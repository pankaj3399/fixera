/**
 * Mirrors fixera-server src/utils/customerPricing.ts: unit-priced work is
 * charged as quantity x the customer's unit price in whole cents (30 x 16.43
 * = 492.90), so the total shown here is the one the server charges.
 */

/** Half away from zero, like Odoo, so -2.5 x 16.43 is -41.08 everywhere. */
const roundLineAmount = (value: number): number =>
  Math.sign(value) * Math.round(Math.abs(value) * 100 * (1 + 4 * Number.EPSILON)) / 100

// Same rounding as the invoice lines, so the price shown here is the one the
// server charges: a half-cent tie like 10.075 rounds to 10.08, not 10.07.
const roundMoney = (value: number): number => {
  const rounded = roundLineAmount(value)
  return rounded === 0 ? 0 : rounded
}

const toFinite = (value: unknown): number | undefined => {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export type UnitPricing = { pricingType?: string; unitAmount?: number; quantity?: number }

export const withCommission = (amount: number, commissionPercent: number): number =>
  roundMoney(amount * (1 + Math.max(0, commissionPercent) / 100))

export const withCommissionPerUnit = (unitPrice: number, quantity: number, commissionPercent: number): number =>
  roundLineAmount(withCommission(unitPrice, commissionPercent) * quantity)

/**
 * Commission-inclusive amount; when it contains a unit-priced package, that
 * package is priced per unit and the rest (options) as a whole.
 */
export const commissionedAmount = (
  amount: number,
  commissionPercent: number,
  unitPricing?: UnitPricing | null,
): number => {
  const unitPrice = toFinite(unitPricing?.unitAmount)
  const quantity = toFinite(unitPricing?.quantity)
  if (unitPricing?.pricingType === 'unit' && unitPrice != null && unitPrice >= 0 && quantity != null && quantity > 0) {
    const rest = roundMoney(amount - roundMoney(unitPrice * quantity))
    if (rest >= 0) {
      return roundMoney(withCommissionPerUnit(unitPrice, quantity, commissionPercent)
        + (rest > 0 ? withCommission(rest, commissionPercent) : 0))
    }
  }
  return withCommission(amount, commissionPercent)
}

type ExtraCostLike = { type?: string; amount?: number; unitPrice?: number; actualUnits?: number; estimatedUnits?: number }

const extraCostQuantity = (cost: ExtraCostLike): number | undefined => {
  const actual = toFinite(cost.actualUnits)
  if (actual == null) return undefined
  const estimated = toFinite(cost.estimatedUnits)
  if (cost.type === 'unit_adjustment' && estimated != null) {
    const difference = Math.round((actual - estimated) * 1e6) / 1e6
    return difference !== 0 ? difference : undefined
  }
  return actual
}

/** Customer price of one extra cost, before any customer discount. */
export const commissionedExtraCost = (cost: ExtraCostLike, commissionPercent: number): number => {
  const amount = toFinite(cost.amount) ?? 0
  const quantity = extraCostQuantity(cost)
  const unitPrice = toFinite(cost.unitPrice)
  if (quantity != null && unitPrice != null && Math.abs(roundMoney(quantity * unitPrice) - amount) < 0.005) {
    return withCommissionPerUnit(unitPrice, quantity, commissionPercent)
  }
  return withCommission(amount, commissionPercent)
}

/** Customer price of all extra costs; a total set without lines (dispute) is priced whole. */
export const commissionedExtraCostTotal = (
  extraCosts: ExtraCostLike[] | undefined,
  extraCostTotal: number,
  commissionPercent: number,
): number => {
  const costs = Array.isArray(extraCosts) ? extraCosts : []
  const linesTotal = roundMoney(costs.reduce((sum, cost) => sum + (toFinite(cost.amount) ?? 0), 0))
  if (costs.length === 0 || Math.abs(linesTotal - roundMoney(extraCostTotal)) >= 0.005) {
    return withCommission(extraCostTotal, commissionPercent)
  }
  return roundMoney(costs.reduce((sum, cost) => sum + commissionedExtraCost(cost, commissionPercent), 0))
}

/**
 * Customer total of a package from its server-provided customer amount: a fixed
 * package is charged once; a unit package is charged as quantity x the customer
 * unit price in whole cents (the server's withCommissionPerUnit).
 */
export const customerPackageTotal = (
  customerAmount: number,
  pricingType: string | undefined,
  quantity = 1,
): number => (pricingType === 'unit' ? roundMoney(customerAmount * quantity) : customerAmount)
