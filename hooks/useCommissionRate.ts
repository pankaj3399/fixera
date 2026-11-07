import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import { cachedClientRequest } from '@/lib/clientRequestCache'
import { useAuth } from '@/contexts/AuthContext'
import { customerPriceCache, type ExtraCostPreview } from '@/lib/customerPricePreview'
import type { UnitPricing } from '@/lib/customerPricing'

const COMMISSION_CACHE_KEY = 'commission-rate'
const serverSnapshot = () => 0

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

  // The revision makes memoized price consumers recompute when their amount batch arrives.
  const customerPrice = useCallback((amount: number, unitPricing?: UnitPricing | null) => {
    void revision
    if (typeof window === 'undefined') return NaN
    const unit = unitPricing?.pricingType === 'unit' && unitPricing.unitAmount != null && unitPricing.quantity != null
      ? { pricingType: 'unit', unitAmount: unitPricing.unitAmount, quantity: unitPricing.quantity } : undefined
    return customerPriceCache.read({ kind: 'amount', amount, ...(unit ? { unitPricing: unit } : {}) })
  }, [revision])
  const customerExtraCost = useCallback((cost: ExtraCostPreview) => {
    void revision
    if (typeof window === 'undefined') return NaN
    return customerPriceCache.read({ kind: 'extra_cost', amount: cost.amount ?? 0, cost })
  }, [revision])
  const customerExtraCostTotal = useCallback((costs: ExtraCostPreview[] | undefined, amount: number) => {
    void revision
    if (typeof window === 'undefined') return NaN
    return customerPriceCache.read({ kind: 'extra_cost_total', amount, costs: costs || [] })
  }, [revision])
  useEffect(() => {
    const retry = () => customerPriceCache.invalidate()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [])

  return { commissionPercent, commissionLoaded, commissionError, customerPrice, customerExtraCost, customerExtraCostTotal,
    pricingReady: customerPriceCache.ready(), pricingError: customerPriceCache.error(), retryPricing: customerPriceCache.invalidate }
}
