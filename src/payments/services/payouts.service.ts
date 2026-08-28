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
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { toCents } from '../utils/money.util';
import { sessionPayoutAmount } from '../utils/payout-math.util';
import { StripeService } from './stripe.service';
import { GetMyPayoutsQueryDto } from '../dto/get-my-payouts-query.dto';

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
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async recordPayoutForCompletedSession(
    tx: Prisma.TransactionClient,
    session: Session,
    proposal: Proposal,
    payment: Payment,
  ): Promise<PayoutTrigger | null> {
    if (!session.tutorJoinedAt) {
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

    const { serviceFeePercent } = await this.platformSettings.getSettings();
    const tutorEarnedTotal = new Prisma.Decimal(
      getFeeBreakdown(
        new Prisma.Decimal(proposal.totalPrice).toNumber(),
        serviceFeePercent,
      ).tutorTotal,
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

  async previewSessionAmount(
    session: { sessionNumber: number },
    proposal: {
      totalPrice: Prisma.Decimal;
      payment: { currency: string } | null;
    },
    totalSessions: number,
  ): Promise<{ amount: number; currency: string } | null> {
    if (!proposal.payment) return null;

    const { serviceFeePercent } = await this.platformSettings.getSettings();
    const tutorEarnedTotal = new Prisma.Decimal(
      getFeeBreakdown(
        new Prisma.Decimal(proposal.totalPrice).toNumber(),
        serviceFeePercent,
      ).tutorTotal,
    );
    const amount = sessionPayoutAmount(
      tutorEarnedTotal,
      session.sessionNumber,
      totalSessions,
    );
    return { amount: amount.toNumber(), currency: proposal.payment.currency };
  }

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

  async getMyPayouts(tutorId: string, query: GetMyPayoutsQueryDto) {
    const where: Prisma.PayoutWhereInput = { tutorId };
    if (query.status) where.status = query.status;
    const [items, totalCount, totalEarned] = await this.prisma.$transaction([
      this.prisma.payout.findMany({
        where,
        orderBy: { triggeredAt: query.sortDir ?? 'desc' },
        skip: query.page * query.take,
        take: query.take,
        include: {
          session: {
            select: {
              title: true,
              sessionNumber: true,
              proposal: {
                select: {
                  learnRequest: {
                    select: {
                      title: true,
                      learner: { select: { firstname: true, lastname: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.payout.count({ where }),
      this.prisma.payout.aggregate({
        where: { tutorId, status: PayoutStatus.RELEASED },
        _sum: { amount: true },
      }),
    ]);

    return {
      paginatedResult: items,
      totalCount,
      totalEarned: totalEarned._sum.amount ?? 0,
    };
  }
}
