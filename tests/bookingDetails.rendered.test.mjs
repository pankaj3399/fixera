import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const { CurrencyProvider } = await import('@/contexts/CurrencyContext')
const { QuotationPanel } = await import('@/components/booking/details/QuotationPanel')
const { PaymentsPanel } = await import('@/components/booking/details/PaymentsPanel')
const { BookingPanel } = await import('@/components/booking/details/BookingDataPanel')
const { PartyCard, AttachmentLinks, StatusText } = await import('@/components/booking/details/DetailPrimitives')
const { AdminReferencesCard } = await import('@/components/booking/details/AdminReferencesCard')
const { PostBookingQuestionField } = await import('@/components/booking/details/PostBookingQuestionField')
const { withSubmittedPostBookingAnswers, quotationVersionLabel } = await import('@/lib/bookingDetails.ts')

const messagesByLocale = {
  en: JSON.parse(readFileSync(new URL('../messages/en/bookings.json', import.meta.url), 'utf8')),
  nl: JSON.parse(readFileSync(new URL('../messages/nl/bookings.json', import.meta.url), 'utf8')),
  fr: JSON.parse(readFileSync(new URL('../messages/fr/bookings.json', import.meta.url), 'utf8')),
}
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/bookingDetails/${name}.json`, import.meta.url), 'utf8'))

function render(element, locale = 'en') {
  return renderToStaticMarkup(
    React.createElement(
      NextIntlClientProvider,
      { locale, messages: { bookings: messagesByLocale[locale] }, timeZone: 'UTC' },
      React.createElement(
        CurrencyProvider,
        { initialCurrency: 'EUR', initialRates: { EUR: 1 }, refreshRates: false },
        element
      )
    )
  )
}

function quotationHtml(name) {
  const payload = fixture(name)
  return render(
    React.createElement(QuotationPanel, {
      booking: payload.booking,
      details: payload.details,
      pathname: '/bookings/test',
      search: '?action=quote',
    })
  )
}

function paymentsHtml(details, booking, viewerRole = 'customer', locale = 'en') {
  return render(React.createElement(PaymentsPanel, { booking, details, viewerRole }), locale)
}

function cardSlice(html, id) {
  const start = html.indexOf(`id="${id}"`)
  if (start < 0) return ''
  const next = html.indexOf('data-slot="card"', start + 1)
  return html.slice(start, next < 0 ? undefined : next)
}

test('actual quoted DTO renders v2 as current and v1 as rejected', () => {
  const html = quotationHtml('quoted-customer')
  assert.match(html, />rejected</)
  const v2Card = cardSlice(html, 'quotation-v2')
  assert.match(v2Card, />current</)
  assert.doesNotMatch(v2Card, />rejected</)
  assert.match(v2Card, /· Professional/)
  assert.match(html, /QT-2026-000001-v2/)
  assert.doesNotMatch(html, /QT-2026-000001-v2-v2/)
})

test('actual accepted DTO renders v2 accepted and does not present its old rejection timestamp as the version status', () => {
  const html = quotationHtml('completed-customer')
  const v2Card = cardSlice(html, 'quotation-v2')
  assert.match(v2Card, />accepted</)
  assert.doesNotMatch(v2Card, /Rejected at/)
  assert.doesNotMatch(v2Card, /rejection timestamp for this version/)
  assert.match(html, /QT-2026-000001-v2/)
  assert.doesNotMatch(html, /QT-2026-000001-v2-v2/)
})

test('a contradictory legacy rejection timestamp is shown as recorded, not hidden, and does not relabel accepted v2', () => {
  const payload = fixture('completed-customer')
  const details = structuredClone(payload.details)
  details.quotation.versions[1].rejectedAt = '2026-02-01T11:00:00.000Z'
  const html = render(
    React.createElement(QuotationPanel, {
      booking: payload.booking,
      details,
      pathname: '/bookings/test',
      search: '?tab=quotation',
    })
  )
  const v2Card = cardSlice(html, 'quotation-v2')
  assert.match(v2Card, />accepted</)
  assert.match(v2Card, /rejection timestamp for this version/)
  assert.match(v2Card, /1 Feb 2026/)
})

test('direct draft and RFQ-rejected DTOs render draft/rejected instead of a phantom quotation', () => {
  const draft = quotationHtml('direct-draft-customer')
  assert.match(draft, />Draft</)
  assert.doesNotMatch(draft, /id="quotation-v/)
  const rejected = quotationHtml('rfq-rejected-customer')
  assert.match(rejected, />Rejected</)
  assert.doesNotMatch(rejected, /id="quotation-v/)
})

test('supplier credit note and supplier Peppol facts render for admin without internal identifiers', () => {
  const payload = fixture('supplier-credit-admin')
  const html = paymentsHtml(payload.details, payload.booking, 'admin')
  assert.match(html, /Supplier credit note/)
  assert.match(html, /SUP-CN-1/)
  assert.match(html, /Peppol status: Sent/)
  assert.match(html, /PEP-SUP-1/)
  assert.match(html, /FIX-1/)
  assert.match(html, /CN-1/)
  assert.doesNotMatch(html, /507f1f77bcf86cd799439017/)
  assert.doesNotMatch(html, /INTERNAL REFUND NOTE/)
  assert.doesNotMatch(html, /stripePaymentIntentId|pi_secret|ch_secret/)
})

test('all four recorded refunds render, including the euro cancellation refund', () => {
  const payload = fixture('completed-customer')
  const html = paymentsHtml(payload.details, payload.booking)
  assert.equal(payload.details.payments.refunds.length, 4)
  assert.match(html, /133\.10/)
  assert.match(html, /25\.00/)
  assert.match(html, /Cancelled before start/)
})

test('a refund with no recorded currency renders the missing-currency label, not EUR', () => {
  const payload = fixture('completed-customer')
  const details = structuredClone(payload.details)
  details.payments.refunds = [
    {
      id: 'refund:no-currency',
      amount: 12,
      currency: null,
      refundedAt: '2026-02-04T10:00:00.000Z',
      source: 'platform',
      status: 'recorded',
      justification: 'Goodwill',
      justificationRecorded: true,
      vatSplitRecorded: false,
      noticeCodes: ['REFUND_VAT_SPLIT_NOT_RECORDED'],
    },
  ]
  details.payments.base = null
  details.payments.records = []
  details.payments.byCurrency = []
  const html = paymentsHtml(details, { ...payload.booking, payment: null })
  assert.match(html, /currency not recorded/)
  assert.doesNotMatch(html, /€12|€ 12/)
})

test('extra-cost notices from the actual DTO are rendered', () => {
  const payload = fixture('completed-customer')
  const details = structuredClone(payload.details)
  details.extraCosts.notices = [
    { code: 'REFUND_BREAKDOWN_INCOMPLETE', severity: 'warning', entity: 'refund' },
  ]
  const html = paymentsHtml(details, payload.booking)
  assert.match(html, /refund breakdown is incomplete|refund could not be fully matched/i)
})

test('post-booking answers render immediately from the merged POST result', () => {
  const payload = fixture('completed-customer')
  const details = structuredClone(payload.details)
  details.postBooking.answers = []
  details.postBooking.complete = false
  details.postBooking.submittedAt = null
  for (const question of details.postBooking.questions) {
    question.answer = null
    question.answered = false
  }
  const before = render(
    React.createElement(BookingPanel, {
      booking: { ...payload.booking, postBookingData: [] },
      details,
    })
  )
  assert.match(before, /Not answered/)

  const merged = withSubmittedPostBookingAnswers(details, [
    { questionId: 'pq-1', question: 'Parking available?', answer: '0' },
    { questionId: 'pq-2', question: 'Pets present?', answer: 'false' },
  ])
  const after = render(
    React.createElement(BookingPanel, {
      booking: { ...payload.booking, postBookingData: merged.postBooking.answers },
      details: merged,
    })
  )
  assert.match(after, /Parking available\?/)
  assert.match(after, />0</)
  assert.doesNotMatch(after, /Not answered/)
})

test('legacy quote version nulls render as not recorded, never as zero or no', () => {
  const payload = fixture('legacy-customer')
  const details = payload.details
  assert.equal(details.quotation.versions[0].totalAmount, null)
  assert.equal(details.quotation.versions[0].materialsIncluded, null)
  const html = render(
    React.createElement(QuotationPanel, {
      booking: payload.booking,
      details,
      pathname: '/bookings/test',
      search: '?tab=quotation',
    })
  )
  const v2Card = cardSlice(html, 'quotation-v2')
  assert.match(v2Card, /Not recorded/)
  assert.doesNotMatch(v2Card, /Materials included<\/dt><dd[^>]*>No</)
  assert.doesNotMatch(v2Card, /€0\.00|0 months/)
})

test('party customer type renders as a localized enum, not the raw API token', () => {
  const html = render(
    React.createElement(PartyCard, {
      title: 'Customer',
      party: {
        id: 'c1',
        name: 'Carla Customer',
        customerType: 'business',
        businessName: 'Carla BV',
        address: null,
      },
      role: 'customer',
      labels: {
        name: 'Name',
        username: 'Username',
        businessName: 'Business name',
        email: 'Email',
        phone: 'Phone',
        vat: 'VAT',
        website: 'Website',
        city: 'City',
        postalCode: 'Postal code',
        country: 'Country',
        timeZone: 'Time zone',
        customerType: 'Customer type',
      },
    })
  )
  assert.match(html, />Business</)
  assert.doesNotMatch(html, />business</)
})

test('quotation labels from actual metadata contain the canonical number once', () => {
  assert.equal(quotationVersionLabel('QT-2026-000001-v1', 1), 'QT-2026-000001-v1')
  assert.equal(quotationVersionLabel('QT-2026-000001-v2', 2), 'QT-2026-000001-v2')
})

test('legacy stored answers render with recorded wording and missing question definitions are appended', () => {
  const payload = fixture('legacy-customer')
  const html = render(
    React.createElement(BookingPanel, { booking: payload.booking, details: payload.details })
  )
  assert.match(html, /Building type at booking\?/)
  assert.match(html, /Which extras\?/)
  assert.match(html, /Balcony/)
  assert.match(html, /Cellar/)
  assert.match(html, /Pets present\?/)
  assert.match(html, /Pets present\?[\s\S]{0,3000}>No</)
  assert.doesNotMatch(html, /Current live question\?/)
  assert.doesNotMatch(html, /Current live parking question\?/)
  assert.match(html, /recorded answer wording/)
})

test('an unsubmitted snapshot booking uses the recorded post-booking questions', () => {
  const payload = fixture('unsubmitted-snapshot-customer')
  const html = render(
    React.createElement(BookingPanel, { booking: payload.booking, details: payload.details })
  )
  assert.match(html, /Parking available\?/)
  assert.match(html, /Pets present\?/)
  assert.doesNotMatch(html, /Current live parking question\?/)
})

test('null refund currency is not inherited from a real non-null EUR base payment', () => {
  const payload = fixture('completed-customer')
  const details = structuredClone(payload.details)
  details.payments.refunds = [
    {
      id: 'refund:null-own-currency',
      amount: 12,
      currency: null,
      currencySource: 'not_recorded',
      refundedAt: '2026-02-04T10:00:00.000Z',
      source: 'platform',
      status: 'recorded',
      kind: 'booking',
      justification: 'Goodwill',
      justificationRecorded: true,
      vatSplitRecorded: false,
      noticeCodes: ['REFUND_VAT_SPLIT_NOT_RECORDED'],
    },
  ]
  assert.ok(details.payments.base?.currency === 'EUR')
  assert.ok((details.payments.records || []).length > 0)
  const html = paymentsHtml(details, payload.booking)
  assert.match(html, /currency not recorded/)
  assert.doesNotMatch(html, /€12\.00/)
})

test('multiple recorded currencies stay independent in records and refunds', () => {
  const payload = fixture('multi-currency-customer')
  const html = paymentsHtml(payload.details, payload.booking)
  assert.match(html, /\$20\.00/)
  assert.match(html, /£10\.00/)
  assert.match(html, />USD</)
  assert.match(html, />GBP</)
  assert.match(html, /GBP partial refund/)
})

test('zero refund amounts remain recorded and missing amounts do not become zero', () => {
  const payload = fixture('completed-customer')
  const details = structuredClone(payload.details)
  details.payments.refunds = [
    {
      id: 'refund:zero',
      amount: 0,
      currency: 'USD',
      currencySource: 'payment',
      refundedAt: '2026-02-04T10:00:00.000Z',
      source: 'platform',
      status: 'recorded',
      kind: 'booking',
      justification: 'Zero adjustment',
      justificationRecorded: true,
      vatSplitRecorded: false,
      noticeCodes: ['REFUND_VAT_SPLIT_NOT_RECORDED'],
    },
    {
      id: 'refund:missing-amount',
      amount: null,
      currency: 'GBP',
      currencySource: 'payment',
      refundedAt: '2026-02-04T10:00:00.000Z',
      source: 'platform',
      status: 'recorded',
      kind: 'booking',
      justification: 'Amount not recorded',
      justificationRecorded: true,
      vatSplitRecorded: false,
      noticeCodes: ['REFUND_VAT_SPLIT_NOT_RECORDED'],
    },
  ]
  const html = paymentsHtml(details, payload.booking)
  assert.match(html, /\$0\.00/)
  assert.match(html, /Amount not recorded/)
  assert.match(html, /Not recorded/)
})

test('admin references and VAT decision values are localized in French', () => {
  const adminHtml = render(
    React.createElement(AdminReferencesCard, {
      links: [
        { key: 'booking', href: '/admin/bookings/1' },
        { key: 'warranty', href: '/admin/warranty-claims' },
      ],
    }),
    'fr'
  )
  assert.match(adminHtml, /Références admin/)
  assert.match(adminHtml, /Réservation admin/)
  assert.match(adminHtml, /Garanties admin/)

  const payload = fixture('completed-customer')
  const vatHtml = render(
    React.createElement(BookingPanel, { booking: payload.booking, details: payload.details }),
    'fr'
  )
  assert.match(vatHtml, /Taux standard/)
  assert.match(vatHtml, /Immeuble/)
  assert.match(vatHtml, /Nature du bien/)
  assert.doesNotMatch(vatHtml, /standard_rate/)
  assert.doesNotMatch(vatHtml, /immovable/)
})

test('post-booking controls expose an accessible label and error association', () => {
  const html = render(
    React.createElement(PostBookingQuestionField, {
      question: { question: 'Parking available?', type: 'text', isRequired: true },
      index: 0,
      value: '',
      hasError: true,
      uploading: false,
      onChange: () => {},
      onUpload: () => {},
    })
  )
  assert.match(html, /<label[^>]*for="q0-field"[^>]*id="q0-label"|<label[^>]*id="q0-label"[^>]*for="q0-field"/)
  assert.match(html, /<textarea[^>]*id="q0-field"/)
  assert.match(html, /aria-labelledby="q0-label"/)
  assert.match(html, /aria-describedby="q0-error"/)
  assert.match(html, /aria-required="true"/)
  assert.match(html, /<p id="q0-error" role="alert"/)
})

test('unavailable attachments show a truthful localized row without a raw key or provider reason', () => {
  const html = render(
    React.createElement(AttachmentLinks, {
      attachments: [
        { url: null, fileName: 'evidence.pdf', source: 'cancellation', signed: false, unavailableReason: 'presign_failed' },
        { url: 'projects/507f1f77bcf86cd799439014/attachment/507f1f77bcf86cd799439011/private.pdf', source: 'rfq', signed: false },
      ],
    })
  )
  assert.match(html, /evidence.pdf/)
  assert.match(html, /This attachment is not available with your access\./)
  assert.doesNotMatch(html, /presign_failed/)
  assert.doesNotMatch(html, /projects\/507f1f77/)
})


test('refund kind and payout transfer facts render role-safely without provider diagnostics', () => {
  const payload = fixture('completed-professional')
  const html = paymentsHtml(payload.details, payload.booking, 'professional')
  assert.match(html, /Extra-cost refund/)
  assert.match(html, /Booking refund/)
  assert.match(html, /Payout transfer/)
  assert.match(html, /Succeeded/)
  assert.match(html, /Transfer amount/)
  assert.match(html, /€100\.00/)
  assert.doesNotMatch(html, /tr_secret_123/)
  assert.doesNotMatch(html, /INTERNAL TRANSFER ERROR/)
  assert.doesNotMatch(html, /pi_secret_123/)
})

test('pending and failed payout transfers are distinguishable', () => {
  const payload = fixture('completed-professional')
  for (const [status, label] of [['pending', /Pending/], ['failed', /Failed/]]) {
    const details = structuredClone(payload.details)
    details.payments.records[0].transfer = {
      ...(details.payments.records[0].transfer || {}),
      status,
      amount: 100,
      currency: 'EUR',
      attemptedAt: '2026-02-04T09:59:00.000Z',
    }
    const html = paymentsHtml(details, payload.booking, 'professional')
    assert.match(html, /Payout transfer/)
    assert.match(html, label)
  }
})

test('customers do not receive professional payout transfer details', () => {
  const payload = fixture('completed-customer')
  const html = paymentsHtml(payload.details, payload.booking, 'customer')
  assert.doesNotMatch(html, /Payout transfer<\/p>/)
  assert.doesNotMatch(html, /Transfer amount/)
})

test('post-booking radio and file controls also have accessible names and error/help wiring', () => {
  const choice = render(
    React.createElement(PostBookingQuestionField, {
      question: { question: 'Pets present?', type: 'multiple_choice', options: ['Yes', 'No'], isRequired: true },
      index: 1,
      value: '',
      hasError: true,
      uploading: false,
      onChange: () => {},
      onUpload: () => {},
    })
  )
  assert.match(choice, /aria-labelledby="q1-label"/)
  assert.match(choice, /aria-describedby="q1-error"/)
  assert.match(choice, /<label[^>]*id="q1-label"/)
  assert.match(choice, /id="q1-opt0"/)

  const file = render(
    React.createElement(PostBookingQuestionField, {
      question: { question: 'Upload evidence', type: 'attachment', isRequired: false },
      index: 2,
      value: '',
      hasError: false,
      uploading: false,
      onChange: () => {},
      onUpload: () => {},
    })
  )
  assert.match(file, /<label[^>]*for="q2-field"/)
  assert.match(file, /<input[^>]*id="q2-field"/)
  assert.match(file, /aria-labelledby="q2-label"/)
  assert.match(file, /aria-describedby="q2-help"/)
  assert.match(file, /id="q2-help"/)
})


test('an unsubmitted current booking is not labelled as a legacy missing timestamp', () => {
  const payload = fixture('unsubmitted-snapshot-customer')
  const html = render(
    React.createElement(BookingPanel, { booking: payload.booking, details: payload.details })
  )
  assert.match(html, /Not submitted yet\./)
  assert.doesNotMatch(html, /Submission time was not recorded for this legacy booking/)
})


test('a backend default EUR marked currencySource not_recorded is not shown as a recorded currency', () => {
  const payload = fixture('completed-customer')
  const details = structuredClone(payload.details)
  details.payments.refunds = [
    {
      id: 'refund:defaulted-eur',
      amount: 12,
      currency: 'EUR',
      currencySource: 'not_recorded',
      refundedAt: '2026-02-04T10:00:00.000Z',
      source: 'platform',
      status: 'recorded',
      kind: 'booking',
      justification: 'Goodwill',
      justificationRecorded: true,
      vatSplitRecorded: false,
      noticeCodes: ['REFUND_VAT_SPLIT_NOT_RECORDED'],
    },
  ]
  details.payments.records = details.payments.records.map((record) => ({
    ...record,
    currency: 'EUR',
    currencySource: 'not_recorded',
    transfer: null,
  }))
  details.payments.base = details.payments.records[0]
  const html = paymentsHtml(details, payload.booking)
  assert.match(html, /currency not recorded/)
  assert.doesNotMatch(html, /€12\.00/)
})


test('quotation RFQ answers also use the recorded wording and append missing definitions', () => {
  const html = quotationHtml('legacy-customer')
  assert.match(html, /Building type at booking\?/)
  assert.match(html, /Which extras\?/)
  assert.match(html, /Balcony/)
  assert.doesNotMatch(html, /Current live question\?/)
})


test('an explicitly unrecorded schedule zone is shown as not recorded, not as the raw booking zone', () => {
  const payload = fixture('completed-customer')
  const details = structuredClone(payload.details)
  details.booking.schedule = {
    ...(details.booking.schedule || {}),
    timeZone: 'Europe/Brussels',
    timeZoneRecorded: false,
  }
  details.bookingSnapshot.schedule = {
    ...(details.bookingSnapshot.schedule || {}),
    timeZone: null,
    timeZoneRecorded: false,
  }
  const html = render(
    React.createElement(BookingPanel, {
      booking: { ...payload.booking, scheduleTimeZone: 'Europe/Lisbon' },
      details,
    })
  )
  assert.doesNotMatch(html, /Europe\/Lisbon/)
  assert.match(html, /The schedule time zone was not recorded for this legacy booking\.|schedule time zone was not recorded/i)
})

test('actual unrecorded-zone DTO keeps the recorded flag false and never presents the profile zone as the booking zone', () => {
  const payload = fixture('unrecorded-zone-customer')
  assert.equal(payload.details.booking.schedule.timeZone, null)
  assert.equal(payload.details.booking.schedule.timeZoneRecorded, false)
  assert.equal(payload.details.bookingSnapshot.schedule.timeZoneRecorded, false)
  assert.equal(payload.booking.scheduleTimeZone, undefined)
  const html = render(
    React.createElement(BookingPanel, { booking: payload.booking, details: payload.details })
  )
  assert.match(html, /schedule time zone was not recorded/i)
})

test('aggregate-only refund and Peppol sent statuses are localized in French and Dutch', () => {
  const aggregate = fixture('aggregate-refund-customer')
  assert.ok(
    aggregate.details.payments.refunds.some((refund) => refund.status === 'aggregate_only')
  )
  for (const [locale, expected] of [
    ['fr', 'Montant global uniquement'],
    ['nl', 'Alleen totaalbedrag'],
  ]) {
    const html = paymentsHtml(aggregate.details, aggregate.booking, 'customer', locale)
    assert.match(html, new RegExp(expected))
    assert.doesNotMatch(html, /aggregate only/i)
  }

  const supplier = fixture('supplier-credit-admin')
  assert.equal(supplier.details.payments.records[0].invoice.peppolDispatchStatus, 'sent')
  for (const [locale, label, sent] of [
    ['fr', 'Statut Peppol', 'Envoyé'],
    ['nl', 'Peppolstatus', 'Verzonden'],
  ]) {
    const html = paymentsHtml(supplier.details, supplier.booking, 'admin', locale)
    assert.match(html, new RegExp(label))
    assert.match(html, new RegExp(sent))
    assert.doesNotMatch(html, /Peppol status: sent|Peppolstatus: sent/)
  }

  const skippedDetails = structuredClone(supplier.details)
  skippedDetails.payments.records[0].invoice.peppolDispatchStatus = 'skipped'
  const skippedHtml = paymentsHtml(skippedDetails, supplier.booking, 'admin', 'fr')
  assert.match(skippedHtml, /Statut Peppol : Ignoré/)
  assert.doesNotMatch(skippedHtml, /Peppol status: skipped|Statut Peppol : skipped/)
})

test('known refund/status enums are translated in French while an unknown value stays readable text', () => {
  const html = render(
    React.createElement(
      'div',
      null,
      React.createElement(StatusText, { value: 'requested' }),
      '|',
      React.createElement(StatusText, { value: 'aggregate_only' }),
      '|',
      React.createElement(StatusText, { value: 'legacy' }),
      '|',
      React.createElement(StatusText, { value: 'skipped' }),
      '|',
      React.createElement(StatusText, { value: 'custom_status_text' })
    ),
    'fr'
  )
  assert.match(html, /Demandé/)
  assert.match(html, /Montant global uniquement/)
  assert.match(html, /Historique/)
  assert.match(html, /Ignoré/)
  assert.match(html, /custom status text/)
  assert.doesNotMatch(html, /aggregate_only|requested|legacy|skipped/)
})

test('actual completed refunds keep their opaque source ids, kind and own currency', () => {
  const payload = fixture('completed-customer')
  const refunds = payload.details.payments.refunds
  assert.equal(refunds.length, 4)
  assert.ok(refunds.some((refund) => refund.kind === 'extra_cost'))
  assert.ok(refunds.some((refund) => refund.cancellationRequestId === '507f1f77bcf86cd799439017'))
  for (const refund of refunds) {
    assert.match(refund.id, /^(payment:[^:]+:refund:[a-f0-9]{16}|cancellation:[a-f0-9]{24}:refund)$/)
    assert.doesNotMatch(refund.id, /^re_/)
    assert.equal(refund.currency, 'EUR')
    assert.equal(refund.currencySource, 'payment')
    assert.equal(refund.providerRefundId, undefined)
    assert.equal(refund.internalNotes, undefined)
  }
  assert.equal(payload.details.booking.payment.refundedTotal, 178.1)
  const html = paymentsHtml(payload.details, payload.booking)
  assert.match(html, /Cancelled before start/)
  assert.doesNotMatch(html, /re_full|re_extra|re_partial|INTERNAL REFUND NOTE/)
})

test('later post-booking questions are rendered as a separate labelled set before submission', () => {
  const payload = fixture('post-booking-later-before-customer')
  assert.equal(payload.details.bookingSnapshot.questions.postBooking.length, 0)
  assert.ok(payload.details.postBooking.questions.every((question) => question.source === 'live_project'))
  const html = render(
    React.createElement(BookingPanel, { booking: payload.booking, details: payload.details })
  )
  assert.match(html, /Which floor is the bathroom on\?/)
  assert.match(html, /Upload access proof/)
  assert.match(html, /later post-booking questions/)
  assert.match(html, /not part of the original booking snapshot/i)
  assert.doesNotMatch(html, /recorded at submission/)
  assert.doesNotMatch(html, /EDITED/)
})

test('post-booking submission provenance renders frozen wording after a later live project edit', () => {
  const payload = fixture('post-booking-submission-customer')
  assert.ok(
    payload.details.postBooking.questions.every(
      (question) => question.source === 'post_booking_submission'
    )
  )
  assert.deepEqual(
    payload.details.postBooking.questions.map((question) => question.question),
    [
      'Which floor is the bathroom on?',
      'Is the lift available?',
      'Which access door?',
      'Upload access proof',
    ]
  )
  assert.deepEqual(
    payload.details.postBooking.questions.find((question) => question.questionId === 'pbq-3').options,
    ['Front door', 'Back door']
  )
  const answers = payload.details.postBooking.answers
  assert.equal(answers.find((answer) => answer.questionId === 'pbq-1').answer, '0')
  assert.equal(answers.find((answer) => answer.questionId === 'pbq-2').answer, 'false')
  assert.equal(answers.find((answer) => answer.questionId === 'pbq-3').answer, 'Back door')
  assert.equal(answers.find((answer) => answer.questionId === 'pbq-4').answerType, 'file')
  const html = render(
    React.createElement(BookingPanel, { booking: payload.booking, details: payload.details })
  )
  assert.match(html, /recorded at submission/)
  assert.match(html, /Which floor is the bathroom on\?/)
  assert.match(html, /Back door/)
  assert.match(html, /Upload access proof/)
  assert.doesNotMatch(html, /EDITED/)
  assert.doesNotMatch(html, /Edited option/)
})

test('a later rejected quotation that was cancelled still renders as rejected', () => {
  const payload = fixture('quote-rejected-cancelled-customer')
  assert.equal(payload.details.quotation.status, 'rejected')
  const html = quotationHtml('quote-rejected-cancelled-customer')
  const v2Card = cardSlice(html, 'quotation-v2')
  assert.match(v2Card, />rejected</)
  assert.doesNotMatch(v2Card, />current</)
  assert.doesNotMatch(v2Card, />accepted</)
})

test('raw role DTOs keep only the customer payment-page client secret and no internal notes', () => {
  const customer = fixture('completed-customer')
  const professional = fixture('completed-professional')
  const admin = fixture('supplier-credit-admin')

  assert.equal(customer.booking.payment.stripeClientSecret, 'pi_secret_client')
  assert.equal(customer.booking.payment.extraCostClientSecret, 'pi_secret_extra')
  assert.equal(customer.booking.payment.stripePaymentIntentId, undefined)
  assert.equal(customer.booking.payment.metadata, undefined)
  assert.equal(customer.booking.notes, undefined)
  assert.equal(customer.booking.payment.refundNotes, undefined)

  assert.equal(professional.booking.payment.stripeClientSecret, undefined)
  assert.equal(professional.booking.payment.extraCostClientSecret, undefined)
  assert.equal(professional.booking.payment.stripePaymentIntentId, undefined)

  assert.equal(admin.booking.payment.stripePaymentIntentId, 'pi_secret_123')
  assert.equal(admin.details.payments.records[0].providerIds.paymentIntentId, 'pi_secret_123')

  for (const payload of [customer, professional]) {
    const serialized = JSON.stringify(payload.details)
    assert.doesNotMatch(serialized, /stripeClientSecret|extraCostClientSecret|stripePaymentIntentId|INTERNAL REFUND NOTE|INTERNAL SECRET NOTE/)
  }
})
