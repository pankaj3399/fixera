import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import { cachedClientRequest } from '@/lib/clientRequestCache'
import { useAuth } from '@/contexts/AuthContext'
import { customerPriceCache, type PackagePriceRef } from '@/lib/customerPricePreview'
import { commissionedAmount, type UnitPricing } from '@/lib/customerPricing'

const COMMISSION_CACHE_KEY = 'commission-rate'
const serverSnapshot = () => 0

/**
 * Professionals may see the commission rate; customers and anonymous visitors never
 * fetch it. A professional prices their own base amounts locally with the same
 * arithmetic as the server. Customers get customer totals from the server.
 */
export function useCommissionRate() {
  const { user } = useAuth()
  const [commissionPercent, setCommissionPercent] = useState<number | null>(null)
  const [commissionLoaded, setCommissionLoaded] = useState(false)
  const [commissionError, setCommissionError] = useState<Error | null>(null)
  const revision = useSyncExternalStore(customerPriceCache.subscribe, customerPriceCache.snapshot, serverSnapshot)

  useEffect(() => {
    let active = true
    setCommissionPercent(null)
    setCommissionError(null)
    if (user?.role !== 'professional') { setCommissionLoaded(true); return }
    setCommissionLoaded(false)
    cachedClientRequest<number>(COMMISSION_CACHE_KEY, async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/commission-rate`, { credentials: 'include' })
      if (!res.ok) throw new Error('Commission rate unavailable')
      const json = await res.json()
      const rate = json?.data?.commissionPercent
      if (typeof rate !== 'number' || !Number.isFinite(rate)) throw new Error('Invalid commission rate')
      return rate
    }, 0).then(rate => { if (active) setCommissionPercent(rate) })
      .catch(cause => { if (active) setCommissionError(cause) })
      .finally(() => { if (active) setCommissionLoaded(true) })
    return () => { active = false }
  }, [user?.role, user?._id])

  /** Professional's own base amount with the commission added. NaN until the rate has loaded. */
  const commissionedPrice = useCallback((amount: number, unitPricing?: UnitPricing | null) => {
    if (commissionPercent == null || !Number.isFinite(amount)) return NaN
    return commissionedAmount(amount, commissionPercent, unitPricing)
  }, [commissionPercent])

  /** Customer total for a stored package, from the server. NaN while loading or unavailable. */
  const customerPackagePrice = useCallback((ref: PackagePriceRef) => {
    void revision
    if (typeof window === 'undefined') return NaN
    return customerPriceCache.read(ref)
  }, [revision])

  return {
    commissionPercent,
    commissionLoaded,
    commissionError,
    commissionedPrice,
    customerPackagePrice,
    pricingReady: customerPriceCache.ready(),
    pricingError: customerPriceCache.error(),
    retryPricing: customerPriceCache.invalidate,
  }
}
