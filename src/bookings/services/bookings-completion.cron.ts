import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LearnRequestType, PaymentStatus, SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PayoutsService } from '../../payments/services/payouts.service';

@Injectable()
export class BookingsCompletionCron {
  private readonly logger = new Logger(BookingsCompletionCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payoutsService: PayoutsService,
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
      include: {
        session: {
          include: {
            proposal: { include: { learnRequest: true, payment: true } },
          },
        },
      },
    });

    for (const booking of dueBookings) {
      const payoutTrigger = await this.prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'COMPLETED' },
        });

        if (!booking.session) return null;

        const completedSession = await tx.session.update({
          where: { id: booking.session.id },
          data: { status: SessionStatus.COMPLETED },
        });

        const { proposal } = booking.session;

        const nextSession = await tx.session.findFirst({
          where: {
            proposalId: proposal.id,
            sessionNumber: { gt: booking.session.sessionNumber },
          },
          orderBy: { sessionNumber: 'asc' },
        });

        if (!nextSession) {
          await tx.learnRequest.update({
            where: { id: proposal.learnRequest.id },
            data: { status: 'COMPLETED' },
          });
        } else if (
          proposal.learnRequest.type === LearnRequestType.COURSE &&
          nextSession.status === SessionStatus.LOCKED
        ) {
          await tx.session.update({
            where: { id: nextSession.id },
            data: { status: SessionStatus.PENDING_SCHEDULE },
          });
        }

        // TODO: notifications hook — notify tutor/learner that the session completed
        // and (for COURSE) that the next session is ready to schedule.
        if (proposal.payment?.status !== PaymentStatus.SUCCEEDED) return null;

        return this.payoutsService.recordPayoutForCompletedSession(
          tx,
          completedSession,
          proposal,
          proposal.payment,
        );
      });
      if (payoutTrigger?.shouldRelease) {
        await this.payoutsService.releasePayout(payoutTrigger.payoutId);
      }
    }

    if (dueBookings.length > 0) {
      this.logger.debug(`Completed ${dueBookings.length} finished booking(s)`);
    }
  }
}
