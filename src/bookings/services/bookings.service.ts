import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  findConfirmedByTutor(tutorId: string) {
    return this.prisma.booking.findMany({
      where: { tutorId, status: 'CONFIRMED' },
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

    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.booking.update({
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

      return cancelled;
    });
  }
}
