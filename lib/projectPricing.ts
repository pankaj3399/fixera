export interface RepeatBuyerDiscountConfig {
  enabled?: boolean
  percentage?: number
  maxDiscountAmount?: number | null
}

interface ComputeCustomerPriceWithRepeatBuyerDiscountParams {
  amount?: number | null
  customerPrice: (amount: number) => number
  eligible?: boolean
  repeatBuyerDiscount?: RepeatBuyerDiscountConfig | null
}

interface CustomerPriceWithRepeatBuyerDiscountResult {
  customerAmount: number | null
  discountedAmount: number | null
}

const toFiniteAmount = (value?: number | null): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export const computeCustomerPriceWithRepeatBuyerDiscount = ({
  amount,
  customerPrice,
  eligible,
  repeatBuyerDiscount,
}: ComputeCustomerPriceWithRepeatBuyerDiscountParams): CustomerPriceWithRepeatBuyerDiscountResult => {
  const validatedAmount = toFiniteAmount(amount)
  if (validatedAmount == null) {
    return { customerAmount: null, discountedAmount: null }
  }

  const customerAmount = toFiniteAmount(customerPrice(validatedAmount))
  if (customerAmount == null) {
    return { customerAmount: null, discountedAmount: null }
  }

  const discountPercentage = toFiniteAmount(repeatBuyerDiscount?.percentage)
  if (
    !eligible ||
    !repeatBuyerDiscount?.enabled ||
    discountPercentage == null ||
    discountPercentage <= 0
  ) {
    return { customerAmount, discountedAmount: null }
  }

  let discountAmount = +(customerAmount * (discountPercentage / 100)).toFixed(2)
  const maxDiscountAmount = toFiniteAmount(repeatBuyerDiscount.maxDiscountAmount)
  if (maxDiscountAmount != null) {
    discountAmount = Math.min(discountAmount, maxDiscountAmount)
  }

  return {
    customerAmount,
    discountedAmount: +Math.max(0, customerAmount - discountAmount).toFixed(2),
  }
}
