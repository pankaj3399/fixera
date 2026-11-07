import type { QuotationVersionDto } from '@/types/bookingDetails'

const money = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Quote-time facts are shared by the quotation email and booking display.
 * Checkout discounts, points and settlement remain separate payment facts. */
export function recordedQuotationPricing(version: QuotationVersionDto | null | undefined) {
  const totals = version?.customerTotals
  if (!totals || !finite(totals.customerNetAmount) || !finite(totals.vatAmount)
    || !finite(totals.totalWithVat)) return null
  let saving = totals.discount?.totalDiscountWithVat
  // Older snapshots did not persist gross savings. Recover the original VAT
  // from that immutable version's lines and recorded commission, never from
  // the customer's current tier or live platform settings.
  if (!finite(saving) && finite(totals.amountBeforeDiscounts) && finite(totals.commissionPercent)
    && version.pricingLines?.length
    && version.pricingLines.every((line) => finite(line.price) && finite(line.vatRate))) {
    const lines = version.pricingLines.flatMap((line) => finite(line.price) && finite(line.vatRate)
      ? [{ net: money(line.price * (1 + totals.commissionPercent! / 100)), rate: line.vatRate }] : [])
    const last = lines[lines.length - 1]
    if (last) {
      last.net = money(last.net + totals.amountBeforeDiscounts - lines.reduce((sum, line) => sum + line.net, 0))
      const vat = lines.reduce((sum, line) => sum + money(line.net * line.rate / 100), 0)
      saving = money(totals.amountBeforeDiscounts + vat - totals.totalWithVat)
    }
  }
  const weights = version.milestones || []
  const weightTotal = weights.reduce((sum, milestone) => sum + Math.max(0, milestone.amount || 0), 0)
  let allocated = 0
  const milestones = weights.map((milestone, index) => {
    const share = index === weights.length - 1 ? money(totals.totalWithVat! - allocated)
      : weightTotal > 0 ? money(totals.totalWithVat! * Math.max(0, milestone.amount || 0) / weightTotal) : 0
    allocated = money(allocated + share)
    return share
  })
  return {
    totals: { netAmount: totals.customerNetAmount, vatAmount: totals.vatAmount, total: totals.totalWithVat },
    saving: finite(saving) ? saving : null,
    lines: totals.vatBreakdown || null,
    milestones,
  }
}
