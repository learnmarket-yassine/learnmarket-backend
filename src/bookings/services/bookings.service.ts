import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GetMyBookingsQueryDto } from '../dto/get-my-bookings-query.dto';

const RESCHEDULE_CUTOFF_HOURS = 2;

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  findConfirmedByTutor(tutorId: string, query?: GetMyBookingsQueryDto) {
    return this.prisma.booking.findMany({
      where: { tutorId, status: 'CONFIRMED', ...startTimeFilter(query) },
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        sessionId: true,
        // proposalId lets the frontend route a tutor's booking to its
        // /jobs/:proposalId details page.
        session: { select: { title: true, proposalId: true } },
        learner: { select: { firstname: true, lastname: true } },
      },
    });
  }

  findConfirmedByLearner(learnerId: string, query?: GetMyBookingsQueryDto) {
    return this.prisma.booking.findMany({
      where: { learnerId, status: 'CONFIRMED', ...startTimeFilter(query) },
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        sessionId: true,
        // learnRequestId lets the frontend route a learner's booking to its
        // /learn-requests/:learnRequestId details page.
        session: {
          select: {
            title: true,
            proposal: { select: { learnRequestId: true } },
          },
        },
        tutor: { select: { firstname: true, lastname: true } },
      },
    });
  }

  async rescheduleBooking(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.tutorId !== userId && booking.learnerId !== userId) {
      // 404, not 403 -- matches assertParticipant's ownership-check pattern
      // in SessionsService (a booking is reachable only via its session).
      throw new NotFoundException('Booking not found');
    }
    if (booking.status !== 'CONFIRMED') {
      throw new ConflictException('This booking can no longer be rescheduled');
    }

    const hoursUntilStart =
      (booking.startTime.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilStart <= RESCHEDULE_CUTOFF_HOURS) {
      throw new ConflictException(
        'Rescheduling is only available more than 2 hours before the session',
      );
    }

    const rescheduled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' },
      });

      if (booking.sessionId) {
        await tx.session.update({
          where: { id: booking.sessionId },
          data: { status: SessionStatus.PENDING_SCHEDULE },
        });
      }

      return updated;
    });
    return rescheduled;
  }
}

function startTimeFilter(query?: GetMyBookingsQueryDto) {
  if (!query?.from && !query?.to) return {};
  return {
    startTime: {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    },
  };
}
