import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getAuthToken } from '@/lib/utils'
import type { PackagePriceRef } from '@/lib/customerPricePreview'
import { useCommissionRate } from './useCommissionRate'
import { cachedClientRequest } from '@/lib/clientRequestCache'

interface LoyaltyDiscountInfo {
  level: string
  percentage: number
  maxDiscountAmount: number | null
}

interface LoyaltyStatusResponse {
  success?: boolean
  msg?: string
  error?: string
  data?: {
    userStats?: {
      tierInfo?: {
        name?: string
        discountPercentage?: number
        maxDiscountAmount?: number | null
      }
    }
    loyaltyStatus?: { level?: string }
  }
}

export interface CustomerPricing {
  pricingReady: boolean
  pricingError: Error | null
  retryPricing: () => void
  loyalty: LoyaltyDiscountInfo | null
  loyaltyLoaded: boolean
  /** Customer total for a stored package, from the server. NaN while loading or unavailable. */
  customerPackagePrice: (ref: PackagePriceRef) => number
  /** Loyalty discount applied to a customer-side amount (already commission-inclusive, from the server). */
  customerPrice: (customerAmount: number) => number
  /** The customer-side amount before any personal discount (the strike-through reference). */
  originalPrice: (customerAmount: number) => number
  withLoyaltyDiscount: (customerAmount: number) => number
  customerPriceWithRepeatBuyer: (customerAmount: number, repeatBuyer?: { enabled?: boolean; percentage?: number; maxDiscountAmount?: number | null } | null, eligible?: boolean) => number
}

const toRoundedTwo = (value: number) => Math.round(value * 100) / 100

/**
 * Customer-side pricing. Every amount it receives must already be a customer amount
 * (commission-inclusive, from the server); it never sees a professional base price.
 * Professionals price their own base amounts with `useCommissionRate().commissionedPrice`.
 */
export function useCustomerPricing(): CustomerPricing {
  const { customerPackagePrice, pricingReady, pricingError, retryPricing } = useCommissionRate()
  const { user, isAuthenticated } = useAuth()
  const [loyalty, setLoyalty] = useState<LoyaltyDiscountInfo | null>(null)
  const [loyaltyLoaded, setLoyaltyLoaded] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'customer') {
      setLoyalty(null)
      setLoyaltyLoaded(true)
      return
    }
    setLoyalty(null)
    setLoyaltyLoaded(false)
    let active = true
    const token = getAuthToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    cachedClientRequest<LoyaltyStatusResponse>(
      `loyalty-status:${user._id}`,
      async () => {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/loyalty/status`, {
          credentials: 'include',
          headers,
        })
        if (!res.ok) {
          throw new Error(`Loyalty status request failed (${res.status})`)
        }
        return res.json()
      },
      0,
    )
      .then((json) => {
        if (!active) return
        if (!json.success) {
          console.error('Loyalty status payload error:', json?.msg || json?.error || json)
          setLoyalty(null)
          return
        }
        const tierInfo = json?.data?.userStats?.tierInfo
        const level = json?.data?.loyaltyStatus?.level || tierInfo?.name
        const percentage = Number(tierInfo?.discountPercentage) || 0
        const maxDiscountAmount = typeof tierInfo?.maxDiscountAmount === 'number' ? tierInfo.maxDiscountAmount : null
        if (level) {
          setLoyalty({ level, percentage, maxDiscountAmount })
        } else {
          setLoyalty(null)
        }
      })
      .catch((error) => {
        if (!active) return
        console.error('Failed to fetch loyalty status:', error)
      })
      .finally(() => {
        if (active) setLoyaltyLoaded(true)
      })
    return () => {
      active = false
    }
  }, [isAuthenticated, user?.role, user?._id])

  const applyLoyaltyDiscount = useCallback(
    (customerAmount: number) => {
      if (!loyalty || loyalty.percentage <= 0 || customerAmount <= 0) return customerAmount
      let discount = toRoundedTwo(customerAmount * (loyalty.percentage / 100))
      if (loyalty.maxDiscountAmount != null && loyalty.maxDiscountAmount > 0) {
        discount = Math.min(discount, loyalty.maxDiscountAmount)
      }
      return Math.max(0, toRoundedTwo(customerAmount - discount))
    },
    [loyalty]
  )

  const customerPrice = useCallback((customerAmount: number) => applyLoyaltyDiscount(customerAmount), [applyLoyaltyDiscount])
  const originalPrice = useCallback((customerAmount: number) => customerAmount, [])

  const customerPriceWithRepeatBuyer = useCallback(
    (
      customerAmount: number,
      repeatBuyer?: { enabled?: boolean; percentage?: number; maxDiscountAmount?: number | null } | null,
      eligible?: boolean
    ) => {
      const afterLoyalty = customerPrice(customerAmount)
      if (!eligible || !repeatBuyer?.enabled || !repeatBuyer.percentage || repeatBuyer.percentage <= 0) return afterLoyalty
      let discount = toRoundedTwo(afterLoyalty * (repeatBuyer.percentage / 100))
      if (repeatBuyer.maxDiscountAmount != null && repeatBuyer.maxDiscountAmount > 0) {
        discount = Math.min(discount, repeatBuyer.maxDiscountAmount)
      }
      return Math.max(0, toRoundedTwo(afterLoyalty - discount))
    },
    [customerPrice]
  )

  return useMemo(
    () => ({
      pricingReady,
      pricingError,
      retryPricing,
      loyalty,
      loyaltyLoaded,
      customerPackagePrice,
      customerPrice,
      originalPrice,
      withLoyaltyDiscount: applyLoyaltyDiscount,
      customerPriceWithRepeatBuyer,
    }),
    [pricingReady, pricingError, retryPricing, loyalty, loyaltyLoaded, customerPackagePrice, customerPrice, originalPrice, applyLoyaltyDiscount, customerPriceWithRepeatBuyer]
  )
}
