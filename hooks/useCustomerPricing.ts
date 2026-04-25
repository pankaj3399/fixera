import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getAuthToken } from '@/lib/utils'
import { useCommissionRate } from './useCommissionRate'

interface LoyaltyDiscountInfo {
  level: string
  percentage: number
  maxDiscountAmount: number | null
}

export interface CustomerPricing {
  commissionPercent: number | null
  loyalty: LoyaltyDiscountInfo | null
  customerPrice: (amount: number) => number
  originalPrice: (amount: number) => number
  customerPriceWithRepeatBuyer: (amount: number, repeatBuyer?: { enabled?: boolean; percentage?: number; maxDiscountAmount?: number | null } | null, eligible?: boolean) => number
}

const toRoundedTwo = (value: number) => Math.round(value * 100) / 100

export function useCustomerPricing(): CustomerPricing {
  const { commissionPercent, customerPrice: baseCustomerPrice } = useCommissionRate()
  const { user, isAuthenticated } = useAuth()
  const [loyalty, setLoyalty] = useState<LoyaltyDiscountInfo | null>(null)

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'customer') {
      setLoyalty(null)
      return
    }
    const controller = new AbortController()
    const token = getAuthToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/loyalty/status`, {
      credentials: 'include',
      headers,
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
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
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Failed to fetch loyalty status:', error)
      })
    return () => controller.abort()
  }, [isAuthenticated, user?.role, user?._id])

  const applyLoyaltyDiscount = useCallback(
    (commissionInclusiveAmount: number) => {
      if (!loyalty || loyalty.percentage <= 0 || commissionInclusiveAmount <= 0) return commissionInclusiveAmount
      let discount = toRoundedTwo(commissionInclusiveAmount * (loyalty.percentage / 100))
      if (loyalty.maxDiscountAmount != null && loyalty.maxDiscountAmount > 0) {
        discount = Math.min(discount, loyalty.maxDiscountAmount)
      }
      return Math.max(0, toRoundedTwo(commissionInclusiveAmount - discount))
    },
    [loyalty]
  )

  const customerPrice = useCallback(
    (amount: number) => applyLoyaltyDiscount(baseCustomerPrice(amount)),
    [applyLoyaltyDiscount, baseCustomerPrice]
  )

  const originalPrice = useCallback((amount: number) => baseCustomerPrice(amount), [baseCustomerPrice])

  const customerPriceWithRepeatBuyer = useCallback(
    (
      amount: number,
      repeatBuyer?: { enabled?: boolean; percentage?: number; maxDiscountAmount?: number | null } | null,
      eligible?: boolean
    ) => {
      const afterLoyalty = customerPrice(amount)
      if (!eligible || !repeatBuyer?.enabled || !repeatBuyer.percentage || repeatBuyer.percentage <= 0) return afterLoyalty
      let discount = toRoundedTwo(afterLoyalty * (repeatBuyer.percentage / 100))
      if (repeatBuyer.maxDiscountAmount != null && repeatBuyer.maxDiscountAmount > 0) {
        discount = Math.min(discount, repeatBuyer.maxDiscountAmount)
      }
      return Math.max(0, toRoundedTwo(afterLoyalty - discount))
    },
    [customerPrice]
  )

  return {
    commissionPercent,
    loyalty,
    customerPrice,
    originalPrice,
    customerPriceWithRepeatBuyer,
  }
}
