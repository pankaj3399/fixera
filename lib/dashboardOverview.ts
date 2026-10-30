/**
 * Shared dashboard overview helpers (groups 9–15).
 *
 * Pure, display-only functions for the shared bookings/quotations tables and
 * the professional summary cards. Server remains authoritative for money,
 * dates, eligibility, and counts; these helpers only resolve display values
 * from recorded fields. Unknown renders as null so callers show a dash —
 * never 0, never fabricated.
 */

export type OverviewMoney = {
  amount: number | null
  currency: string | null
  source: "recorded" | "not_recorded"
}

/** Wire-shaped dashboard record: server payloads decoded as JSON. */
export type WireRecord = Record<string, unknown>

export const DASH = "—"

const asRecord = (value: unknown): WireRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as WireRecord) : null

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

/** Format recorded money, or a dash when unknown. Never renders 0 for unknown. */
export function formatOverviewMoney(
  money: OverviewMoney | null | undefined,
  formatAmount: (amount: number, currency?: string | null) => string,
): string {
  if (!money || money.amount == null || money.source !== "recorded") return DASH
  return formatAmount(money.amount, money.currency || "EUR")
}

export function formatUnknownDate(value: string | null | undefined, intl: string): string {
  if (!value) return DASH
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return DASH
  return new Date(time).toLocaleDateString(intl)
}

/**
 * Canonical booked project/subproject snapshot. Booking-time snapshot wins
 * over the current mutable project; RFQ-initial unfilled fields stay null.
 */
export function resolveSnapshotTitles(booking: unknown): {
  projectId: string | null
  projectTitle: string | null
  subprojectTitle: string | null
  titleSource: "booking_snapshot" | "live_project" | "not_recorded"
} {
  const bookingRecord = asRecord(booking)
  const snapshot = asRecord(bookingRecord?.bookingSnapshot)
  const snapshotProject = asRecord(snapshot?.project)
  if (snapshotProject) {
    const selected = asRecord(snapshot?.selectedSubproject)
    const subprojectTitle = asText(selected?.title) ?? asText(selected?.name)
    const liveProject = asRecord(bookingRecord?.project)
    const rawId = snapshotProject.id ?? liveProject?._id ?? liveProject?.id ?? bookingRecord?.project
    const idRecord = asRecord(rawId)
    return {
      projectId: idRecord ? asText(idRecord._id) : typeof rawId === "string" ? rawId : null,
      projectTitle: asText(snapshotProject.title),
      subprojectTitle,
      titleSource: "booking_snapshot",
    }
  }
  const liveProject = asRecord(bookingRecord?.project)
  if (liveProject) {
    return {
      projectId: asText(liveProject._id) ?? asText(liveProject.id),
      projectTitle: asText(liveProject.title),
      subprojectTitle: null,
      titleSource: "live_project",
    }
  }
  return {
    projectId: typeof bookingRecord?.project === "string" ? bookingRecord.project : null,
    projectTitle: null,
    subprojectTitle: null,
    titleSource: "not_recorded",
  }
}

export function joinServiceAddress(location: unknown): string | null {
  const record = asRecord(location)
  if (!record) return null
  const parts = [record.address, record.city, record.postalCode, record.country]
    .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
  return parts.length > 0 ? parts.join(", ") : null
}

/**
 * Quote version pinning: recorded accepted version first, else current.
 * The table links this exact version (`#quotation-v{N}`); the booking route
 * loads the pinned version instead of ignoring the link.
 */
export function resolvePinnedQuoteVersion(booking: unknown): {
  pinnedVersion: number | null
  pinnedVersionSource: "recorded" | "inferred_current" | "not_recorded"
} {
  const bookingRecord = asRecord(booking)
  const quote = asRecord(bookingRecord?.quote)
  const accepted = asNumber(bookingRecord?.acceptedQuoteVersion ?? quote?.acceptedVersion)
  if (accepted != null) {
    return { pinnedVersion: accepted, pinnedVersionSource: "recorded" }
  }
  const current = asNumber(bookingRecord?.currentQuoteVersion ?? quote?.currentVersion)
  if (current != null) {
    return { pinnedVersion: current, pinnedVersionSource: "inferred_current" }
  }
  return { pinnedVersion: null, pinnedVersionSource: "not_recorded" }
}

export function quoteVersionHref(bookingId: string, booking: unknown): string {
  const { pinnedVersion } = resolvePinnedQuoteVersion(booking)
  return pinnedVersion != null ? `/bookings/${bookingId}#quotation-v${pinnedVersion}` : `/bookings/${bookingId}`
}

export const bookingHref = (bookingId: string): string => `/bookings/${bookingId}`

export const projectHref = (projectId: string): string => `/projects/${projectId}`

export const professionalHref = (professionalId: string): string => `/professional/${professionalId}`

/** Customer pay-now eligibility mirrors the server quick-action rule. */
export function isPayNowEligible(status: unknown): boolean {
  return status === "quote_accepted" || status === "payment_pending"
}

/** Customer warranty-action eligibility mirrors the server rule. */
export function isWarrantyActionEligible(booking: unknown, now: number = Date.now()): boolean {
  const record = asRecord(booking)
  if (!record || record.status !== "completed") return false
  const coverage = asRecord(record.warrantyCoverage)
  const duration = asRecord(coverage?.duration)
  const durationValue = asNumber(duration?.value) ?? 0
  const endsAt = typeof coverage?.endsAt === "string" ? new Date(coverage.endsAt).getTime() : NaN
  return durationValue > 0 && Number.isFinite(endsAt) && endsAt > now
}

/**
 * Per-currency earnings display. A blended cross-currency sum is never
 * presented as a single-currency figure: with several currencies each
 * bucket renders separately.
 */
export function describeEarningsBuckets(
  totalsByCurrency:
    | Array<{ currency: string; totalEarnings?: number | null; pendingEarnings?: number | null }> | null
    | undefined,
  kind: "totalEarnings" | "pendingEarnings",
  formatAmount: (amount: number, currency?: string | null) => string,
): string {
  const buckets = (totalsByCurrency || []).filter(
    (bucket) => bucket && typeof bucket.currency === "string" && typeof bucket[kind] === "number",
  )
  if (buckets.length === 0) return DASH
  return buckets.map((bucket) => formatAmount(bucket[kind] as number, bucket.currency)).join(" + ")
}

/** Look up a server facet count, defaulting to 0 for unseen keys. */
export function facetCount(counts: Record<string, number> | null | undefined, key: string): number {
  if (!counts || typeof counts !== "object") return 0
  const value = counts[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/** Sum server status counts over a mode set (pending/finished cards). */
export function sumStatusCounts(
  counts: Record<string, number> | null | undefined,
  statuses: Iterable<string>,
): number {
  let total = 0
  for (const status of statuses) total += facetCount(counts, status)
  return total
}

export interface PriceBucket {
  model: string
  unit: string | null
  cheapest: number
}

export interface PricedSubproject {
  pricing?: {
    type?: string
    amount?: number | null
    priceRange?: { min?: number } | null
    unit?: string | null
  } | null
  basePrice?: number | null
  pricingModel?: string | null
}

/**
 * Cheapest recorded customer price per (pricing model, unit) group. Groups
 * are never blended across models or units: fixed and per-m² figures stay
 * separate, and an RFQ-only project yields no price. Unknown stays null.
 */
export function cheapestPriceByModelUnit(
  subprojects: Array<PricedSubproject | null> | null | undefined,
): PriceBucket[] {
  if (!Array.isArray(subprojects)) return []
  const groups = new Map<string, PriceBucket>()
  for (const subproject of subprojects) {
    const pricing = subproject?.pricing ?? null
    // Legacy list shape carries basePrice/pricingModel instead of pricing.
    const legacyAmount = asNumber(subproject?.basePrice)
    if ((!pricing || pricing.type === "rfq") && legacyAmount == null) continue
    const amount = pricing && pricing.type !== "rfq"
      ? (asNumber(pricing.amount) ?? asNumber(pricing.priceRange?.min))
      : legacyAmount
    if (amount == null) continue
    const model = (pricing && pricing.type !== "rfq" ? pricing.type : null) || subproject?.pricingModel || "fixed"
    const unit = pricing && typeof pricing.unit === "string" && pricing.unit ? pricing.unit : null
    const key = `${model}||${unit || ""}`
    const current = groups.get(key)
    if (!current || amount < current.cheapest) {
      groups.set(key, { model, unit, cheapest: amount })
    }
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.model.localeCompare(b.model) || (a.unit || "").localeCompare(b.unit || ""),
  )
}

/** Elapsed hold days require a recorded hold transition, never updatedAt. */
export function recordedHoldDays(onHoldAt: string | null | undefined, now = Date.now()): number | null {
  if (!onHoldAt) return null
  const start = new Date(onHoldAt).getTime()
  return Number.isFinite(start) && start <= now ? Math.floor((now - start) / 86400000) : null
}
