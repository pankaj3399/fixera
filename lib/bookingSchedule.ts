/**
 * Pure scheduling helpers for the customer booking form
 * (`components/project/ProjectBookingForm.tsx`), kept free of React so the
 * node test suite can exercise them directly.
 */

import { addDays } from 'date-fns'

export const DEFAULT_WORKING_HOURS = { startTime: '09:00', endTime: '17:00' } as const

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

type DayAvailability = { available?: boolean; startTime?: string; endTime?: string } | null | undefined

/**
 * Working hours of one weekday. A missing or unavailable weekday falls back to
 * 09:00–17:00, which is what the booking calendar uses to build its slots.
 */
export function workingHoursForDay(day: DayAvailability): { startTime: string; endTime: string } {
  if (!day || !day.available) return { ...DEFAULT_WORKING_HOURS }
  return {
    startTime: day.startTime || DEFAULT_WORKING_HOURS.startTime,
    endTime: day.endTime || DEFAULT_WORKING_HOURS.endTime,
  }
}

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** Hours between the start and the end of one weekday's working window. */
export function workingWindowHours(day: DayAvailability): number {
  const { startTime, endTime } = workingHoursForDay(day)
  return (minutesOf(endTime) - minutesOf(startTime)) / 60
}

/**
 * Largest working window across the seven weekdays. In hours mode a booking
 * longer than a day's window gets no slot on that day, so a customer-hours
 * quantity above this maximum has no bookable date at all.
 */
export function maxWorkingWindowHours(
  availability: Partial<Record<(typeof WEEKDAYS)[number], DayAvailability>> | null | undefined,
): number {
  const windows = WEEKDAYS.map((weekday) => workingWindowHours(availability?.[weekday]))
  const finite = windows.filter((hours) => Number.isFinite(hours) && hours > 0)
  return finite.length ? Math.max(...finite) : 0
}

/**
 * Longest working day (hours) exactly as the backend schedule engine computes
 * it (`getLongestWorkingDayHours`): unavailable weekdays are skipped instead
 * of falling back to 09:00–17:00. 0 when there is no working day. Quantity
 * hours above it are booked in day mode (FT1 6B).
 */
export function longestWorkingDayHours(
  availability: Partial<Record<(typeof WEEKDAYS)[number], DayAvailability>> | null | undefined,
): number {
  let longest = 0
  for (const weekday of WEEKDAYS) {
    const day = availability?.[weekday]
    if (!day || day.available === false) continue
    const start = minutesOf(day.startTime || DEFAULT_WORKING_HOURS.startTime)
    const end = minutesOf(day.endTime || DEFAULT_WORKING_HOURS.endTime)
    const hours = (end - start) / 60
    if (Number.isFinite(hours) && hours > longest) longest = hours
  }
  return longest
}

/** End of an execution that starts at `start` and lasts `hours`, fractions included. */
export function addExecutionHours(start: Date, hours: number): Date {
  const end = new Date(start)
  end.setMinutes(end.getMinutes() + Math.round(hours * 60))
  return end
}

/** Days searched for a completion date, the same horizon as the buffer search. */
export const COMPLETION_SEARCH_DAYS = 366 * 3

/**
 * Date of the `workingDays`-th workable day counted from `start` (inclusive),
 * or null when no such day exists within `maxDays`, for example when the
 * professional is unavailable every day.
 */
export function advanceWorkingDays(
  start: Date,
  workingDays: number,
  isWorkable: (day: Date) => boolean,
  maxDays: number = COMPLETION_SEARCH_DAYS,
): Date | null {
  if (workingDays <= 1) return start

  let cursor = start
  let counted = isWorkable(start) ? 1 : 0
  let searched = 0
  while (counted < workingDays) {
    if (searched >= maxDays) return null
    cursor = addDays(cursor, 1)
    searched += 1
    if (isWorkable(cursor)) counted += 1
  }
  return cursor
}

/** Adds the booked quantity to a scheduling request URL for unit-priced packages. */
export function withBookingQuantity(url: string, isUnitPricing: boolean, quantity: number): string {
  if (!isUnitPricing) return url
  return `${url}${url.includes('?') ? '&' : '?'}quantity=${encodeURIComponent(String(quantity))}`
}
