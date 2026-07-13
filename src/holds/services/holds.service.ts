import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHoldDto } from '../dto/create-hold.dto';

const HOLD_DURATION_MS = 10 * 60 * 1000;

@Injectable()
export class HoldsService {
  constructor(private readonly prisma: PrismaService) {}

  async requestHold(learnerId: string, dto: CreateHoldDto) {
    const session = await this.prisma.proposalSession.findUnique({
      where: { id: dto.proposalSessionId },
      include: { proposal: { include: { jobRequest: true } } },
    });
    if (!session) throw new NotFoundException('Proposal session not found');
    if (session.proposal.jobRequest.learnerId !== learnerId) {
      throw new ForbiddenException('You do not own this proposal session');
    }

    return this.createSlotHold(
      session.proposal.tutorId,
      learnerId,
      dto.proposalSessionId,
      new Date(dto.startTime),
      new Date(dto.endTime),
    );
  }

  async createSlotHold(
    tutorId: string,
    learnerId: string,
    proposalSessionId: string,
    startTime: Date,
    endTime: Date,
  ) {
    try {
      return await this.withDeadlockRetry(() =>
        this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            UPDATE "slot_holds" SET status = 'EXPIRED'
            WHERE tutor_id = ${tutorId} AND status = 'ACTIVE' AND expires_at <= now()
          `;

          const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);

          return tx.slotHold.upsert({
            where: { proposalSessionId },
            create: {
              tutorId,
              learnerId,
              proposalSessionId,
              startTime,
              endTime,
              expiresAt,
              status: 'ACTIVE',
            },
            update: {
              tutorId,
              learnerId,
              startTime,
              endTime,
              expiresAt,
              status: 'ACTIVE',
            },
          });
        }),
      );
    } catch (error) {
      this.handleOverlapError(error, 'no_overlapping_active_holds');
    }
  }

  async confirmSlotHold(slotHoldId: string) {
    const hold = await this.prisma.slotHold.findUnique({
      where: { id: slotHoldId },
    });
    if (!hold) throw new NotFoundException('Slot hold not found');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const result = await tx.slotHold.updateMany({
          where: {
            id: slotHoldId,
            status: 'ACTIVE',
            expiresAt: { gt: new Date() },
          },
          data: { status: 'CONVERTED' },
        });
        if (result.count === 0) {
          throw new GoneException('This hold has expired');
        }

        const booking = await tx.booking.create({
          data: {
            tutorId: hold.tutorId,
            learnerId: hold.learnerId,
            proposalSessionId: hold.proposalSessionId,
            slotHoldId: hold.id,
            startTime: hold.startTime,
            endTime: hold.endTime,
            status: 'CONFIRMED',
          },
        });

        await tx.proposalSession.update({
          where: { id: hold.proposalSessionId },
          data: { status: 'BOOKED' },
        });

        return booking;
      });
    } catch (error) {
      if (error instanceof GoneException) throw error;
      this.handleOverlapError(error, 'no_overlapping_confirmed_bookings');
    }
  }

  async releaseSlotHold(slotHoldId: string) {
    const hold = await this.prisma.slotHold.findUnique({
      where: { id: slotHoldId },
    });
    if (!hold) throw new NotFoundException('Slot hold not found');

    return this.prisma.slotHold.update({
      where: { id: slotHoldId },
      data: { status: 'EXPIRED' },
    });
  }

  async assertLearnerOwnsHold(learnerId: string, slotHoldId: string) {
    const hold = await this.prisma.slotHold.findUnique({
      where: { id: slotHoldId },
    });
    if (!hold) throw new NotFoundException('Slot hold not found');
    if (hold.learnerId !== learnerId) {
      throw new ForbiddenException('You do not own this hold');
    }
  }

  /**
   * Postgres reports an EXCLUDE constraint violation as SQLSTATE 23P01.
   * Verified against a real database (Prisma 6.19): the query engine only
   * maps this to a `PrismaClientKnownRequestError` with code P2004 for
   * CHECK constraints (23514) — an exclusion-constraint violation instead
   * surfaces as a `PrismaClientUnknownRequestError`. Both are handled here
   * so this keeps working if a future Prisma version changes that mapping.
   */
  private handleOverlapError(error: unknown, constraintName: string): never {
    const isKnownConstraintFailure =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2004' &&
      error.message.includes(constraintName);
    const isUnmappedConstraintFailure =
      error instanceof Prisma.PrismaClientUnknownRequestError &&
      error.message.includes(constraintName);

    if (isKnownConstraintFailure || isUnmappedConstraintFailure) {
      throw new ConflictException('This time slot is no longer available');
    }
    throw error;
  }

  /**
   * `upsert` compiles to `INSERT ... ON CONFLICT ... DO UPDATE`. Postgres's
   * speculative-insertion protocol for ON CONFLICT can genuinely deadlock
   * (SQLSTATE 40P01) when two concurrent upserts on *different* keys each
   * violate the same exclusion constraint — a documented Postgres corner
   * case, not a bug in the exclusion constraint itself. Retrying is the
   * standard mitigation: Postgres already aborts one side of the deadlock,
   * so the retry simply re-evaluates against whichever transaction won.
   */
  private async withDeadlockRetry<T>(
    operation: () => Promise<T>,
    attempts = 3,
  ): Promise<T> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === attempts || !this.isDeadlock(error)) throw error;
      }
    }
    throw new Error('unreachable');
  }

  private isDeadlock(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientUnknownRequestError &&
      error.message.includes('40P01')
    );
  }
}
