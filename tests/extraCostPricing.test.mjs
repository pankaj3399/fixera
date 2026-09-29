import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getExtraCostAmounts, mergePersistedExtraCostCharge } from '../lib/extraCostPricing.ts'

test('initial summary includes booking VAT on the discounted extra cost', () => {
  assert.deepEqual(getExtraCostAmounts(null, { vatRate: 21 }, 21.90), {
    net: 21.90, vat: 4.60, total: 26.50, vatRate: 21,
  })
  assert.equal(getExtraCostAmounts(null, { vatRate: 6 }, 21.90).total, 23.21)
  assert.equal(getExtraCostAmounts(null, { vatRate: 21, reverseCharge: true }, 21.90).total, 21.90)
})

test('refresh repairs an incomplete first-create response despite matching secret and total', () => {
  const response = {
    paymentIntentClientSecret: 'pi_secret', customerChargeAmount: 26.50,
    customerNetChargeAmount: 26.50, vatAmount: 0, subtotalInclCommission: 22.35,
    loyaltyDiscountAmount: 0.45, loyaltyLevel: 'Gold', loyaltyPercentage: 2,
  }
  const payment = {
    extraCostClientSecret: 'pi_secret', extraCostAmount: 26.50,
    extraCostCustomerNetAmount: 21.90, extraCostVatAmount: 4.60,
    extraCostCustomerDiscount: 0.45, vatRate: 21,
  }
  const refreshed = mergePersistedExtraCostCharge(response, payment)
  assert.deepEqual(getExtraCostAmounts(refreshed, payment, 99), {
    net: 21.90, vat: 4.60, total: 26.50, vatRate: 21,
  })
  assert.equal(refreshed.subtotalInclCommission, 22.35)
  assert.equal(refreshed.loyaltyPercentage, 2)
})

test('legacy gross-only response derives VAT without changing the amount charged', () => {
  const response = {
    paymentIntentClientSecret: 'pi_secret', customerChargeAmount: 26.50,
    loyaltyLevel: '', loyaltyPercentage: 0,
  }
  assert.deepEqual(getExtraCostAmounts(response, { vatRate: 21 }, 99), {
    net: 21.90, vat: 4.60, total: 26.50, vatRate: 21,
  })
})

test('reload uses saved terms and a replaced intent drops the previous breakdown', () => {
  const saved = {
    extraCostClientSecret: 'new_secret', extraCostAmount: 12.10,
    extraCostCustomerNetAmount: 10, extraCostVatAmount: 2.10,
    extraCostCustomerDiscount: 0, extraCostLoyaltyTier: 'Bronze', extraCostLoyaltyPercentage: 0,
  }
  const previous = {
    paymentIntentClientSecret: 'old_secret', customerChargeAmount: 26.50,
    customerNetChargeAmount: 21.90, vatAmount: 4.60, subtotalInclCommission: 22.35,
    loyaltyLevel: 'Gold', loyaltyPercentage: 2,
  }
  assert.deepEqual(mergePersistedExtraCostCharge(previous, saved), mergePersistedExtraCostCharge(null, saved))
  assert.equal(mergePersistedExtraCostCharge(previous, undefined), null)
})
