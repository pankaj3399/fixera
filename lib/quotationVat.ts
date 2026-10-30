/**
 * Quotation VAT determination helpers (client task 18a/18b).
 *
 * The quotation VAT-options endpoint returns `data.vatDetermination` next to
 * `data.options`:
 *   { customerType: 'B2C' | 'B2B',
 *     article47Class: 'Movable' | 'Immovable'
 *       | 'Immovable but exempt from Belgian reverse charge' | null,
 *     vatAddressType: 'Booking address' | 'Customer business address',
 *     vatCountry: string, reverseCharge: boolean }
 *
 * When `reverseCharge` is true the options list is a single 0% Reverse Charge
 * entry: the determined VAT applies to every line and the professional gets
 * no rate choice. Otherwise the professional picks Standard/Reduced and the
 * determination parameters are shown alongside for transparency.
 */

export type QuotationCustomerType = 'B2C' | 'B2B'

export type QuotationArticle47Class =
  | 'Movable'
  | 'Immovable'
  | 'Immovable but exempt from Belgian reverse charge'

export type QuotationVatAddressType = 'Booking address' | 'Customer business address'

export interface QuotationVatDetermination {
  customerType: QuotationCustomerType
  article47Class: QuotationArticle47Class | null
  vatAddressType: QuotationVatAddressType
  vatCountry: string
  reverseCharge: boolean
}

export interface QuotationVatRateOption {
  rate: number
  country: string
  label: string
  reverseCharge: boolean
  source: 'standard' | 'reduced' | 'b2b_exempt' | 'legacy'
  isCustom?: boolean
}

const ARTICLE_47_CLASSES: readonly QuotationArticle47Class[] = [
  'Movable',
  'Immovable',
  'Immovable but exempt from Belgian reverse charge',
]

const VAT_ADDRESS_TYPES: readonly QuotationVatAddressType[] = [
  'Booking address',
  'Customer business address',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Tolerant parser for the `vatDetermination` payload. Returns null for
 * legacy/loading/error shapes so the wizard keeps working without it.
 */
export function parseQuotationVatDetermination(value: unknown): QuotationVatDetermination | null {
  if (!isRecord(value)) return null
  const customerType = value.customerType === 'B2B' ? 'B2B' : value.customerType === 'B2C' ? 'B2C' : null
  if (!customerType) return null
  const rawArticle47 = value.article47Class
  const article47Class =
    rawArticle47 == null
      ? null
      : (ARTICLE_47_CLASSES as readonly string[]).includes(String(rawArticle47))
        ? (String(rawArticle47) as QuotationArticle47Class)
        : null
  // Unknown enum values invalidate the payload rather than rendering a raw
  // backend string; null stays valid (B2C and non-classified B2B work).
  if (rawArticle47 != null && article47Class == null) return null
  const vatAddressType = (VAT_ADDRESS_TYPES as readonly string[]).includes(String(value.vatAddressType))
    ? (String(value.vatAddressType) as QuotationVatAddressType)
    : null
  if (!vatAddressType) return null
  const vatCountry = asNonEmptyString(value.vatCountry)
  if (!vatCountry) return null
  if (typeof value.reverseCharge !== 'boolean') return null
  return {
    customerType,
    article47Class,
    vatAddressType,
    vatCountry: vatCountry.toUpperCase(),
    reverseCharge: value.reverseCharge,
  }
}

/**
 * Tolerant parser for the whole `/vat-rates` response body. Returns null
 * when the endpoint is unreachable, errors, or answers in a legacy shape.
 */
export function parseQuotationVatOptionsResponse(body: unknown): {
  options: QuotationVatRateOption[]
  vatDetermination: QuotationVatDetermination | null
} | null {
  if (!isRecord(body) || body.success !== true) return null
  const data = body.data
  if (!isRecord(data) || !Array.isArray(data.options)) return null
  const options = (data.options as unknown[]).filter(isRecord).map((option) => ({
    rate: Number(option.rate),
    country: typeof option.country === 'string' ? option.country : '',
    label: typeof option.label === 'string' ? option.label : '',
    reverseCharge: option.reverseCharge === true,
    source: option.source as QuotationVatRateOption['source'],
    ...(option.isCustom === true ? { isCustom: true as const } : {}),
  // Malformed options (non-finite rate) are dropped instead of becoming a
  // NaN-rate default that could be rendered or submitted.
  })).filter((option) => Number.isFinite(option.rate))
  return {
    options,
    vatDetermination: parseQuotationVatDetermination(data.vatDetermination),
  }
}

/** Reverse charge applies: single 0% option, no professional rate choice. */
export function isReverseChargeDetermination(
  determination: QuotationVatDetermination | null | undefined,
  options?: Array<Pick<QuotationVatRateOption, 'reverseCharge'>> | null,
): boolean {
  if (determination) return determination.reverseCharge === true
  // Legacy fallback: no determination payload but every option is a
  // reverse-charge option -> still read-only.
  if (!options || options.length === 0) return false
  return options.every((option) => option.reverseCharge === true)
}

/** Article 47 class is only meaningful (and only shown) for B2B. */
export function shouldShowArticle47Class(
  determination: QuotationVatDetermination | null | undefined,
): boolean {
  return determination?.customerType === 'B2B' && determination.article47Class != null
}

export interface QuotationPricingLineLike {
  vatRate: number
  vatCountry?: string
  vatLabel?: string
  vatRateMode?: 'preset' | 'custom'
  vatRateExplicitlyEntered?: boolean
}

/**
 * Force every pricing line onto the single reverse-charge option so a
 * reverse-charge quotation can never submit another rate, even when the
 * form was started (or loaded from a legacy version) with other rates.
 */
export function applyReverseChargeToLines<T extends QuotationPricingLineLike>(
  lines: T[],
  reverseChargeOption: Pick<QuotationVatRateOption, 'rate' | 'country' | 'label'>,
): T[] {
  return lines.map((line) => ({
    ...line,
    vatRate: reverseChargeOption.rate,
    vatCountry: reverseChargeOption.country,
    vatLabel: reverseChargeOption.label,
    vatRateMode: 'preset' as const,
    vatRateExplicitlyEntered: true,
  }))
}
