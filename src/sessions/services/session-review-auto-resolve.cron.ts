import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionsService } from './sessions.service';

const RESPONSE_TIMEOUT_HOURS = 48;

@Injectable()
export class SessionReviewAutoResolveCron {
  private readonly logger = new Logger(SessionReviewAutoResolveCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async resolveStaleReviews(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error(
        'resolveStaleReviews failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async run(): Promise<void> {
    const cutoff = new Date(Date.now() - RESPONSE_TIMEOUT_HOURS * 3600_000);

    // Disputed sessions are excluded entirely -- they never auto-complete
    // via this path regardless of how stale either branch is.
    const stale = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.PENDING_REVIEW,
        disputedAt: null,
        booking: { endTime: { lt: cutoff } },
        OR: [{ summarySubmittedAt: null }, { learnerConfirmedAt: null }],
      },
    });

    for (const session of stale) {
      // Each branch is backfilled independently -- a session missing only
      // one branch only gets that one touched.
      if (!session.summarySubmittedAt) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: {
            summary: 'No summary was provided.',
            summarySubmittedAt: new Date(),
          },
        });
      }
      if (!session.learnerConfirmedAt) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: { learnerConfirmedAt: new Date() },
        });
      }
      await this.sessionsService.tryCompleteIfBothBranchesReady(session.id);
    }

    if (stale.length > 0) {
      this.logger.debug(`Auto-resolved ${stale.length} stale session review(s)`);
    }
  }
}
