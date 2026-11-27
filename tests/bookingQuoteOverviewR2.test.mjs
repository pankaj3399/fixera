import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
process.env.TZ = 'UTC'
const require = createRequire(import.meta.url)
const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime')
const { AuthProvider } = await import('@/contexts/AuthContext')
const { default: SharedBookingsTable } = await import('@/components/dashboard/SharedBookingsTable')
const { default: SharedQuotesTable } = await import('@/components/dashboard/SharedQuotesTable')
const { quoteServiceAddress, bookingServiceAddress } = await import('../lib/dashboardOverview.ts')
const { customerTimelineStatuses } = await import('../lib/dashboardBookingHelpers.ts')

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const messages = Object.fromEntries(['auth', 'dashboardWidgets', 'search'].map(name => [name, JSON.parse(read(`messages/en/${name}.json`))]))
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
const props = { formatMoney: (amount, currency = 'EUR') => `${currency} ${amount.toFixed(2)}`, intl: 'en-GB', statusLabel: s => s, invoiceLabel: 'Invoice', downloadLabel: 'Download', chatLabel: 'Chat', warrantyLabel: 'Warranty', payNowLabel: 'Pay now', viewLabel: 'View', acceptPayLabel: 'Accept & Pay' }
const render = (Component, extra) => renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router },
  React.createElement(NextIntlClientProvider, { locale: 'en', timeZone: 'UTC', messages },
    React.createElement(AuthProvider, null, React.createElement(Component, { ...props, ...extra })))))

const profile = { address: 'Meir 1', city: 'Antwerpen', postalCode: '2000', country: 'BE' }
const quoted = { address: 'Lange Nieuwstraat 5', city: 'Antwerpen', postalCode: '2000', country: 'BE' }
const edited = { address: 'Kammenstraat 9', city: 'Antwerpen', postalCode: '2000', country: 'BE' }

test('FT2-14: no service address before a quotation exists', () => {
  for (const status of ['rfq', 'rfq_accepted', 'draft_quote']) {
    assert.equal(quoteServiceAddress({ status, location: profile }), null, status)
  }
  // A quote status without any recorded quote has nothing to show either.
  assert.equal(quoteServiceAddress({ status: 'quoted', location: profile }), null)
})

test('FT2-14: a quotation shows the address the professional recorded on the pinned version', () => {
  const booking = { status: 'quoted', location: edited, currentQuoteVersion: 2, quoteVersions: [{ version: 1, serviceLocation: quoted }, { version: 2, serviceLocation: edited }] }
  assert.equal(quoteServiceAddress(booking), 'Kammenstraat 9, Antwerpen, 2000, BE')
  // The accepted version wins over a newer current one.
  assert.equal(quoteServiceAddress({ ...booking, status: 'quote_accepted', acceptedQuoteVersion: 1 }), 'Lange Nieuwstraat 5, Antwerpen, 2000, BE')
  // Legacy version without a per-version snapshot: the booking address the quote wrote.
  assert.equal(quoteServiceAddress({ status: 'quoted', location: quoted, currentQuoteVersion: 1, quoteVersions: [{ version: 1 }] }), 'Lange Nieuwstraat 5, Antwerpen, 2000, BE')
})

test('FT2-14: a booking made from a quotation uses the accepted version; a direct booking its own address', () => {
  assert.equal(bookingServiceAddress({ status: 'booked', location: edited, acceptedQuoteVersion: 1, quoteVersions: [{ version: 1, serviceLocation: quoted }, { version: 2, serviceLocation: edited }] }), 'Lange Nieuwstraat 5, Antwerpen, 2000, BE')
  assert.equal(bookingServiceAddress({ status: 'booked', location: profile }), 'Meir 1, Antwerpen, 2000, BE')
})

test('FT2-14: the quotation table renders the rule and a comparison checkbox on each row', () => {
  const rows = [
    { _id: 'q1', status: 'rfq', bookingNumber: 'BK-1', location: profile },
    { _id: 'q2', status: 'quoted', quotationNumber: 'Q-2', currentQuoteVersion: 1, location: quoted, quoteVersions: [{ version: 1, serviceLocation: quoted }] },
  ]
  const selected = new Set(['q2'])
  const html = render(SharedQuotesTable, {
    viewerRole: 'customer', bookings: rows,
    selection: { isSelected: id => selected.has(id), onToggle() {}, label: b => `Compare ${b.quotationNumber || b.bookingNumber}` },
  })
  assert.doesNotMatch(html, /Meir 1/)
  assert.match(html, /Lange Nieuwstraat 5/)
  assert.equal((html.match(/role="checkbox"/g) || []).length, 2, 'one checkbox per row')
  assert.match(html, /aria-label="Compare Q-2"[^>]*|aria-checked="true"/)
  assert.match(html, /<span class="sr-only">Compare<\/span>/)
  // Without a selection there is no checkbox column (professional view without compare).
  assert.doesNotMatch(render(SharedQuotesTable, { viewerRole: 'customer', bookings: rows }), /role="checkbox"/)
})

test('FT2-13: the tables keep their last column visible (sticky) and the pro payout is one column', () => {
  const booking = { _id: 'b1', status: 'completed', payment: { transferredAt: '2026-11-01T00:00:00Z', professionalPayout: 80, currency: 'EUR' } }
  const pro = render(SharedBookingsTable, { viewerRole: 'professional', bookings: [booking] })
  assert.match(pro, /<th class="sticky right-0[^"]*">Details<\/th>/)
  assert.match(pro, /<td class="sticky right-0/)
  assert.match(pro, />Payout date \/ amount \/ refund</)
  assert.equal((pro.match(/<th /g) || []).length, 13)
  const quotes = render(SharedQuotesTable, { viewerRole: 'customer', bookings: [{ _id: 'q', status: 'quoted' }] })
  assert.match(quotes, /<th class="sticky right-0[^"]*">Quick actions<\/th>/)
})

test('FT2-13: customer timeline statuses follow the bookings filter', () => {
  assert.deepEqual(customerTimelineStatuses('all'), ['booked', 'rescheduling_requested', 'in_progress', 'professional_completed', 'dispute'])
  assert.deepEqual(customerTimelineStatuses('in_progress'), ['in_progress'])
  assert.deepEqual(customerTimelineStatuses('completed'), [])
  assert.deepEqual(customerTimelineStatuses('payment_pending'), [])
})

test('FT2-13: customer and professional booking pages have "Booking overview" and "Timeline" views', () => {
  const customer = read('components/dashboard/CustomerDashboard.tsx')
  assert.match(customer, /<TabsTrigger value="overview">\{t\("customerDashboard\.bookingViews\.overview"\)\}/)
  assert.match(customer, /<TabsContent value="timeline">\s*<CustomerBookingTimeline/)
  const pro = read('components/dashboard/ProfessionalBookingsQuotesManager.tsx')
  assert.match(pro, /<TabsTrigger value="timeline">\{t\("professionalManager\.views\.timeline"\)\}/)
  assert.match(pro, /<TabsContent value="timeline">[\s\S]*<BookingTimelineBoard/)
  // The comparison checkboxes are no longer a list above the table.
  for (const source of [customer, pro]) assert.doesNotMatch(source, /<Checkbox/)
  const timeline = read('components/dashboard/CustomerBookingTimeline.tsx')
  assert.match(timeline, /viewerRole="customer"/)
  assert.match(timeline, /\/api\/bookings\/my-bookings\?/)
})
