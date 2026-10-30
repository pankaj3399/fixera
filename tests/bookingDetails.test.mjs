import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  answerRecorded,
  activityAmountRows,
  activityCategory,
  activityQualityNoteKey,
  buildAdminDetailLinks,
  buildDetailHref,
  buildLegacyActivity,
  buildPostBookingAnswerPayload,
  buildQuoteAnchors,
  dedupeActivity,
  dedupeNotices,
  describeAnswer,
  detailTabFromHash,
  formatCalendarDate,
  formatInstant,
  groupActivityByDay,
  mergeQuestionAnswers,
  missingRequiredPostBookingQuestionIndexes,
  ownRecordedCurrency,
  noticeKey,
  parseCalendarDate,
  quotationVersionLabel,
  quoteVersionStatus,
  recordedScheduleTimeZone,
  resolvePostBookingFormQuestions,
  resolveQuotationVersionFromUrl,
  vatAnswerFieldLabelKey,
  vatAnswerValueKey,
  resolveActivityItems,
  resolveDetailTab,
  resolveTabFromUrl,
  safeAttachments,
  visibleActivity,
  withSubmittedPostBookingAnswers,
} from '../lib/bookingDetails.ts'

const t = (iso, id, extra = {}) => ({
  id,
  type: extra.type || 'status_changed',
  category: extra.category,
  occurredAt: iso,
  timestampRecorded: true,
  actor: extra.actor ?? null,
  actorRecorded: Boolean(extra.actor),
  description: extra.description ?? null,
  statusTo: extra.statusTo ?? null,
  metadata: extra.metadata ?? null,
  visibility: extra.visibility,
})

test('tab parsing and deep links preserve action params and only replace tab', () => {
  assert.equal(resolveDetailTab('quotation'), 'quotation')
  assert.equal(resolveDetailTab('bogus'), 'overview')
  assert.equal(resolveDetailTab(null), 'overview')

  const search = 'action=quote&postBookingQuestions=true&payExtras=1'
  assert.equal(
    buildDetailHref('/bookings/b1', search, 'quotation', '#quotation-v2'),
    '/bookings/b1?action=quote&postBookingQuestions=true&payExtras=1&tab=quotation#quotation-v2'
  )
  assert.equal(
    buildDetailHref('/bookings/b1', 'tab=quotation&action=quote', 'overview'),
    '/bookings/b1?action=quote'
  )
  const anchors = buildQuoteAnchors('/bookings/b1', 'foo=bar', 3)
  assert.equal(anchors.overview, '/bookings/b1?foo=bar&tab=quotation#quotation')
  assert.equal(anchors.version, '/bookings/b1?foo=bar&tab=quotation#quotation-v3')
  assert.equal(detailTabFromHash('#quotation-v2'), 'quotation')
  assert.equal(detailTabFromHash('#payments'), 'payments')
  assert.equal(detailTabFromHash('#booking-summary'), 'booking')
  assert.equal(detailTabFromHash('#activity'), 'activity')
  assert.equal(detailTabFromHash('#unknown'), null)
  assert.equal(detailTabFromHash(''), null)
  assert.equal(resolveTabFromUrl('?tab=payments', '#quotation-v2', 'overview'), 'quotation')
  assert.equal(resolveTabFromUrl('?tab=payments', '', 'overview'), 'payments')
  assert.equal(resolveTabFromUrl('?action=quote', '', 'booking'), 'booking')
  assert.equal(resolveTabFromUrl('?tab=bogus', '#unknown', 'overview'), 'overview')
})

test('quotation version labels append a version suffix exactly once', () => {
  assert.equal(quotationVersionLabel('QT-2026-000001-v1', 1), 'QT-2026-000001-v1')
  assert.equal(quotationVersionLabel('QT-2026-000001', 2), 'QT-2026-000001-v2')
  assert.equal(quotationVersionLabel('QT-2026-000001-v2', null), 'QT-2026-000001-v2')
  assert.equal(quotationVersionLabel(null, 3), 'v3')
  assert.equal(quotationVersionLabel(null, null), null)
})

test('date-only values are parsed as calendar dates and do not shift with the viewer zone', () => {
  const parsed = parseCalendarDate('2026-06-24')
  assert.equal(parsed.getFullYear(), 2026)
  assert.equal(parsed.getMonth(), 5)
  assert.equal(parsed.getDate(), 24)
  assert.equal(parseCalendarDate('2026-02-30'), null)
  assert.equal(formatCalendarDate('2026-06-24', 'en-GB'), '24/06/2026')
  assert.equal(formatCalendarDate('', 'en-GB'), null)
})

test('instant formatting honours an explicit recorded timezone', () => {
  const instant = '2026-06-24T22:30:00.000Z'
  assert.match(formatInstant(instant, 'en-GB', 'UTC'), /22:30/)
  assert.match(formatInstant(instant, 'en-GB', 'Europe/Amsterdam'), /00:30/)
  assert.equal(formatInstant('not-a-date', 'en-GB'), null)
})

test('activity is grouped by local day and undated legacy events go last', () => {
  const items = [
    t('2026-06-24T08:00:00.000Z', 'b'),
    t('2026-06-23T22:30:00.000Z', 'a'),
    t(null, 'undated'),
  ]
  items[2].timestampRecorded = false
  const groups = groupActivityByDay(items, 'Europe/Amsterdam')
  assert.deepEqual(groups.map((group) => group.key), ['2026-06-24', 'undated'])
  assert.deepEqual(groups[0].items.map((item) => item.id), ['a', 'b'])
  assert.equal(groups[1].undated, true)
})

test('dedupe removes duplicate ids and generic status rows covered by richer events', () => {
  const rich = t('2026-06-24T10:00:01.000Z', 'quote:v2', {
    type: 'quotation_accepted',
    category: 'quotation',
    statusTo: 'quote_accepted',
  })
  const generic = t('2026-06-24T10:00:02.000Z', 'status:1', { statusTo: 'quote_accepted' })
  const duplicate = t('2026-06-24T10:00:01.000Z', 'quote:v2', { type: 'quotation_accepted' })
  const unrelated = t('2026-06-24T10:10:00.000Z', 'status:2', { statusTo: 'booked' })
  assert.deepEqual(
    dedupeActivity([rich, generic, duplicate, unrelated]).map((item) => item.id),
    ['quote:v2', 'status:2']
  )
})

test('admin-only activity is hidden from participants but kept for admins', () => {
  const items = [
    t('2026-06-24T10:00:00.000Z', 'public'),
    t('2026-06-24T11:00:00.000Z', 'secret', { visibility: 'admin' }),
  ]
  assert.deepEqual(visibleActivity(items, 'customer').map((item) => item.id), ['public'])
  assert.deepEqual(visibleActivity(items, 'admin').map((item) => item.id), ['public', 'secret'])
})

test('legacy activity only uses stored timestamps and never current project data', () => {
  const booking = {
    _id: 'b1',
    createdAt: '2026-01-01T10:00:00.000Z',
    project: { title: 'Edited project title', subprojects: [{ name: 'Edited package' }] },
    statusHistory: [
      { status: 'booked', timestamp: '2026-01-02T10:00:00.000Z', updatedBy: 'u1', note: 'Booked' },
      { status: 'completed', timestamp: null, updatedBy: 'u2' },
    ],
    quoteVersions: [
      {
        version: 1,
        quotationNumber: 'QT-2026-000001-v1',
        createdAt: '2026-01-01T12:00:00.000Z',
        changeNote: 'Initial',
        createdBy: { _id: 'pro1', name: 'Pro Name', role: 'professional' },
      },
    ],
  }
  const items = buildLegacyActivity(booking)
  assert.equal(items.filter((item) => item.id.startsWith('status:')).length, 1)
  assert.equal(items.some((item) => item.description?.includes('Edited')), false)
  assert.equal(items.find((item) => item.id === 'quote:v1').actor.name, 'Pro Name')
  assert.equal(items.find((item) => item.id === 'quote:v1').references.quotationNumber, 'QT-2026-000001-v1')
})

test('legacy activity does not invent events when only live project data exists', () => {
  const items = buildLegacyActivity({
    _id: 'b1',
    project: { title: 'A project', postBookingQuestions: [{ question: 'Q' }] },
  })
  assert.deepEqual(items, [])
})

test('activity events without an actor are marked, never attributed to the viewer', () => {
  const [item] = buildLegacyActivity({
    _id: 'b1',
    statusHistory: [{ status: 'booked', timestamp: '2026-01-02T10:00:00.000Z', note: 'Booked' }],
  })
  assert.equal(item.actor, null)
  assert.equal(item.actorRecorded, false)
})

test('backend activity wins over fallback and is sorted', () => {
  const details = {
    activity: {
      items: [
        t('2026-06-25T10:00:00.000Z', 'late', { type: 'completion_confirmed' }),
        t('2026-06-24T10:00:00.000Z', 'early', { type: 'booking_created' }),
      ],
    },
  }
  const items = resolveActivityItems(details, { _id: 'b1', statusHistory: [] }, 'customer')
  assert.deepEqual(items.map((item) => item.id), ['early', 'late'])
  assert.deepEqual(buildLegacyActivity({ _id: 'b1' }), [])
})

test('answer rendering preserves 0, false, empty, array and object distinctions', () => {
  assert.deepEqual(describeAnswer(0), { kind: 'number', value: 0 })
  assert.deepEqual(describeAnswer(false), { kind: 'boolean', value: false })
  assert.deepEqual(describeAnswer(null), { kind: 'empty' })
  assert.deepEqual(describeAnswer(''), { kind: 'empty' })
  assert.deepEqual(describeAnswer([]), { kind: 'empty_array' })
  assert.deepEqual(describeAnswer(['a']), { kind: 'array', items: ['a'] })
  assert.deepEqual(describeAnswer({ a: 0 }), { kind: 'object', entries: [{ key: 'a', value: 0 }] })
  assert.deepEqual(describeAnswer('https://example.com/a.pdf'), {
    kind: 'file',
    value: 'https://example.com/a.pdf',
  })
  assert.deepEqual(describeAnswer('["Balcony","Cellar"]'), {
    kind: 'array',
    items: ['Balcony', 'Cellar'],
  })
  assert.deepEqual(describeAnswer('false'), { kind: 'boolean', value: false })
  assert.deepEqual(describeAnswer('true'), { kind: 'boolean', value: true })
  assert.deepEqual(describeAnswer('2026-06-24'), { kind: 'date', value: '2026-06-24' })
  assert.deepEqual(describeAnswer('[not json'), { kind: 'text', value: '[not json' })
})

test('post-booking submission updates details without inventing a timestamp', () => {
  const details = {
    viewerRole: 'customer',
    postBooking: {
      answers: [],
      complete: false,
      submittedAt: null,
      submittedBy: null,
    },
  }
  const merged = withSubmittedPostBookingAnswers(details, [
    { questionId: 'q1', question: 'Parking?', answer: '0' },
    { questionId: 'q2', question: 'File?', answer: 'https://example.com/a.pdf' },
  ])
  assert.equal(merged.postBooking.complete, true)
  assert.equal(merged.postBooking.submittedAt, null)
  assert.equal(merged.postBooking.answers[0].answer, '0')
  assert.equal(merged.postBooking.answers[0].answerType, 'text')
  assert.equal(merged.postBooking.answers[1].answerType, 'file')
  assert.equal(withSubmittedPostBookingAnswers(null, []), null)
})

test('admin links require role and area permissions and never appear for participants', () => {
  const permissions = {
    bookingsRead: true,
    disputesManage: true,
    warrantyManage: true,
    paymentsManage: true,
  }
  const participant = buildAdminDetailLinks({
    viewerRole: 'customer',
    bookingId: 'b1',
    permissions,
    hasDispute: true,
    hasPayment: true,
  })
  assert.deepEqual(participant, [])

  const admin = buildAdminDetailLinks({
    viewerRole: 'admin',
    bookingId: 'b1',
    permissions,
    claimNumber: 'WC-2026-000001',
    hasDispute: true,
    hasPayment: true,
  })
  assert.deepEqual(admin.map((link) => link.key), ['booking', 'warranty', 'disputes', 'payments'])
  assert.equal(admin[1].href, '/admin/warranty-claims?search=WC-2026-000001')

  const limited = buildAdminDetailLinks({
    viewerRole: 'admin',
    bookingId: 'b1',
    permissions: { ...permissions, warrantyManage: false, disputesManage: false, paymentsManage: false },
  })
  assert.deepEqual(limited.map((link) => link.key), ['booking'])
})

test('only http(s) attachments are rendered', () => {
  const safe = safeAttachments([
    { url: 'https://cdn.example.com/a.pdf', fileName: 'a.pdf' },
    { url: 'javascript:alert(1)' },
    { url: 's3://private/key' },
    { url: null },
  ])
  assert.deepEqual(safe.map((item) => item.url), ['https://cdn.example.com/a.pdf'])
})

test('notice codes are deduped and canonical backend codes map to translations', () => {
  assert.equal(
    dedupeNotices([
      { code: 'BOOKING_SNAPSHOT_NOT_RECORDED' },
      { code: 'BOOKING_SNAPSHOT_NOT_RECORDED', severity: 'warning' },
      { code: 'LIVE_PROJECT_MAY_HAVE_CHANGED' },
    ]).length,
    2
  )
  assert.equal(noticeKey('BOOKING_SNAPSHOT_NOT_RECORDED'), 'details.notices.termsSnapshotNotRecorded')
  assert.equal(noticeKey('QUOTE_CUSTOMER_TOTALS_NOT_RECORDED'), 'details.notices.quoteCustomerPricingNotRecorded')
  assert.equal(noticeKey('PAYMENT_CURRENCY_NOT_RECORDED'), 'details.notices.paymentCurrencyNotRecorded')
  assert.equal(
    activityQualityNoteKey('UNDATED_QUOTE_VERSION'),
    'activity.qualityNotes.undated_quote_version'
  )
  const acceptedDetails = {
    quotation: { status: 'accepted', currentVersion: 2, acceptedVersion: { version: 2, source: 'recorded' } },
  }
  assert.equal(quoteVersionStatus({ version: 1, rejectedAt: '2026-02-01T11:00:00.000Z' }, acceptedDetails), 'rejected')
  assert.equal(
    quoteVersionStatus({ version: 2, accepted: true, rejectedAt: '2026-02-01T11:00:00.000Z' }, acceptedDetails),
    'accepted'
  )
  const quotedDetails = { quotation: { status: 'quoted', currentVersion: 2, acceptedVersion: null } }
  assert.equal(quoteVersionStatus({ version: 1, rejectedAt: '2026-02-01T11:00:00.000Z' }, quotedDetails), 'rejected')
  assert.equal(
    quoteVersionStatus({ version: 2, rejectedAt: '2026-02-01T11:00:00.000Z' }, quotedDetails),
    'current',
    'a contradictory legacy rejection timestamp must not relabel the quoted current version'
  )
  assert.equal(quoteVersionStatus({ version: 3 }, quotedDetails), 'historical')
  assert.equal(
    quoteVersionStatus({ version: 2 }, { quotation: { status: 'rejected', currentVersion: 2 } }),
    'rejected'
  )
  assert.equal(
    quoteVersionStatus(
      { version: 2 },
      { quotation: { status: 'accepted', currentVersion: 2, acceptedVersion: { version: 2, source: 'inferred_current' } } }
    ),
    'accepted'
  )
})

test('backend activity amounts object and legacy amount lines render as recorded rows', () => {
  const backend = activityAmountRows({
    amounts: { amount: 131, netAmount: 110, vatAmount: 21, totalAmount: 131, currency: 'EUR' },
  })
  assert.deepEqual(
    backend.map((row) => [row.kind, row.amount, row.currency]),
    [
      ['net', 110, 'EUR'],
      ['vat', 21, 'EUR'],
      ['total', 131, 'EUR'],
    ]
  )

  const legacy = activityAmountRows({
    amounts: [{ kind: 'refund', amount: 25, currency: 'USD', recorded: true }],
  })
  assert.deepEqual(legacy, [{ kind: 'refund', amount: 25, currency: 'USD', recorded: true }])
  assert.deepEqual(activityAmountRows({ amounts: {} }), [])

  const duplicatedQuotation = activityAmountRows({
    amounts: { amount: 100, totalAmount: 100, currency: 'EUR' },
    amountLines: [{ kind: 'professional', amount: 100, currency: 'EUR', recorded: true }],
  })
  assert.deepEqual(duplicatedQuotation, [{ kind: 'professional', amount: 100, currency: 'EUR', recorded: true }])

  const nullCurrency = activityAmountRows({
    amounts: { totalAmount: 25, currency: null },
    amountLines: [{ kind: 'refund', amount: 25, currency: null, recorded: true }],
  })
  assert.deepEqual(nullCurrency, [{ kind: 'refund', amount: 25, currency: null, recorded: true }])

  const payout = activityAmountRows({
    amounts: { netAmount: 110, vatAmount: 23.1, totalAmount: 133.1, currency: 'EUR' },
    amountLines: [{ kind: 'payout', amount: 100, currency: 'EUR', recorded: true }],
  })
  assert.deepEqual(
    payout.map((row) => [row.kind, row.amount]),
    [
      ['payout', 100],
      ['net', 110],
      ['vat', 23.1],
      ['total', 133.1],
    ]
  )
})

test('activity categories cover the stable event families', () => {
  assert.equal(activityCategory('quotation_updated'), 'quotation')
  assert.equal(activityCategory('refund_processed'), 'refund')
  assert.equal(activityCategory('payment_succeeded'), 'payment')
  assert.equal(activityCategory('reschedule_declined'), 'schedule')
  assert.equal(activityCategory('completion_confirmed'), 'completion')
  assert.equal(activityCategory('warranty_claim_opened'), 'warranty')
  assert.equal(activityCategory('dispute_opened'), 'dispute')
  assert.equal(activityCategory('future_event'), 'system')
})

test('details-only fallback merges payment, refund and schedule records without duplicates', () => {
  const details = {
    reschedules: [
      {
        requestedAt: '2026-02-01T10:00:00.000Z',
        requestedBy: { id: 'u1', name: 'Customer', role: 'customer' },
        reason: 'Weather',
        status: 'accepted',
        respondedAt: '2026-02-02T10:00:00.000Z',
        respondedBy: { id: 'p1', name: 'Pro', role: 'professional' },
      },
    ],
    payments: {
      base: {
        currency: 'EUR',
        totalWithVat: 121,
        timestamps: { paidAt: '2026-02-03T10:00:00.000Z' },
      },
      refunds: [
        {
          id: 'r1',
          amount: 25,
          currency: 'EUR',
          refundedAt: '2026-02-04T10:00:00.000Z',
          justification: 'Agreed goodwill',
          status: 'recorded',
        },
      ],
    },
  }
  const items = resolveActivityItems(details, { _id: 'b1' }, 'customer')
  assert.deepEqual(
    items.map((item) => item.type),
    ['reschedule_requested', 'reschedule_accepted', 'payment_captured', 'refund_issued']
  )
  assert.equal(items[3].description, 'Agreed goodwill')
  assert.equal(items[3].amounts[0].amount, 25)
})

test('an explicit empty backend timeline is trusted over raw booking fallback', () => {
  const items = resolveActivityItems(
    { activity: { items: [], complete: true } },
    {
      _id: 'b1',
      statusHistory: [{ status: 'booked', timestamp: '2026-01-02T10:00:00.000Z' }],
    },
    'customer'
  )
  assert.deepEqual(items, [])
})

test('participant activity never exposes an admin-only item from a details payload', () => {
  const details = {
    activity: {
      items: [
        t('2026-01-01T10:00:00.000Z', 'visible', { type: 'booking_created' }),
        t('2026-01-02T10:00:00.000Z', 'admin-note', {
          type: 'status_note',
          visibility: 'admin',
          description: 'Internal note',
        }),
      ],
    },
  }
  assert.deepEqual(
    resolveActivityItems(details, { _id: 'b1' }, 'professional').map((item) => item.id),
    ['visible']
  )
  assert.deepEqual(
    resolveActivityItems(details, { _id: 'b1' }, 'admin').map((item) => item.id),
    ['visible', 'admin-note']
  )
})

test('admin warranty link falls back to the list when no claim number exists', () => {
  const links = buildAdminDetailLinks({
    viewerRole: 'admin',
    bookingId: 'b1',
    permissions: {
      bookingsRead: false,
      disputesManage: false,
      warrantyManage: true,
      paymentsManage: false,
    },
  })
  assert.deepEqual(links, [{ key: 'warranty', href: '/admin/warranty-claims' }])
})


const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/bookingDetails/${name}.json`, import.meta.url), 'utf8'))

test('question/answer union keeps recorded wording, 0/false/array answers and unknown definitions', () => {
  const rows = mergeQuestionAnswers(
    [
      { questionId: 'q1', question: 'Live q1', type: 'text', source: 'live_project', isRequired: true },
      { questionId: 'q2', question: 'Live q2', type: 'text', source: 'live_project' },
      { questionId: 'q3', question: 'Live q3', type: 'text', source: 'booking_snapshot' },
    ],
    [
      { questionId: 'q1', question: 'Recorded q1', answer: 0, fieldType: 'number' },
      { questionId: 'q3', question: 'Live q3', answer: false },
      { questionId: 'q4', question: 'Which extras?', answer: '["Balcony","Cellar"]', options: ['Balcony', 'Cellar'] },
      { questionId: 'q5', question: 'Blank answer', answer: '' },
    ]
  )
  assert.equal(rows.length, 4)
  assert.equal(rows[0].label, 'Recorded q1')
  assert.equal(rows[0].labelSource, 'recorded_answer')
  assert.equal(rows[0].hasAnswer, true)
  assert.equal(rows[0].answer, 0)
  assert.equal(rows[0].options.length, 0)
  assert.equal(rows[1].label, 'Live q2')
  assert.equal(rows[1].hasAnswer, false)
  assert.equal(rows[2].label, 'Live q3')
  assert.equal(rows[2].hasAnswer, true)
  assert.equal(rows[2].answer, false)
  assert.equal(rows[3].label, 'Which extras?')
  assert.equal(rows[3].hasAnswer, true)
  assert.deepEqual(rows[3].options, ['Balcony', 'Cellar'])
  assert.equal(answerRecorded(0), true)
  assert.equal(answerRecorded(false), true)
  assert.equal(answerRecorded([]), true)
  assert.equal(answerRecorded(''), false)
  assert.equal(answerRecorded(null), false)
})

test('legacy question with no definition gets an explicit unknown label, not live wording', () => {
  const rows = mergeQuestionAnswers([], [{ questionId: 'pq-9', answer: 'false' }])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].label, null)
  assert.equal(rows[0].labelSource, 'none')
  assert.equal(rows[0].hasAnswer, true)
})

test('post-booking form source uses the recorded snapshot and falls back honestly for legacy records', () => {
  const completed = fixture('completed-customer')
  const snapshot = resolvePostBookingFormQuestions(
    completed.details,
    completed.booking.project?.postBookingQuestions || []
  )
  assert.equal(snapshot.legacyFallback, false)
  assert.equal(snapshot.laterProjectQuestions, false)
  assert.equal(snapshot.source, 'booking_snapshot')
  assert.deepEqual(snapshot.questions.map((question) => question.question), [
    'Parking available?',
    'Pets present?',
  ])
  assert.deepEqual(snapshot.questions.map((question) => question._id), ['pq-1', 'pq-2'])

  const legacy = fixture('legacy-customer')
  const legacySource = resolvePostBookingFormQuestions(
    legacy.details,
    legacy.booking.project?.postBookingQuestions || []
  )
  assert.equal(legacySource.legacyFallback, true)
  assert.equal(legacySource.laterProjectQuestions, false)
  assert.deepEqual(legacySource.questions.map((question) => question.question), [
    'Current live parking question?',
  ])

  const noSnapshotQuestions = structuredClone(completed.details)
  noSnapshotQuestions.postBooking.questions = []
  const empty = resolvePostBookingFormQuestions(
    noSnapshotQuestions,
    completed.booking.project?.postBookingQuestions || []
  )
  assert.deepEqual(empty.questions, [])
  assert.equal(empty.legacyFallback, false)
  assert.equal(empty.laterProjectQuestions, false)

  const noDetails = resolvePostBookingFormQuestions(null, legacy.booking.project?.postBookingQuestions || [])
  assert.equal(noDetails.legacyFallback, true)
  assert.equal(noDetails.laterProjectQuestions, false)
  assert.deepEqual(noDetails.questions.map((question) => question.question), [
    'Current live parking question?',
  ])
})

test('hash removal restores the current quotation version and the queried/default tab', () => {
  assert.equal(resolveQuotationVersionFromUrl('#quotation-v1', 2, 2), 1)
  assert.equal(resolveQuotationVersionFromUrl('', 2, 1), 2)
  assert.equal(resolveQuotationVersionFromUrl('#quotation', 2, 1), 2)
  assert.equal(resolveQuotationVersionFromUrl('', null, 1), 1)
  assert.equal(resolveTabFromUrl('?tab=quotation', ''), 'quotation')
  assert.equal(resolveTabFromUrl('?lang=en&action=quote', ''), 'overview')
  assert.equal(resolveTabFromUrl('?tab=payments', '#quotation-v1'), 'quotation')
  assert.equal(resolveTabFromUrl('?tab=quotation', '#quotation-v1'), 'quotation')
})

test('own record currency never inherits a default or an unrelated record currency', () => {
  assert.equal(ownRecordedCurrency({ currency: 'EUR', currencySource: 'not_recorded' }), null)
  assert.equal(ownRecordedCurrency({ currency: 'GBP', currencySource: 'payment' }), 'GBP')
  assert.equal(ownRecordedCurrency({ currency: 'GBP', currencyRecorded: false }), null)
  assert.equal(ownRecordedCurrency({ currency: null, currencySource: 'payment' }), null)
  assert.equal(ownRecordedCurrency(null), null)
})

test('VAT helper translates known fields/values and preserves unknown custom ones', () => {
  assert.equal(vatAnswerFieldLabelKey('propertyNature'), 'details.enums.vatAnswerField.propertyNature')
  assert.equal(vatAnswerFieldLabelKey('custom_field'), null)
  assert.equal(vatAnswerValueKey('immovable'), 'details.enums.vatAnswerValue.immovable')
  assert.equal(vatAnswerValueKey('standard_rate'), 'details.enums.vatAnswerValue.standard_rate')
  assert.equal(vatAnswerValueKey('my custom answer'), null)
  assert.equal(vatAnswerValueKey(0), null)
})


test('a captured snapshot keeps recorded questions and treats later live questions only as a separate submission-time set', () => {
  const completed = fixture('completed-customer')
  const details = structuredClone(completed.details)
  // A captured snapshot with recorded questions stays authoritative even if
  // live questions appear alongside it; later wording must not enter the form.
  details.postBooking.questions = [
    ...details.postBooking.questions,
    { questionId: 'pq-new', question: 'Current live parking question?', type: 'text', options: [], isRequired: true, professionalAttachments: [], answer: null, answered: false, source: 'live_project' },
  ]
  const resolved = resolvePostBookingFormQuestions(details, completed.booking.project?.postBookingQuestions || [])
  assert.deepEqual(resolved.questions.map((question) => question._id), ['pq-1', 'pq-2'])
  assert.equal(resolved.source, 'booking_snapshot')
  assert.equal(resolved.laterProjectQuestions, false)

  // A captured snapshot with no post-booking section: the backend accepts and
  // freezes submission-time definitions. They are offered explicitly as later
  // questions, never relabelled as part of the original snapshot.
  const emptySnapshot = structuredClone(completed.details)
  emptySnapshot.bookingSnapshot.questions.postBooking = []
  emptySnapshot.postBooking.questions = [
    { questionId: 'pq-new-1', question: 'Added after booking?', type: 'text', options: [], isRequired: true, professionalAttachments: [], answer: null, answered: false, source: 'live_project' },
    { questionId: 'pq-new-2', question: 'Choose access?', type: 'multiple_choice', options: ['Front', 'Back'], isRequired: false, professionalAttachments: [], answer: null, answered: false, source: 'live_project' },
  ]
  const later = resolvePostBookingFormQuestions(emptySnapshot, [])
  assert.equal(later.legacyFallback, false)
  assert.equal(later.laterProjectQuestions, true)
  assert.equal(later.source, 'live_project')
  assert.deepEqual(later.questions.map((question) => [question._id, question.type, question.isRequired]), [
    ['pq-new-1', 'text', true],
    ['pq-new-2', 'multiple_choice', false],
  ])
})

test('an explicit unrecorded schedule zone is not replaced by a raw/inferred booking zone', () => {
  const details = {
    booking: { schedule: { timeZone: 'Europe/Brussels', timeZoneRecorded: false } },
    bookingSnapshot: { schedule: { timeZone: null, timeZoneRecorded: false } },
  }
  assert.equal(recordedScheduleTimeZone(details, 'Europe/Lisbon'), null)
  assert.equal(
    recordedScheduleTimeZone(
      { booking: { schedule: { timeZone: 'Europe/Brussels', timeZoneRecorded: true } } },
      'Europe/Lisbon'
    ),
    'Europe/Brussels'
  )
  assert.equal(recordedScheduleTimeZone(null, 'Europe/Lisbon'), 'Europe/Lisbon')
})

test('actual later-question submission fixtures carry valid ids/types/required and a frozen post-submission DTO', () => {
  const before = fixture('post-booking-later-before-customer')
  const beforeSource = resolvePostBookingFormQuestions(
    before.details,
    before.booking.project?.postBookingQuestions || []
  )
  assert.equal(beforeSource.source, 'live_project')
  assert.equal(beforeSource.legacyFallback, false)
  assert.equal(beforeSource.laterProjectQuestions, true)
  assert.deepEqual(
    beforeSource.questions.map((question) => [question._id, question.type, question.isRequired]),
    [
      ['pbq-1', 'text', true],
      ['pbq-2', 'text', true],
      ['pbq-3', 'multiple_choice', true],
      ['pbq-4', 'attachment', true],
    ]
  )

  const answers = {
    0: '0',
    1: 'false',
    2: 'Back door',
    3: 'https://fixera-uploads.s3.us-east-1.amazonaws.com/rfq-attachments/507f1f77bcf86cd799439011/access-proof.pdf',
  }
  assert.deepEqual(missingRequiredPostBookingQuestionIndexes(beforeSource.questions, answers), [])
  assert.deepEqual(
    missingRequiredPostBookingQuestionIndexes(beforeSource.questions, { ...answers, 3: '   ' }),
    [3]
  )
  assert.deepEqual(buildPostBookingAnswerPayload(beforeSource.questions, answers), [
    { questionId: 'pbq-1', question: 'Which floor is the bathroom on?', answer: '0' },
    { questionId: 'pbq-2', question: 'Is the lift available?', answer: 'false' },
    { questionId: 'pbq-3', question: 'Which access door?', answer: 'Back door' },
    { questionId: 'pbq-4', question: 'Upload access proof', answer: answers[3] },
  ])
  assert.deepEqual(
    buildPostBookingAnswerPayload(beforeSource.questions, { 0: '0', 1: '', 2: 'Back door', 3: answers[3] }),
    [
      { questionId: 'pbq-1', question: 'Which floor is the bathroom on?', answer: '0' },
      { questionId: 'pbq-3', question: 'Which access door?', answer: 'Back door' },
      { questionId: 'pbq-4', question: 'Upload access proof', answer: answers[3] },
    ],
    'blank optional answers are omitted from the POST payload'
  )

  const after = fixture('post-booking-submission-customer')
  const afterSource = resolvePostBookingFormQuestions(
    after.details,
    after.booking.project?.postBookingQuestions || []
  )
  assert.equal(afterSource.source, 'post_booking_submission')
  assert.equal(afterSource.legacyFallback, false)
  assert.equal(afterSource.laterProjectQuestions, false)
  assert.deepEqual(afterSource.questions.map((question) => question._id), [
    'pbq-1',
    'pbq-2',
    'pbq-3',
    'pbq-4',
  ])
  assert.ok(
    after.details.postBooking.questions.every(
      (question) => question.source === 'post_booking_submission'
    )
  )
  assert.ok(
    after.details.postBooking.questions.every((question) => !question.question.startsWith('EDITED'))
  )
  assert.deepEqual(
    after.details.postBooking.questions.find((question) => question.questionId === 'pbq-3').options,
    ['Front door', 'Back door']
  )

  const legacy = fixture('legacy-customer')
  const legacyRows = mergeQuestionAnswers(
    legacy.details.postBooking.questions,
    legacy.details.postBooking.answers
  )
  const orphan = legacyRows.find((row) => row.questionId === 'pq-2')
  assert.equal(orphan.questionSource, 'recorded_answer')
  assert.equal(orphan.label, 'Pets present?')
  assert.equal(orphan.hasAnswer, true)
  assert.equal(orphan.answer, 'false')
})
