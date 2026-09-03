import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { normalizeTimezone } from '@/lib/timezoneDisplay'
import type { CalendarEvent } from '@/components/calendar/WeeklyAvailabilityCalendar'

export function resolveAdminAvailabilityTimeZone(
  value: string | undefined,
  fallback: string,
): string {
  return normalizeTimezone(value, fallback)
}

export function safeFormatInTimeZone(
  date: Date,
  timeZone: string,
  format: string,
  fallbackTimeZone: string,
): string {
  const resolved = resolveAdminAvailabilityTimeZone(timeZone, fallbackTimeZone)
  try {
    return formatInTimeZone(date, resolved, format)
  } catch {
    return formatInTimeZone(date, fallbackTimeZone, format)
  }
}

export function hasStoredScheduleTimes(
  availability: Record<string, { startTime?: string; endTime?: string } | undefined>,
): boolean {
  return Object.values(availability).some((day) => day?.startTime || day?.endTime)
}

/** Accept HH:mm, H:mm, and browser time values that include seconds. */
export function parseClockTime(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d{1,3})?)?$/)
  if (!match) return undefined
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

export type AdminDaySchedule = { available: boolean; startTime?: string; endTime?: string }

const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const

export function defaultAdminDaySchedule(day: string): AdminDaySchedule {
  return {
    available: (WEEKDAY_KEYS as readonly string[]).includes(day),
    startTime: '09:00',
    endTime: '17:00',
  }
}

export function mergeAdminDaySchedule(day: string, loaded: AdminDaySchedule | undefined): AdminDaySchedule {
  const defaults = defaultAdminDaySchedule(day)
  return {
    available: loaded?.available === true,
    startTime: parseClockTime(loaded?.startTime) || defaults.startTime,
    endTime: parseClockTime(loaded?.endTime) || defaults.endTime,
  }
}

export function addIsoDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function buildBlockedCalendarEvents(
  blockedDates: Array<{ date: string; reason?: string }>,
  blockedRanges: Array<{ startDate: string; endDate: string; reason?: string }>,
  timeZone: string,
  fallbackTimeZone: string,
  idPrefix = 'admin-blocked',
): CalendarEvent[] {
  const resolvedTimeZone = resolveAdminAvailabilityTimeZone(timeZone, fallbackTimeZone)
  const events: CalendarEvent[] = []

  blockedDates.forEach((item, index) => {
    if (!item.date) return
    try {
      const start = fromZonedTime(`${item.date}T00:00:00`, resolvedTimeZone)
      const end = fromZonedTime(`${addIsoDays(item.date, 1)}T00:00:00`, resolvedTimeZone)
      events.push({
        id: `${idPrefix}-date-${index}`,
        type: 'company',
        title: item.reason ? `Blocked: ${item.reason}` : 'Blocked',
        start,
        end,
        readOnly: true,
      })
    } catch {
      // Skip invalid blocked dates when timezone is invalid.
    }
  })

  blockedRanges.forEach((range, index) => {
    const start = new Date(range.startDate)
    const end = new Date(range.endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return
    events.push({
      id: `${idPrefix}-range-${index}`,
      type: 'company',
      title: range.reason ? `Blocked: ${range.reason}` : 'Blocked',
      start,
      end,
      readOnly: true,
    })
  })

  return events
}
