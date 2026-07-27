import { Injectable } from '@nestjs/common';
import { ExceptionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  toDateOnlyString,
  zonedTimeToUtc,
} from '../../common/utils/timezone.util';
import {
  chunkIntoSlots,
  Interval,
  subtract,
  union,
} from '../utils/interval.util';

@Injectable()
export class AvailabilityResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAvailableSlots(
    tutorId: string,
    fromDate: string,
    toDate: string,
    durationMinutes: number,
  ): Promise<Date[]> {
    const dates = enumerateDates(fromDate, toDate);
    const durationMs = durationMinutes * 60_000;
    const now = new Date();

    // Widened bounds so no relevant booking/hold is clipped by an extreme timezone offset.
    const queryLowerBound = addDays(new Date(`${fromDate}T00:00:00.000Z`), -1);
    const queryUpperBound = addDays(new Date(`${toDate}T00:00:00.000Z`), 2);

    const [rules, exceptions, bookings, holds] = await Promise.all([
      this.prisma.tutorAvailabilityRule.findMany({
        where: { tutorId, isActive: true },
      }),
      this.prisma.tutorAvailabilityException.findMany({
        where: {
          tutorId,
          date: {
            gte: new Date(`${fromDate}T00:00:00.000Z`),
            lte: new Date(`${toDate}T00:00:00.000Z`),
          },
        },
      }),
      this.prisma.booking.findMany({
        where: {
          tutorId,
          status: 'CONFIRMED',
          startTime: { lt: queryUpperBound },
          endTime: { gt: queryLowerBound },
        },
        select: { startTime: true, endTime: true },
      }),
      this.prisma.slotHold.findMany({
        where: {
          tutorId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
          startTime: { lt: queryUpperBound },
          endTime: { gt: queryLowerBound },
        },
        select: { startTime: true, endTime: true },
      }),
    ]);

    const busy: Interval[] = [...bookings, ...holds].map((b) => ({
      start: b.startTime,
      end: b.endTime,
    }));

    const exceptionsByDate = new Map<string, typeof exceptions>();
    for (const exception of exceptions) {
      const key = toDateOnlyString(exception.date);
      const bucket = exceptionsByDate.get(key);
      if (bucket) bucket.push(exception);
      else exceptionsByDate.set(key, [exception]);
    }

    const allSlots: Date[] = [];

    for (const dateStr of dates) {
      const weekday = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();

      let windows: Interval[] = rules
        .filter((rule) => rule.dayOfWeek === weekday)
        .map((rule) => ({
          start: zonedTimeToUtc(dateStr, rule.startTime, rule.timezone),
          end: zonedTimeToUtc(dateStr, rule.endTime, rule.timezone),
        }));

      const dayExceptions = exceptionsByDate.get(dateStr) ?? [];

      const addedWindows = dayExceptions
        .filter((e) => e.type === ExceptionType.ADDED)
        .map((e) =>
          exceptionWindow(dateStr, e.startTime, e.endTime, e.timezone),
        );
      windows = union(windows, addedWindows);

      const blockedWindows = dayExceptions
        .filter((e) => e.type === ExceptionType.BLOCKED)
        .map((e) =>
          exceptionWindow(dateStr, e.startTime, e.endTime, e.timezone),
        );
      windows = subtract(windows, blockedWindows);

      windows = subtract(windows, busy);

      allSlots.push(...chunkIntoSlots(windows, durationMs));
    }

    // The only place `now()` may influence the result: dropping slots whose
    // start has already elapsed. It must never be an ingredient of slot
    // generation itself, or the same conceptual slot would compute a
    // different timestamp depending on what millisecond the request landed on.
    return allSlots
      .filter((slot) => slot.getTime() >= now.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
  }
}

function exceptionWindow(
  dateStr: string,
  startTime: number | null,
  endTime: number | null,
  timezone: string,
): Interval {
  if (startTime == null || endTime == null) {
    return {
      start: zonedTimeToUtc(dateStr, 0, timezone),
      end: zonedTimeToUtc(dateStr, 1440, timezone),
    };
  }
  return {
    start: zonedTimeToUtc(dateStr, startTime, timezone),
    end: zonedTimeToUtc(dateStr, endTime, timezone),
  };
}

function enumerateDates(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(toDateOnlyString(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
