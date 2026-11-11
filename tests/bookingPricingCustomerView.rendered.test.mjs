import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { loadComponent, ui } from './reviewComponentHarness.mjs'
import { register } from 'node:module'
register('./swc-loader.mjs', import.meta.url)
const currency = await import('@/contexts/CurrencyContext')
const { CurrencyProvider } = currency
const detailsLib = await import('@/lib/bookingDetails')
const primitives = await import('@/components/booking/details/DetailPrimitives')
const localeLib = await import('@/lib/i18n/useFormatLocale')
const intl = await import('next-intl')

const messages = JSON.parse(readFileSync(new URL('../messages/en/bookings.json', import.meta.url)))
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/bookingDetails/completed-customer.json', import.meta.url)))
function render(element) {
  return renderToStaticMarkup(React.createElement(NextIntlClientProvider, { locale: 'en', timeZone: 'UTC', messages: { bookings: messages } },
    React.createElement(CurrencyProvider, { initialCurrency: 'EUR', initialRates: { EUR: 1 }, refreshRates: false }, element)))
}
const shared = () => ({ react: React, 'next-intl': intl, '@/lib/bookingDetails': detailsLib, './DetailPrimitives': primitives,
  '@/contexts/CurrencyContext': currency, '@/lib/i18n/useFormatLocale': localeLib })
const activityPanel = (adminAreas = ['warranty', 'bookings', 'disputes', 'payments']) => loadComponent('../components/booking/details/ActivityPanel.tsx', {
  ...shared(),
  '@/contexts/AuthContext': { useAuth: () => ({ user: { role: 'admin', adminPermissionLevels: {} } }) },
  '@/lib/adminRbac': { canAccessAdminPage: (_user, pathname) => adminAreas.some(area => pathname === ({ bookings: '/admin/bookings', disputes: '/admin/disputes', warranty: '/admin/warranty-claims', payments: '/admin/payments' })[area]) },
}, 'ActivityPanel')

function claimActivity(claimNumber) {
  const data = fixture()
  data.details.activity = { complete: false, coverage: { status: 'unknown' }, items: [
    { id: 'claim:1', type: 'warranty_claim_opened', category: 'warranty', occurredAt: '', timestampRecorded: false, actorRecorded: false,
      metadata: { claimId: 'claim-1', ...(claimNumber ? { claimNumber } : {}), participantCanOpen: false }, attachments: [] },
  ] }
  data.details.adminLinks = { booking: '/admin/bookings/test', disputes: '/admin/disputes', warrantyClaims: '/admin/warranty-claims' }
  return data
}

test('an admin activity event without a claim number never links to another claim', () => {
  const ActivityPanel = activityPanel()
  const withNumber = render(React.createElement(ActivityPanel, { ...claimActivity('WC-1'), viewerRole: 'admin', pathname: '/admin/bookings/x', search: '' }))
  assert.match(withNumber, /warranty-claims\?search=WC-1/)
  const withoutNumber = render(React.createElement(ActivityPanel, { ...claimActivity(null), viewerRole: 'admin', pathname: '/admin/bookings/x', search: '' }))
  assert.doesNotMatch(withoutNumber, /warranty-claims\?search=/)
})

test('activity admin links open only the pages the admin may read', () => {
  const ActivityPanel = activityPanel(['bookings'])
  const html = render(React.createElement(ActivityPanel, { ...claimActivity('WC-1'), viewerRole: 'admin', pathname: '/admin/bookings/x', search: '' }))
  assert.doesNotMatch(html, /warranty-claims\?search=WC-1/)
})

test('customers see no professional total, net or commission in the quotation panel', async () => {
  const { QuotationPanel } = await import('@/components/booking/details/QuotationPanel')
  const payload = fixture()
  // Mirror the server's customer payload: professional-side fields are withheld, customer totals remain.
  payload.details.quotation.versions = [{ ...payload.details.quotation.versions?.[0], version: 2,
    customerTotals: { customerNetAmount: 120, totalWithVat: 145.2, currency: 'EUR', recordedAt: '2026-01-02T00:00:00.000Z' } }]
  delete payload.details.quotation.totalAmountProfessional
  const html = render(React.createElement(QuotationPanel, { ...payload, viewerRole: 'customer', pathname: '/bookings/test', search: '' }))
  assert.doesNotMatch(html, /Professional total|Professional net|Pricing lines \(professional net\)|Commission/)
  assert.match(html, /Customer price/)
})

test('a customer sees the customer total and no base amounts in the booking data panel', async () => {
  const { BookingPanel: BookingDataPanel } = await import('@/components/booking/details/BookingDataPanel')
  const payload = fixture()
  payload.details.viewerRole = 'customer'
  payload.details.bookingSnapshot = { ...(payload.details.bookingSnapshot || {}), checkoutSnapshot: {
    pricingType: 'fixed', unitAmount: 873.37, quantity: 1, baseSubtotal: 873.37, extraOptionsTotal: 0,
    totalAmount: 873.37, customerTotal: 986.91, currency: 'EUR', selectedOptions: [],
  } }
  const html = render(React.createElement(BookingDataPanel, { booking: payload.booking, details: payload.details }))
  assert.doesNotMatch(html, /Base subtotal|Unit price|Base amount/)
  assert.doesNotMatch(html, /873\.37/)
  assert.match(html, /986\.91/)
})

test('the overview falls back field by field to the summary version, never to a newer quote', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime')
  const { AuthProvider } = await import('@/contexts/AuthContext')
  const { OverviewPanel } = await import('@/components/booking/details/OverviewPanel')
  const payload = fixture()
  payload.viewerRole = 'professional'
  payload.details.viewerRole = 'professional'
  // The summary has no amount of its own, and the quotation has no professional total: the same version supplies it.
  payload.details.booking.quote = { quotationNumber: 'QT-1', currentVersion: 2, acceptedVersion: 1, currency: 'EUR', status: 'accepted' }
  delete payload.details.quotation.totalAmountProfessional
  payload.details.quotation.acceptedVersion = { version: 1, source: 'recorded' }
  payload.booking.quoteVersions = [
    { version: 1, totalAmount: 321.5, validUntil: '2026-06-01T00:00:00.000Z' },
    { version: 2, totalAmount: 999.99, validUntil: '2099-12-31T00:00:00.000Z' },
  ]
  const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
  const html = render(React.createElement(AppRouterContext.Provider, { value: router },
    React.createElement(AuthProvider, null, React.createElement(OverviewPanel, {
      ...payload, viewerRole: 'professional', pathname: '/bookings/test', search: '', onSelectTab() {},
    }))))
  assert.match(html, /321\.5/)
  assert.doesNotMatch(html, /999\.99|2099/)
})

test('a known price model is translated, a custom value keeps its raw label', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime')
  const { AuthProvider } = await import('@/contexts/AuthContext')
  const { OverviewPanel } = await import('@/components/booking/details/OverviewPanel')
  const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
  const renderWith = (priceModel) => {
    const payload = fixture()
    payload.details.booking.priceModel = priceModel
    return render(React.createElement(AppRouterContext.Provider, { value: router },
      React.createElement(AuthProvider, null, React.createElement(OverviewPanel, {
        ...payload, viewerRole: 'customer', pathname: '/bookings/test', search: '', onSelectTab() {},
      }))))
  }
  assert.match(renderWith('hour'), /Per hour/)
  assert.match(renderWith('custom_model'), /custom model/)
})

const overviewPanel = (allowedPaths) => loadComponent('../components/booking/details/OverviewPanel.tsx', {
  ...shared(),
  '@/components/ui/badge': ui,
  'lucide-react': ui,
  '@/contexts/AuthContext': { useAuth: () => ({ user: { role: 'admin', adminPermissionLevels: {} } }) },
  '@/lib/adminRbac': { canAccessAdminPage: (_user, pathname) => allowedPaths.includes(pathname) },
  'next/link': { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) },
  '@/lib/dashboardOverview': { projectHref: (id) => `/projects/${id}`, professionalHref: (id) => `/professional/${id}` },
  // Stub the card so the test reads the exact links the overview passes down.
  './AdminReferencesCard': { AdminReferencesCard: ({ links }) => React.createElement('ul', null,
    links.map(link => React.createElement('li', { key: link.key, 'data-key': link.key }, link.key))) },
}, 'OverviewPanel')

test('admin overview links appear only for destinations the admin may open', () => {
  const OverviewPanel = overviewPanel(['/admin/bookings'])
  const payload = fixture()
  payload.booking.dispute = { raisedAt: '2026-01-02T00:00:00.000Z' }
  payload.booking.payment = { ...(payload.booking.payment || {}), currency: 'EUR' }
  payload.details.warrantyClaims = [{ claimNumber: 'WC-1' }]
  const html = render(React.createElement(OverviewPanel, { ...payload, viewerRole: 'admin', pathname: '/admin/bookings/x', search: '', onSelectTab() {} }))
  assert.match(html, /data-key="booking"/)
  assert.doesNotMatch(html, /data-key="(warranty|disputes|payments)"/)
})

test('admin overview shows each link whose destination is open to the admin', () => {
  const OverviewPanel = overviewPanel(['/admin/bookings', '/admin/disputes', '/admin/warranty-claims', '/admin/payments'])
  const payload = fixture()
  payload.booking.dispute = { raisedAt: '2026-01-02T00:00:00.000Z' }
  payload.booking.payment = { ...(payload.booking.payment || {}), currency: 'EUR' }
  payload.details.warrantyClaims = [{ claimNumber: 'WC-1' }]
  const html = render(React.createElement(OverviewPanel, { ...payload, viewerRole: 'admin', pathname: '/admin/bookings/x', search: '', onSelectTab() {} }))
  assert.match(html, /data-key="(warranty|disputes|payments)"/)
  assert.match(html, /data-key="disputes"/)
  assert.match(html, /data-key="warranty"/)
  assert.match(html, /data-key="payments"/)
})

test('a professional sees the base subtotal in the booking data panel, which customers never receive', async () => {
  const { BookingPanel: BookingDataPanel } = await import('@/components/booking/details/BookingDataPanel')
  const payload = fixture()
  payload.details.viewerRole = 'professional'
  payload.details.bookingSnapshot = { ...(payload.details.bookingSnapshot || {}), checkoutSnapshot: {
    pricingType: 'fixed', unitAmount: 873.37, quantity: 1, baseSubtotal: 873.37, extraOptionsTotal: 0,
    totalAmount: 873.37, customerTotal: null, currency: 'EUR', selectedOptions: [],
  } }
  const html = render(React.createElement(BookingDataPanel, { booking: payload.booking, details: payload.details }))
  assert.match(html, /873\.37/)
})

test('a legacy quotation shows the professional total to professionals and hides it from customers', async () => {
  const { QuotationPanel } = await import('@/components/booking/details/QuotationPanel')
  const legacy = (viewerRole) => {
    const payload = fixture()
    payload.booking.quote = { amount: 321.5, currency: 'EUR', validUntil: null, submittedAt: null, status: 'legacy' }
    payload.details.quotation = null
    payload.booking.quoteVersions = []
    return render(React.createElement(QuotationPanel, { ...payload, viewerRole, pathname: '/bookings/test', search: '' }))
  }
  assert.match(legacy('professional'), /Professional (amount|total) \(excl\. commission\)/)
  assert.match(legacy('professional'), /321\.5/)
  assert.doesNotMatch(legacy('customer'), /Professional (amount|total) \(excl\. commission\)|321\.5/)
})
