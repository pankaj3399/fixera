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
  const render = ready => new Function('require', 'currentVersion', 'quotePricingReady', 'customerPricingReady', 'currentVersionMilestoneGrossAmounts', 'formatMoney', `const exports = {}; ${code}; return preview();`)(
    require, { milestones: [{ title: 'First' }], currency: 'EUR' }, ready, false, [133.1], amount => `EUR ${amount}`,
  )
  const { renderToStaticMarkup } = require('react-dom/server')
  assert.match(renderToStaticMarkup(render(true)), /EUR 133.1/)
  assert.match(renderToStaticMarkup(render(false)), /\.\.\./)
})

