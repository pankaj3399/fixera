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

type DurationUnit = 'hours' | 'days'

/**
 * The professional's per-unit duration, kept while the package's pricing
 * option is temporarily hourly so a return to the same option restores it.
 * Wizard state only: `withoutRetainedDurations` strips it before saving.
 */
export type RetainedPerUnitDuration = { pricingUnit?: string; value: number; unit?: DurationUnit }

type WizardPackage = {
  pricing: { type?: string; unit?: string; durationBasis?: string }
  executionDuration?: { value?: number; unit?: DurationUnit; range?: { min?: number; max?: number } }
  retainedPerUnitDuration?: RetainedPerUnitDuration
}

/**
 * Updates for a package whose pricing type is chosen (type select or the
 * auto-repair to a valid type). A fixed/RFQ duration covers the whole job;
 * carried into unit pricing it would be read per unit (3 days × 10 units =
 * 30 days), so the value is cleared on entering unit pricing.
 */
export function pricingTypeChangeUpdates<P extends WizardPackage>(
  pkg: P,
  nextPricing: P['pricing'],
): Pick<P, 'pricing' | 'executionDuration' | 'retainedPerUnitDuration'> {
  const entersUnit = nextPricing.type === 'unit' && pkg.pricing.type !== 'unit'
  return {
    pricing: nextPricing,
    executionDuration: entersUnit && pkg.executionDuration
      ? { ...pkg.executionDuration, value: undefined }
      : pkg.executionDuration,
    retainedPerUnitDuration: undefined,
  } as Pick<P, 'pricing' | 'executionDuration' | 'retainedPerUnitDuration'>
}

/**
 * A unit package after the Step 1 pricing option changes its unit.
 *
 * Per-unit → hourly: the hours the customer books become the duration, so the
 * value is cleared, but the professional's per-unit value and its unit are
 * kept aside. Hourly → the same per-unit option: they are restored. Any other
 * return leaves the value empty for the professional to enter.
 */
export function withSyncedPricingUnit<P extends WizardPackage>(pkg: P, unit: string | undefined): P {
  if (pkg.pricing.unit === unit) return pkg
  const next: P = { ...pkg, pricing: { ...pkg.pricing, unit } }
  const before = packageDurationMode(pkg.pricing)
  const after = packageDurationMode(next.pricing)

  if (before === 'per_unit' && after === 'customer_hours') {
    const value = pkg.executionDuration?.value
    return {
      ...next,
      retainedPerUnitDuration: typeof value === 'number' && Number.isFinite(value) && value > 0
        ? { pricingUnit: pkg.pricing.unit, value, unit: pkg.executionDuration?.unit }
        : undefined,
      executionDuration: { ...pkg.executionDuration, value: undefined, unit: 'hours' },
    }
  }

  if (before === 'customer_hours' && after === 'per_unit') {
    const retained = pkg.retainedPerUnitDuration
    const restored = { ...next, retainedPerUnitDuration: undefined }
    if (retained && retained.pricingUnit === unit) {
      restored.executionDuration = {
        ...pkg.executionDuration,
        value: retained.value,
        unit: retained.unit ?? pkg.executionDuration?.unit ?? 'hours',
      }
    }
    return restored
  }

  return next
}

/**
 * A wizard package aligned with the Step 1 pricing option: on Step 2 mount and
 * when the option changes while Step 2 is mounted. Step 2 is unmounted while
 * Step 1 is edited, so on mount the stored package still has the previous unit.
 * The transition runs from that unit; overwriting it first would make
 * per-unit → hourly look like hourly → hourly and lose the per-unit value.
 * Fixed/RFQ pricing carries no unit.
 */
export function withOptionPricingUnit<P extends WizardPackage>(
  pkg: P,
  optionUnit: string | undefined,
  fallbackUnit: string,
): P {
  if (pkg.pricing.type !== 'unit') {
    return pkg.pricing.unit === undefined ? pkg : { ...pkg, pricing: { ...pkg.pricing, unit: undefined } }
  }
  return withSyncedPricingUnit(pkg, optionUnit || pkg.pricing.unit || fallbackUnit)
}

/** Packages as saved: the wizard-only retained duration never reaches the API. */
export function withoutRetainedDurations<P extends object>(packages: P[] | undefined): P[] | undefined {
  if (!Array.isArray(packages)) return packages
  return packages.map((pkg) => {
    if (!('retainedPerUnitDuration' in pkg)) return pkg
    const rest = { ...pkg } as P & { retainedPerUnitDuration?: unknown }
    delete rest.retainedPerUnitDuration
    return rest
  })
}

/**
 * What a package card shows for its execution duration: "determined by
 * customer" for customer-set hours (no stored value by design), a finite
 * stored duration otherwise, or nothing.
 */
export type PackageDurationDisplay =
  | { kind: 'customer_hours' }
  | { kind: 'duration'; value: number; unit: DurationUnit }
  | null

export function packageDurationDisplay(
  pkg: { pricing?: PricingLike; executionDuration?: { value?: unknown; unit?: string } | null } | null | undefined,
): PackageDurationDisplay {
  if (packageDurationMode(pkg?.pricing) === 'customer_hours') return { kind: 'customer_hours' }
  const value = pkg?.executionDuration?.value
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return { kind: 'duration', value, unit: pkg?.executionDuration?.unit === 'days' ? 'days' : 'hours' }
}
