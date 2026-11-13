import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import IntlMessageFormat from 'intl-messageformat'
import {
  COMPLETION_SEARCH_DAYS,
  addExecutionHours,
  advanceWorkingDays,
  longestWorkingDayHours,
  maxWorkingWindowHours,
  withBookingQuantity,
  workingHoursForDay,
  workingWindowHours,
} from '../lib/bookingSchedule.ts'

const FORM = readFileSync(new URL('../components/project/ProjectBookingForm.tsx', import.meta.url), 'utf8')
const messages = (locale) => JSON.parse(readFileSync(new URL(`../messages/${locale}/projectBooking.json`, import.meta.url), 'utf8'))

test('projected completion keeps fractional execution hours (2.5 h ends 30 min later than 2 h)', () => {
  const start = new Date(2026, 10, 3, 9, 0, 0, 0)
  assert.equal(addExecutionHours(start, 2.5).getTime() - start.getTime(), 150 * 60_000)
  assert.equal(addExecutionHours(start, 2).getHours(), 11)
  assert.equal(addExecutionHours(start, 2.5).getMinutes(), 30)
  assert.equal(addExecutionHours(start, 1 / 3).getMinutes(), 20, 'rounded to whole minutes like the slot end')
  assert.equal(start.getHours(), 9, 'input date is not mutated')
  // Control: the old setHours call dropped the fraction.
  const old = new Date(start)
  old.setHours(old.getHours() + 2.5)
  assert.equal(old.getMinutes(), 0)
  assert.match(FORM, /const executionEnd = addExecutionHours\(startDate, executionHours\);/)
  assert.doesNotMatch(FORM, /executionEnd\.setHours\(executionEnd\.getHours\(\) \+ executionHours\)/)
})

test('working hours per weekday use the calendar fallback for missing or unavailable days', () => {
  assert.deepEqual(workingHoursForDay(undefined), { startTime: '09:00', endTime: '17:00' })
  assert.deepEqual(workingHoursForDay({ available: false, startTime: '06:00', endTime: '22:00' }), { startTime: '09:00', endTime: '17:00' })
  assert.deepEqual(workingHoursForDay({ available: true, startTime: '07:30' }), { startTime: '07:30', endTime: '17:00' })
  assert.equal(workingWindowHours({ available: true, startTime: '07:00', endTime: '19:30' }), 12.5)
  // The form's per-date lookup delegates to the same rule.
  assert.match(FORM, /return workingHoursForDay\(dayAvailability\);/)
})

test('customer-hours maximum is the largest window of the seven weekdays, fallback included', () => {
  assert.equal(maxWorkingWindowHours(null), 8, 'no availability: 09:00–17:00 every day')
  const week = {
    monday: { available: true, startTime: '08:00', endTime: '12:00' },
    tuesday: { available: true, startTime: '08:00', endTime: '12:00' },
    wednesday: { available: true, startTime: '07:00', endTime: '19:00' },
    thursday: { available: true, startTime: '08:00', endTime: '12:00' },
    friday: { available: true, startTime: '08:00', endTime: '12:00' },
    saturday: { available: true, startTime: '08:00', endTime: '12:00' },
    sunday: { available: true, startTime: '08:00', endTime: '12:00' },
  }
  assert.equal(maxWorkingWindowHours(week), 12, 'one long day keeps 12 h bookable')
  const shortWeek = Object.fromEntries(Object.keys(week).map((day) => [day, { available: true, startTime: '08:00', endTime: '12:00' }]))
  assert.equal(maxWorkingWindowHours(shortWeek), 4)
  // An unavailable weekday counts as 09:00–17:00, exactly as the calendar builds its slots.
  assert.equal(maxWorkingWindowHours({ ...shortWeek, sunday: { available: false } }), 8)
})

test('FT1 6B: customer hours above the longest working day are booked in day mode, not rejected', () => {
  assert.doesNotMatch(FORM, /toasts\.maxHoursPerWorkingDay/, 'step 1 no longer blocks long hour quantities')
  assert.doesNotMatch(FORM, /maxWorkingWindowHours/)
  // The booked execution goes through the same working-day rule as the engine.
  assert.match(
    FORM,
    /scheduledExecutionDuration<AnyExecutionDuration>\(\s*selectedPackage,\s*project\.executionDuration,\s*isUnitPricing \? estimatedUsage : 1,\s*longestWorkingDayHours\(professionalAvailability\),\s*\)/,
  )
  // The engine's mode wins while its proposals match the package and quantity.
  assert.match(FORM, /\(proposals\?\.mode && proposalsKey === currentProposalsKey \? proposals\.mode : undefined\) \|\|\s*bookedExecution\?\.unit \|\|\s*'days'/)
  assert.match(FORM, /setProposals\(data\.proposals\);\s*setProposalsKey\(requestKey\);/)
})

test('longest working day mirrors the backend: unavailable weekdays do not count', () => {
  const shortWeek = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map((day) => [day, { available: true, startTime: '09:00', endTime: '15:00' }]))
  // maxWorkingWindowHours treats an unavailable day as 09:00–17:00; the engine skips it.
  assert.equal(longestWorkingDayHours({ ...shortWeek, saturday: { available: false }, sunday: { available: false } }), 6)
  assert.equal(longestWorkingDayHours({ ...shortWeek, monday: { available: true, startTime: '08:00', endTime: '18:00' } }), 10)
  assert.equal(longestWorkingDayHours({ monday: { available: true } }), 8, 'missing times use 09:00–17:00')
  assert.equal(longestWorkingDayHours({ monday: { available: false } }), 0)
  assert.equal(longestWorkingDayHours(null), 0)
})

test('completion search is bounded: no workable day returns null instead of looping forever', () => {
  const start = new Date(2026, 10, 3)
  const never = () => false
  let calls = 0
  const counting = (day) => { calls += 1; return never(day) }
  assert.equal(advanceWorkingDays(start, 2, counting), null)
  assert.ok(calls <= COMPLETION_SEARCH_DAYS + 1, `bounded at ${calls} checks`)
  assert.equal(advanceWorkingDays(start, 3, never, 10), null)
})

test('completion search keeps the existing working-day count when days are workable', () => {
  const start = new Date(2026, 10, 2) // Monday
  const weekdays = (day) => day.getDay() !== 0 && day.getDay() !== 6
  assert.equal(advanceWorkingDays(start, 1, weekdays), start, 'one day ends on the start date')
  assert.equal(advanceWorkingDays(start, 0, weekdays), start)
  assert.equal(advanceWorkingDays(start, 2, weekdays).getDate(), 3)
  assert.equal(advanceWorkingDays(start, 6, weekdays).getDate(), 9, 'skips the weekend')
  const saturday = new Date(2026, 10, 7)
  assert.equal(advanceWorkingDays(saturday, 2, weekdays).getDate(), 10, 'a non-workable start is not counted')
})

test('booking form treats an unreachable completion as "no completion date"', () => {
  assert.match(FORM, /advanceWorkingDaysWithin\(\s*startDate,\s*workingDays,\s*\(day\) => isProfessionalWorkingDay\(day\) && !isDateBlocked\(toLocalDateKey\(day\)\),\s*\)/)
  assert.doesNotMatch(FORM, /while \(countedDays < workingDays\)/, 'the unbounded loop is gone')
  assert.match(FORM, /if \(!completionWithoutBuffer \|\| !includeBuffer\) \{\s*return completionWithoutBuffer;/)
  assert.match(FORM, /const bufferEndDate = advanceWorkingDays\(bufferStart, bufferDays\);\s*if \(!bufferEndDate\) return null;/)
})

test('booked quantity is added to scheduling requests of unit-priced packages only', () => {
  assert.equal(withBookingQuantity('/x/available-slots?date=2026-11-03', true, 6), '/x/available-slots?date=2026-11-03&quantity=6')
  assert.equal(withBookingQuantity('/x/availability', true, 2.5), '/x/availability?quantity=2.5')
  assert.equal(withBookingQuantity('/x/availability?subprojectIndex=1', true, 40), '/x/availability?subprojectIndex=1&quantity=40')
  assert.equal(withBookingQuantity('/x/schedule-proposals', false, 6), '/x/schedule-proposals')
})

test('all four scheduling requests carry the booked quantity', () => {
  // available slots, schedule window, team availability, schedule proposals
  for (const [name, pattern] of [
    ['available-slots', /\/available-slots\?date=\$\{selectedDate\}`;[\s\S]{0,200}?url = withBookingQuantity\(url, isUnitPricing, estimatedUsage\);[\s\S]{0,80}?fetch\(url/],
    ['schedule-window', /\/schedule-window\?startDate=\$\{startDate\}`;[\s\S]{0,200}?url = withBookingQuantity\(url, isUnitPricing, estimatedUsage\);/],
    ['availability', /\/availability`;[\s\S]{0,200}?url = withBookingQuantity\(url, isUnitPricing, estimatedUsage\);\s*const response = await fetch\(url\)/],
    ['schedule-proposals', /\/schedule-proposals`;[\s\S]{0,200}?endpoint = withBookingQuantity\(endpoint, isUnitPricing, estimatedUsage\);\s*const response = await fetch\(endpoint\)/],
  ]) {
    assert.match(FORM, pattern, name)
  }
  assert.equal((FORM.match(/withBookingQuantity\(/g) || []).length, 4)
  assert.doesNotMatch(FORM, /quantity=\$\{/, 'no request builds the quantity by hand')
})

test('the customer-hours hint follows the duration mode exactly', () => {
  assert.match(FORM, /\{packageDurationMode\(selectedPackage\.pricing\) === 'customer_hours' \? \(\s*<span[^>]*>\{t\('package\.hoursDeterminedByCustomer'\)\}/)
  assert.doesNotMatch(FORM, /isHourUnit\(selectedPackage\.pricing\.unit\)/, 'the duration mode decides, not the unit alone')
})
