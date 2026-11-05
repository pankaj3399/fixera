import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
const require = createRequire(import.meta.url)
const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime')
const { AuthProvider } = await import('@/contexts/AuthContext')
const { default: SharedBookingsTable, completionAdditionOf } = await import('@/components/dashboard/SharedBookingsTable')
const { default: SharedQuotesTable } = await import('@/components/dashboard/SharedQuotesTable')
const messages = Object.fromEntries(['auth', 'dashboardWidgets', 'search'].map(name => [name, JSON.parse(readFileSync(new URL(`../messages/en/${name}.json`, import.meta.url), 'utf8'))]))
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
const props = { formatMoney: (amount, currency = 'EUR') => `${currency} ${amount.toFixed(2)}`, intl: 'en-GB', statusLabel: status => status, invoiceLabel: 'Invoice', downloadLabel: 'Download', chatLabel: 'Chat', warrantyLabel: 'Warranty', payNowLabel: 'Pay now', viewLabel: 'View', acceptPayLabel: 'Accept & Pay' }
function render(Component, booking, viewerRole) {
  return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router },
    React.createElement(NextIntlClientProvider, { locale: 'en', timeZone: 'UTC', messages },
      React.createElement(AuthProvider, null, React.createElement(Component, { ...props, viewerRole, bookings: [booking] })))))
}
test('booking table renders a recorded model, refund, and public professional tags', () => {
  const booking = { _id: 'b1', status: 'completed', priceModel: 'unit', professional: { _id: 'p1', name: 'Piet', professionalLevel: 'Level 2', adminTags: ['verified', 'our choice'] }, payment: { professionalPayout: 80, refundAmount: 20, currency: 'EUR' } }
  const pro = render(SharedBookingsTable, booking, 'professional')
  assert.match(pro, />unit</)
  assert.match(pro, /EUR 20.00/)
  const customer = render(SharedBookingsTable, booking, 'customer')
  assert.match(customer, /Verified/)
  assert.match(customer, /Our Choice/)
  assert.doesNotMatch(customer, /EUR 80.00/)
})
test('quote table displays the pinned customer total including VAT, with tags', () => {
  const html = render(SharedQuotesTable, { _id: 'b1', status: 'quoted', currentQuoteVersion: 2, professional: { _id: 'p1', adminTags: ['verified'] }, quoteVersions: [{ version: 2, totalAmount: 300, currency: 'EUR', customerTotals: { totalWithVat: 363 }, firstPossibleStart: '2026-10-28T08:00:00.000Z' }] }, 'customer')
  assert.match(html, /EUR 363.00/)
  assert.match(html, /28\/10\/2026/)
  assert.doesNotMatch(html, /2026-10-28T08:00:00/)
  assert.doesNotMatch(html, /EUR 300.00/)
  assert.match(html, /Verified/)
})
test('booking table never shows an amount due as the paid price', () => {
  const due = { totalWithVat: 1210, currency: 'EUR', status: 'pending' }
  for (const status of ['quote_accepted', 'payment_pending']) {
    assert.doesNotMatch(render(SharedBookingsTable, { _id: 'b1', status, payment: { ...due, status: 'authorized' } }, 'customer'), /EUR 1210.00/)
  }
  // A later milestone's open checkout replaced booking.payment.
  assert.doesNotMatch(render(SharedBookingsTable, { _id: 'b1', status: 'in_progress', payment: due }, 'customer'), /EUR 1210.00/)
  assert.match(render(SharedBookingsTable, { _id: 'b1', status: 'booked', payment: { ...due, status: 'authorized' } }, 'customer'), /EUR 1210.00/)
})
test('quote table shows a dash, not the pre-VAT net, for a priced version without a recorded total', () => {
  const priced = { version: 2, totalAmount: 300, currency: 'EUR', pricingLines: [{ description: 'Work', price: 300, vatRate: 21 }] }
  const html = render(SharedQuotesTable, { _id: 'b1', status: 'quoted', currentQuoteVersion: 2, quoteVersions: [priced] }, 'customer')
  assert.doesNotMatch(html, /EUR 300.00/)
  // Legacy versions without pricingLines keep the totalAmount fallback (0% VAT).
  const legacy = render(SharedQuotesTable, { _id: 'b1', status: 'quoted', currentQuoteVersion: 2, quoteVersions: [{ version: 2, totalAmount: 300, currency: 'EUR' }] }, 'customer')
  assert.match(legacy, /EUR 300.00/)
})
test('both dashboard tables have an accessible name', () => {
  assert.match(render(SharedBookingsTable, { _id: 'b1', status: 'completed' }, 'customer'), /<table[^>]*aria-label="Bookings"/)
  assert.match(render(SharedQuotesTable, { _id: 'b1', status: 'quoted' }, 'professional'), /<table[^>]*aria-label="Quotations"/)
})
// Paid price and completion addition mirror the backend overview row
// (fixera-server src/utils/bookingDetails/overviewRows.ts): VAT-inclusive
// recorded totals and settled extra-cost facts only.
const paidCell = html => {
  // Column 9 (Paid price) of the single body row.
  const row = html.split('<tbody')[1]
  const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/g)
  return cells[8]
}
const stripTags = cell => cell.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'")
test('booking table never presents the pre-VAT payment.amount as the paid price', () => {
  // createPaymentIntent stores the pre-VAT net in payment.amount.
  const legacy = render(SharedBookingsTable, { _id: 'b1', status: 'completed', payment: { amount: 1000, currency: 'EUR', status: 'completed' } }, 'customer')
  assert.equal(stripTags(paidCell(legacy)), '—')
  assert.doesNotMatch(legacy, /EUR 1000.00/)
  const recorded = render(SharedBookingsTable, { _id: 'b1', status: 'completed', payment: { amount: 1000, totalWithVat: 1210, currency: 'EUR', status: 'completed' } }, 'customer')
  assert.equal(stripTags(paidCell(recorded)), 'EUR 1210.00')
  // No payment at all, or a non-finite total, stays unknown, never 0.
  assert.equal(stripTags(paidCell(render(SharedBookingsTable, { _id: 'b1', status: 'completed' }, 'customer'))), '—')
  assert.equal(stripTags(paidCell(render(SharedBookingsTable, { _id: 'b1', status: 'completed', payment: { totalWithVat: null, currency: 'EUR' } }, 'professional'))), '—')
})
test('booking table adds only a succeeded VAT-inclusive extra-cost charge, never declared extraCosts entries', () => {
  const base = { _id: 'b1', status: 'completed', payment: { totalWithVat: 1210, currency: 'EUR', status: 'completed' } }
  // Declared IExtraCost entries carry no status and are pre-VAT pro amounts.
  const declared = render(SharedBookingsTable, { ...base, extraCosts: [{ type: 'other', name: 'Extra tiles', amount: 100 }] }, 'customer')
  assert.equal(stripTags(paidCell(declared)), 'EUR 1210.00')
  for (const extraCostStatus of ['pending', 'failed', 'refunded']) {
    const html = render(SharedBookingsTable, { ...base, payment: { ...base.payment, extraCostAmount: 121, extraCostStatus } }, 'customer')
    assert.equal(stripTags(paidCell(html)), 'EUR 1210.00', extraCostStatus)
  }
  // An explicitly loaded, empty refund ledger: no refunds, so the charge stands.
  const succeeded = render(SharedBookingsTable, { ...base, extraCosts: [{ type: 'other', name: 'Extra tiles', amount: 100 }], payment: { ...base.payment, extraCostAmount: 121, extraCostStatus: 'succeeded', refunds: [] } }, 'customer')
  assert.equal(stripTags(paidCell(succeeded)), 'EUR 1210.00+ EUR 121.00')
  assert.doesNotMatch(succeeded, /EUR 100.00/)
  // Succeeded without a recorded amount is unknown, not + 0.
  const noAmount = render(SharedBookingsTable, { ...base, payment: { ...base.payment, extraCostStatus: 'succeeded' } }, 'customer')
  assert.equal(stripTags(paidCell(noAmount)), 'EUR 1210.00')
})
test('booking table subtracts only actually returned extra-cost refunds, once', () => {
  const payment = { totalWithVat: 1210, currency: 'EUR', status: 'completed', refundAmount: 50 }
  const refunds = [
    { amount: 30, kind: 'extra_cost', status: 'succeeded' },
    { amount: 5, kind: 'extra_cost' }, // legacy row without status: an actual refund
    { amount: 40, kind: 'extra_cost', status: 'failed' },
    { amount: 41, kind: 'extra_cost', status: 'canceled' },
    { amount: 42, kind: 'extra_cost', status: 'pending' },
    { amount: 43, kind: 'extra_cost', status: 'requires_action' },
    { amount: 50, kind: 'booking', status: 'succeeded' }, // booking-price refund, not the addition
  ]
  const html = render(SharedBookingsTable, { _id: 'b1', status: 'completed', payment: { ...payment, refunds } }, 'professional')
  assert.equal(stripTags(paidCell(html)), 'EUR 1210.00− EUR 35.00')
  // The booking-price refund stays in its own column from refundAmount, not doubled.
  assert.equal((html.match(/EUR 50.00/g) || []).length, 1)
  // Charge and returned refund net out per the recorded facts.
  const both = render(SharedBookingsTable, { _id: 'b1', status: 'completed', payment: { ...payment, extraCostAmount: 121, extraCostStatus: 'succeeded', refunds: [{ amount: 21, kind: 'extra_cost', status: 'succeeded' }] } }, 'customer')
  assert.equal(stripTags(paidCell(both)), 'EUR 1210.00+ EUR 100.00')
  // Only failed rows: nothing returned, nothing recorded.
  const failedOnly = render(SharedBookingsTable, { _id: 'b1', status: 'completed', payment: { ...payment, refunds: [{ amount: 30, kind: 'extra_cost', status: 'failed' }] } }, 'customer')
  assert.equal(stripTags(paidCell(failedOnly)), 'EUR 1210.00')
})
test('booking table prefers the authoritative overview money, including an intentional unknown', () => {
  const payment = { totalWithVat: 1210, currency: 'EUR', status: 'completed', extraCostAmount: 121, extraCostStatus: 'succeeded', refunds: [] }
  const authoritative = render(SharedBookingsTable, { _id: 'b1', status: 'completed', payment, overview: {
    paidPrice: { amount: 999, currency: 'USD', source: 'recorded' },
    completionAddition: { amount: -12.5, currency: 'USD', source: 'recorded' },
  } }, 'customer')
  assert.equal(stripTags(paidCell(authoritative)), 'USD 999.00− USD 12.50')
  const unknown = render(SharedBookingsTable, { _id: 'b1', status: 'completed', payment, overview: {
    paidPrice: { amount: null, currency: null, source: 'not_recorded' },
    completionAddition: null,
  } }, 'customer')
  assert.equal(stripTags(paidCell(unknown)), '—')
  // A malformed recorded value is unknown, never a client-side fallback.
  const malformed = render(SharedBookingsTable, { _id: 'b1', status: 'completed', payment, overview: { paidPrice: { amount: '1210', source: 'recorded' } } }, 'customer')
  assert.equal(stripTags(paidCell(malformed)), '—+ EUR 121.00')
  // Overview present for one field only: the other is derived from the booking.
  const partial = render(SharedBookingsTable, { _id: 'b1', status: 'completed', payment, overview: { completionAddition: { amount: null, currency: null, source: 'not_recorded' } } }, 'customer')
  assert.equal(stripTags(paidCell(partial)), 'EUR 1210.00')
})
test('a fully refunded extra-cost charge nets to 0, never a negative credit; real credits and partial refunds stay', () => {
  const base = { totalWithVat: 1210, currency: 'EUR', status: 'completed' }
  const addition = payment => completionAdditionOf({ _id: 'b1', status: 'completed', payment: { ...base, ...payment } })
  const money = amount => ({ amount, currency: 'EUR', source: 'recorded' })
  const unknown = { amount: null, currency: null, source: 'not_recorded' }
  const refund = (amount, status = 'succeeded') => ({ amount, kind: 'extra_cost', status })
  // The reviewed case: charged 121, then refunded 121.
  const fullyRefunded = { extraCostAmount: 121, extraCostStatus: 'refunded', refunds: [refund(121)] }
  assert.deepEqual(addition(fullyRefunded), money(0))
  const html = render(SharedBookingsTable, { _id: 'b1', status: 'completed', payment: { ...base, ...fullyRefunded } }, 'customer')
  assert.equal(stripTags(paidCell(html)), 'EUR 1210.00', 'no "− EUR 121.00"')
  // Refunded, but the returning refund is not in this payload: unknown, not +121 or 0 invented.
  assert.deepEqual(addition({ extraCostAmount: 121, extraCostStatus: 'refunded' }), unknown)
  assert.deepEqual(addition({ extraCostAmount: 121, extraCostStatus: 'refunded', refunds: [refund(121, 'failed'), refund(121, 'pending')] }), unknown)
  // A partial returned ledger does not cover the refunded charge: unknown, never + 100.
  assert.deepEqual(addition({ extraCostAmount: 121, extraCostStatus: 'refunded', refunds: [refund(21)] }), unknown)
  // Returned rows beyond the refunded charge remain a credit.
  assert.deepEqual(addition({ extraCostAmount: 121, extraCostStatus: 'refunded', refunds: [refund(121), refund(10)] }), money(-10))
  // Partial refund of a succeeded charge leaves the remainder.
  assert.deepEqual(addition({ extraCostAmount: 121, extraCostStatus: 'succeeded', refunds: [refund(21)] }), money(100))
  // Succeeded charge with an explicitly empty ledger: no refunds, the charge stands.
  assert.deepEqual(addition({ extraCostAmount: 121, extraCostStatus: 'succeeded', refunds: [] }), money(121))
  // Succeeded charge without the refund ledger (legacy payload, no overview):
  // a partial refund may be missing, so unknown, never the full + 121.
  assert.deepEqual(addition({ extraCostAmount: 121, extraCostStatus: 'succeeded' }), unknown)
  assert.deepEqual(addition({ extraCostAmount: 121, extraCostStatus: 'succeeded', refunds: null }), unknown)
  // A negative "charge" is malformed: returned money is a refund row, not a negative charge.
  for (const extraCostStatus of ['succeeded', 'refunded']) {
    assert.deepEqual(addition({ extraCostAmount: -121, extraCostStatus, refunds: [] }), unknown, extraCostStatus)
    assert.deepEqual(addition({ extraCostAmount: -121, extraCostStatus }), unknown, extraCostStatus)
    // A real credit row still shows when the charge field is malformed.
    assert.deepEqual(addition({ extraCostAmount: -121, extraCostStatus, refunds: [refund(30)] }), money(-30), extraCostStatus)
  }
  // A zero charge with a loaded ledger is a recorded zero addition.
  assert.deepEqual(addition({ extraCostAmount: 0, extraCostStatus: 'succeeded', refunds: [] }), money(0))
  // Negative-only credit against the base charge, with no extra charge.
  assert.deepEqual(addition({ refunds: [refund(30), refund(5, undefined)] }), money(-35))
  for (const extraCostStatus of ['pending', 'failed', undefined]) {
    // An unsettled charge adds nothing; a real credit still shows.
    assert.deepEqual(addition({ extraCostAmount: 121, extraCostStatus, refunds: [refund(30)] }), money(-30), String(extraCostStatus))
    assert.deepEqual(addition({ extraCostAmount: 121, extraCostStatus }), unknown, String(extraCostStatus))
  }
  // No charge and no returned refund: nothing invented.
  assert.deepEqual(addition({ refunds: [refund(30, 'canceled')] }), unknown)
  // The authoritative overview still wins, unknown included.
  assert.deepEqual(completionAdditionOf({ _id: 'b1', status: 'completed', payment: { ...base, ...fullyRefunded }, overview: { completionAddition: null } }), unknown)
})

