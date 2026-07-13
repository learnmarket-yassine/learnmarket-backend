import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

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

      // A cancelled session must become reschedulable, not stuck at BOOKED.
      if (booking.proposalSessionId) {
        await tx.proposalSession.update({
          where: { id: booking.proposalSessionId },
          data: { status: 'PENDING_SCHEDULE' },
        });
      }

      return cancelled;
    });
  }
}
