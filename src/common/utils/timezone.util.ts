/**
 * Converts a "wall clock" time (a calendar date + minutes-since-midnight,
 * local to `timeZone`) into the absolute UTC instant it represents.
 * Handles DST correctly by resolving the zone's actual offset at that instant.
 */
export function zonedTimeToUtc(
  dateStr: string,
  minutesSinceMidnight: number,
  timeZone: string,
): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const hours = Math.floor(minutesSinceMidnight / 60);
  const minutes = minutesSinceMidnight % 60;

  const naiveUtcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const offsetMs = getTimezoneOffsetMs(naiveUtcMs, timeZone);
  return new Date(naiveUtcMs - offsetMs);
}

/** Returns the timeZone's UTC offset (in ms, positive east of UTC) at the given instant. */
function getTimezoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );

  return asUtc - utcMs;
}

/** Formats a calendar Date as "YYYY-MM-DD" (UTC calendar, no timezone shifting). */
export function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves the calendar date (as seen in `timeZone`) and weekday
 * (0 = Sunday .. 6 = Saturday, matching JS `Date.getDay()`) for a given
 * UTC instant.
 */
export function getZonedDateParts(
  instant: Date,
  timeZone: string,
): { dateStr: string; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);

  const year = get('year');
  const month = get('month');
  const day = get('day');
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return { dateStr, weekday };
}
