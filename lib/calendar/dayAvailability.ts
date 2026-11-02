/**
 * Daily planning rule (Final Touches Part 3 #2): a working day is available
 * for a day-based booking only when at least MIN_FREE_WORKING_HOURS of its
 * working schedule are still free after merging blocked ranges and existing
 * bookings inside the working window.
 *
 * This replaces the former "4 or more blocked hours ⇒ unavailable" rule,
 * which kept a 6-hour day with 2 free hours bookable (the reported 23/10
 * case). Must match the backend availability engine.
 */
export const MIN_FREE_WORKING_HOURS = 3;

/** Float tolerance so 3h free computed from minute arithmetic still counts. */
const EPSILON_HOURS = 1 / 3600;

export interface DayWorkload {
  /** Length of the day's working window in hours (0 or non-finite = none). */
  workingHours: number;
  /** Merged blocked/booked hours inside the working window. */
  blockedHours: number;
}

export function freeWorkingHours({ workingHours, blockedHours }: DayWorkload): number {
  if (!Number.isFinite(workingHours) || workingHours <= 0) return 0;
  if (!Number.isFinite(blockedHours)) return 0;
  return Math.max(0, workingHours - Math.max(0, blockedHours));
}

export function hasEnoughFreeWorkingTime(day: DayWorkload, minimumHours = MIN_FREE_WORKING_HOURS): boolean {
  return freeWorkingHours(day) + EPSILON_HOURS >= minimumHours;
}
