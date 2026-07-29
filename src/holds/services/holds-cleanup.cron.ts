import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HoldsCleanupCron {
  private readonly logger = new Logger(HoldsCleanupCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 0 * * * *')
  async expireStaleHolds(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error(
        'expireStaleHolds failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async run(): Promise<void> {
    const stale = await this.prisma.slotHold.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: new Date() } },
      select: { id: true, sessionId: true },
    });
    if (stale.length === 0) return;

    await this.prisma.$transaction([
      this.prisma.slotHold.updateMany({
        where: { id: { in: stale.map((hold) => hold.id) } },
        data: { status: 'EXPIRED' },
      }),
      this.prisma.session.updateMany({
        where: {
          id: { in: stale.map((hold) => hold.sessionId) },
          status: 'HELD',
        },
        data: { status: 'PENDING_SCHEDULE' },
      }),
    ]);

    this.logger.debug(`Expired ${stale.length} stale slot hold(s)`);
  }
}
