import type { QuotationMilestone, QuotationPricingLine } from '@/types/quotation'

export interface VatPricingTotals {
  netAmount: number
  vatAmount: number
  total: number
}

export interface VatQuoteVersionLike {
  scope?: string
  description?: string
  totalAmount?: number
  pricingLines?: Array<Pick<QuotationPricingLine, 'description' | 'price' | 'vatRate'>>
  milestones?: Array<Pick<QuotationMilestone, 'amount'>>
}

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

const allocateRoundedAmounts = (amounts: number[], targetTotal: number): number[] => {
  if (!Number.isFinite(targetTotal) || amounts.some(amount => !Number.isFinite(amount))) return amounts.map(() => NaN)
  const sourceTotal = amounts.reduce((sum, amount) => sum + amount, 0)
  if (!(sourceTotal > 0) || !(targetTotal > 0)) {
    return amounts.map(() => 0)
  }

  let allocated = 0
  return amounts.map((amount, index) => {
    if (index === amounts.length - 1) {
      return roundMoney(targetTotal - allocated)
    }
    const share = roundMoney((amount / sourceTotal) * targetTotal)
    allocated = roundMoney(allocated + share)
    return share
  })
}

export const calculateVatTotalsFromPricingLines = (
  lines: Array<Pick<QuotationPricingLine, 'price' | 'vatRate'>>,
  mapNetAmount?: (netAmount: number) => number
): VatPricingTotals => {
  const validLines = lines.filter((line) => {
    const price = Number(line.price)
    const vatRate = Number(line.vatRate)
    return Number.isFinite(price) && price > 0 && Number.isFinite(vatRate) && vatRate >= 0 && vatRate <= 100
  })

  if (validLines.length === 0) {
    return { netAmount: 0, vatAmount: 0, total: 0 }
  }

  let netAmount = 0
  let vatAmount = 0

  for (const line of validLines) {
    const rawNet = Number(line.price)
    const lineNet = mapNetAmount ? mapNetAmount(rawNet) : rawNet
    const lineVat = (lineNet * Number(line.vatRate)) / 100
    netAmount += lineNet
    vatAmount += lineVat
  }

  netAmount = roundMoney(netAmount)
  vatAmount = roundMoney(vatAmount)

  return {
    netAmount,
    vatAmount,
    total: roundMoney(netAmount + vatAmount),
  }
}

/** Legacy quotes without granular pricingLines use a single synthetic line at 0% VAT. */
export const getQuoteVersionPricingLines = (
  version: VatQuoteVersionLike | null | undefined
): Array<Pick<QuotationPricingLine, 'description' | 'price' | 'vatRate'>> => {
  if (!version) return []
  if (version.pricingLines?.length) {
    return version.pricingLines
  }
  // Backward compatibility: pre-line-item quotes only expose totalAmount.
  return [{
    description: version.description || version.scope || 'Quote',
    price: version.totalAmount || 0,
    vatRate: 0,
  }]
}

export const calculateQuoteVersionVatTotals = (
  version: VatQuoteVersionLike | null | undefined,
  mapNetAmount?: (netAmount: number) => number
): VatPricingTotals => calculateVatTotalsFromPricingLines(
  getQuoteVersionPricingLines(version),
  mapNetAmount
)

export const calculateMilestoneGrossAmounts = (
  version: VatQuoteVersionLike | null | undefined,
  mapNetAmount?: (netAmount: number) => number
): number[] => {
  const milestones = version?.milestones || []
  if (milestones.length === 0) return []

  const milestoneNetAmounts = milestones.map((milestone) => {
    const netAmount = Number(milestone.amount) || 0
    return mapNetAmount ? mapNetAmount(netAmount) : netAmount
  })
  const quoteTotals = calculateQuoteVersionVatTotals(version, mapNetAmount)

  return allocateRoundedAmounts(milestoneNetAmounts, quoteTotals.total)
}
