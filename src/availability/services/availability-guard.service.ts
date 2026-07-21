import { ConflictException, Injectable } from '@nestjs/common';
import { TutorAvailabilityRule } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  getZonedDateParts,
  zonedTimeToUtc,
} from '../../common/utils/timezone.util';
import { Interval, overlaps } from '../utils/interval.util';

/**
 * Guards against availability writes that would silently strand an
 * existing CONFIRMED booking (i.e. no longer be covered by any rule or
 * ADDED exception once the write goes through).
 */
@Injectable()
export class AvailabilityGuardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * For a rule being deleted or shrunk (update), checks whether any future
   * CONFIRMED booking that currently falls inside the rule's window would
   * no longer be covered by `newWindow` (pass `null` for a full delete).
   */
  async assertRuleChangeSafe(
    tutorId: string,
    rule: Pick<
      TutorAvailabilityRule,
      'dayOfWeek' | 'startTime' | 'endTime' | 'timezone'
    >,
    newWindow: { startTime: number; endTime: number } | null,
  ): Promise<void> {
    const bookings = await this.prisma.booking.findMany({
      where: { tutorId, status: 'CONFIRMED', startTime: { gte: new Date() } },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        sessionId: true,
      },
    });
    if (!bookings.length) return;

    const affected = bookings.filter((booking) => {
      const { dateStr, weekday } = getZonedDateParts(
        booking.startTime,
        rule.timezone,
      );
      if (weekday !== rule.dayOfWeek) return false;

      const oldWindow: Interval = {
        start: zonedTimeToUtc(dateStr, rule.startTime, rule.timezone),
        end: zonedTimeToUtc(dateStr, rule.endTime, rule.timezone),
      };
      const bookingWindow: Interval = {
        start: booking.startTime,
        end: booking.endTime,
      };
      if (!overlaps(oldWindow, bookingWindow)) return false;

      if (!newWindow) return true;

      const newRuleWindow: Interval = {
        start: zonedTimeToUtc(dateStr, newWindow.startTime, rule.timezone),
        end: zonedTimeToUtc(dateStr, newWindow.endTime, rule.timezone),
      };
      const stillCovered =
        booking.startTime >= newRuleWindow.start &&
        booking.endTime <= newRuleWindow.end;
      return !stillCovered;
    });

    this.throwIfAffected(affected);
  }

  /** For an exception write, checks whether any of the given windows overlap a CONFIRMED booking. */
  async assertWindowsSafe(tutorId: string, windows: Interval[]): Promise<void> {
    if (!windows.length) return;

    const affected = await this.prisma.booking.findMany({
      where: {
        tutorId,
        status: 'CONFIRMED',
        OR: windows.map((w) => ({
          startTime: { lt: w.end },
          endTime: { gt: w.start },
        })),
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        sessionId: true,
      },
    });

    this.throwIfAffected(affected);
  }

  private throwIfAffected(
    affected: {
      id: string;
      startTime: Date;
      endTime: Date;
      sessionId: string | null;
    }[],
  ): void {
    if (!affected.length) return;
    throw new ConflictException({
      message:
        'This change would remove availability covering one or more confirmed sessions',
      affectedSessions: affected.map((b) => ({
        bookingId: b.id,
        sessionId: b.sessionId,
        startTime: b.startTime,
        endTime: b.endTime,
      })),
    });
  }
}
