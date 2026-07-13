import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobRequestType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BookingsCompletionCron {
  private readonly logger = new Logger(BookingsCompletionCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async completeFinishedBookings(): Promise<void> {
    const dueBookings = await this.prisma.booking.findMany({
      where: { status: 'CONFIRMED', endTime: { lt: new Date() } },
      include: {
        proposalSession: {
          include: { proposal: { include: { jobRequest: true } } },
        },
      },
    });

    for (const booking of dueBookings) {
      await this.prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'COMPLETED' },
        });

        if (!booking.proposalSession) return;

        await tx.proposalSession.update({
          where: { id: booking.proposalSession.id },
          data: { status: 'COMPLETED' },
        });

        const { proposal } = booking.proposalSession;
        if (proposal.jobRequest.type === JobRequestType.COURSE) {
          const next = await tx.proposalSession.findFirst({
            where: {
              proposalId: proposal.id,
              sessionNumber: booking.proposalSession.sessionNumber + 1,
              status: 'LOCKED',
            },
          });
          if (next) {
            await tx.proposalSession.update({
              where: { id: next.id },
              data: { status: 'PENDING_SCHEDULE' },
            });
          }
        }

        // TODO: notifications hook — notify tutor/learner that the session completed
        // and (for COURSE) that the next session is ready to schedule.
      });
    }

    if (dueBookings.length > 0) {
      this.logger.debug(`Completed ${dueBookings.length} finished booking(s)`);
    }
  }
}
