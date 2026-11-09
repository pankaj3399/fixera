/**
 * Customer price lookups. The server prices a stored package for a customer:
 * the request names a published project, one of its packages, the usage and the
 * options. It cannot carry an amount, so the client never sends a base price and
 * never receives one back.
 */
export type PackagePriceRef = {
  projectId: string
  subprojectIndex: number
  /** Unit packages: the quantity the customer estimates. */
  estimatedUsage?: number | string
  /** Indexes into the project's extra options. */
  selectedExtraOptions?: number[]
}

const refKey = (ref: PackagePriceRef) => JSON.stringify([
  ref.projectId,
  ref.subprojectIndex,
  ref.estimatedUsage ?? null,
  [...(ref.selectedExtraOptions ?? [])].sort((a, b) => a - b),
])

/** Matches the server's MAX_PREVIEW_REQUESTS: a larger batch is rejected whole, so it is split. */
export const CUSTOMER_PRICE_BATCH_LIMIT = 50
/** Matches the server's subproject index bound (0..99). */
const MAX_SUBPROJECT_INDEX = 99

const isValidRef = (ref: PackagePriceRef) => Boolean(ref.projectId)
  && Number.isInteger(ref.subprojectIndex) && ref.subprojectIndex >= 0 && ref.subprojectIndex <= MAX_SUBPROJECT_INDEX

/**
 * Shared cache for customer totals. A missing, pending or failed lookup reads as
 * NaN, never as an unpriced amount. One `online` listener, registered by the
 * module, retries failed lookups for every consumer.
 */
export function createCustomerPriceCache(fetchPrices: (requests: PackagePriceRef[]) => Promise<number[]>) {
  const entries = new Map<string, { request: PackagePriceRef; value?: number; expires: number; failed?: boolean }>()
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
    const keys = [...queued].slice(0, CUSTOMER_PRICE_BATCH_LIMIT)
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
      keys.forEach((key) => entries.set(key, { request: entries.get(key)!.request, expires: Infinity, failed: true }))
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
    /** The customer total for a package, or NaN while it is loading or unavailable. */
    read: (ref: PackagePriceRef): number => {
      if (!isValidRef(ref)) return NaN
      const key = refKey(ref)
      const entry = entries.get(key)
      if (entry?.expires && entry.expires > Date.now()) return entry.value ?? NaN
      entries.set(key, { request: ref, expires: Infinity })
      queued.add(key)
      schedule()
      return NaN
    },
    invalidate: () => { generation++; entries.clear(); queued.clear(); error = null; emit() },
  }
}

export const customerPriceCache = createCustomerPriceCache(async requests => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/customer-prices`, {
    method: 'POST', signal: AbortSignal.timeout(15_000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }),
  })
  if (!response.ok) throw new Error('Price preview unavailable')
  const result = await response.json()
  if (!result.success || !Array.isArray(result.data?.prices)) throw new Error('Invalid price preview')
  return result.data.prices
})

export const invalidateCustomerPrices = () => customerPriceCache.invalidate()

// One retry listener for the whole app, owned by the shared cache (not by each consumer).
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => customerPriceCache.invalidate())
}
