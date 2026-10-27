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
const { default: SharedBookingsTable } = await import('@/components/dashboard/SharedBookingsTable')
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
