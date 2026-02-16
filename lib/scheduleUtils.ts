/**
 * Schedule-related utility functions for availability and time calculations.
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { logError } from './logger';

/**
 * Converts total minutes since midnight to an HH:MM time string.
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/**
 * Day order used across schedule utilities.
 * Values map to calendar day indices where 0=Sun, 1=Mon, ... 6=Sat.
 */
const SCHEDULE_DAY_ORDER: Array<{ key: string; calendarIndex: number }> = [
  { key: 'monday', calendarIndex: 1 },
  { key: 'tuesday', calendarIndex: 2 },
  { key: 'wednesday', calendarIndex: 3 },
  { key: 'thursday', calendarIndex: 4 },
  { key: 'friday', calendarIndex: 5 },
  { key: 'saturday', calendarIndex: 6 },
  { key: 'sunday', calendarIndex: 0 },
]

/**
 * Computes the earliest start and latest end across configured available days,
 * returning an object with dayStart and dayEnd time strings.
 */
export function getScheduleWindow(
  availability?: Record<string, { available?: boolean; startTime?: string; endTime?: string }>
): { dayStart: string; dayEnd: string } {
  if (!availability) {
    return { dayStart: '09:00', dayEnd: '17:00' }
  }
  let min: number | null = null
  let max: number | null = null

  SCHEDULE_DAY_ORDER.forEach(({ key: day }) => {
    const dayData = availability[day]
    if (!dayData?.available) return
    const start = parseTimeToMinutes(dayData.startTime || '09:00')
    const end = parseTimeToMinutes(dayData.endTime || '17:00')
    if (start === null || end === null || end <= start) return
    min = min === null ? start : Math.min(min, start)
    max = max === null ? end : Math.max(max, end)
  })

  if (min === null || max === null) {
    return { dayStart: '09:00', dayEnd: '17:00' }
  }

  return { dayStart: minutesToTime(min), dayEnd: minutesToTime(max) }
}

/**
 * Returns the configured visible day indices for the weekly calendar.
 * Falls back to Monday-Friday when no valid available days are configured.
 */
export function getVisibleScheduleDays(
  availability?: Record<string, { available?: boolean; startTime?: string; endTime?: string }>
): number[] {
  if (!availability) {
    return [1, 2, 3, 4, 5]
  }

  const visibleDays = SCHEDULE_DAY_ORDER
    .filter(({ key: day }) => availability[day]?.available)
    .map(({ calendarIndex }) => calendarIndex)

  return visibleDays.length > 0 ? visibleDays : [1, 2, 3, 4, 5]
}

// Type for daily availability schedule
type DaySchedule = {
  available: boolean
  startTime: string
  endTime: string
}

// Type for company availability by weekday
type CompanyAvailability = {
  monday: DaySchedule
  tuesday: DaySchedule
  wednesday: DaySchedule
  thursday: DaySchedule
  friday: DaySchedule
  saturday: DaySchedule
  sunday: DaySchedule
}

type WeekdayKey = keyof CompanyAvailability

/**
 * Parses a time string (HH:MM) to total minutes since midnight.
 * @param value - Time string in "HH:MM" format
 * @returns Total minutes, or null if invalid
 */
export function parseTimeToMinutes(value?: string): number | null {
  if (!value) return null
  const [hours, minutes] = value.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * Gets the working window in UTC for a given date based on the professional's timezone and availability.
 * @param dateStr - Date string in "yyyy-MM-dd" format
 * @param professionalTimeZone - IANA timezone string for the professional
 * @param companyAvailability - Weekly availability schedule
 * @returns Object with workStartUtc and workEndUtc Date objects, or null if unavailable
 */
export function getWorkingWindowUtc(
  dateStr: string,
  professionalTimeZone: string,
  companyAvailability: CompanyAvailability
): { workStartUtc: Date; workEndUtc: Date } | null {
  // Validate dateStr format (yyyy-MM-dd)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    logError(
      new Error('Invalid dateStr format'),
      'Failed to parse date string in getWorkingWindowUtc',
      { dateStr, professionalTimeZone, component: 'scheduleUtils', action: 'getWorkingWindowUtc' }
    )
    return null
  }

  try {
    const dayStartUtc = fromZonedTime(`${dateStr}T00:00:00`, professionalTimeZone)
    const weekday = formatInTimeZone(dayStartUtc, professionalTimeZone, 'eeee').toLowerCase() as WeekdayKey
    const daySchedule = companyAvailability[weekday]

    if (daySchedule?.available === false) {
      return null
    }

    const startTime = daySchedule?.startTime || '09:00'
    const endTime = daySchedule?.endTime || '17:00'
    const startMinutes = parseTimeToMinutes(startTime)
    const endMinutes = parseTimeToMinutes(endTime)

    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return null
    }

    const workStartUtc = fromZonedTime(`${dateStr}T${startTime}:00`, professionalTimeZone)
    const workEndUtc = fromZonedTime(`${dateStr}T${endTime}:00`, professionalTimeZone)

    return { workStartUtc, workEndUtc }
  } catch (error) {
    logError(
      error,
      'Error processing timezone conversion in getWorkingWindowUtc',
      { dateStr, professionalTimeZone, component: 'scheduleUtils', action: 'getWorkingWindowUtc' }
    )
    return null
  }
}
