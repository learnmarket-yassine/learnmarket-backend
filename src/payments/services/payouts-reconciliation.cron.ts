import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PayoutStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PayoutsService } from './payouts.service';

/**
 * A Payout should never sit at PENDING for long -- recordPayoutForCompletedSession
 * immediately hands off to releasePayout in the same code path. A row
 * lingering here past the age threshold means the process crashed between
 * the DB commit and the Stripe Transfer call. Safe to retry blindly:
 * releasePayout's Transfer call reuses the `transfer-${payoutId}`
 * idempotency key, so even a "Stripe already actually transferred it, we
 * just never recorded that" row resolves correctly instead of double-paying.
 */
const STUCK_PAYOUT_AGE_MS = 60 * 60_000;

@Injectable()
export class PayoutsReconciliationCron {
  private readonly logger = new Logger(PayoutsReconciliationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payoutsService: PayoutsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async retryStuckPayouts(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error(
        'retryStuckPayouts failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async run(): Promise<void> {
    const stuck = await this.prisma.payout.findMany({
      where: {
        status: PayoutStatus.PENDING,
        triggeredAt: { lt: new Date(Date.now() - STUCK_PAYOUT_AGE_MS) },
      },
    });

    for (const payout of stuck) {
      await this.payoutsService.releasePayout(payout.id);
    }

    if (stuck.length > 0) {
      this.logger.debug(`Retried ${stuck.length} stuck payout(s)`);
    }
  }
}
