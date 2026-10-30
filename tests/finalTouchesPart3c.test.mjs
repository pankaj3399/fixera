import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const {
  parseQuotationVatDetermination,
  parseQuotationVatOptionsResponse,
  isReverseChargeDetermination,
  shouldShowArticle47Class,
  applyReverseChargeToLines,
} = await import('@/lib/quotationVat')
const {
  getTimelineBounds,
  getTimelineDisplaySchedule,
  resolveTimelineIsDaysMode,
  resolveTimelineShowTimes,
  resolveTimelineHourMode,
  resolveTimelineExecutionUnit,
} = await import('@/lib/bookingTimeline')
const {
  resolveScheduleHourMode,
  resolveBookingHourMode,
  resolvePanelHourMode,
  formatScheduleTimeRange,
} = await import('@/lib/bookingDetails')
const VatDeterminationPanel = (await import('@/components/quotation/VatDeterminationPanel')).default
const { ScheduleSummary } = await import('@/components/booking/details/DetailPrimitives')

const readSource = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const quotationEn = JSON.parse(readFileSync(new URL('../messages/en/quotation.json', import.meta.url), 'utf8'))
const quotationNl = JSON.parse(readFileSync(new URL('../messages/nl/quotation.json', import.meta.url), 'utf8'))
const quotationFr = JSON.parse(readFileSync(new URL('../messages/fr/quotation.json', import.meta.url), 'utf8'))
const widgetsEn = JSON.parse(readFileSync(new URL('../messages/en/dashboardWidgets.json', import.meta.url), 'utf8'))
const widgetsNl = JSON.parse(readFileSync(new URL('../messages/nl/dashboardWidgets.json', import.meta.url), 'utf8'))
const widgetsFr = JSON.parse(readFileSync(new URL('../messages/fr/dashboardWidgets.json', import.meta.url), 'utf8'))
const bookingsEn = JSON.parse(readFileSync(new URL('../messages/en/bookings.json', import.meta.url), 'utf8'))

function renderScheduleSummary(schedule, hourMode) {
  return renderToStaticMarkup(
    React.createElement(
      NextIntlClientProvider,
      { locale: 'en', messages: { bookings: bookingsEn }, timeZone: 'UTC' },
      React.createElement(ScheduleSummary, { schedule, intl: 'en', hourMode })
    )
  )
}

// date-fns parses date-only strings as local midnight: compare local parts.
const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function renderPanel(determination, locale = 'en') {
  const messages = locale === 'nl' ? { quotation: quotationNl } : locale === 'fr' ? { quotation: quotationFr } : { quotation: quotationEn }
  return renderToStaticMarkup(
    React.createElement(
      NextIntlClientProvider,
      { locale, messages, timeZone: 'UTC' },
      React.createElement(VatDeterminationPanel, { determination })
    )
  )
}

// ── 18a/18b: VAT determination parsing ──────────────────────────────
test('parseQuotationVatDetermination accepts B2B reverse-charge payloads', () => {
  assert.deepEqual(
    parseQuotationVatDetermination({
      customerType: 'B2B',
      article47Class: 'Immovable but exempt from Belgian reverse charge',
      vatAddressType: 'Booking address',
      vatCountry: 'be',
      reverseCharge: true,
    }),
    {
      customerType: 'B2B',
      article47Class: 'Immovable but exempt from Belgian reverse charge',
      vatAddressType: 'Booking address',
      vatCountry: 'BE',
      reverseCharge: true,
    }
  )
  assert.deepEqual(
    parseQuotationVatDetermination({
      customerType: 'B2C',
      article47Class: null,
      vatAddressType: 'Customer business address',
      vatCountry: 'NL',
      reverseCharge: false,
    })?.customerType,
    'B2C'
  )
})

test('parseQuotationVatDetermination rejects unknown enums, stays null on legacy shapes', () => {
  // Unknown enum values invalidate the payload instead of rendering raw text.
  assert.equal(
    parseQuotationVatDetermination({
      customerType: 'B2B',
      article47Class: 'Spaceship',
      vatAddressType: 'Booking address',
      vatCountry: 'BE',
      reverseCharge: false,
    }),
    null
  )
  assert.equal(parseQuotationVatDetermination(null), null)
  assert.equal(parseQuotationVatDetermination({}), null)
  assert.equal(
    parseQuotationVatDetermination({
      customerType: 'individual',
      vatAddressType: 'Booking address',
      vatCountry: 'BE',
      reverseCharge: false,
    }),
    null
  )
  assert.equal(
    parseQuotationVatDetermination({
      customerType: 'B2B',
      article47Class: null,
      vatAddressType: 'Booking address',
      vatCountry: '',
      reverseCharge: false,
    }),
    null
  )
})

test('parseQuotationVatOptionsResponse tolerates legacy/loading/error bodies', () => {
  assert.equal(parseQuotationVatOptionsResponse(null), null)
  assert.equal(parseQuotationVatOptionsResponse({ success: false }), null)
  assert.equal(parseQuotationVatOptionsResponse({ success: true, data: {} }), null)
  // Legacy body without a determination still yields usable options.
  const legacy = parseQuotationVatOptionsResponse({
    success: true,
    data: { options: [{ rate: 21, country: 'BE', label: '21% standard VAT', reverseCharge: false, source: 'standard' }] },
  })
  assert.equal(legacy?.options.length, 1)
  assert.equal(legacy?.vatDetermination, null)
  const full = parseQuotationVatOptionsResponse({
    success: true,
    data: {
      options: [{ rate: 0, country: 'BE', label: 'Reverse Charge', reverseCharge: true, source: 'b2b_exempt' }],
      vatDetermination: {
        customerType: 'B2B',
        article47Class: 'Movable',
        vatAddressType: 'Customer business address',
        vatCountry: 'BE',
        reverseCharge: true,
      },
    },
  })
  assert.equal(full?.vatDetermination?.reverseCharge, true)
  assert.equal(full?.vatDetermination?.article47Class, 'Movable')
})

test('malformed VAT options are dropped instead of becoming NaN-rate defaults', () => {
  const parsed = parseQuotationVatOptionsResponse({
    success: true,
    data: {
      options: [
        { rate: 'not-a-number', country: 'BE', label: 'Bogus', reverseCharge: false, source: 'standard' },
        { country: 'BE', label: 'Missing rate', reverseCharge: false, source: 'reduced' },
        { rate: 21, country: 'BE', label: '21% standard VAT', reverseCharge: false, source: 'standard' },
      ],
    },
  })
  assert.equal(parsed?.options.length, 1)
  assert.equal(parsed?.options[0]?.rate, 21)
})

test('reverse-charge detection and Article 47 visibility rules', () => {
  const rc = { customerType: 'B2B', article47Class: null, vatAddressType: 'Booking address', vatCountry: 'BE', reverseCharge: true }
  const std = { ...rc, reverseCharge: false }
  assert.equal(isReverseChargeDetermination(rc, []), true)
  assert.equal(isReverseChargeDetermination(std, [{ reverseCharge: false }]), false)
  assert.equal(isReverseChargeDetermination(null, [{ reverseCharge: true }]), true)
  assert.equal(isReverseChargeDetermination(null, [{ reverseCharge: true }, { reverseCharge: false }]), false)
  assert.equal(isReverseChargeDetermination(null, null), false)
  assert.equal(shouldShowArticle47Class({ ...rc, article47Class: 'Movable' }), true)
  assert.equal(shouldShowArticle47Class({ ...rc, customerType: 'B2C', article47Class: 'Movable' }), false)
  assert.equal(shouldShowArticle47Class(std), false)
  assert.equal(shouldShowArticle47Class(null), false)
})

test('applyReverseChargeToLines forces every line onto the RC option', () => {
  const lines = [
    { description: 'Work', price: 100, vatRate: 21, vatCountry: 'BE', vatLabel: '21% standard VAT', vatRateMode: 'preset', vatRateExplicitlyEntered: true },
    { description: 'Extra', price: 50, vatRate: 0, vatLabel: 'Custom VAT rate', vatRateMode: 'custom', vatRateExplicitlyEntered: false },
  ]
  const forced = applyReverseChargeToLines(lines, { rate: 0, country: 'BE', label: 'Reverse Charge' })
  assert.equal(forced.length, 2)
  for (const line of forced) {
    assert.equal(line.vatRate, 0)
    assert.equal(line.vatCountry, 'BE')
    assert.equal(line.vatLabel, 'Reverse Charge')
    assert.equal(line.vatRateMode, 'preset')
    assert.equal(line.vatRateExplicitlyEntered, true)
  }
  // Input untouched (no mutation of the wizard form state).
  assert.equal(lines[0].vatRate, 21)
})

test('VatDeterminationPanel shows Article 47 only for B2B and the RC note', () => {
  const b2b = renderPanel({
    customerType: 'B2B',
    article47Class: 'Immovable',
    vatAddressType: 'Customer business address',
    vatCountry: 'BE',
    reverseCharge: true,
  })
  assert.match(b2b, /VAT determination/)
  assert.match(b2b, /Business \(B2B\)/)
  assert.match(b2b, /Article 47/)
  assert.match(b2b, /Immovable/)
  assert.match(b2b, /Customer business address/)
  assert.match(b2b, /BE/)
  assert.match(b2b, /0% VAT on all lines/)

  const b2c = renderPanel({
    customerType: 'B2C',
    article47Class: null,
    vatAddressType: 'Booking address',
    vatCountry: 'NL',
    reverseCharge: false,
  })
  assert.match(b2c, /Consumer \(B2C\)/)
  assert.match(b2c, /Booking address/)
  assert.doesNotMatch(b2c, /Article 47/)
  assert.doesNotMatch(b2c, /0% VAT on all lines/)

  // nl + fr render without crashing and translate the panel.
  assert.match(renderPanel({
    customerType: 'B2B',
    article47Class: 'Movable',
    vatAddressType: 'Booking address',
    vatCountry: 'DE',
    reverseCharge: false,
  }, 'nl'), /Btw-vaststelling/)
  assert.match(renderPanel({
    customerType: 'B2B',
    article47Class: 'Movable',
    vatAddressType: 'Booking address',
    vatCountry: 'DE',
    reverseCharge: false,
  }, 'fr'), /Détermination de la TVA/)
})

test('quotation wizard renders determination, locks RC lines, submits RC-only', () => {
  const wizard = readSource('../components/quotation/QuotationWizard.tsx')
  assert.match(wizard, /VatDeterminationPanel/)
  assert.match(wizard, /parseQuotationVatOptionsResponse/)
  assert.match(wizard, /isReverseChargeDetermination/)
  assert.match(wizard, /applyReverseChargeToLines/)
  assert.match(wizard, /reverseChargeRate/)
  assert.match(wizard, /vatDetermination\.loadError/)
  // Read-only RC rendering replaces the selector; submit forces RC values.
  assert.match(wizard, /isReverseCharge \? \(/)
  assert.match(wizard, /rcOptionForSubmit/)
  assert.match(wizard, /pricingLinesForSubmit/)
  // Forcing requires a real reverse-charge option, never the fallback.
  assert.match(wizard, /find\(\(option\) => option\.reverseCharge\) \|\| null/)
  assert.doesNotMatch(wizard, /reverseCharge\) \|\| defaultVatOption/)
  assert.doesNotMatch(wizard, /reverseCharge\) \|\| firstOption/)
  // Screen-reader affordances for the read-only rate and notices.
  assert.match(wizard, /role="alert"/)
  assert.match(wizard, /role="status"/)
  assert.match(wizard, /role="note"/)
  // Non-RC keeps the professional Standard/Reduced selector.
  assert.match(wizard, /updatePricingLineVat/)
  assert.match(wizard, /selectVatRateOptions/)
})

test('VAT determination i18n keys exist in en/nl/fr', () => {
  for (const [name, messages] of [['en', quotationEn], ['nl', quotationNl], ['fr', quotationFr]]) {
    const det = messages.wizard?.vatDetermination
    assert.ok(det, `${name} vatDetermination`)
    for (const key of ['title', 'customerType', 'article47', 'addressType', 'country', 'reverseCharge', 'yes', 'no', 'reverseChargeNote', 'reverseChargeRate', 'loadError']) {
      assert.ok(det[key], `${name} vatDetermination.${key}`)
    }
    assert.ok(det.customerTypes?.b2c && det.customerTypes?.b2b, `${name} customerTypes`)
    assert.ok(det.article47Classes?.movable && det.article47Classes?.immovable && det.article47Classes?.immovableExempt, `${name} article47Classes`)
    assert.ok(det.addressTypes?.booking && det.addressTypes?.business, `${name} addressTypes`)
  }
  assert.equal(widgetsEn.timeline.tooltip.bufferEnd, 'Buffer end: {value}')
  assert.equal(widgetsNl.timeline.tooltip.bufferEnd, 'Einde buffer: {value}')
  assert.equal(widgetsFr.timeline.tooltip.bufferEnd, 'Fin du tampon : {value}')
})

// ── 22c: timeline shows execution time only ──────────────────────────
test('timeline bounds use execution end, never buffer end', () => {
  const booking = {
    scheduledStartDate: '2026-11-01',
    scheduledExecutionEndDate: '2026-11-03',
    scheduledBufferEndDate: '2026-11-10',
  }
  const bounds = getTimelineBounds(booking)
  assert.equal(dayKey(bounds?.start), '2026-11-01')
  assert.equal(dayKey(bounds?.end), '2026-11-03')
  // No execution end falls back to the start (single-day bar), not buffer.
  const noExec = getTimelineBounds({ scheduledStartDate: '2026-11-01', scheduledBufferEndDate: '2026-11-10' })
  assert.equal(dayKey(noExec?.end), '2026-11-01')
  // Preferred start fallback and null when nothing is scheduled.
  assert.equal(dayKey(getTimelineBounds({ rfqData: { preferredStartDate: '2026-12-01' } })?.start), '2026-12-01')
  assert.equal(getTimelineBounds({}), null)
})

test('timeline display schedule prefers the proposed reschedule window', () => {
  const booking = {
    status: 'rescheduling_requested',
    scheduledStartDate: '2026-11-01',
    scheduledExecutionEndDate: '2026-11-03',
    scheduledBufferEndDate: '2026-11-10',
    rescheduleRequest: {
      proposedSchedule: { scheduledStartDate: '2026-11-08', scheduledExecutionEndDate: '2026-11-09', scheduledBufferEndDate: '2026-11-20' },
    },
  }
  assert.equal(getTimelineDisplaySchedule(booking).scheduledStartDate, '2026-11-08')
  assert.equal(dayKey(getTimelineBounds(booking)?.end), '2026-11-09')
  // Non-rescheduling bookings ignore a stale proposed schedule.
  const booked = { ...booking, status: 'booked' }
  assert.equal(dayKey(getTimelineBounds(booked)?.start), '2026-11-01')
})

test('timeline board consumes execution-only bounds with separate buffer display', () => {
  const board = readSource('../components/dashboard/BookingTimelineBoard.tsx')
  assert.doesNotMatch(board, /toDate\(schedule\.scheduledBufferEndDate\)/)
  assert.doesNotMatch(board, /scheduledBufferEndDate\)\s*\n\s*\|\|/)
  assert.match(board, /getTimelineBounds/)
  assert.match(board, /resolveTimelineShowTimes/)
  assert.match(board, /timeline\.tooltip\.bufferEnd/)
  assert.match(board, /scheduledEndTime/)
  // scheduleSnapshot execution duration feeds days/hour detection.
  assert.match(board, /scheduleSnapshot\?: \{\s*\n?\s*executionDuration\?: \{ value\?: number; unit\?: 'hours' \| 'days' \}/)
})

test('timeline execution-unit resolution prefers recorded snapshots', () => {
  const daysProject = { executionDuration: { value: 3, unit: 'days' } }
  assert.equal(resolveTimelineExecutionUnit({ project: daysProject }), 'days')
  assert.equal(resolveTimelineIsDaysMode({ project: daysProject }), true)
  const hoursProject = { executionDuration: { value: 4, unit: 'hours' } }
  assert.equal(resolveTimelineExecutionUnit({ project: hoursProject }), 'hours')
  assert.equal(resolveTimelineIsDaysMode({ project: hoursProject }), false)
  // Recorded schedule snapshot fills in when the project omits durations.
  assert.equal(
    resolveTimelineExecutionUnit({ project: { timeMode: 'mixed' }, scheduleSnapshot: { executionDuration: { value: 2, unit: 'hours' } } }),
    'hours'
  )
  // Snapshot wins over live project data: a project edited after booking
  // must not flip the timeline while the panels stay put.
  assert.equal(
    resolveTimelineExecutionUnit({
      project: { timeMode: 'days', executionDuration: { value: 3, unit: 'days' } },
      scheduleSnapshot: { executionDuration: { value: 2, unit: 'hours' } },
    }),
    'hours'
  )
  assert.equal(resolveTimelineHourMode({
    project: { timeMode: 'days', executionDuration: { value: 3, unit: 'days' } },
    scheduleSnapshot: { executionDuration: { value: 2, unit: 'hours' } },
  }), true)
  // Live project still applies when no snapshot is recorded.
  assert.equal(
    resolveTimelineExecutionUnit({
      project: { timeMode: 'hours', executionDuration: { value: 4, unit: 'hours' } },
      scheduleSnapshot: null,
    }),
    'hours'
  )
  // Time mode fallback; unknown stays unknown.
  assert.equal(resolveTimelineExecutionUnit({ project: { timeMode: 'days' } }), 'days')
  assert.equal(resolveTimelineExecutionUnit({ project: { timeMode: 'hours' } }), 'hours')
  assert.equal(resolveTimelineExecutionUnit({}), null)
  assert.equal(resolveTimelineIsDaysMode({}), false)
  assert.equal(resolveTimelineHourMode({}), false)
  assert.equal(resolveTimelineHourMode({ project: { timeMode: 'hours' } }), true)
  assert.equal(resolveTimelineHourMode({ project: { timeMode: 'days' } }), false)
  assert.equal(resolveTimelineHourMode(null), false)
})

test('timeline shows times only for hour mode with recorded times', () => {
  const hour = {
    scheduledStartDate: '2026-11-05',
    scheduledStartTime: '14:00',
    scheduledEndTime: '16:00',
    project: { timeMode: 'hours', executionDuration: { value: 2, unit: 'hours' } },
  }
  assert.equal(resolveTimelineShowTimes(hour), true)
  const days = { ...hour, project: { timeMode: 'days', executionDuration: { value: 2, unit: 'days' } } }
  assert.equal(resolveTimelineShowTimes(days), false)
  assert.equal(resolveTimelineShowTimes({ ...hour, scheduledEndTime: null }), false)
  assert.equal(resolveTimelineShowTimes(null), false)
  // Unknown mode stays date-only even when times are recorded (fail-safe:
  // showing a wrong time is worse than showing none).
  assert.equal(
    resolveTimelineShowTimes({
      scheduledStartDate: '2026-11-05',
      scheduledStartTime: '14:00',
      scheduledEndTime: '16:00',
      project: { timeMode: 'mixed' },
    }),
    false
  )
  assert.equal(resolveTimelineShowTimes({ scheduledStartTime: '14:00', scheduledEndTime: '16:00' }), false)
})

// ── 23a: hour-mode times in booking info and timeline ────────────────
test('hour-mode helpers gate times on execution unit, never on presence alone', () => {
  assert.equal(resolveScheduleHourMode({ executionUnit: 'hours' }), true)
  assert.equal(resolveScheduleHourMode({ executionUnit: 'days' }), false)
  assert.equal(resolveScheduleHourMode({ timeMode: 'hours' }), true)
  assert.equal(resolveScheduleHourMode({ timeMode: 'days' }), false)
  assert.equal(resolveScheduleHourMode({ executionUnit: 'days', timeMode: 'hours' }), false)
  assert.equal(resolveScheduleHourMode({ timeMode: 'HOURS' }), true)
  assert.equal(resolveScheduleHourMode(null), false)
  assert.equal(resolveScheduleHourMode({}), false)
  assert.equal(
    resolveBookingHourMode({ snapshotExecutionUnit: 'hours', bookingTimeMode: 'days' }),
    true
  )
  assert.equal(
    resolveBookingHourMode({ bookingExecutionUnit: 'days', snapshotTimeMode: 'hours' }),
    false
  )
  assert.equal(resolveBookingHourMode({ snapshotTimeMode: 'hours' }), true)
  assert.equal(resolveBookingHourMode({ bookingTimeMode: 'days' }), false)
  assert.equal(resolveBookingHourMode(null), false)
  assert.equal(formatScheduleTimeRange('14:00', '16:00'), '14:00–16:00')
  assert.equal(formatScheduleTimeRange('14:00', null), null)
  assert.equal(formatScheduleTimeRange(null, '16:00'), null)
})

test('resolvePanelHourMode prefers snapshot over live project data', () => {
  const hourBooking = {
    selectedSubprojectIndex: 0,
    project: {
      timeMode: 'hours',
      executionDuration: { value: 2, unit: 'hours' },
      subprojects: [{ executionDuration: { value: 2, unit: 'hours' } }],
    },
  }
  const hourDetails = {
    bookingSnapshot: {
      project: { timeMode: 'hours' },
      selectedSubproject: { executionDuration: { value: 2, unit: 'hours' } },
    },
  }
  assert.equal(resolvePanelHourMode(hourBooking, hourDetails), true)
  // Snapshot unit beats live unit: a project edited after booking keeps the
  // recorded mode.
  assert.equal(
    resolvePanelHourMode(
      hourBooking,
      { bookingSnapshot: { project: { timeMode: 'days' }, selectedSubproject: { executionDuration: { value: 3, unit: 'days' } } } }
    ),
    false
  )
  // Live unit applies when no snapshot is recorded.
  assert.equal(resolvePanelHourMode(hourBooking, null), true)
  assert.equal(resolvePanelHourMode(hourBooking, {}), true)
  // Day mode, unknown mode, and missing inputs never show times.
  const daysBooking = {
    project: { timeMode: 'days', executionDuration: { value: 3, unit: 'days' } },
  }
  assert.equal(resolvePanelHourMode(daysBooking, null), false)
  assert.equal(resolvePanelHourMode({}, null), false)
  assert.equal(resolvePanelHourMode(null, null), false)
  assert.equal(resolvePanelHourMode(undefined, undefined), false)
  // Snapshot timeMode fills in when no unit is recorded anywhere.
  assert.equal(
    resolvePanelHourMode({ project: {} }, { bookingSnapshot: { project: { timeMode: 'hours' } } }),
    true
  )
})

test('ScheduleSummary shows times only with a positive hour-mode signal', () => {
  const schedule = {
    scheduledStartDate: '2026-11-05',
    scheduledStartTime: '14:00',
    scheduledEndTime: '16:00',
    scheduledExecutionEndDate: '2026-11-05',
  }
  // Day mode with a stale/recorded start time: dates only, no leak.
  const dayHtml = renderScheduleSummary(schedule, false)
  assert.match(dayHtml, /11\/5\/2026/)
  assert.doesNotMatch(dayHtml, /14:00/)
  assert.doesNotMatch(dayHtml, /16:00/)
  // Unknown mode (omitted flag): dates only, fail-safe.
  const unknownHtml = renderScheduleSummary(schedule, undefined)
  assert.doesNotMatch(unknownHtml, /14:00/)
  assert.doesNotMatch(unknownHtml, /16:00/)
  const nullHtml = renderScheduleSummary(schedule, null)
  assert.doesNotMatch(nullHtml, /14:00/)
  // Positive hour mode: start AND end time render.
  const hourHtml = renderScheduleSummary(schedule, true)
  assert.match(hourHtml, /14:00–16:00/)
  // Hour mode without times recorded: dates only, no crash.
  const dateless = renderScheduleSummary({ scheduledStartDate: '2026-11-05' }, true)
  assert.match(dateless, /2026/)
  // Empty schedule renders the not-recorded marker, never times.
  const empty = renderScheduleSummary(null, true)
  assert.doesNotMatch(empty, /14:00/)
})

test('booking info and timeline consume the recorded end time', () => {
  const overview = readSource('../components/booking/details/OverviewPanel.tsx')
  assert.match(overview, /scheduledEndTime/)
  assert.match(overview, /resolvePanelHourMode/)
  assert.match(overview, /formatScheduleTimeRange/)
  assert.match(overview, /scheduleTimeRange = hourMode/)
  // No stale-time fallback: day/unknown mode renders dates only.
  assert.doesNotMatch(overview, /recordedStartTime \? \(/)
  assert.doesNotMatch(overview, /: recordedStartTime/)

  const bookingData = readSource('../components/booking/details/BookingDataPanel.tsx')
  assert.match(bookingData, /scheduleSelection\.endTime/)
  assert.match(bookingData, /scheduledEndTime: scheduleSelection\.endTime/)
  assert.match(bookingData, /resolvePanelHourMode/)
  assert.doesNotMatch(bookingData, /recordedStartTime/)

  const primitives = readSource('../components/booking/details/DetailPrimitives.tsx')
  assert.match(primitives, /scheduledEndTime\?: string \| null/)
  assert.match(primitives, /hourMode === true/)
  assert.match(primitives, /hourMode\?: boolean \| null/)

  const quotation = readSource('../components/booking/details/QuotationPanel.tsx')
  assert.match(quotation, /scheduledEndTime: scheduleSelection\.endTime/)
  assert.match(quotation, /resolvePanelHourMode/)

  const activity = readSource('../components/booking/details/ActivityPanel.tsx')
  assert.match(activity, /item\.metadata\?\.schedule/)
  assert.match(activity, /activity\.schedule/)
  assert.match(activity, /scheduledEndTime/)
  assert.match(activity, /resolvePanelHourMode/)
  assert.match(activity, /hourMode=\{hourMode\}/)

  const rescheduleCard = readSource('../components/booking/RescheduleRequestCard.tsx')
  assert.match(rescheduleCard, /hourMode\?: boolean \| null/)
  assert.match(rescheduleCard, /hourMode=\{hourMode\}/)

  const page = readSource('../app/(pages)/bookings/[id]/page.tsx')
  assert.match(page, /resolvePanelHourMode\(booking, details\)/)
  assert.match(page, /hourMode=\{resolvePanelHourMode\(booking, details\)\}/)
})

// ── 19a: booking page saving uses the recorded quotation saving ──────
test('booking page prefers the recorded quotation saving amount', () => {
  const page = readSource('../app/(pages)/bookings/[id]/page.tsx')
  assert.match(page, /recordedQuotationSaving/)
  assert.match(page, /customerTotals\?\.discount\?\.totalDiscount/)
  assert.match(page, /quotationSavingAmount/)
  assert.doesNotMatch(page, /youSave", \{ amount: formatMoney\(currentVersionOriginalQuoteTotals\.total - currentVersionQuoteTotals\.total/)
})
