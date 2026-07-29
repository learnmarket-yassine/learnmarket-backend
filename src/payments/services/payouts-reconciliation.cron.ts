import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PayoutStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PayoutsService } from './payouts.service';

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
