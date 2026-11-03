import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const { default: RescheduleRequestCard } = await import('@/components/booking/RescheduleRequestCard')
const {
  hasRecordedRescheduleRequest,
  legacyRescheduleEntries,
  resolveRescheduleEntries,
  selectCancellationRequest,
} = await import('@/lib/bookingDetails.ts')

const messages = {
  bookings: JSON.parse(readFileSync(new URL('../messages/en/bookings.json', import.meta.url), 'utf8')),
  common: JSON.parse(readFileSync(new URL('../messages/en/common.json', import.meta.url), 'utf8')),
}

/**
 * Exactly what the backend booking GET serializes for a booking that never had
 * a reschedule request: Mongoose (fixera-server models/booking.ts nested
 * `rescheduleRequest` path) materializes the `assignedTeamMembers` arrays as []
 * on hydrate, and `toObject()` keeps them.
 */
const MONGOOSE_DEFAULT_SHELL = {
  previousSchedule: { assignedTeamMembers: [] },
  proposedSchedule: { assignedTeamMembers: [] },
}

const CUSTOMER = 'customer-1'
const PROFESSIONAL = 'pro-1'
const REQUESTED_AT = '2026-10-20T09:00:00.000Z'

function renderCard(reschedules, viewer = { id: CUSTOMER, role: 'customer' }) {
  return renderToStaticMarkup(
    React.createElement(
      NextIntlClientProvider,
      { locale: 'en', messages, timeZone: 'UTC', onError() {} },
      React.createElement(RescheduleRequestCard, {
        bookingId: 'b1',
        reschedules,
        viewerUserId: viewer.id,
        viewerRole: viewer.role,
      })
    )
  )
}

const acceptButton = new RegExp(`>${messages.bookings.common.accept}<`)

test('the schema-default rescheduleRequest shell renders no reschedule panel (sparse / completion-ready bookings)', () => {
  for (const shell of [
    MONGOOSE_DEFAULT_SHELL,
    {},
    { previousSchedule: {}, proposedSchedule: {} },
    { reason: '   ', previousSchedule: { assignedTeamMembers: [], scheduledStartDate: null } },
    null,
    undefined,
  ]) {
    assert.equal(hasRecordedRescheduleRequest(shell), false, JSON.stringify(shell))
    assert.deepEqual(legacyRescheduleEntries(shell, CUSTOMER), [])
    // The page path: the details DTO (BE242 included) sends no entries for a
    // never-rescheduled booking, so the legacy shell must not become a card.
    for (const reschedules of [undefined, null, []]) {
      const entries = resolveRescheduleEntries({ reschedules, liveRequest: shell, bookingStatus: 'booked', viewerUserId: CUSTOMER })
      assert.deepEqual(entries, [])
      assert.equal(renderCard(entries), '', `no panel for ${JSON.stringify(shell)}`)
    }
  }
})

test('a recorded legacy pending request from the other party still renders with its reason, schedules and actions', () => {
  const request = {
    ...MONGOOSE_DEFAULT_SHELL,
    status: 'pending',
    requestedBy: PROFESSIONAL,
    requestedAt: REQUESTED_AT,
    reason: 'Material delivery delayed',
    description: 'Supplier moved the delivery by a week.',
    previousSchedule: { scheduledStartDate: '2026-10-23T00:00:00.000Z', scheduledStartTime: '09:00', assignedTeamMembers: [] },
    proposedSchedule: { scheduledStartDate: '2026-10-30T00:00:00.000Z', scheduledStartTime: '10:00', assignedTeamMembers: [] },
  }
  const entries = legacyRescheduleEntries(request, CUSTOMER)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].canRespond, true)
  assert.equal(entries[0].status, 'pending')
  const html = renderCard(entries)
  assert.match(html, /Material delivery delayed/)
  assert.match(html, /Supplier moved the delivery by a week\./)
  assert.match(html, /09:00 /, 'original schedule time')
  assert.match(html, /10:00 /, 'new schedule time')
  assert.match(html, acceptButton)
  assert.doesNotMatch(html, new RegExp(messages.bookings.rescheduleRequest.noActionAvailable))
})

test('the requester (string or populated id) cannot answer their own pending legacy request', () => {
  const base = { status: 'pending', requestedAt: REQUESTED_AT, reason: 'Sick team member', proposedSchedule: { scheduledStartDate: '2026-10-30T00:00:00.000Z' } }
  for (const requestedBy of [CUSTOMER, { _id: CUSTOMER, name: 'Customer' }]) {
    const entries = legacyRescheduleEntries({ ...base, requestedBy }, CUSTOMER)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].canRespond, false)
    const html = renderCard(entries)
    assert.match(html, /Sick team member/)
    assert.doesNotMatch(html, acceptButton)
  }
})

test('recorded accepted / declined / disputed legacy requests stay visible with their status and reason', () => {
  for (const status of ['accepted', 'declined', 'disputed']) {
    const entries = legacyRescheduleEntries(
      { ...MONGOOSE_DEFAULT_SHELL, status, reason: `Reason ${status}`, requestedAt: REQUESTED_AT },
      CUSTOMER
    )
    assert.equal(entries.length, 1, status)
    assert.equal(entries[0].status, status)
    assert.equal(entries[0].canRespond, false)
    const html = renderCard(entries)
    assert.match(html, new RegExp(`Reason ${status}`))
    assert.match(html, new RegExp(messages.bookings.rescheduleRequest.status[status]))
  }
  assert.equal(legacyRescheduleEntries({ proposedSchedule: { scheduledStartDate: '2026-10-30T00:00:00.000Z', assignedTeamMembers: [] } }, CUSTOMER).length, 1)
  assert.equal(legacyRescheduleEntries({ requestedBy: PROFESSIONAL }, CUSTOMER).length, 1)
})

/**
 * BE242 (fixera-server feat/final-touches-3, src/utils/bookingDetails/projection.ts)
 * emits reschedule entries without `canRespond`; BE ft4 adds it. The shape
 * below is that projection's entry for a live pending request.
 */
const be242Entry = (overrides = {}) => ({
  id: `reschedule:0:${REQUESTED_AT}`,
  requestedAt: REQUESTED_AT,
  requestedBy: { id: PROFESSIONAL, name: 'Pro', role: 'professional' },
  actorRecorded: true,
  reason: 'Rain forecast',
  description: null,
  note: null,
  status: 'pending',
  respondedAt: null,
  respondedBy: null,
  responseNote: null,
  previousSchedule: { scheduledStartDate: '2026-10-23T00:00:00.000Z' },
  proposedSchedule: { scheduledStartDate: '2026-10-30T00:00:00.000Z' },
  timeZone: 'Europe/Brussels',
  timeZoneRecorded: true,
  ...overrides,
})
const liveRequest = { status: 'pending', requestedBy: PROFESSIONAL, requestedAt: REQUESTED_AT, reason: 'Rain forecast' }

test('BE242 details entries without canRespond keep the customer accept/refund actions on the live pending request', () => {
  const entries = resolveRescheduleEntries({
    reschedules: [be242Entry()],
    liveRequest,
    bookingStatus: 'rescheduling_requested',
    viewerUserId: CUSTOMER,
  })
  assert.equal(entries[0].canRespond, true)
  const html = renderCard(entries)
  assert.match(html, acceptButton)
  assert.match(html, new RegExp(`>${messages.bookings.common.refund}<`))
  // Before the backfill, the same BE242 entry rendered no action at all.
  assert.doesNotMatch(renderCard([be242Entry()]), acceptButton)
})

test('BE242 backfill follows the respond-reschedule endpoint: live pending only, never the requester', () => {
  const cases = [
    ['booking no longer rescheduling_requested', { bookingStatus: 'booked' }],
    ['live request already answered', { liveRequest: { ...liveRequest, status: 'accepted' } }],
    ['history entry with a different request time', { reschedules: [be242Entry({ requestedAt: '2026-09-01T09:00:00.000Z' })] }],
    ['viewer is the requester', { viewerUserId: PROFESSIONAL }],
    ['entry already terminal', { reschedules: [be242Entry({ status: 'declined' })] }],
    ['no live request recorded', { liveRequest: MONGOOSE_DEFAULT_SHELL }],
  ]
  for (const [label, overrides] of cases) {
    const entries = resolveRescheduleEntries({
      reschedules: [be242Entry()],
      liveRequest,
      bookingStatus: 'rescheduling_requested',
      viewerUserId: CUSTOMER,
      ...overrides,
    })
    assert.equal(entries[0].canRespond, false, label)
    assert.doesNotMatch(renderCard(entries), acceptButton, label)
  }
  // Same instant in another ISO spelling still matches the live request.
  const offset = resolveRescheduleEntries({
    reschedules: [be242Entry({ requestedAt: '2026-10-20T11:00:00+02:00' })],
    liveRequest,
    bookingStatus: 'rescheduling_requested',
    viewerUserId: CUSTOMER,
  })
  assert.equal(offset[0].canRespond, true)
})

test('an explicit backend canRespond (BE ft4 and later) is kept as sent', () => {
  for (const canRespond of [true, false]) {
    const [entry] = resolveRescheduleEntries({
      reschedules: [be242Entry({ canRespond })],
      liveRequest: canRespond ? MONGOOSE_DEFAULT_SHELL : liveRequest,
      bookingStatus: canRespond ? 'booked' : 'rescheduling_requested',
      viewerUserId: CUSTOMER,
    })
    assert.equal(entry.canRespond, canRespond)
  }
  const history = [be242Entry({ status: 'declined', requestedAt: '2026-09-01T09:00:00.000Z' }), be242Entry()]
  const resolved = resolveRescheduleEntries({ reschedules: history, liveRequest, bookingStatus: 'rescheduling_requested', viewerUserId: CUSTOMER })
  assert.deepEqual(resolved.map((entry) => entry.canRespond), [false, true])
})

test('the booking page shows the live or newest cancellation request, not the first DTO row', () => {
  const denied = { id: 'c1', status: 'denied', reason: 'Old request', createdAt: '2026-09-01T10:00:00.000Z' }
  const pending = { id: 'c2', status: 'pending', reason: 'New request', createdAt: '2026-10-25T10:00:00.000Z' }
  const approved = { id: 'c3', status: 'approved', reason: 'Latest closed', createdAt: '2026-10-28T10:00:00.000Z' }
  // Participant details DTO: oldest first (Booking/details.ts sorts createdAt: 1).
  assert.equal(selectCancellationRequest([denied, pending])?.id, 'c2')
  // Admin detail: newest first.
  assert.equal(selectCancellationRequest([pending, denied])?.id, 'c2')
  // A live request wins over a newer closed one.
  assert.equal(selectCancellationRequest([denied, pending, approved])?.id, 'c2')
  for (const status of ['negotiating', 'escalated', 'processing']) {
    assert.equal(selectCancellationRequest([{ ...pending, status }, approved])?.id, 'c2', status)
  }
  // Nothing live: the newest closed request.
  assert.equal(selectCancellationRequest([denied, approved])?.id, 'c3')
  assert.equal(selectCancellationRequest([approved, denied])?.id, 'c3')
  // Unrecorded dates keep DTO order among themselves.
  assert.equal(selectCancellationRequest([{ id: 'a', status: 'denied' }, { id: 'b', status: 'approved' }])?.id, 'a')
  assert.equal(selectCancellationRequest([]), null)
  assert.equal(selectCancellationRequest(undefined), null)
})

test('the booking page wires the resolvers instead of the raw DTO rows', () => {
  const page = readFileSync(new URL('../app/(pages)/bookings/[id]/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /resolveRescheduleEntries\(\{\s*reschedules: details\?\.reschedules,\s*liveRequest: booking\?\.rescheduleRequest,\s*bookingStatus: booking\?\.status,/)
  assert.match(page, /selectCancellationRequest\(details\?\.cancellations\)/)
  assert.doesNotMatch(page, /details\?\.cancellations\?\.\[0\]/)
})
