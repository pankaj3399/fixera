import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
const { isCheckoutSnapshotLine, isCheckoutSnapshotQuote } = await import('../lib/booking/checkoutQuote.ts')

test('C11-1: the auto-generated checkout quote of a direct booking is recognised', () => {
  assert.equal(isCheckoutSnapshotLine({ item: 'checkout_snapshot:selected_package_index:0' }), true)
  assert.equal(isCheckoutSnapshotLine({ item: 'Package Base' }), false)
  assert.equal(isCheckoutSnapshotQuote({ breakdown: [{ item: 'Package Base' }, { item: 'checkout_snapshot:computed_total' }] }), true)
  assert.equal(isCheckoutSnapshotQuote({ breakdown: [{ item: 'Work' }] }), false)
  assert.equal(isCheckoutSnapshotQuote(null), false)
})

test('C11-1: customers see their own prices in the charge composition', () => {
  const panel = readFileSync(new URL('../components/booking/details/PaymentsPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /viewerRole === "customer" \? checkout\?\.customerPrices/)
  assert.match(panel, /customerPrices\?\.unitPrice \?\? checkout\?\.unitAmount/)
  const quotation = readFileSync(new URL('../components/booking/details/QuotationPanel.tsx', import.meta.url), 'utf8')
  assert.match(quotation, /!isCheckoutSnapshotQuote\(booking\.quote\)/)
})
