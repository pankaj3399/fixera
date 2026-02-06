/**
 * Date utility functions for form inputs and date manipulation.
 */

import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

/**
 * Converts an ISO date string to a value suitable for datetime-local input.
 * Uses proper timezone-aware conversion via date-fns-tz to handle DST correctly.
 *
 * @param value - ISO date string or any string parseable by Date
 * @returns Local datetime string in "yyyy-MM-dd'T'HH:mm" format, or empty string if invalid
 */
export function toLocalInputValue(value: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return ''
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const zoned = toZonedTime(date, timeZone)
  return format(zoned, "yyyy-MM-dd'T'HH:mm")
}

/**
 * Gets the next day's date string from a given date value.
 * Returns a local date string to avoid off-by-one errors in non-UTC timezones.
 *
 * @param value - Date string to parse
 * @returns Date string in "yyyy-MM-dd" format for the next day (local time), or empty string if invalid
 */
export function getNextDateValue(value: string): string {
  let date: Date
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  } else {
    date = new Date(value)
  }
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + 1)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
