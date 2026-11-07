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
