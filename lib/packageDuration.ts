/**
 * How a package's execution duration relates to the quantity the customer
 * books. Mirrors the backend `getProjectDurations` (scheduleEngine.ts):
 *
 * - `customer_hours`: unit pricing with an hour unit and a per-unit duration
 *   basis. The professional sets no duration; the hours the customer books are
 *   the execution duration.
 * - `per_unit`: unit pricing with any other unit. The professional sets the
 *   duration of one unit and the booked quantity multiplies it.
 * - `per_booking`: fixed/RFQ pricing, and legacy unit packages saved without a
 *   duration basis. One duration applies to the whole booking.
 */

export type PackageDurationMode = 'customer_hours' | 'per_unit' | 'per_booking'

type PricingLike = { type?: string; unit?: string; durationBasis?: string } | undefined | null

type DurationLike = {
  value?: number
  unit?: 'hours' | 'days'
  range?: { min?: number; max?: number }
}

/** Same hour-unit spellings the backend recognises. */
const HOUR_UNIT = /^(h|hr|hrs|hour|hours|hur)$/

export const isHourUnit = (unit: unknown): boolean =>
  typeof unit === 'string' && HOUR_UNIT.test(unit.toLowerCase())

export function packageDurationMode(pricing: PricingLike): PackageDurationMode {
  if (pricing?.type !== 'unit' || pricing.durationBasis !== 'per_unit') return 'per_booking'
  return isHourUnit(pricing.unit) ? 'customer_hours' : 'per_unit'
}

/**
 * Duration basis for a package whose pricing type is being chosen (new package
 * or a type change). Unit pricing is per unit; other types carry no basis.
 * Existing packages are never passed through this on load, so legacy per-booking
 * unit packages keep their stored behaviour.
 */
export function withChosenDurationBasis<T extends { type?: string; durationBasis?: string }>(pricing: T): T {
  return { ...pricing, durationBasis: pricing.type === 'unit' ? 'per_unit' : undefined }
}

/**
 * Execution duration the booking actually occupies for `quantity` booked
 * units, matching what the backend schedules.
 */
export function effectiveExecutionDuration<D extends DurationLike>(
  pkg: { pricing?: PricingLike; executionDuration?: D } | undefined | null,
  fallback: D | undefined,
  quantity: number,
): D | undefined {
  const source = pkg?.executionDuration || fallback
  const mode = packageDurationMode(pkg?.pricing)
  const validQuantity = Number.isFinite(quantity) && quantity > 0
  if (mode === 'customer_hours') {
    return validQuantity ? ({ ...(source || {}), value: quantity, unit: 'hours', range: undefined } as D) : source
  }
  if (mode === 'per_unit' && validQuantity && source && typeof source.value === 'number' && source.value > 0) {
    return { ...source, value: source.value * quantity }
  }
  return source
}
