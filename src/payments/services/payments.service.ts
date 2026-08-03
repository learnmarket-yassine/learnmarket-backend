import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LearnRequestStatus,
  PaymentStatus,
  PayoutStatus,
  Prisma,
  ProposalStatus,
  SessionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { DailyService } from '../../sessions/services/daily.service';
import { toCents } from '../utils/money.util';
import { amountThroughSession } from '../utils/payout-math.util';
import { GetMyPaymentsQueryDto } from '../dto/get-my-payments-query.dto';
import { SearchTransactionsQueryDto } from '../dto/search-transactions-query.dto';

const CURRENCY = 'usd';

export interface CheckoutIntent {
  clientSecret: string | null;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly dailyService: DailyService,
  ) {}

  /**
   * Learner-initiated: creates (or reuses, on a retried click) the
   * PaymentIntent for hiring a tutor. Ownership/status checks that used to
   * gate ProposalsService.accept() live here now -- by the time the
   * payment_intent.succeeded webhook fires and actually accepts the
   * proposal, there's no learnerId in scope to re-check against, so this is
   * the one place those checks can happen.
   */
  async createPaymentIntentForProposal(
    learnerId: string,
    proposalId: string,
  ): Promise<CheckoutIntent> {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { learnRequest: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.learnRequest.learnerId !== learnerId) {
      throw new ForbiddenException('You do not own this learn request');
    }
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new ConflictException('Proposal is not pending');
    }
    if (proposal.learnRequest.status !== LearnRequestStatus.OPEN) {
      throw new ConflictException('Learn request is not open');
    }

    const existing = await this.prisma.payment.findUnique({
      where: { proposalId },
    });
    if (
      existing &&
      existing.status !== PaymentStatus.PENDING &&
      existing.status !== PaymentStatus.FAILED
    ) {
      throw new ConflictException(
        'This proposal already has a completed or settled payment',
      );
    }

    // idempotencyKey `payment-intent-${proposalId}` means a retried click
    // (or a retry after an earlier failed/abandoned confirmation) returns
    // the SAME PaymentIntent -- no second Payment row is ever needed, the
    // @unique constraint on proposalId is safe by construction.
    const paymentIntent = await this.stripe.createPaymentIntent(
      proposalId,
      toCents(proposal.totalPrice),
      CURRENCY,
    );

    let payment = existing;
    if (!payment) {
      payment = await this.prisma.payment.create({
        data: {
          proposalId,
          learnerId,
          stripePaymentIntentId: paymentIntent.id,
          amount: proposal.totalPrice,
          currency: CURRENCY,
          status: PaymentStatus.PENDING,
        },
      });
    } else if (payment.stripePaymentIntentId !== paymentIntent.id) {
      // Stripe idempotency keys only guarantee dedup for ~24h. A retry
      // after that window returns a genuinely new PaymentIntent under the
      // same deterministic key -- keep the Payment row pointed at whichever
      // PaymentIntent id the frontend is actually about to confirm, so the
      // webhook can find it later.
      payment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { stripePaymentIntentId: paymentIntent.id },
      });
    }

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: new Prisma.Decimal(payment.amount).toNumber(),
      currency: payment.currency,
    };
  }

  /**
   * Learner-only. Cancels an already-hired engagement: the remaining,
   * not-yet-completed sessions are cancelled and the un-transferred portion
   * of what was paid is refunded. LearnRequest/Session carry the
   * cancellation state -- Proposal.status is deliberately left ACCEPTED as
   * a historical record of which proposal was hired, mirroring how
   * Session/Booking already carry their own CANCELLED status independently
   * elsewhere in this schema.
   */
  async cancelProposal(
    learnerId: string,
    proposalId: string,
    reason?: string,
  ): Promise<void> {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { learnRequest: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.learnRequest.learnerId !== learnerId) {
      throw new ForbiddenException('You do not own this learn request');
    }
    if (
      proposal.status !== ProposalStatus.ACCEPTED ||
      proposal.learnRequest.status !== LearnRequestStatus.CLOSED
    ) {
      throw new ConflictException(
        'Only a hired, not-yet-completed engagement can be cancelled',
      );
    }

    // Read before the transaction flips these sessions to CANCELLED --
    // dailyRoomName isn't touched by that update either way, but the rooms
    // still need cleaning up afterward, outside the DB transaction.
    const sessionsToCleanup = await this.prisma.session.findMany({
      where: {
        proposalId,
        status: { notIn: [SessionStatus.COMPLETED, SessionStatus.CANCELLED] },
        dailyRoomName: { not: null },
      },
      select: { dailyRoomName: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.learnRequest.update({
        where: { id: proposal.learnRequestId },
        data: { status: LearnRequestStatus.CANCELLED },
      });
      await tx.session.updateMany({
        where: {
          proposalId,
          status: { notIn: [SessionStatus.COMPLETED, SessionStatus.CANCELLED] },
        },
        data: { status: SessionStatus.CANCELLED },
      });
      await tx.booking.updateMany({
        where: { session: { proposalId }, status: 'CONFIRMED' },
        data: { status: 'CANCELLED' },
      });
    });

    await this.cancelAndRefund(proposalId, reason);

    // Daily room cleanup happens outside the transaction and must never
    // block a cancellation/refund that already committed -- matches
    // confirmSlotHold's decoupled try/catch pattern around Daily calls.
    for (const session of sessionsToCleanup) {
      try {
        await this.dailyService.deleteRoom(session.dailyRoomName!);
      } catch (err) {
        this.logger.error('Daily room deletion failed', err);
      }
    }
  }

  /**
   * Only the portion that hasn't yet been transferred to the tutor is
   * refundable -- once a Transfer has moved money to a tutor's connected
   * account, refunding the original charge does NOT claw it back
   * automatically, and refunding more than what's still on the platform's
   * own balance would push it negative. Uses the cumulative-difference
   * formula against the FULL learner-paid amount (not the tutor-net share)
   * so the platform's fee for already-consumed sessions is preserved.
   */
  async cancelAndRefund(proposalId: string, reason?: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { proposalId },
      include: { payouts: true, proposal: { include: { sessions: true } } },
    });
    if (!payment || payment.status !== PaymentStatus.SUCCEEDED) return;

    const totalSessions = payment.proposal.sessions.length;
    const sessionsReleased = payment.payouts.filter(
      (p) => p.status === PayoutStatus.RELEASED,
    ).length;
    const consumedAmount = amountThroughSession(
      new Prisma.Decimal(payment.amount),
      sessionsReleased,
      totalSessions,
    );
    const refundableAmount = new Prisma.Decimal(payment.amount).minus(
      consumedAmount,
    );

    // Cancel any payouts that hadn't been released yet -- they must never
    // fire later after this refund.
    await this.prisma.payout.updateMany({
      where: {
        paymentId: payment.id,
        status: { in: [PayoutStatus.PENDING, PayoutStatus.PENDING_ONBOARDING] },
      },
      data: { status: PayoutStatus.CANCELLED },
    });

    if (refundableAmount.isZero() || refundableAmount.isNegative()) return;

    // Outside any transaction -- see the payments module's Stripe-call
    // pattern (never call Stripe from inside a Prisma $transaction).
    // idempotencyKey `refund-${paymentId}` means a retried call after a
    // crash resolves to the same Stripe refund rather than double-refunding.
    const refund = await this.stripe.createRefund(
      payment.id,
      payment.stripePaymentIntentId,
      toCents(refundableAmount),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.refund.create({
        data: {
          paymentId: payment.id,
          stripeRefundId: refund.id,
          amount: refundableAmount.toNumber(),
          reason,
        },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: refundableAmount.equals(payment.amount)
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });
    });
  }

  /**
   * Learner-scoped. learnerId is denormalized directly on Payment, so this
   * needs no ownership check beyond the where clause -- a learner can only
   * ever query their own rows.
   */
  async getMyPayments(learnerId: string, query: GetMyPaymentsQueryDto) {
    const where: Prisma.PaymentWhereInput = { learnerId };
    if (query.status) where.status = query.status;
    const [items, totalCount, totalSpent] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: query.sortDir ?? 'desc' },
        skip: query.page * query.take,
        take: query.take,
        include: {
          refunds: true,
          proposal: {
            include: {
              tutor: {
                select: { firstname: true, lastname: true, avatar: true },
              },
              learnRequest: { select: { title: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({
        where: {
          learnerId,
          status: {
            in: [PaymentStatus.SUCCEEDED, PaymentStatus.PARTIALLY_REFUNDED],
          },
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      paginatedResult: items,
      totalCount,
      totalSpent: totalSpent._sum.amount ?? 0,
    };
  }

  /**
   * Admin-only. Unlike getMyPayments, this deliberately surfaces raw Stripe
   * ids (via payouts/refunds includes and Payment.stripePaymentIntentId
   * itself) for reconciliation -- learner/tutor-facing endpoints must never
   * leak these.
   */
  async searchTransactions(query: SearchTransactionsQueryDto) {
    const where: Prisma.PaymentWhereInput = {};
    if (query.learnerId) where.learnerId = query.learnerId;
    if (query.status) where.status = query.status;
    if (query.tutorId) where.proposal = { tutorId: query.tutorId };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.page * query.take,
        take: query.take,
        include: {
          learner: { select: { firstname: true, lastname: true, email: true } },
          proposal: {
            select: {
              tutorId: true,
              tutor: { select: { firstname: true, lastname: true } },
            },
          },
          payouts: true,
          refunds: true,
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { paginatedResult: items, totalCount };
  }
}
