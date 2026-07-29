import { Injectable, Logger } from '@nestjs/common';
import {
  Payment,
  PayoutStatus,
  Prisma,
  Proposal,
  Session,
} from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { getFeeBreakdown } from '../../common/utils/fee.util';
import { PrismaService } from '../../prisma/prisma.service';
import { toCents } from '../utils/money.util';
import { sessionPayoutAmount } from '../utils/payout-math.util';
import { StripeService } from './stripe.service';

export interface PayoutTrigger {
  payoutId: string;
  shouldRelease: boolean;
}

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  /**
   * Called from inside the session-completion cron's per-booking
   * transaction, right after a Session flips to COMPLETED. Only ever
   * records the DB-side "intent to pay" here -- the actual Stripe Transfer
   * call happens afterward, outside any transaction (see releasePayout).
   */
  async recordPayoutForCompletedSession(
    tx: Prisma.TransactionClient,
    session: Session,
    proposal: Proposal,
    payment: Payment,
  ): Promise<PayoutTrigger | null> {
    if (!session.tutorJoinedAt) {
      // No-show guard: the tutor never actually joined per the Session
      // module's join-tracking. Do NOT auto-pay -- held for manual admin
      // review (no resolution UI in this phase).
      await tx.payout.create({
        data: {
          paymentId: payment.id,
          sessionId: session.id,
          tutorId: proposal.tutorId,
          amount: 0,
          status: PayoutStatus.HELD_FOR_REVIEW,
        },
      });
      return null;
    }

    // CRITICAL: proposal.totalPrice is the LEARNER-FACING, fee-inclusive
    // amount. Paying that out in full would send the tutor the platform's
    // own fee too. Payout math must always run against the de-inflated
    // tutor share.
    const tutorEarnedTotal = new Prisma.Decimal(
      getFeeBreakdown(new Prisma.Decimal(proposal.totalPrice).toNumber())
        .tutorTotal,
    );
    const totalSessions = await tx.session.count({
      where: { proposalId: proposal.id },
    });

    let amount: Prisma.Decimal;
    if (proposal.payoutMethod === 'ON_COMPLETION') {
      if (session.sessionNumber !== totalSessions) {
        return null; // not yet the final session -- nothing payable yet
      }
      const alreadyPaidOut = await tx.payout.aggregate({
        where: {
          paymentId: payment.id,
          status: { not: PayoutStatus.CANCELLED },
        },
        _sum: { amount: true },
      });
      amount = tutorEarnedTotal.minus(alreadyPaidOut._sum.amount ?? 0);
    } else {
      amount = sessionPayoutAmount(
        tutorEarnedTotal,
        session.sessionNumber,
        totalSessions,
      );
    }
    if (amount.isZero()) return null;

    const tutorProfile = await tx.tutorProfile.findUnique({
      where: { userId: proposal.tutorId },
    });
    const enabled =
      !!tutorProfile?.stripePayoutsEnabled && !!tutorProfile.stripeAccountId;

    const payout = await tx.payout.create({
      data: {
        paymentId: payment.id,
        sessionId: session.id,
        tutorId: proposal.tutorId,
        amount: amount.toNumber(),
        status: enabled
          ? PayoutStatus.PENDING
          : PayoutStatus.PENDING_ONBOARDING,
      },
    });
    return { payoutId: payout.id, shouldRelease: enabled };
  }

  /**
   * Makes the real Stripe Transfer call. Never call this from inside a
   * Prisma transaction -- see payments module plan §3. Idempotent: safe to
   * call repeatedly for the same payoutId (via the reconciliation cron, a
   * retried onboarding sync, etc) because the Transfer's idempotency key is
   * scoped to payoutId, so a "did it actually already transfer" retry
   * resolves to the same Stripe object rather than double-paying.
   */
  async releasePayout(payoutId: string): Promise<void> {
    const payout = await this.prisma.payout.findUniqueOrThrow({
      where: { id: payoutId },
      include: { payment: true, tutor: { include: { tutorProfile: true } } },
    });
    if (payout.status === PayoutStatus.RELEASED) return;

    const stripeAccountId = payout.tutor.tutorProfile?.stripeAccountId;
    if (!stripeAccountId) {
      this.logger.error(
        `releasePayout(${payoutId}) called but tutor ${payout.tutorId} has no stripeAccountId`,
      );
      return;
    }

    try {
      const transfer = await this.stripe.createTransfer(
        payout.id,
        stripeAccountId,
        toCents(payout.amount),
        payout.payment.currency,
      );
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.RELEASED,
          stripeTransferId: transfer.id,
          releasedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: { status: PayoutStatus.FAILED },
      });
      this.logger.error(
        `Transfer failed for payout ${payoutId}`,
        error instanceof Error ? error.stack : String(error),
      );
      Sentry.captureException(error, { extra: { payoutId } });
    }
  }

  /** Triggered after account.updated flips a tutor's payouts_enabled to true. */
  async retryPendingOnboardingPayouts(stripeAccountId: string): Promise<void> {
    const tutorProfile = await this.prisma.tutorProfile.findUnique({
      where: { stripeAccountId },
    });
    if (!tutorProfile) return;

    const stuck = await this.prisma.payout.findMany({
      where: {
        tutorId: tutorProfile.userId,
        status: PayoutStatus.PENDING_ONBOARDING,
      },
    });
    for (const p of stuck) {
      await this.releasePayout(p.id);
    }
  }
}
