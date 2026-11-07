import type { UnitPricing } from './customerPricing'

export type ExtraCostPreview = { type?: string; amount?: number; unitPrice?: number; actualUnits?: number; estimatedUnits?: number }
export type CustomerPriceRequest =
  | { kind: 'amount'; amount: number; unitPricing?: UnitPricing }
  | { kind: 'extra_cost'; amount: number; cost: ExtraCostPreview }
  | { kind: 'extra_cost_total'; amount: number; costs: ExtraCostPreview[] }

/** Amount-only cache. A missing/failed preview is NaN, never an unpriced supplier amount. */
export function createCustomerPriceCache(fetchPrices: (requests: CustomerPriceRequest[]) => Promise<number[]>) {
  const entries = new Map<string, { request: CustomerPriceRequest; value?: number; expires: number; failed?: boolean }>()
  const queued = new Set<string>()
  const listeners = new Set<() => void>()
  let revision = 0
  let scheduled = false
  let inFlight = 0
  let error: Error | null = null
  let generation = 0
  const emit = () => { revision++; listeners.forEach(listener => listener()) }
  const flush = async () => {
    scheduled = false
    if (!queued.size) return
    const keys = [...queued].slice(0, 100)
    keys.forEach(key => queued.delete(key))
    const batch = keys.map(key => entries.get(key)!.request)
    const currentGeneration = generation
    inFlight++
    emit()
    try {
      const prices = await fetchPrices(batch)
      if (prices.length !== keys.length || prices.some(price => !Number.isFinite(price))) throw new Error('Invalid price preview')
      if (generation !== currentGeneration) return
      keys.forEach((key, index) => entries.set(key, { request: batch[index], value: prices[index], expires: Date.now() + 60_000 }))
    } catch (cause) {
      if (generation !== currentGeneration) return
      error = cause instanceof Error ? cause : new Error('Price preview unavailable')
      keys.forEach((key, index) => entries.set(key, { request: batch[index], expires: Infinity, failed: true }))
    } finally {
      inFlight--
      emit()
      if (queued.size) schedule()
    }
  }
  const schedule = () => {
    if (!scheduled) { scheduled = true; queueMicrotask(() => { void flush() }) }
  }
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    snapshot: () => revision,
    ready: () => !queued.size && inFlight === 0 && !error,
    error: () => error,
    read: (request: CustomerPriceRequest): number => {
      if (!Number.isFinite(request.amount)) return NaN
      const key = JSON.stringify(request)
      const entry = entries.get(key)
      if (entry?.expires && entry.expires > Date.now()) return entry.value ?? NaN
      entries.set(key, { request, expires: Infinity })
      queued.add(key)
      schedule()
      return NaN
    },
    invalidate: () => { generation++; entries.clear(); queued.clear(); error = null; emit() },
  }
}

export const customerPriceCache = createCustomerPriceCache(async prices => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/customer-prices`, {
    method: 'POST', signal: AbortSignal.timeout(15_000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prices }),
  })
  if (!response.ok) throw new Error('Price preview unavailable')
  const result = await response.json()
  if (!result.success || !Array.isArray(result.data?.prices)) throw new Error('Invalid price preview')
  return result.data.prices
})

export const invalidateCustomerPrices = () => customerPriceCache.invalidate()
