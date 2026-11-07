import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { transformSync } from '@swc/core'
import { format } from 'date-fns'
import { enGB } from 'date-fns/locale'
import { formatInTimeZone } from 'date-fns-tz'
import { getTimelineDisplaySchedule, getTimelineBounds, resolveTimelineShowTimes, toTimelineDate } from '../lib/bookingTimeline.ts'

const source = readFileSync(new URL('../components/dashboard/BookingTimelineBoard.tsx', import.meta.url), 'utf8')
const formatter = source.slice(source.indexOf('const formatDateLabel ='), source.indexOf('const hasPayableMilestone ='))
const builder = source.slice(source.indexOf('const buildTooltip ='), source.indexOf('const renderActionButtons ='))
const code = transformSync(`${formatter}\n${builder}`, { jsc: { parser: { syntax: 'typescript' } } }).code
const buildTooltip = new Function('format', 'formatInTimeZone', 'toTimelineDate', 'getDisplaySchedule', 'resolveTimelineShowTimes', 'getBookingPrice', 'formatMoney', 't', 'dateFns', `${code}; return buildTooltip;`)(
  format, formatInTimeZone, toTimelineDate, getTimelineDisplaySchedule, resolveTimelineShowTimes, () => null, () => '', (key, values) => values?.value ?? key, enGB,
)
test('timeline tooltip uses the recorded zone for both dates and preserves recorded wall times', () => {
  const previousTZ = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    const booking = { status: 'booked', scheduleTimeZone: 'Europe/Brussels', scheduleSnapshot: { executionDuration: { unit: 'hours' } },
      scheduledStartDate: '2026-11-04T23:30:00Z', scheduledExecutionEndDate: '2026-11-05T23:30:00Z', scheduledStartTime: '00:30', scheduledEndTime: '00:30' }
    assert.equal(buildTooltip(booking, getTimelineBounds(booking)), '05 Nov 2026 00:30\n06 Nov 2026 00:30')
    const calendar = { ...booking, scheduledStartDate: '2026-11-05', scheduledExecutionEndDate: '2026-11-06' }
    assert.equal(buildTooltip(calendar, getTimelineBounds(calendar)), '05 Nov 2026 00:30\n06 Nov 2026 00:30')
  } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ }
})

test('a moved reschedule start never inherits the previous end time without an explicit proposed end', () => {
  const base = { status: 'rescheduling_requested', scheduledStartDate: '2026-11-05', scheduledExecutionEndDate: '2026-11-05', scheduledStartTime: '10:00', scheduledEndTime: '12:00' }
  for (const proposedSchedule of [{ scheduledStartDate: '2026-11-06' }, { scheduledStartTime: '14:00' }]) {
    const schedule = getTimelineDisplaySchedule({ ...base, rescheduleRequest: { proposedSchedule } })
    assert.equal(schedule.scheduledEndTime, null)
    assert.equal(resolveTimelineShowTimes({ ...base, project: { timeMode: 'hours' }, rescheduleRequest: { proposedSchedule } }), false)
  }
  assert.equal(getTimelineDisplaySchedule({ ...base, rescheduleRequest: { proposedSchedule: { scheduledStartTime: '10:00' } } }).scheduledEndTime, '12:00')
  assert.equal(getTimelineDisplaySchedule({ ...base, rescheduleRequest: { proposedSchedule: { scheduledStartTime: '14:00', scheduledEndTime: '16:00' } } }).scheduledEndTime, '16:00')
})
