import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// The booking wizard rejected the start date it proposed itself when the
// browser zone differed from the professional's (UTC, Europe/Lisbon): the
// date step re-keyed the professional's midnight instant in the browser zone
// and landed on the previous day. Each browser zone runs in its own process
// because the zone must be fixed before Date is used.
const BROWSER_ZONES = ['UTC', 'Europe/Lisbon', 'Europe/Brussels', 'America/New_York', 'Asia/Tokyo']
const PROFESSIONAL_TZ = 'Europe/Brussels'

const probe = `
import { calendarDateFromKey, calendarDateKey } from ${JSON.stringify(new URL('../lib/calendar/calendarDateKey.ts', import.meta.url).href)}
import { addDays } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
const tz = ${JSON.stringify(PROFESSIONAL_TZ)}
// The wizard's day helpers: key a calendar-day Date, then resolve the
// professional's weekday from that key (isProfessionalWorkingDay).
const weekdayOf = (date) => formatInTimeZone(fromZonedTime(calendarDateKey(date) + 'T00:00:00', tz), tz, 'eeee')
const keys = []
// Every other day of a year, across both DST changes in Europe and the US.
for (let d = new Date(Date.UTC(2026, 0, 1)); d.getUTCFullYear() === 2026; d = new Date(d.getTime() + 2 * 864e5)) keys.push(d.toISOString().slice(0, 10))
const out = { roundTrip: [], weekday: [], window: [], legacyMismatch: 0 }
for (const key of keys) {
  const day = calendarDateFromKey(key)
  if (calendarDateKey(day) !== key) out.roundTrip.push(key)
  const expected = new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  if (weekdayOf(day) !== expected) out.weekday.push(key)
  // A 10-day window walked with addDays keeps consecutive keys.
  let cursor = day
  for (let i = 1; i <= 10; i++) {
    cursor = addDays(cursor, 1)
    const want = new Date(Date.parse(key + 'T12:00:00Z') + i * 864e5).toISOString().slice(0, 10)
    if (calendarDateKey(cursor) !== want) { out.window.push(key); break }
  }
  // The former conversion (professional midnight instant) for comparison.
  if (calendarDateKey(fromZonedTime(key + 'T00:00:00', tz)) !== key) out.legacyMismatch++
}
console.log(JSON.stringify(out))
`

const runIn = async (zone) => JSON.parse((await promisify(execFile)(
  process.execPath,
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--input-type=module', '-e', probe],
  { env: { ...process.env, TZ: zone }, encoding: 'utf8' },
)).stdout)
// One process per zone, started together.
const results = Object.fromEntries(BROWSER_ZONES.map(zone => [zone, runIn(zone)]))

for (const zone of BROWSER_ZONES) {
  test(`booking wizard date keys stay on the proposed day with the browser in ${zone}`, async () => {
    const result = await results[zone]
    assert.deepEqual(result.roundTrip, [], 'a proposed date key must map back to itself')
    assert.deepEqual(result.weekday, [], 'the professional weekday must be the weekday of the key')
    assert.deepEqual(result.window, [], 'a multi-day window must walk consecutive days')
    if (zone === 'UTC' || zone === 'Europe/Lisbon' || zone === 'America/New_York') {
      // Guards the regression: the old instant-based conversion shifted days here.
      assert.ok(result.legacyMismatch > 0, `${zone} is west of ${PROFESSIONAL_TZ}`)
    }
  })
}

test('the date step and default date resolve keys as calendar days, not professional instants', () => {
  const source = readFileSync(new URL('../components/project/ProjectBookingForm.tsx', import.meta.url), 'utf8')
  const isDateBlocked = source.slice(source.indexOf('const isDateBlocked ='), source.indexOf('const isDateBlocked =') + 400)
  assert.match(isDateBlocked, /dateObj = calendarDateFromKey\(dateString\)/)
  assert.doesNotMatch(isDateBlocked, /fromProfessionalDateKey/)
  const getMinDate = source.slice(source.indexOf('const getMinDate ='), source.indexOf('const calculateCompletionDate ='))
  assert.match(getMinDate, /let checkDate = calendarDateFromKey\(earliestKey\)/)
  // Hour buffers walk wall-clock days in the professional's frame.
  const buffer = source.slice(source.indexOf('const addWorkingHoursForBuffer ='), source.indexOf('const advanceWorkingDaysForBuffer ='))
  assert.match(buffer, /const dayStart = startOfDay\(cursor\)/)
  // Midnight-UTC range ends compare the professional's day, not a browser date.
  assert.match(source, /adjustRangeEndForMidnightUtc\(rangeEnd, dayStart, tz, dayEnd\)/)
})
