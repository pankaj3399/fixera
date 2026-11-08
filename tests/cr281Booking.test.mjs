import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { transformSync } from '@swc/core'
const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../app/(pages)/bookings/[id]/page.tsx', import.meta.url), 'utf8')
function fragment(start, end, bindings, result) {
  const body = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
  assert.ok(body.length > 0)
  const code = transformSync(`function run() { ${body}; return ${result}; }`, {
    jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  }).code
  return new Function('require', ...Object.keys(bindings), `${code}; return run();`)(require, ...Object.values(bindings))
}
const planCharges = plan => fragment('const recordedMilestoneCharges =', 'const milestoneIncludesOptions =', {
  useMemo: fn => fn(), booking: { milestonePayments: plan }, details: { payments: { milestones: plan } },
}, 'recordedMilestoneCharges')
test('booking plan prefers settled charges only for paid milestones, including zero', () => {
  assert.deepEqual(planCharges([
    { status: 'paid', customerChargeTotalWithVat: 133.1, expectedCustomerCharge: 110 },
    { status: 'paid', customerChargeTotalWithVat: 0, expectedCustomerCharge: 110 },
    { status: 'pending', customerChargeTotalWithVat: 133.1, expectedCustomerCharge: 110 },
    { status: 'paid', expectedCustomerCharge: 110 },
    { status: 'paid', customerChargeTotalWithVat: NaN },
  ]), [133.1, 0, 110, 110, null])
})

import { milestoneDisplayAmount } from '../lib/booking/milestoneDisplay.ts'
test('tracker shows recorded charges without live pricing and never calculates prematurely', () => {
  const resolve = (ready, recorded, preview = [999]) => fragment('const getBookingMilestoneDisplayAmount =', 'const milestoneIncludesOptions =', {
    milestoneDisplayAmount, recordedMilestoneCharges: recorded, bookingMilestoneGrossAmounts: preview,
    customerPricingReady: ready, customerPrice: amount => { assert.equal(ready, true); return amount * 1.21 },
  }, 'getBookingMilestoneDisplayAmount(0, 100)')
  assert.equal(resolve(false, [133.1]), 133.1)
  assert.equal(resolve(false, [0]), 0)
  assert.equal(resolve(false, [null]), null)
  assert.equal(resolve(true, [null]), 999)
  assert.equal(resolve(true, [null], []), 121)
})
test('payment schedule resolves settled and expected charges while live pricing is unavailable', () => {
  const paymentSource = readFileSync(new URL('../app/bookings/[id]/payment/page.tsx', import.meta.url), 'utf8')
  const body = paymentSource.slice(paymentSource.indexOf('const getMilestoneDisplayAmount ='), paymentSource.indexOf('const getQuotedDurations ='))
  const code = transformSync(`${body}; getMilestoneDisplayAmount`, { jsc: { parser: { syntax: 'typescript' } } }).code
  const resolve = recorded => new Function('useCallback', 'milestoneDisplayAmount', 'recordedMilestonePlan', 'booking', 'milestoneGrossAmounts', 'customerPricingReady', 'customerPrice', `${code}; return getMilestoneDisplayAmount(0,100)`)(
    fn => fn, milestoneDisplayAmount, [recorded], {}, [999], false, () => { throw new Error('live calculation unavailable') },
  )
  assert.equal(resolve({ customerChargeTotalWithVat: 133.1 }), 133.1)
  assert.equal(resolve({ expectedCustomerCharge: 0 }), 0)
  assert.equal(resolve({}), null)
})

test('quotation milestone preview renders immutable totals before live pricing loads', () => {
  const start = source.indexOf('{currentVersion.milestones.map((ms, i) => (')
  const jsx = source.slice(start, source.indexOf('))}', start) + 3)
  const code = transformSync(`function preview() { return <div>${jsx}</div> }`, {
    jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  }).code
  const render = (ready, amounts = [133.1]) => new Function('require', 'currentVersion', 'quotePricingReady', 'customerPricingReady', 'currentVersionMilestoneGrossAmounts', 'formatMoney', `const exports = {}; ${code}; return preview();`)(
    require, { milestones: [{ title: 'First' }], currency: 'EUR' }, ready, false, amounts, amount => `EUR ${amount}`,
  )
  const { renderToStaticMarkup } = require('react-dom/server')
  assert.match(renderToStaticMarkup(render(true)), /EUR 133.1/)
  assert.match(renderToStaticMarkup(render(false)), /\.\.\./)
  assert.match(renderToStaticMarkup(render(true, [])), /\.\.\./)
  assert.doesNotMatch(renderToStaticMarkup(render(true, [])), /EUR 0/)
  assert.match(renderToStaticMarkup(render(true, [0])), /EUR 0/)
})

test('proposal decline enforces the trimmed 3–1000-character range before sending', async () => {
  const calls = [], errors = [], loading = []
  const submit = fragment('const handleRespondToWarrantyProposal =', 'const handleMarkWarrantyResolved =', {
    warrantyClaim: { _id: 'claim' }, t: key => key, setProposalDeclineError: error => errors.push(error),
    setWarrantyActionLoading: value => loading.push(value), callWarrantyAction: async (...args) => { calls.push(args); return {} },
    setWarrantyClaim() {}, setShowProposalDeclineDialog() {}, setProposalDeclineClarification() {}, toast: { success() {}, error() {} }, getErrorText() {},
  }, 'handleRespondToWarrantyProposal')
  await submit('decline', ` ${'x'.repeat(1001)} `)
  await submit('decline', ' ab ')
  assert.deepEqual(errors, ['warranty.clarificationTooLong', 'warranty.clarificationRequired'])
  assert.deepEqual(calls, [])
  assert.deepEqual(loading, [])
  await submit('decline', ` ${'x'.repeat(1000)} `)
  assert.equal(calls[0][1].clarification.length, 1000)
  assert.equal(calls[0][0], 'claim/proposal-response')
  await submit('accept')
  assert.deepEqual(calls[1][1], { action: 'accept' })
})

test('unknown customer charges retain booking progress without treating unknown milestones as zero', () => {
  const progress = charges => fragment("const isCustomerView = user?.role === 'customer'", 'const amountLabel =', {
    user: { role: 'customer' }, booking: { milestonePayments: [{ amount: 100, status: 'paid', workStatus: 'completed' }, { amount: 100, status: 'pending' }] },
    getBookingMilestoneDisplayAmount: index => charges[index],
  }, '({ paymentPct, workPct, showAmounts })')
  assert.deepEqual(progress([null, null]), { paymentPct: 50, workPct: 50, showAmounts: false })
  assert.deepEqual(progress([133.1, null]), { paymentPct: 50, workPct: 50, showAmounts: false })
  assert.deepEqual(progress([133.1, 133.1]), { paymentPct: 50, workPct: 50, showAmounts: true })
})

test('completion subtotal preserves customer amounts without printing the platform percentage in EN/NL/FR', () => {
  const start = source.indexOf('{customerPricingReady && rawTotal !== 0 && (')
  const jsx = source.slice(start, source.indexOf('{showLoyalty &&', start))
  const code = transformSync(`function subtotal() { return <div>${jsx}</div> }`, {
    jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  }).code
  const { renderToStaticMarkup } = require('react-dom/server')
  for (const locale of ['en', 'nl', 'fr']) {
    const labels = JSON.parse(readFileSync(new URL(`../messages/${locale}/bookings.json`, import.meta.url)))
    const tree = new Function('require', 't', 'customerPricingReady', 'rawTotal', 'subtotalInclCommission', 'formatMoney', 'currency',
      `const exports = {}; ${code}; return subtotal();`)(require, key => key.split('.').reduce((v, k) => v[k], labels), true, 100, 117.43, amount => `EUR ${amount}`, 'EUR')
    const html = renderToStaticMarkup(tree)
    assert.match(html, /EUR 117\.43/)
    assert.doesNotMatch(html, /17\.4321|percent|%/)
  }
})

for (const code of ['TEAM_CONFLICT', 'RESCHEDULE_DISPUTED']) test(`booking reschedule acceptance handles 409 ${code} by its code`, async () => {
  const errors = [], refreshes = []
  const submit = fragment('const handleRespondReschedule =', 'const openDisputeModal =', {
    bookingId: 'b1', setRespondingReschedule() {}, getAuthToken: () => null,
    fetch: async () => ({ status: 409, ok: false, json: async () => ({ error: { code } }) }),
    toast: { error: value => errors.push(value) }, t: key => key,
    getErrorText: result => result.error.code, setShowRescheduleRefundModal() {}, setRescheduleRefundNote() {},
    refreshBooking: async () => refreshes.push(true),
  }, 'handleRespondReschedule')
  await submit('accept')
  assert.deepEqual(errors, [code === 'RESCHEDULE_DISPUTED' ? 'rescheduleRequest.toasts.disputed' : 'TEAM_CONFLICT'])
  assert.equal(refreshes.length, code === 'RESCHEDULE_DISPUTED' ? 1 : 0)
})

import { hooks, loadComponent, findAll, textOf, common, settle } from './reviewComponentHarness.mjs'
for (const code of ['TEAM_CONFLICT', 'RESCHEDULE_DISPUTED']) test(`reschedule card handles 409 ${code} by its code`, async () => {
  const state = hooks(), errors = [], resolved = []
  const t = key => key; t.has = () => false
  const Card = loadComponent('../components/booking/RescheduleRequestCard.tsx', {
    ...common, react: state.api, 'next-intl': { useTranslations: () => t },
    '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en' }) },
    '@/lib/i18n/useErrorMessage': { useErrorMessage: () => result => result.error.code },
    '@/lib/utils': { authFetch: async () => ({ status: 409, ok: false, json: async () => ({ error: { code } }) }) },
    '@/components/booking/details/DetailPrimitives': { ScheduleSummary: () => null },
    '@/lib/bookingDetails': { formatInstant: () => null },
    sonner: { toast: { error: value => errors.push(value) } },
  })
  try {
    const tree = state.render(() => Card({ bookingId: 'b1', viewerUserId: 'customer', viewerRole: 'customer',
      reschedules: [{ id: 'request', status: 'pending', canRespond: true, requestedBy: { id: 'pro' } }], onResolved: () => resolved.push(true) }))
    findAll(tree, node => typeof node.props.onClick === 'function' && textOf(node) === 'common.accept')[0].props.onClick()
    await settle()
    assert.deepEqual(errors, [code === 'RESCHEDULE_DISPUTED' ? 'rescheduleRequest.toasts.disputed' : 'TEAM_CONFLICT'])
    assert.equal(resolved.length, code === 'RESCHEDULE_DISPUTED' ? 1 : 0)
  } finally { state.unmount() }
})
