/**
 * Schedule-related utility functions for availability and time calculations.
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

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
    console.error(`Invalid dateStr format: ${dateStr}`)
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
    console.error(`Error processing timezone conversion: ${error}`)
    return null
  }
}
