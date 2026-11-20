import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
const { recordedQuotationPricing } = await import('../lib/booking/quotationPricing.ts')
const version = () => ({ version: 1, pricingLines: [{ price: 50, vatRate: 21 }, { price: 50, vatRate: 6 }],
  milestones: [{ amount: 40 }, { amount: 60 }], customerTotals: {
    commissionPercent: 10, amountBeforeDiscounts: 110, customerNetAmount: 99, vatAmount: 13.37, totalWithVat: 112.37,
    discount: { totalDiscount: 11, totalDiscountWithVat: 12.48 },
    vatBreakdown: [{ description: 'A', netAmount: 49.5, vatRate: 21, vatAmount: 10.4, totalAmount: 59.9 },
      { description: 'B', netAmount: 49.5, vatRate: 6, vatAmount: 2.97, totalAmount: 52.47 }] } })

test('quotation display uses the same recorded total and gross savings as the email', () => {
  const input = version()
  const original = structuredClone(input)
  const display = recordedQuotationPricing(input)
  assert.deepEqual(display.totals, { netAmount: 99, vatAmount: 13.37, total: 112.37 })
  assert.equal(display.saving, 12.48)
  assert.deepEqual(display.lines, input.customerTotals.vatBreakdown)
  assert.deepEqual(display.milestones, [44.95, 67.42])
  assert.equal(display.milestones.reduce((a, b) => a + b, 0), 112.37)
  assert.deepEqual(input, original)
})
test('older snapshots recover VAT-inclusive savings from immutable quote terms', () => {
  const input = version()
  delete input.customerTotals.discount.totalDiscountWithVat
  assert.equal(recordedQuotationPricing(input).saving, 12.48)
})
test('missing snapshots stay unknown while zero is a valid recorded amount', () => {
  assert.equal(recordedQuotationPricing(null), null)
  assert.equal(recordedQuotationPricing({ customerTotals: { customerNetAmount: 10 } }), null)
  assert.equal(recordedQuotationPricing({ customerTotals: { customerNetAmount: 0, vatAmount: 0, totalWithVat: 0 } }).totals.total, 0)
})

test('savings stay unknown if any immutable pricing line has incomplete or non-finite inputs', () => {
  for (const patch of [{ price: undefined }, { vatRate: undefined }, { price: NaN }, { vatRate: Infinity }]) {
    const input = version()
    delete input.customerTotals.discount.totalDiscountWithVat
    Object.assign(input.pricingLines[0], patch)
    assert.equal(recordedQuotationPricing(input).saving, null)
  }
})

test('FT3-19a: customers get the server milestone totals although the professional amounts are withheld', () => {
  // QT-2026-000004-v1: the customer payload carries no milestone `amount`.
  const input = { version: 1, milestones: [{ customerTotalWithVat: 3618.65 }, { customerTotalWithVat: 6031.1 }],
    customerTotals: { customerNetAmount: 7975, vatAmount: 1674.75, totalWithVat: 9649.75 } }
  assert.deepEqual(recordedQuotationPricing(input).milestones, [3618.65, 6031.1])
  // Without server totals and without amounts the old allocation gave 0 / everything.
  const withoutTotals = { ...input, milestones: [{}, {}] }
  assert.deepEqual(recordedQuotationPricing(withoutTotals).milestones, [0, 9649.75])
})
