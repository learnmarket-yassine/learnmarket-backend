import { zonedTimeToUtc } from './timezone.util';

describe('zonedTimeToUtc', () => {
  it('converts winter (CET, UTC+1) local time to UTC', () => {
    // 2026-01-15 09:00 Europe/Paris -> 08:00 UTC
    const result = zonedTimeToUtc('2026-01-15', 9 * 60, 'Europe/Paris');
    expect(result.toISOString()).toBe('2026-01-15T08:00:00.000Z');
  });

  it('converts summer (CEST, UTC+2) local time to UTC, accounting for DST', () => {
    // 2026-07-15 09:00 Europe/Paris -> 07:00 UTC
    const result = zonedTimeToUtc('2026-07-15', 9 * 60, 'Europe/Paris');
    expect(result.toISOString()).toBe('2026-07-15T07:00:00.000Z');
  });

  it('handles UTC itself as a no-op offset', () => {
    const result = zonedTimeToUtc('2026-03-01', 14 * 60 + 30, 'UTC');
    expect(result.toISOString()).toBe('2026-03-01T14:30:00.000Z');
  });

  it('handles negative offsets (America/New_York, UTC-5 in winter)', () => {
    const result = zonedTimeToUtc('2026-01-15', 9 * 60, 'America/New_York');
    expect(result.toISOString()).toBe('2026-01-15T14:00:00.000Z');
  });

  it('handles half-hour offsets (Asia/Kolkata, UTC+5:30)', () => {
    const result = zonedTimeToUtc('2026-06-01', 10 * 60, 'Asia/Kolkata');
    expect(result.toISOString()).toBe('2026-06-01T04:30:00.000Z');
  });
});
