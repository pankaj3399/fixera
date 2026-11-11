import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
register('./swc-loader.mjs', import.meta.url)

const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const { CurrencyProvider } = await import('@/contexts/CurrencyContext')
const { createRequire } = await import('node:module')
const require = createRequire(import.meta.url)
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime')
const { AuthProvider } = await import('@/contexts/AuthContext')
const { OverviewPanel } = await import('@/components/booking/details/OverviewPanel')
const { PaymentsPanel } = await import('@/components/booking/details/PaymentsPanel')
const { ActivityPanel } = await import('@/components/booking/details/ActivityPanel')

const messagesByLocale = Object.fromEntries(['en', 'nl', 'fr'].map((locale) => [
  locale,
  JSON.parse(readFileSync(new URL(`../messages/${locale}/bookings.json`, import.meta.url), 'utf8')),
]))
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/bookingDetails/completed-customer.json', import.meta.url), 'utf8'))
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }

function render(element, locale = 'en') {
  return renderToStaticMarkup(React.createElement(NextIntlClientProvider, { locale, timeZone: 'UTC', messages: { bookings: messagesByLocale[locale] } },
    React.createElement(CurrencyProvider, { initialCurrency: 'EUR', initialRates: { EUR: 1 }, refreshRates: false },
      React.createElement(AppRouterContext.Provider, { value: router },
        React.createElement(AuthProvider, null, element)))))
}

function overview(viewerRole, mutate = () => {}) {
  const payload = fixture()
  payload.details.viewerRole = viewerRole
  mutate(payload)
  return render(React.createElement(OverviewPanel, { ...payload, viewerRole, pathname: '/bookings/x', search: '', onSelectTab() {} }))
}

test('customers see their completion-extras price, never the professional amount', () => {
  const html = overview('customer', (payload) => {
    payload.details.booking.extraCosts = { customerTotal: 123.45, currency: 'EUR', status: 'confirmed' }
    payload.booking.extraCostTotal = undefined
  })
  assert.match(html, /Completion extras \(your price, excl\. VAT\)/)
  assert.match(html, /123\.45/)
  assert.doesNotMatch(html, /professional amount/)
})

test('professionals see the professional amount and not a customer price', () => {
  const html = overview('professional', (payload) => {
    payload.details.booking.extraCosts = { total: 100, currency: 'EUR', status: 'confirmed' }
  })
  assert.match(html, /Completion extras \(professional amount\)/)
  assert.doesNotMatch(html, /your price, excl\. VAT/)
})

test('project title links to the project page and the professional to their profile (customer view)', () => {
  const html = overview('customer', (payload) => {
    payload.booking.project = { ...(payload.booking.project || {}), _id: '507f1f77bcf86cd799439099' }
    payload.booking.professional = { ...(payload.booking.professional || {}), _id: '507f1f77bcf86cd799439088' }
  })
  assert.match(html, /href="\/projects\/507f1f77bcf86cd799439099"/)
  assert.match(html, /href="\/professional\/507f1f77bcf86cd799439088"/)
  assert.match(html, /View profile/)
})

test('an anonymized professional gets no profile link', () => {
  const html = overview('customer', (payload) => {
    payload.booking.professional = { ...(payload.booking.professional || {}), _id: '507f1f77bcf86cd799439088', isAnonymized: true }
  })
  assert.doesNotMatch(html, /href="\/professional\//)
})

test('a derived refund VAT split is labelled as derived in every locale', () => {
  for (const locale of ['en', 'nl', 'fr']) {
    const payload = fixture()
    payload.details.payments.refunds = [{
      id: 'r1', amount: 60.5, currency: 'EUR', refundedAt: '2026-10-01T00:00:00.000Z', status: 'recorded',
      netAmount: 50, vatAmount: 10.5, vatRate: 21, vatSplitRecorded: false, vatSplitDerived: true, kind: 'booking',
      justification: 'Partial cancellation', justificationRecorded: true, noticeCodes: ['REFUND_VAT_SPLIT_DERIVED'],
    }]
    // The backend sends the matching panel notice (projection.ts).
    payload.details.payments.notices = [{ code: 'REFUND_VAT_SPLIT_DERIVED', severity: 'info', entity: 'refund' }]
    const html = render(React.createElement(PaymentsPanel, { booking: payload.booking, details: payload.details, viewerRole: 'customer' }), locale)
    if (!html.includes(messagesByLocale[locale].details.notices.refundVatSplitDerived)) { const i = html.indexOf("Partial cancellation"); console.log("DBG", i, html.slice(Math.max(0, i - 200), i + 900)) }
    const esc = (text) => text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')
    assert.ok(html.includes(esc(messagesByLocale[locale].details.notices.refundVatSplitDerived)), locale)
    assert.ok(!html.includes(esc(messagesByLocale[locale].details.notices.refundVatSplitNotRecorded)), locale)
    assert.match(html, /10[.,]50/)
  }
})

test('activity coverage badge reflects the append-only archive', () => {
  const payload = fixture()
  const renderCoverage = (coverage) => {
    const details = structuredClone(payload.details)
    details.activity = { ...(details.activity || {}), coverage, items: details.activity?.items || [] }
    return render(React.createElement(ActivityPanel, { booking: payload.booking, details, viewerRole: 'customer', pathname: '/bookings/x', search: '' }))
  }
  assert.match(renderCoverage({ status: 'complete', source: 'append_only_archive', appendOnlyArchive: true }), /Complete history/)
  assert.match(renderCoverage({ status: 'partial', source: 'append_only_archive', appendOnlyArchive: true }), /Recent changes were recorded/)
  assert.match(renderCoverage({ status: 'unknown', source: 'surviving_records', appendOnlyArchive: false }), /Historical coverage is unknown/)
})
