import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionsService } from '../../sessions/services/sessions.service';
import { GetMyBookingsQueryDto } from '../dto/get-my-bookings-query.dto';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
  ) {}

  findConfirmedByTutor(tutorId: string, query?: GetMyBookingsQueryDto) {
    return this.prisma.booking.findMany({
      where: { tutorId, status: 'CONFIRMED', ...startTimeFilter(query) },
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        sessionId: true,
        session: { select: { title: true } },
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
        session: { select: { title: true } },
        tutor: { select: { firstname: true, lastname: true } },
      },
    });
  }

  async cancel(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.tutorId !== userId && booking.learnerId !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }
    if (booking.status !== 'CONFIRMED') {
      throw new ConflictException('Only confirmed bookings can be cancelled');
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' },
      });

      // A cancelled session must become reschedulable, not stuck at BOOKED --
      // CANCELLED (not PENDING_SCHEDULE) so it's distinguishable from a
      // session that was never scheduled at all. HoldsService.requestHold
      // treats CANCELLED as a valid starting state for a new hold.
      if (booking.sessionId) {
        await tx.session.update({
          where: { id: booking.sessionId },
          data: { status: SessionStatus.CANCELLED },
        });
      }

      return updated;
    });

    // Outside the transaction, and never throws -- a Zoom cleanup failure
    // must not undo a cancellation that already committed.
    if (booking.sessionId) {
      await this.sessionsService.deprovisionMeeting(booking.sessionId);
    }

    return cancelled;
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
