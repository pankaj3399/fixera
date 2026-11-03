/**
 * Resolve the configured pricing unit of a booking (m², hour, day, …) so the
 * completion pop-up says "Estimated m²" / "Price per hour" instead of a
 * generic "unit".
 */

export const CANONICAL_UNITS = ['hour', 'day', 'meter', 'm2', 'm3', 'room', 'piece'] as const
export type CanonicalUnit = (typeof CANONICAL_UNITS)[number]

const ALIASES: Record<string, CanonicalUnit> = {
  h: 'hour', hr: 'hour', hrs: 'hour', hour: 'hour', hours: 'hour', uur: 'hour', uren: 'hour', heure: 'hour', heures: 'hour',
  d: 'day', day: 'day', days: 'day', dag: 'day', dagen: 'day', jour: 'day', jours: 'day',
  m: 'meter', meter: 'meter', meters: 'meter', metre: 'meter', metres: 'meter', lm: 'meter', mètre: 'meter', mètres: 'meter',
  m2: 'm2', 'm²': 'm2', sqm: 'm2', squaremeter: 'm2', squaremeters: 'm2', squaremetre: 'm2', squaremetres: 'm2',
  m3: 'm3', 'm³': 'm3', cubicmeter: 'm3', cubicmetre: 'm3',
  room: 'room', rooms: 'room', kamer: 'room', kamers: 'room',
  piece: 'piece', pieces: 'piece', pcs: 'piece', pc: 'piece', stuk: 'piece', stuks: 'piece',
}

/** Words that say nothing about the actual unit and must never be displayed as one. */
const GENERIC = new Set(['', 'unit', 'units', 'unitbased', 'perunit', 'priceperunit', 'rfq', 'fixed', 'fixedprice', 'total', 'quote', 'eenheid', 'eenheden', 'unite', 'unité', 'unités'])

const squash = (value: string) =>
  value.trim().toLowerCase().replace(/^per[\s_-]+/, '').replace(/[\s_\-./]+/g, '')

/** Canonical unit for a raw configured value, or null when unknown/generic. */
export function canonicalUnit(raw: unknown): CanonicalUnit | null {
  if (typeof raw !== 'string') return null
  return ALIASES[squash(raw)] ?? null
}

function meaningful(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed || GENERIC.has(squash(trimmed))) return null
  return trimmed
}

export interface BookingUnitSources {
  /** Unit stored on an existing extra cost. */
  costUnit?: unknown
  /** Unit recorded at checkout (server-authoritative for new adjustments). */
  checkoutSnapshotUnit?: unknown
  /**
   * `selectedSubproject.pricing.unit` from the immutable booking-time snapshot
   * (`details.bookingSnapshot`). Survives later project edits, reorders and
   * deleted subprojects, and is set for quotation/legacy bookings too.
   */
  snapshotSubprojectUnit?: unknown
  /** `pricing.unit` of the booked subproject on the live, editable project (fallback). */
  subprojectUnit?: unknown
  /** Legacy project price model (e.g. "m2", "hour"). */
  priceModel?: unknown
}

/** First meaningful configured unit, most authoritative source first. */
export function resolveBookingUnit(sources: BookingUnitSources): string | null {
  return (
    meaningful(sources.costUnit) ??
    meaningful(sources.checkoutSnapshotUnit) ??
    meaningful(sources.snapshotSubprojectUnit) ??
    meaningful(sources.subprojectUnit) ??
    meaningful(sources.priceModel)
  )
}

/**
 * Index of the booked subproject: the stored index when it is valid, else the
 * only package when no index is stored. A stored but invalid index (the
 * package was removed) never falls back to whichever package remains.
 */
export function bookedSubprojectIndex(selectedIndex: unknown, subprojectCount: number): number | null {
  if (typeof selectedIndex === 'number') {
    return Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < subprojectCount ? selectedIndex : null
  }
  return subprojectCount === 1 ? 0 : null
}

type PricingSource = { type?: string | null; amount?: number | null; unit?: string | null } | null | undefined

export type BookedUnitPricing =
  | { ok: true; unitPrice: number; liveSubprojectIndex: number | null }
  | { ok: false; reason: 'noSubproject' | 'notUnitPriced' | 'unitPriceMissing' }

/**
 * Pricing of the booked package for a completion unit adjustment. The
 * booking-time snapshot wins, as it does for the unit label
 * (`snapshotSubprojectUnit`), so a package re-priced or re-united after the
 * booking cannot price the adjustment with today's rate. The live project is
 * only a fallback for bookings without a snapshot.
 */
export function bookedUnitPricing(input: {
  snapshotPricing: PricingSource
  liveSubprojects: Array<{ pricing?: PricingSource } | null | undefined>
  selectedIndex: unknown
}): BookedUnitPricing {
  const liveSubprojectIndex = bookedSubprojectIndex(input.selectedIndex, input.liveSubprojects.length)
  const pricing = input.snapshotPricing ?? (liveSubprojectIndex != null ? input.liveSubprojects[liveSubprojectIndex]?.pricing : undefined)
  if (!input.snapshotPricing && liveSubprojectIndex == null) return { ok: false, reason: 'noSubproject' }
  if (pricing?.type !== 'unit') return { ok: false, reason: 'notUnitPriced' }
  const unitPrice = Number(pricing.amount)
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { ok: false, reason: 'unitPriceMissing' }
  return { ok: true, unitPrice, liveSubprojectIndex }
}
