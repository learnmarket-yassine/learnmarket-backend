export interface Interval {
  start: Date;
  end: Date;
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const merged: Interval[] = [];

  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.start.getTime() <= last.end.getTime()) {
      if (iv.end.getTime() > last.end.getTime()) last.end = iv.end;
    } else {
      merged.push({ start: iv.start, end: iv.end });
    }
  }

  return merged;
}

export function union(base: Interval[], add: Interval[]): Interval[] {
  return mergeIntervals([...base, ...add]);
}

export function subtract(base: Interval[], remove: Interval[]): Interval[] {
  let result = base;

  for (const r of remove) {
    const next: Interval[] = [];
    for (const b of result) {
      if (
        r.end.getTime() <= b.start.getTime() ||
        r.start.getTime() >= b.end.getTime()
      ) {
        next.push(b);
        continue;
      }
      if (r.start.getTime() > b.start.getTime()) {
        next.push({ start: b.start, end: r.start });
      }
      if (r.end.getTime() < b.end.getTime()) {
        next.push({ start: r.end, end: b.end });
      }
    }
    result = next;
  }

  return result.filter((iv) => iv.end.getTime() > iv.start.getTime());
}

export function overlaps(a: Interval, b: Interval): boolean {
  return (
    a.start.getTime() < b.end.getTime() && a.end.getTime() > b.start.getTime()
  );
}

export function chunkIntoSlots(
  intervals: Interval[],
  durationMs: number,
): Date[] {
  const starts: Date[] = [];
  for (const iv of intervals) {
    let cursor = iv.start.getTime();
    const end = iv.end.getTime();
    while (cursor + durationMs <= end) {
      starts.push(new Date(cursor));
      cursor += durationMs;
    }
  }
  return starts;
}
