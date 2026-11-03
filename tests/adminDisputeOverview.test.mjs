import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
const require = createRequire(import.meta.url)
const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime')
const { buildDisputeOverview, filterDisputeOverviewRows } = await import('@/lib/admin/disputeFilters')
const { BookingDisputeCards, SeparateQueueCounts } = await import('@/components/admin/disputes/DisputeOverviewSummary')
const { parseCancellationStatusFilter, isAdminActionableCancellation } = await import('@/lib/admin/cancellationRequestFilters')

// Rows shaped like GET /api/admin/disputes (booking disputes in `disputes`,
// the warranty/refund preview in `externalDisputes`, page 1 only).
const recordedDispute = { _id: 'b-dispute', bookingNumber: 'BK-DISPUTE', status: 'dispute', dispute: { raisedBy: 'u1', reason: 'Extra costs too high', type: 'extra_costs' } }
const settled = { _id: 'b-settled', bookingNumber: 'BK-SETTLED', status: 'completed', dispute: { raisedBy: 'u1', reason: 'r', resolvedAt: '2026-10-06T09:00:00.000Z' } }
const warrantyRow = { _id: 'warranty:w1', source: 'warranty', readOnly: true, claimNumber: 'WC-1', claimStatus: 'open', resolveHref: '/admin/warranty-claims', bookingId: 'b-w', bookingNumber: 'BK-W', status: 'completed', dispute: { type: 'warranty_claim' } }
const refundRow = { _id: 'refund:r1', source: 'refund', readOnly: true, resolveHref: '/admin/cancellation-requests?status=escalated', bookingId: 'b-r', bookingNumber: 'BK-R', status: 'booked', dispute: { type: 'refund_request' } }

const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
const render = (element) => renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router }, element))
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

test('zero records: empty booking list and empty separate preview', () => {
  for (const view of ['all', 'open']) {
    const o = buildDisputeOverview({ disputes: [], externalDisputes: [], view, page: 1 })
    assert.deepEqual(o.bookingRows, [])
    assert.deepEqual(o.separateRows, [])
    assert.equal(o.showSeparateQueues, true)
  }
  const resolved = buildDisputeOverview({ disputes: [], externalDisputes: [], view: 'resolved', page: 1 })
  assert.deepEqual(resolved.bookingRows, [])
  assert.equal(resolved.showSeparateQueues, false)
  // Missing arrays from a failed/legacy response are empty too.
  assert.deepEqual(buildDisputeOverview({ disputes: undefined, externalDisputes: null, view: 'all', page: 1 }).bookingRows, [])
})

test('one recorded dispute appears once; warranty/refund rows stay in their own list', () => {
  const o = buildDisputeOverview({ disputes: [recordedDispute], externalDisputes: [warrantyRow, refundRow], view: 'all', page: 1 })
  assert.deepEqual(o.bookingRows.map((row) => row.bookingNumber), ['BK-DISPUTE'])
  assert.deepEqual(o.separateRows.map((row) => row._id), ['warranty:w1', 'refund:r1'])
  // Even if a separate-queue row were sent in `disputes`, it never joins the booking list.
  const mixed = buildDisputeOverview({ disputes: [warrantyRow, recordedDispute, refundRow], externalDisputes: [], view: 'open', page: 1 })
  assert.deepEqual(mixed.bookingRows.map((row) => row._id), ['b-dispute'])
})

test('normal extra-cost completions and phantom-default bookings are not booking disputes', () => {
  const rows = [
    recordedDispute,
    { _id: 'extra', status: 'professional_completed', extraCostTotal: 40, extraCostStatus: 'pending' },
    { _id: 'extra-done', status: 'completed', extraCostTotal: 25 },
    { _id: 'phantom', status: 'booked', dispute: { type: 'extra_costs', raisedAt: '2026-10-01T09:00:00.000Z' } },
  ]
  assert.deepEqual(filterDisputeOverviewRows(rows, 'all').map((row) => row._id), ['b-dispute'])
  assert.deepEqual(filterDisputeOverviewRows(rows, 'open').map((row) => row._id), ['b-dispute'])
  assert.deepEqual(filterDisputeOverviewRows(rows, 'resolved'), [])
})

test('resolved history shows only in the resolved view, without the separate queues', () => {
  const resolved = buildDisputeOverview({ disputes: [settled], externalDisputes: [], view: 'resolved', page: 1 })
  // Previously dropped client-side because the booking status is no longer `dispute`.
  assert.deepEqual(resolved.bookingRows.map((row) => row.bookingNumber), ['BK-SETTLED'])
  assert.equal(resolved.showSeparateQueues, false)
  assert.deepEqual(resolved.separateRows, [])
  // History never leaks into the default/open overview.
  assert.deepEqual(buildDisputeOverview({ disputes: [settled], externalDisputes: [], view: 'all', page: 1 }).bookingRows, [])
})

test('page 2 keeps the booking page and notes that the separate preview is on page 1', () => {
  const o = buildDisputeOverview({ disputes: [recordedDispute], externalDisputes: [], view: 'all', page: 2 })
  assert.deepEqual(o.bookingRows.map((row) => row._id), ['b-dispute'])
  assert.deepEqual(o.separateRows, [])
  assert.equal(o.separatePreviewOnPageOne, true)
  assert.equal(buildDisputeOverview({ disputes: [], externalDisputes: [warrantyRow], view: 'all', page: 1 }).separatePreviewOnPageOne, false)
})

test('rendered cards state booking-dispute scope and show zero for zero data', () => {
  const zero = render(React.createElement(BookingDisputeCards, { analytics: { totalOpen: 0, totalResolved: 0, totalDisputes: 0 } }))
  assert.match(zero, /data-testid="open-booking-disputes">0</)
  assert.match(zero, /data-testid="resolved-booking-disputes">0</)
  assert.match(zero, /data-testid="bookings-in-dispute">0</)
  assert.match(text(zero), /Booking disputes only\. Warranty claims and refund requests are separate queues/)
  assert.match(text(zero), /Open booking disputes/)
  assert.match(text(zero), /Resolved \(history\)/)
  assert.doesNotMatch(text(zero), /Total Disputes/)

  const one = render(React.createElement(BookingDisputeCards, { analytics: { totalOpen: 1, totalResolved: 0, totalDisputes: 1, separateQueues: { activeWarrantyClaims: 2, escalatedRefundRequests: 1 } } }))
  assert.match(one, /data-testid="open-booking-disputes">1</)
  assert.match(one, /data-testid="bookings-in-dispute">1</)
  // Separate-queue counts are never summed into the booking cards.
  assert.doesNotMatch(one, />(3|4)</)
})

test('rendered separate-queue counts carry their own labels and resolution links', () => {
  const html = render(React.createElement(SeparateQueueCounts, {
    queues: { activeWarrantyClaims: 2, escalatedRefundRequests: 1, warrantyClaimsHref: '/admin/warranty-claims', refundRequestsHref: '/admin/cancellation-requests?status=escalated' },
  }))
  assert.match(text(html), /Active warranty claims: 2/)
  assert.match(text(html), /Escalated refund requests: 1/)
  assert.match(html, /href="\/admin\/warranty-claims"/)
  assert.match(html, /href="\/admin\/cancellation-requests\?status=escalated"/)
  // Older backend without hrefs still links to the own queues.
  const fallback = render(React.createElement(SeparateQueueCounts, { queues: { activeWarrantyClaims: 0, escalatedRefundRequests: 0 } }))
  assert.match(text(fallback), /Active warranty claims: 0/)
  assert.match(fallback, /href="\/admin\/cancellation-requests\?status=escalated"/)
})

test('refund queue: ?status=escalated opens the escalated view; default stays pending', () => {
  assert.equal(parseCancellationStatusFilter('escalated'), 'escalated')
  for (const value of ['all', 'pending', 'approved', 'denied']) assert.equal(parseCancellationStatusFilter(value), value)
  for (const value of [null, undefined, '', 'bogus', 'processing']) assert.equal(parseCancellationStatusFilter(value), 'pending')
  assert.equal(isAdminActionableCancellation('pending'), true)
  assert.equal(isAdminActionableCancellation('escalated'), true)
  for (const value of ['approved', 'denied', 'negotiating', undefined]) assert.equal(isAdminActionableCancellation(value), false)
})

test('pages keep the lists apart and wire the own-queue links', () => {
  const page = readFileSync(new URL('../app/(pages)/admin/disputes/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /setDisputes\(paginated\)/)
  assert.match(page, /setExternalRows\(external\)/)
  assert.doesNotMatch(page, /\[\.\.\.external, \.\.\.paginated\]/)
  assert.match(page, /setTotalBookingDisputes\(Number\(json\.data\?\.pagination\?\.total\) \|\| 0\)/)
  assert.match(page, /Showing \{visibleDisputes\.length\} of \{totalBookingDisputes\} booking/)
  assert.match(page, /No booking disputes found/)
  assert.match(page, /<BookingDisputeCards analytics=\{analytics\} \/>/)
  assert.match(page, /<SeparateQueueCounts queues=\{analytics\.separateQueues\} \/>/)
  assert.match(page, /visibleExternalRows\.map\(\(d\) => renderDisputeCard\(d\)\)/)
  assert.match(page, /refund: 'Escalated refund request'/)
  assert.match(page, /'Open in warranty claims' : 'Open in refund requests'/)
  // The existing filter/page reset on filter change is preserved.
  assert.match(page, /setStatusFilter\(value\); setPage\(1\)/)

  const refunds = readFileSync(new URL('../app/(pages)/admin/cancellation-requests/page.tsx', import.meta.url), 'utf8')
  assert.match(refunds, /syncCancellationStatusFilterState\(filterState, statusQuery\)/)
  assert.match(refunds, /const statusQuery = searchParams\.get\('status'\)/)
  assert.match(refunds, /<SelectItem value="escalated">Escalated<\/SelectItem>/)
  assert.match(refunds, /\{isAdminActionableCancellation\(item\.status\) && \(/)
})
