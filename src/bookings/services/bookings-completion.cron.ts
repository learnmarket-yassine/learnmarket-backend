import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PayoutsService } from '../../payments/services/payouts.service';
import { SessionsService } from '../../sessions/services/sessions.service';

@Injectable()
export class BookingsCompletionCron {
  private readonly logger = new Logger(BookingsCompletionCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payoutsService: PayoutsService,
    private readonly sessionsService: SessionsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async completeFinishedBookings(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error(
        'completeFinishedBookings failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async run(): Promise<void> {
    const dueBookings = await this.prisma.booking.findMany({
      where: { status: 'CONFIRMED', endTime: { lt: new Date() } },
      include: { session: true },
    });

    for (const booking of dueBookings) {
      // Already gated on a previous tick -- nothing left to do here, its
      // completion now waits on the confirmation gate resolving instead.
      if (booking.session?.status === SessionStatus.PENDING_REVIEW) continue;

      const payoutTrigger = await this.prisma.$transaction(async (tx) => {
        if (!booking.session) {
          await tx.booking.update({
            where: { id: booking.id },
            data: { status: 'COMPLETED' },
          });
          return null;
        }

        if (!booking.session.tutorJoinedAt) {
          // No-show -- unchanged immediate-completion behavior. Nothing to
          // summarize or confirm for a session the tutor never attended.
          await tx.booking.update({
            where: { id: booking.id },
            data: { status: 'COMPLETED' },
          });
          return this.sessionsService.completeSessionCascade(
            tx,
            booking.session.id,
          );
        }

        // Tutor attendance verified -- enter the parallel confirmation gate
        // instead of completing immediately. Booking stays CONFIRMED (there
        // is no PENDING_REVIEW BookingStatus) until both gate branches
        // resolve and completeSessionCascade runs from there.
        await tx.session.update({
          where: { id: booking.session.id },
          data: { status: SessionStatus.PENDING_REVIEW },
        });
        return null;
      });

      if (payoutTrigger?.shouldRelease) {
        await this.payoutsService.releasePayout(payoutTrigger.payoutId);
      }
    }

    if (dueBookings.length > 0) {
      this.logger.debug(`Processed ${dueBookings.length} finished booking(s)`);
    }
  }
}
