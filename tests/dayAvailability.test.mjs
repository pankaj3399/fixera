import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { MIN_FREE_WORKING_HOURS, freeWorkingHours, hasEnoughFreeWorkingTime } from '../lib/calendar/dayAvailability.ts'

test('a day is available only with at least 3 free working hours', () => {
  assert.equal(MIN_FREE_WORKING_HOURS, 3)
  // 8h schedule (09:00–17:00)
  assert.equal(hasEnoughFreeWorkingTime({ workingHours: 8, blockedHours: 0 }), true)
  assert.equal(hasEnoughFreeWorkingTime({ workingHours: 8, blockedHours: 5 }), true, '3h free is enough')
  assert.equal(hasEnoughFreeWorkingTime({ workingHours: 8, blockedHours: 5.5 }), false, '2.5h free is not')
  assert.equal(hasEnoughFreeWorkingTime({ workingHours: 8, blockedHours: 6 }), false, 'reported 23/10 case: 2h free')
  // The old rule ("blocked >= 4h ⇒ unavailable") disagrees in both directions:
  assert.equal(hasEnoughFreeWorkingTime({ workingHours: 10, blockedHours: 4 }), true, '6h free stays bookable')
  assert.equal(hasEnoughFreeWorkingTime({ workingHours: 5, blockedHours: 3 }), false, 'only 2h free although <4h blocked')
})

test('free time derives from the schedule, not from blocked hours alone', () => {
  assert.equal(freeWorkingHours({ workingHours: 6, blockedHours: 3.5 }), 2.5)
  assert.equal(hasEnoughFreeWorkingTime({ workingHours: 2.5, blockedHours: 0 }), false, 'short schedule never qualifies')
  assert.equal(hasEnoughFreeWorkingTime({ workingHours: 0, blockedHours: 0 }), false)
  assert.equal(hasEnoughFreeWorkingTime({ workingHours: Number.NaN, blockedHours: 0 }), false)
  assert.equal(hasEnoughFreeWorkingTime({ workingHours: 8, blockedHours: Number.POSITIVE_INFINITY }), false)
  assert.equal(freeWorkingHours({ workingHours: 8, blockedHours: -2 }), 8)
  // Minute arithmetic: 8h − 4h59m59.9s still leaves ~3h
  assert.equal(hasEnoughFreeWorkingTime({ workingHours: 8, blockedHours: 5 - 0.0001 / 3600 }), true)
  assert.equal(hasEnoughFreeWorkingTime({ workingHours: 8, blockedHours: 5 + 1 / 60 }), false, 'one minute short')
})

test('booking wizard uses the free-hour rule for day-based availability', () => {
  const form = readFileSync(new URL('../components/project/ProjectBookingForm.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(form, /PARTIAL_BLOCK_THRESHOLD_HOURS/)
  assert.match(form, /return !hasEnoughFreeWorkingTime\(computeBlockedHoursForIntervals\(date, intervals\)\)/)
  assert.doesNotMatch(form, /if \(intervals\.length === 0\) \{\s*return false;\s*\}\s*const \{ blockedHours \}/)
})
