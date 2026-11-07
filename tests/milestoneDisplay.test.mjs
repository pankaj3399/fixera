import assert from 'node:assert/strict'
import test from 'node:test'
import { milestoneDisplayAmount } from '../lib/booking/milestoneDisplay.ts'

test('#9 paid milestones prefer the settled VAT-inclusive payment over estimates', () => {
  assert.equal(milestoneDisplayAmount({ index: 0, recorded: { customerChargeTotalWithVat: 133.1, expectedCustomerCharge: 110 }, preview: 133.1, fallback: 100 }), 133.1)
})
test('#9 a newly discounted checkout replaces the older display estimate', () => {
  assert.equal(milestoneDisplayAmount({ index: 1, recorded: { expectedCustomerCharge: 133.1 }, payment: { milestoneIndex: 1, totalWithVat: 121 }, preview: 133.1, fallback: 100 }), 121)
})
test('#9 a fully discounted milestone displays its recorded zero charge', () => {
  assert.equal(milestoneDisplayAmount({ index: 1, recorded: { customerChargeTotalWithVat: 0 }, preview: 133.1, fallback: 100 }), 0)
})
