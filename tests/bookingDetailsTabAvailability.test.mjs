import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const { CurrencyProvider } = await import('@/contexts/CurrencyContext')
const { BookingPanel } = await import('@/components/booking/details/BookingDataPanel')
const { PaymentsPanel } = await import('@/components/booking/details/PaymentsPanel')
const {
  bookingHadQuotation,
  bookingHasBeenBooked,
  transferAmountFromMinorUnits,
  unavailableDetailTabs,
} = await import('../lib/bookingDetails.ts')

const messages = (locale) =>
  JSON.parse(readFileSync(new URL(`../messages/${locale}/bookings.json`, import.meta.url), 'utf8'))
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/bookingDetails/${name}.json`, import.meta.url), 'utf8'))

function render(element, locale = 'en') {
  return renderToStaticMarkup(
    React.createElement(
      NextIntlClientProvider,
      { locale, messages: { bookings: messages(locale) }, timeZone: 'UTC' },
      React.createElement(
        CurrencyProvider,
        { initialCurrency: 'EUR', initialRates: { EUR: 1 }, refreshRates: false },
        element
      )
    )
  )
}

// A direct booking stores its checkout as an auto-generated quote.
const directBooking = (overrides = {}) => ({
  _id: 'b-direct',
  status: 'booked',
  statusHistory: [{ status: 'payment_pending' }, { status: 'booked' }],
  quote: {
    amount: 800,
    currency: 'EUR',
    submittedAt: '2026-02-01T10:00:00.000Z',
    breakdown: [{ item: 'checkout_snapshot:computed_total', totalPrice: 950 }],
  },
  rfqData: { serviceType: 'Painting', description: 'Living room walls', additionalNotes: 'Ring twice', answers: [] },
  payment: { status: 'authorized', currency: 'EUR' },
  ...overrides,
})

test('BPQ-1: the quotation tab is unavailable only when the booking never had a quotation', () => {
  const direct = directBooking()
  assert.equal(bookingHadQuotation(direct, { quotation: { status: 'accepted', versions: [] } }), false)
  assert.deepEqual(unavailableDetailTabs(direct, null), { quotation: 'no_quotation' })
  // Legacy direct checkouts started their history at quote_accepted without ever being quoted.
  const legacyDirect = directBooking({ statusHistory: [{ status: 'quote_accepted' }, { status: 'booked' }, { status: 'rescheduling_requested' }, { status: 'booked' }] })
  assert.equal(bookingHadQuotation(legacyDirect, null), false)
  assert.deepEqual(unavailableDetailTabs(legacyDirect, null), { quotation: 'no_quotation' })
  assert.equal(bookingHadQuotation({ status: 'quote_accepted', statusHistory: [{ status: 'quote_accepted' }] }, null), false)
  assert.equal(bookingHadQuotation({ status: 'booked', statusHistory: [{ status: 'rfq' }, { status: 'quoted' }, { status: 'quote_accepted' }] }, null), true)

  assert.equal(bookingHadQuotation({ status: 'rfq' }, null), true)
  assert.equal(bookingHadQuotation({ status: 'booked', statusHistory: [{ status: 'quoted' }] }, null), true)
  assert.equal(bookingHadQuotation({ status: 'booked', quotationNumber: 'QT-2026-000001' }, null), true)
  assert.equal(bookingHadQuotation({ status: 'cancelled', rfqResponse: { action: 'rejected' } }, null), true)
  // A professional-submitted legacy quote (no checkout markers) is a quotation.
  assert.equal(
    bookingHadQuotation({ status: 'completed', quote: { amount: 500, submittedAt: '2026-01-01T00:00:00.000Z', breakdown: [{ item: 'Work' }] } }, null),
    true
  )
  const payload = fixture('completed-customer')
  assert.equal(bookingHadQuotation(payload.booking, payload.details), true)
  assert.deepEqual(unavailableDetailTabs(payload.booking, payload.details), {})
})

test('BPQ-2: booking and payments stay unavailable until the quotation is booked (paid)', () => {
  for (const status of ['rfq', 'rfq_accepted', 'draft_quote', 'quoted', 'quote_accepted', 'quote_rejected', 'payment_pending']) {
    assert.deepEqual(
      unavailableDetailTabs({ status, quotationNumber: 'QT-1', payment: { status: 'pending' } }, null),
      { booking: 'not_booked', payments: 'not_booked' },
      status
    )
  }
  const quoted = fixture('quoted-customer')
  assert.equal(bookingHasBeenBooked(quoted.booking, quoted.details), false)
  assert.deepEqual(unavailableDetailTabs(quoted.booking, quoted.details), { booking: 'not_booked', payments: 'not_booked' })

  // A cancelled quotation that was never paid stays locked; one that was booked first does not.
  assert.equal(bookingHasBeenBooked({ status: 'cancelled', statusHistory: [{ status: 'quoted' }, { status: 'cancelled' }] }, null), false)
  assert.equal(bookingHasBeenBooked({ status: 'cancelled', statusHistory: [{ status: 'booked' }, { status: 'cancelled' }] }, null), true)
  assert.equal(bookingHasBeenBooked({ status: 'cancelled' }, { payments: { records: [{ status: 'refunded' }] } }), true)
  assert.equal(bookingHasBeenBooked({ status: 'cancelled' }, { payments: { records: [{ timestamps: { capturedAt: '2026-01-01T00:00:00.000Z' } }] } }), true)
  // The current pre-booking status is authoritative over stray payment facts.
  assert.equal(bookingHasBeenBooked({ status: 'payment_pending', payment: { status: 'authorized' } }, null), false)
  for (const status of ['booked', 'in_progress', 'professional_completed', 'completed', 'dispute', 'refunded']) {
    assert.deepEqual(unavailableDetailTabs({ status, quotationNumber: 'QT-1' }, null), {}, status)
  }
})

test('BPQ-1: the booking tab no longer repeats the RFQ wizard data of a quotation booking', () => {
  const payload = fixture('completed-customer')
  const html = render(React.createElement(BookingPanel, { booking: payload.booking, details: payload.details }))
  assert.doesNotMatch(html, /Request \(RFQ\) wizard data/)
  assert.doesNotMatch(html, /RFQ questions &amp; answers/)
  assert.doesNotMatch(html, /RFQ attachments/)
})

test('BPQ-1: a direct booking (no quotation tab) keeps its wizard data on the booking tab', () => {
  for (const [locale, title] of [['en', 'Booking wizard data'], ['nl', 'Gegevens uit de boekingswizard'], ['fr', 'Données de l&#x27;assistant de réservation']]) {
    const html = render(React.createElement(BookingPanel, { booking: directBooking(), details: null }), locale)
    assert.ok(html.includes(title), `${locale}: ${title}`)
    assert.match(html, /Ring twice/)
  }
})

test('customer availability blocks stay visible on the booking tab of a quotation booking', () => {
  const payload = fixture('completed-customer')
  const booking = {
    ...payload.booking,
    customerBlocks: { dates: [{ date: '2026-07-01', reason: 'Holiday' }], windows: [] },
  }
  const html = render(React.createElement(BookingPanel, { booking, details: payload.details }))
  assert.match(html, /Customer availability blocks/)
  assert.match(html, /Holiday/)
})

test('BPQ-1 x100: stored transfer amounts are Stripe minor units and are shown in major units', () => {
  assert.equal(transferAmountFromMinorUnits(10050, 'EUR'), 100.5)
  assert.equal(transferAmountFromMinorUnits(9512, 'usd'), 95.12)
  assert.equal(transferAmountFromMinorUnits(12000, 'JPY'), 12000)
  assert.equal(transferAmountFromMinorUnits(null, 'EUR'), null)
  assert.equal(transferAmountFromMinorUnits(undefined, 'EUR'), null)

  // Without a normalized detail record the panel reads the raw subdocument.
  const payload = fixture('completed-professional')
  const booking = structuredClone(payload.booking)
  booking.payment = {
    ...booking.payment,
    transferStatus: 'succeeded',
    transferAmount: 10050,
    transferCurrency: 'EUR',
  }
  const html = render(React.createElement(PaymentsPanel, { booking, details: null, viewerRole: 'professional' }))
  assert.match(html, /Transfer amount/)
  assert.match(html, /€100\.50/)
  assert.doesNotMatch(html, /€10,050\.00/)
})
