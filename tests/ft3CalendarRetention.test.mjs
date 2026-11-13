import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

const { bookingCalendarEventType, isRetainedPartialRefundBooking } = await import('../lib/calendar/bookingEvents.ts')

test('FT3 #5: retained past days of a partially refunded started booking stay visible', () => {
  assert.equal(bookingCalendarEventType('cancelled', { retainedAfterRefund: true }), 'booking-completed')
  // A plain cancellation (or a retained flag on another status) keeps its normal colour.
  assert.equal(bookingCalendarEventType('cancelled'), null)
  assert.equal(bookingCalendarEventType('cancelled', { retainedAfterRefund: false }), null)
  assert.equal(bookingCalendarEventType('refunded', { retainedAfterRefund: true }), null)
  assert.equal(bookingCalendarEventType('in_progress', { retainedAfterRefund: true }), 'booking-active')
})

test('FT3 #8: completed bookings render in the completed colour', () => {
  assert.equal(bookingCalendarEventType('completed'), 'booking-completed')
  assert.equal(bookingCalendarEventType('completed', { retainedAfterRefund: false }), 'booking-completed')
})

test('isRetainedPartialRefundBooking requires cancelled + preserved planning + partial refund', () => {
  const retained = { status: 'cancelled', refundPreservesPastPlanning: true, payment: { status: 'partially_refunded' } }
  assert.equal(isRetainedPartialRefundBooking(retained), true)
  assert.equal(isRetainedPartialRefundBooking({ ...retained, payment: { status: 'refunded' } }), false)
  assert.equal(isRetainedPartialRefundBooking({ ...retained, refundPreservesPastPlanning: false }), false)
  assert.equal(isRetainedPartialRefundBooking({ ...retained, status: 'completed' }), false)
  assert.equal(isRetainedPartialRefundBooking(null), false)
})

test('employee and team calendars pass the retained flag from the booking ranges', () => {
  for (const component of ['EmployeeAvailability', 'TeamManagement']) {
    const source = readFileSync(new URL(`../components/${component}.tsx`, import.meta.url), 'utf8')
    assert.match(source, /bookingCalendarEventType\(range\.status, \{ retainedAfterRefund: range\.retainedAfterRefund \}\)/, component)
    assert.match(source, /retainedAfterRefund\?: boolean/, component)
  }
})

test('personal calendar shows only retained planned days, never the whole refunded window', () => {
  const profile = readFileSync(new URL('../app/(pages)/profile/page.tsx', import.meta.url), 'utf8')
  assert.match(profile, /bookingCalendarEventType\(booking\?\.status, \{ retainedAfterRefund: isRetainedPartialRefundBooking\(booking\) \}\) !== null/)
  assert.match(profile, /if \(retainedAfterRefund && !hasPlan\) return/)
})
