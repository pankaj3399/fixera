import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cheapestPriceByModelUnit,
  describeEarningsBuckets,
  facetCount,
  recordedHoldDays,
  formatOverviewMoney,
  isPayNowEligible,
  isWarrantyActionEligible,
  quoteVersionHref,
  resolvePinnedQuoteVersion,
  resolveSnapshotTitles,
  sumStatusCounts,
} from '../lib/dashboardOverview.ts'

const eur = (amount, currency = 'EUR') => `${currency} ${amount.toFixed(2)}`

test('snapshot titles prefer the booking-time snapshot over the live project', () => {
  const titles = resolveSnapshotTitles({
    project: { _id: 'p1', title: 'Live mutated title' },
    bookingSnapshot: {
      project: { id: 'p1', title: 'Snapshot title' },
      selectedSubproject: { title: 'Snapshot subproject' },
    },
  })
  assert.equal(titles.titleSource, 'booking_snapshot')
  assert.equal(titles.projectTitle, 'Snapshot title')
  assert.equal(titles.subprojectTitle, 'Snapshot subproject')
})

test('snapshot titles fall back to the live project only without a snapshot', () => {
  const titles = resolveSnapshotTitles({ project: { _id: 'p1', title: 'Live title' } })
  assert.equal(titles.titleSource, 'live_project')
  assert.equal(titles.subprojectTitle, null)
})

test('overview money renders unknown as a dash, never zero', () => {
  assert.equal(formatOverviewMoney(null, eur), '—')
  assert.equal(formatOverviewMoney({ amount: null, currency: null, source: 'not_recorded' }, eur), '—')
  assert.equal(formatOverviewMoney({ amount: 0, currency: 'EUR', source: 'recorded' }, eur), 'EUR 0.00')
  assert.equal(formatOverviewMoney({ amount: 1210, currency: 'EUR', source: 'recorded' }, eur), 'EUR 1210.00')
})

test('earnings buckets render per currency without blending', () => {
  assert.equal(
    describeEarningsBuckets(
      [{ currency: 'EUR', totalEarnings: 100 }, { currency: 'USD', totalEarnings: 200 }],
      'totalEarnings',
      eur,
    ),
    'EUR 100.00 + USD 200.00',
  )
  assert.equal(describeEarningsBuckets([], 'totalEarnings', eur), '—')
  assert.equal(describeEarningsBuckets(null, 'pendingEarnings', eur), '—')
})

test('facet counts default to zero and sum over mode sets', () => {
  assert.equal(facetCount(undefined, 'booked'), 0)
  assert.equal(facetCount({ booked: 3 }, 'completed'), 0)
  assert.equal(sumStatusCounts({ booked: 3, completed: 5, cancelled: 1 }, ['booked', 'completed']), 8)
})

test('quote pinning prefers the recorded accepted version', () => {
  const booking = { acceptedQuoteVersion: 2, currentQuoteVersion: 4 }
  assert.deepEqual(resolvePinnedQuoteVersion(booking), { pinnedVersion: 2, pinnedVersionSource: 'recorded' })
  assert.equal(quoteVersionHref('b1', booking), '/bookings/b1#quotation-v2')
})

test('quote pinning infers current only without an accepted version', () => {
  assert.deepEqual(resolvePinnedQuoteVersion({ currentQuoteVersion: 3 }), {
    pinnedVersion: 3,
    pinnedVersionSource: 'inferred_current',
  })
  assert.equal(quoteVersionHref('b1', {}), '/bookings/b1')
})

test('cheapest prices group by model and unit without blending', () => {
  const buckets = cheapestPriceByModelUnit([
    { pricing: { type: 'fixed', amount: 500 } },
    { pricing: { type: 'fixed', amount: 300 } },
    { pricing: { type: 'unit', amount: 45, unit: 'm²' } },
    { pricing: { type: 'unit', amount: 60, unit: 'hour' } },
    { pricing: { type: 'rfq', amount: 10 } },
    { pricing: { type: 'fixed', amount: null } },
  ])
  assert.deepEqual(buckets, [
    { model: 'fixed', unit: null, cheapest: 300 },
    { model: 'unit', unit: 'hour', cheapest: 60 },
    { model: 'unit', unit: 'm²', cheapest: 45 },
  ])
})

test('cheapest prices support the legacy basePrice shape', () => {
  const buckets = cheapestPriceByModelUnit([
    { basePrice: 900, pricingModel: 'fixed' },
    { basePrice: 700, pricingModel: 'fixed' },
  ])
  assert.deepEqual(buckets, [{ model: 'fixed', unit: null, cheapest: 700 }])
})

test('pay-now and warranty eligibility mirror the server rules', () => {
  assert.equal(isPayNowEligible('quote_accepted'), true)
  assert.equal(isPayNowEligible('payment_pending'), true)
  assert.equal(isPayNowEligible('booked'), false)
  const now = new Date('2026-06-01T00:00:00.000Z').getTime()
  assert.equal(
    isWarrantyActionEligible({
      status: 'completed',
      warrantyCoverage: { duration: { value: 12 }, endsAt: '2027-01-01T00:00:00.000Z' },
    }, now),
    true,
  )
  assert.equal(
    isWarrantyActionEligible({
      status: 'completed',
      warrantyCoverage: { duration: { value: 12 }, endsAt: '2026-01-01T00:00:00.000Z' },
    }, now),
    false,
  )
  assert.equal(isWarrantyActionEligible({ status: 'booked' }, now), false)
})

test('hold days come only from the recorded hold transition', () => {
  const now = Date.parse('2026-10-27T12:00:00Z')
  assert.equal(recordedHoldDays('2026-10-24T12:00:00Z', now), 3)
  assert.equal(recordedHoldDays(null, now), null)
  assert.equal(recordedHoldDays('bad', now), null)
  assert.equal(recordedHoldDays('2026-10-28T00:00:00Z', now), null)
})
