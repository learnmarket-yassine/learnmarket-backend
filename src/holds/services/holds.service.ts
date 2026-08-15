import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Booking,
  NotificationType,
  Prisma,
  SessionStatus,
} from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionsService } from '../../sessions/services/sessions.service';
import { CreateHoldDto } from '../dto/create-hold.dto';

const HOLD_DURATION_MS = 10 * 60 * 1000;

// States a learner may request a new hold from. PENDING_SCHEDULE and
// CANCELLED are the "obviously reschedulable" cases. HELD is included too
// even though the normal UI path resumes an in-progress hold instead of
// re-requesting one -- releaseSlotHold is fired-and-forgotten from the
// client (see useBookingFlow's chooseDifferentTime), so a new hold request
// can land before that release's session-status reset has committed. Since
// createSlotHold upserts by sessionId, re-holding a HELD session is always
// safe; only LOCKED (not this learner's turn yet) and the terminal
// BOOKED/COMPLETED states should actually reject.
const HOLD_REQUESTABLE_STATUSES: SessionStatus[] = [
  SessionStatus.PENDING_SCHEDULE,
  SessionStatus.HELD,
  SessionStatus.CANCELLED,
];

@Injectable()
export class HoldsService {
  private readonly logger = new Logger(HoldsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly notifications: NotificationsService,
  ) {}

  async requestHold(learnerId: string, dto: CreateHoldDto) {
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
      include: { proposal: { include: { learnRequest: true } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.proposal.learnRequest.learnerId !== learnerId) {
      throw new ForbiddenException('You do not own this session');
    }
    if (!HOLD_REQUESTABLE_STATUSES.includes(session.status)) {
      throw new ConflictException(
        session.status === SessionStatus.LOCKED
          ? 'This session cannot be scheduled yet — complete the previous session first'
          : 'This session has already been scheduled',
      );
    }

    const startTime = new Date(dto.startTime);
    if (startTime.getTime() <= Date.now()) {
      throw new ConflictException('This time has already passed');
    }
    const endTime = new Date(
      startTime.getTime() + session.proposal.sessionDurationMinutes * 60_000,
    );

    return this.createSlotHold(
      session.proposal.tutorId,
      learnerId,
      dto.sessionId,
      startTime,
      endTime,
    );
  }

  async createSlotHold(
    tutorId: string,
    learnerId: string,
    sessionId: string,
    startTime: Date,
    endTime: Date,
  ) {
    try {
      return await this.withDeadlockRetry(() =>
        this.prisma.$transaction(async (tx) => {
          // Same-tutor stale-hold cleanup. RETURNING captures which
          // sessions were actually affected so their status can be
          // unwound from HELD back to PENDING_SCHEDULE -- these may be
          // entirely different sessions than the one being held below.
          const expired = await tx.$queryRaw<{ session_id: string }[]>`
            UPDATE "slot_holds" SET status = 'EXPIRED'
            WHERE tutor_id = ${tutorId} AND status = 'ACTIVE' AND expires_at <= now()
            RETURNING session_id
          `;
          if (expired.length > 0) {
            await tx.session.updateMany({
              where: {
                id: { in: expired.map((row) => row.session_id) },
                status: SessionStatus.HELD,
              },
              data: { status: SessionStatus.PENDING_SCHEDULE },
            });
          }

          const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);

          const hold = await tx.slotHold.upsert({
            where: { sessionId },
            create: {
              tutorId,
              learnerId,
              sessionId,
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

          await tx.session.update({
            where: { id: sessionId },
            data: { status: SessionStatus.HELD },
          });

          return hold;
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

    let booking: Booking;
    let isReschedule: boolean;
    try {
      ({ booking, isReschedule } = await this.prisma.$transaction(
        async (tx) => {
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

          // Booking.sessionId is @unique -- a rescheduled session already has
          // a (CANCELLED) Booking row for it, from the reschedule endpoint.
          // Revive that same row rather than inserting a second one.
          const existingBooking = await tx.booking.findUnique({
            where: { sessionId: hold.sessionId },
          });

          const created = existingBooking
            ? await tx.booking.update({
                where: { id: existingBooking.id },
                data: {
                  tutorId: hold.tutorId,
                  learnerId: hold.learnerId,
                  slotHoldId: hold.id,
                  startTime: hold.startTime,
                  endTime: hold.endTime,
                  status: 'CONFIRMED',
                },
              })
            : await tx.booking.create({
                data: {
                  tutorId: hold.tutorId,
                  learnerId: hold.learnerId,
                  sessionId: hold.sessionId,
                  slotHoldId: hold.id,
                  startTime: hold.startTime,
                  endTime: hold.endTime,
                  status: 'CONFIRMED',
                },
              });

          await tx.session.update({
            where: { id: hold.sessionId },
            data: { status: SessionStatus.BOOKED },
          });

          return { booking: created, isReschedule: !!existingBooking };
        },
      ));
    } catch (error) {
      if (error instanceof GoneException) throw error;
      this.handleOverlapError(error, 'no_overlapping_confirmed_bookings');
    }

    // Daily.co provisioning/update happens outside the transaction and must
    // never block a booking that has already been confirmed -- a Daily.co
    // outage degrades to "session shows not_provisioned, tutor can retry",
    // not a failed booking. Both calls already swallow their own errors;
    // this try/catch is defense-in-depth around the DB update they perform.
    try {
      if (isReschedule) {
        // Same Daily room, new time -- provisionMeeting would no-op here
        // since dailyRoomUrl is already set.
        await this.sessionsService.updateMeetingTime(booking.sessionId!);
      } else {
        await this.sessionsService.provisionMeeting(booking.sessionId!);
      }
    } catch (err) {
      this.logger.error('Daily meeting provisioning failed', err);
    }

    await this.notifications.create(
      booking.tutorId,
      NotificationType.SESSION_SCHEDULED,
      isReschedule ? 'Session rescheduled' : 'Session scheduled',
      `A session was scheduled for ${booking.startTime.toISOString()}.`,
      { bookingId: booking.id, sessionId: booking.sessionId },
    );

    return booking;
  }

  async releaseSlotHold(slotHoldId: string) {
    const hold = await this.prisma.slotHold.findUnique({
      where: { id: slotHoldId },
    });
    if (!hold) throw new NotFoundException('Slot hold not found');

    // Guarded like confirmSlotHold: only a genuinely ACTIVE hold gets
    // released. If confirmSlotHold already converted it (or another
    // release call already expired it), this is a correct no-op --
    // never overwrite a CONVERTED hold's terminal state.
    await this.prisma.$transaction(async (tx) => {
      const released = await tx.slotHold.updateMany({
        where: { id: slotHoldId, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });

      if (released.count > 0) {
        await tx.session.updateMany({
          where: { id: hold.sessionId, status: SessionStatus.HELD },
          data: { status: SessionStatus.PENDING_SCHEDULE },
        });
      }
    });

    return this.prisma.slotHold.findUniqueOrThrow({
      where: { id: slotHoldId },
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
