export interface ExtraCostChargeSummary {
  paymentIntentClientSecret: string
  customerChargeAmount: number
  customerNetChargeAmount?: number
  vatAmount?: number
  subtotalInclCommission?: number
  loyaltyDiscountAmount?: number
  loyaltyLevel: string
  loyaltyPercentage: number
}

interface ExtraCostPayment {
  extraCostClientSecret?: string
  extraCostAmount?: number
  extraCostCustomerNetAmount?: number
  extraCostVatAmount?: number
  extraCostCustomerDiscount?: number
  extraCostLoyaltyTier?: string
  extraCostLoyaltyPercentage?: number
  vatRate?: number
  reverseCharge?: boolean
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Refresh saved fields even when the intent's gross amount has not changed. */
export function mergePersistedExtraCostCharge(
  previous: ExtraCostChargeSummary | null,
  payment?: ExtraCostPayment,
): ExtraCostChargeSummary | null {
  if (!payment?.extraCostClientSecret || typeof payment.extraCostAmount !== 'number') return null
  const matching = previous?.paymentIntentClientSecret === payment.extraCostClientSecret
    && previous.customerChargeAmount === payment.extraCostAmount ? previous : null
  const discount = payment.extraCostCustomerDiscount ?? matching?.loyaltyDiscountAmount
  const net = payment.extraCostCustomerNetAmount ?? matching?.customerNetChargeAmount
  return {
    paymentIntentClientSecret: payment.extraCostClientSecret,
    customerChargeAmount: payment.extraCostAmount,
    customerNetChargeAmount: net,
    vatAmount: payment.extraCostVatAmount ?? matching?.vatAmount,
    subtotalInclCommission: net != null && discount != null
      ? money(net + discount) : matching?.subtotalInclCommission,
    loyaltyDiscountAmount: discount,
    loyaltyLevel: payment.extraCostLoyaltyTier ?? matching?.loyaltyLevel ?? '',
    loyaltyPercentage: payment.extraCostLoyaltyPercentage ?? matching?.loyaltyPercentage ?? 0,
  }
}

/** Use charged amounts when available, otherwise estimate VAT on the discounted net. */
export function getExtraCostAmounts(
  summary: ExtraCostChargeSummary | null,
  payment: ExtraCostPayment | undefined,
  estimatedNet: number,
) {
  const rate = payment?.reverseCharge ? 0 : Math.max(0, payment?.vatRate ?? 0)
  const gross = summary?.customerChargeAmount ?? payment?.extraCostAmount
  const savedNet = summary?.customerNetChargeAmount ?? payment?.extraCostCustomerNetAmount
  const savedVat = summary?.vatAmount ?? payment?.extraCostVatAmount
  const net = savedNet ?? (gross != null
    ? savedVat != null ? money(gross - savedVat) : money(gross / (1 + rate / 100))
    : estimatedNet)
  const vat = savedVat ?? (gross != null ? money(gross - net) : money(net * rate / 100))
  return { net, vat, total: gross ?? money(net + vat), vatRate: rate }
}
