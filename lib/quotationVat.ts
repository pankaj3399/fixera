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
  const vatDetermination = parseQuotationVatDetermination(data.vatDetermination)
  if (vatDetermination?.reverseCharge && !options.some(option => option.reverseCharge)) return null
  return { options, vatDetermination }
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

/**
 * The VAT parameters recorded with a quotation version (booking details DTO),
 * in the shape the VAT determination panel shows. Null for versions recorded
 * before the parameters were stored (FT3-18b).
 */
export function recordedQuotationVatDetermination(
  recorded: {
    customerType?: string | null
    article47Class?: string | null
    vatAddressType?: string | null
    vatCountry?: string | null
    reverseCharge?: boolean | null
  } | null | undefined,
): QuotationVatDetermination | null {
  if (!recorded || (recorded.customerType !== 'B2B' && recorded.customerType !== 'B2C')) return null
  const article47 = recorded.article47Class
  return {
    customerType: recorded.customerType,
    article47Class: article47 === 'Movable' || article47 === 'Immovable'
      || article47 === 'Immovable but exempt from Belgian reverse charge'
      ? article47
      : null,
    vatAddressType: recorded.vatAddressType === 'Customer business address' ? 'Customer business address' : 'Booking address',
    vatCountry: recorded.vatCountry || '',
    reverseCharge: recorded.reverseCharge === true,
  }
}

/**
 * FT2-14: once the VAT options of the (new) service country are loaded, put
 * the country's default rate on every line that has no valid rate for it:
 * lines still on the "enter a rate" placeholder and preset rates of another
 * country. A custom rate the professional typed, and a preset rate of the
 * loaded country, are kept. Lines are never wiped while the country is typed.
 */
export function applyCountryDefaultVat<T extends QuotationPricingLineLike>(
  lines: T[],
  option: { rate: number; country: string; label: string; isCustom?: boolean },
  countryOptions: Array<{ rate: number; country: string }>,
): T[] {
  return lines.map((line) => {
    if (line.vatRateMode === 'custom' && line.vatRateExplicitlyEntered === true) return line
    const validPreset = line.vatRateMode === 'preset'
      && countryOptions.some((candidate) => candidate.country === line.vatCountry && candidate.rate === line.vatRate)
    if (validPreset) return line
    return {
      ...line,
      vatRate: option.rate,
      vatCountry: option.country,
      vatLabel: option.label,
      vatRateMode: option.isCustom ? 'custom' : 'preset',
      vatRateExplicitlyEntered: !option.isCustom,
    }
  })
}

/** EU country names (same list as lib/countries; kept import-free for the node test harness). */
const EU_COUNTRY_NAMES: Array<{ code: string; name: string }> = [
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IT', name: 'Italy' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
]

const COUNTRY_NAME_ALIASES: Record<string, string> = {
  belgie: 'BE', belgique: 'BE', belgien: 'BE',
  nederland: 'NL', 'pays-bas': 'NL', niederlande: 'NL', holland: 'NL',
  frankrijk: 'FR', frankreich: 'FR',
  duitsland: 'DE', allemagne: 'DE', deutschland: 'DE',
  luxemburg: 'LU',
}

/**
 * The service country as a 2-letter code once the typed text names one
 * ("BE", "Belgium", "België", "Belgique"…); '' while it does not (e.g. a
 * half-typed "Bel"). The VAT lookup and the line-rate reset follow this code,
 * never every keystroke (FT2-14).
 */
export function quotationCountryKey(
  raw: string | null | undefined,
  euCountries: Array<{ code: string; name: string }> = EU_COUNTRY_NAMES,
): string {
  const text = (raw || '').trim()
  if (!text) return ''
  if (/^[A-Za-z]{2}$/.test(text)) {
    const code = text.toUpperCase() === 'EL' ? 'GR' : text.toUpperCase()
    // "BE" is a code; "Ne" is the start of "Netherlands", not Niger.
    if (text === text.toUpperCase() || euCountries.some((country) => country.code === code)) return code
    return ''
  }
  const folded = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const byName = euCountries.find((country) => country.name.toLowerCase() === folded)
  return byName?.code || COUNTRY_NAME_ALIASES[folded] || ''
}
