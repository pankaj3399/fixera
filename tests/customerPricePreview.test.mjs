import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { register } from 'node:module'
register('./swc-loader.mjs', import.meta.url)
import { settle } from './reviewComponentHarness.mjs'
const { createCustomerPriceCache } = await import('@/lib/customerPricePreview')
const { packageRequiresCustomerPrice, customerPriceGateOpen } = await import('@/lib/projectPricing')
const { customerPackageTotal } = await import('@/lib/customerPricing')

const ref = (subprojectIndex, extra = {}) => ({ projectId: 'project-1', subprojectIndex, ...extra })

test('customer previews are entity-keyed, batch and deduplicate, and read NaN until loaded', async () => {
  const batches = []
  const cache = createCustomerPriceCache(async requests => { batches.push(requests); return requests.map(r => 100 + r.subprojectIndex) })
  assert.ok(Number.isNaN(cache.read(ref(0))))
  assert.ok(Number.isNaN(cache.read(ref(0))))
  cache.read(ref(1, { estimatedUsage: 5, selectedExtraOptions: [2, 0] }))
  await settle()
  assert.equal(batches.length, 1)
  assert.deepEqual(batches[0], [ref(0), ref(1, { estimatedUsage: 5, selectedExtraOptions: [2, 0] })])
  assert.equal(cache.read(ref(0)), 100)
  assert.equal(cache.read(ref(1, { estimatedUsage: 5, selectedExtraOptions: [0, 2] })), 101, 'option order does not change the key')
  assert.equal(cache.ready(), true)
})

test('an invalid package reference never requests a price', async () => {
  const calls = []
  const cache = createCustomerPriceCache(async requests => { calls.push(requests); return requests.map(() => 1) })
  assert.ok(Number.isNaN(cache.read({ projectId: '', subprojectIndex: 0 })))
  assert.ok(Number.isNaN(cache.read(ref(1.5))))
  await settle()
  assert.equal(calls.length, 0)
})

test('a failed lookup reads NaN and is retried by invalidation, not silently priced', async () => {
  let attempts = 0
  const cache = createCustomerPriceCache(async requests => {
    attempts++
    if (attempts === 1) throw new Error('down')
    return requests.map(() => 42)
  })
  cache.read(ref(0))
  await settle()
  assert.ok(Number.isNaN(cache.read(ref(0))))
  assert.ok(cache.error())
  cache.invalidate()
  cache.read(ref(0))
  await settle()
  assert.equal(cache.read(ref(0)), 42)
  assert.equal(cache.error(), null)
})

test('an unavailable price remains unknown through VAT and milestone allocation', async () => {
  const { calculateQuoteVersionVatTotals, calculateMilestoneGrossAmounts } = await import('@/lib/vatPricing')
  const version = { pricingLines: [{ price: 100, vatRate: 21 }], milestones: [{ amount: 50 }, { amount: 50 }] }
  const unavailable = () => NaN
  assert.ok(Number.isNaN(calculateQuoteVersionVatTotals(version, unavailable).total))
  assert.ok(calculateMilestoneGrossAmounts(version, unavailable).every(Number.isNaN))
})


test('a fixed or unit package needs a server price; an RFQ does not', () => {
  assert.equal(packageRequiresCustomerPrice('fixed'), true)
  assert.equal(packageRequiresCustomerPrice('unit'), true)
  assert.equal(packageRequiresCustomerPrice('rfq'), false)
  assert.equal(packageRequiresCustomerPrice(undefined), false)
})

test('each finite-value guard closes the gate on its own (readiness and the amount)', () => {
  const fixed = { requiresPrice: true }
  // Guard 1: pricing not ready, even though an amount is present.
  assert.equal(customerPriceGateOpen({ ...fixed, pricingReady: false, customerAmount: 117 }), false)
  // Guard 2: pricing ready, but the customer amount is unknown or non-finite.
  assert.equal(customerPriceGateOpen({ ...fixed, pricingReady: true, customerAmount: undefined }), false)
  assert.equal(customerPriceGateOpen({ ...fixed, pricingReady: true, customerAmount: Number.NaN }), false)
  assert.equal(customerPriceGateOpen({ ...fixed, pricingReady: true, customerAmount: null }), false)
  // Both satisfied: open.
  assert.equal(customerPriceGateOpen({ ...fixed, pricingReady: true, customerAmount: 117 }), true)
  assert.equal(customerPriceGateOpen({ ...fixed, pricingReady: true, customerAmount: 0 }), true)
})

test('RFQ submissions stay open while server pricing is unavailable', () => {
  assert.equal(customerPriceGateOpen({ requiresPrice: false, pricingReady: false, customerAmount: NaN }), true)
})

test('a unit package total is charged as quantity x the customer unit price in cents', () => {
  assert.equal(customerPackageTotal(16.43, 'unit', 30), 492.9)
  assert.equal(customerPackageTotal(117, 'fixed', 1), 117)
})

const source = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')

test('the booking form submit handler and the pay button share one finite-price gate', () => {
  const form = source('../components/project/ProjectBookingForm.tsx')
  const handler = form.slice(form.indexOf('const handleSubmit = async'), form.indexOf('const handleSubmit = async') + 1200)
  // Guard A: the handler stops a fixed or unit package until the server price is ready and finite.
  assert.match(handler, /if \(!priceGateOpen\) \{/)
  // Guard B: the pay button is disabled by the same gate, so a NaN total never looks payable.
  assert.match(form, /disabled=\{[^}]*\|\| !priceGateOpen\}/)
  // The gate reads readiness and the customer amount, and only prices that need one (RFQs stay open).
  assert.match(form, /const priceGateOpen = customerPriceGateOpen\(\{\s*requiresPrice: priceRequired,\s*pricingReady: customerPricingReady,\s*customerAmount: totalPricing\.customerAmount,\s*\}\)/)
  assert.match(form, /const priceRequired = packageRequiresCustomerPrice\(selectedPackage\?\.pricing\.type\)/)
})

test('a failed price preview shows its error and a retry beside the pay button', () => {
  const form = source('../components/project/ProjectBookingForm.tsx')
  assert.match(form, /\{priceRequired && pricingError \? \(/)
  assert.match(form, /<Button variant='outline' onClick=\{retryPricing\}>\{t\('retryPricing'\)\}<\/Button>/)
})

test('the booking page renders the payment form and extra-cost amounts only when they are finite', () => {
  const page = source('../app/(pages)/bookings/[id]/page.tsx')
  assert.match(page, /\(customerPricingReady && Number\.isFinite\(extraCostAmounts\.total\)\)/)
  assert.match(page, /const hasDisplayAmount = Number\.isFinite\(displayAmount\)/)
})

test('the online retry listener is registered once, by the shared cache, not by each consumer', () => {
  const cache = source('../lib/customerPricePreview.ts')
  const commission = source('../hooks/useCommissionRate.ts')
  assert.equal((cache.match(/addEventListener\('online'/g) ?? []).length, 1)
  assert.doesNotMatch(commission, /addEventListener\('online'/)
})

