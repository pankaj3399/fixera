/**
 * Date utility functions for form inputs and date manipulation.
 */

import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

/**
 * Flexible date input type that handles string, Date, MongoDB Extended JSON, null, and undefined.
 */
export type DateInput = string | Date | { $date: string } | null | undefined

/**
 * Canonical date value extractor - handles string, Date, {$date: string}, null, undefined.
 * Returns validated date string or null.
 */
export function getDateValue(dateValue: DateInput): string | null {
  if (!dateValue) return null
  if (typeof dateValue === 'object' && dateValue !== null && '$date' in dateValue) {
    const parsed = new Date(dateValue.$date)
    return Number.isNaN(parsed.getTime()) ? null : dateValue.$date
  }
  if (dateValue instanceof Date) {
    return Number.isNaN(dateValue.getTime()) ? null : dateValue.toISOString()
  }
  if (typeof dateValue === 'string') {
    const parsed = new Date(dateValue)
    return Number.isNaN(parsed.getTime()) ? null : dateValue
  }
  return null
}

/**
 * Converts a DateInput to an ISO datetime string.
 * For date-only strings (yyyy-MM-dd), appends T00:00:00 or T23:59:59 based on isEnd.
 */
export function toIsoDateTime(value: DateInput, isEnd = false): string | null {
  const dateStr = getDateValue(value)
  if (!dateStr) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const suffix = isEnd ? 'T23:59:59' : 'T00:00:00'
    const parsed = new Date(`${dateStr}${suffix}`)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  const parsed = new Date(dateStr)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

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
