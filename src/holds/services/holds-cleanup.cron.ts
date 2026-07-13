import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Backstop for the per-tutor stale-hold cleanup that already runs
 * transactionally inside `HoldsService.createSlotHold`. Not required for
 * correctness (the exclusion constraint + transactional cleanup already
 * guarantee no double-booking) — this just limits how long an expired hold
 * lingers with a misleading ACTIVE status for anything querying the table
 * directly.
 */
@Injectable()
export class HoldsCleanupCron {
  private readonly logger = new Logger(HoldsCleanupCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 0 * * * *')
  async expireStaleHolds(): Promise<void> {
    const { count } = await this.prisma.slotHold.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED' },
    });
    if (count > 0) {
      this.logger.debug(`Expired ${count} stale slot hold(s)`);
    }
  }
}
