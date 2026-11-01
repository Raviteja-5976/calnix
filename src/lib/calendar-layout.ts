import { addDays, daysBetween } from "./dates";

export interface Span {
  id: string;
  start_date: string | null;
  end_date: string | null;
  start_time?: string | null;
}

export interface Bar<T> {
  item: T;
  /** Zero-based day of the week where the bar begins. */
  column: number;
  /** Number of days it covers this week. */
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface WeekLayout<T> {
  bars: Bar<T>[];
  /** Per day, how many items didn't fit in the visible lanes. */
  hidden: number[];
}

/**
 * Places items into lanes so that bars in one lane never overlap. Longer items
 * get the upper lanes, which keeps multi-day bands in a steady line across the
 * week, with single-day items stacked below them.
 */
export function layoutWeek<T extends Span>(items: T[], weekStart: string, maxLanes: number): WeekLayout<T> {
  const weekEnd = addDays(weekStart, 6);

  const inWeek = items
    .filter((i): i is T & { start_date: string; end_date: string } =>
      Boolean(i.start_date && i.end_date && i.start_date <= weekEnd && i.end_date >= weekStart))
    .sort((a, b) =>
      a.start_date.localeCompare(b.start_date) ||
      daysBetween(b.start_date, b.end_date) - daysBetween(a.start_date, a.end_date) ||
      (a.start_time ?? "").localeCompare(b.start_time ?? "") ||
      a.id.localeCompare(b.id));

  // Multi-day first so they claim the top lanes, whatever day they start.
  const ordered = [
    ...inWeek.filter((i) => i.start_date !== i.end_date),
    ...inWeek.filter((i) => i.start_date === i.end_date),
  ];

  const laneEnds: number[] = [];
  const bars: Bar<T>[] = [];
  const hidden = [0, 0, 0, 0, 0, 0, 0];

  for (const item of ordered) {
    const continuesBefore = item.start_date < weekStart;
    const continuesAfter = item.end_date > weekEnd;
    const column = continuesBefore ? 0 : daysBetween(weekStart, item.start_date);
    const last = continuesAfter ? 6 : daysBetween(weekStart, item.end_date);

    let lane = laneEnds.findIndex((end) => end < column);
    if (lane === -1) lane = laneEnds.length;

    if (lane >= maxLanes) {
      for (let day = column; day <= last; day++) hidden[day]++;
      continue;
    }
    laneEnds[lane] = last;
    bars.push({ item, column, span: last - column + 1, lane, continuesBefore, continuesAfter });
  }

  return { bars, hidden };
}

/** Items on a given day, in reading order: timed first, then by title. */
export function itemsOnDay<T extends Span & { title: string }>(items: T[], day: string): T[] {
  return items
    .filter((i) => i.start_date && i.end_date && i.start_date <= day && i.end_date >= day)
    .sort((a, b) =>
      (a.start_time ?? "99").localeCompare(b.start_time ?? "99") || a.title.localeCompare(b.title));
}
