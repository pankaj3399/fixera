/** Price-model tokens with translations (booking details and dashboard tables). */
export const PRICE_MODEL_KEYS = ["fixed", "unit", "rfq", "hour", "day", "meter", "m2", "room"] as const
export type PriceModelKey = (typeof PRICE_MODEL_KEYS)[number]

/**
 * Maps a recorded price model to its translation key. The backend sends a token,
 * but projects store the service configuration's pricing option name ("Fixed
 * Price", "Price per m²") as free text, and older records may still carry it or
 * an option type (fixed_price/price_per_unit). Mirrors the backend's
 * normalizePriceModel (fixera-server src/utils/bookingDetails/overviewRows.ts).
 * Null when the text names no known model, or names more than one (the legacy
 * combined option "Total price or m² of material"), so the caller shows it as
 * recorded.
 */
const PRICE_MODEL_PATTERNS: ReadonlyArray<readonly [PriceModelKey, RegExp]> = [
  ["rfq", /\b(rfq|quote|quotation|request)\b|offerte|devis/],
  ["fixed", /\b(fixed|total|flat|fixe)\b|vaste|forfait/],
  ["hour", /\b(hour|hours|hourly|uur)\b|heure/],
  ["day", /\b(day|days|daily|dag)\b|jour/],
  ["m2", /m²|\bm2\b|square met/],
  ["room", /\b(room|rooms|kamer)\b|pièce/],
  ["meter", /\b(metre|meter|linear|lineair)\b|mètre/],
]

export function priceModelKey(value: string | null | undefined): PriceModelKey | null {
  if (typeof value !== "string") return null
  const text = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
  if (!text) return null
  if ((PRICE_MODEL_KEYS as readonly string[]).includes(text)) return text as PriceModelKey
  let matches = PRICE_MODEL_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([key]) => key)
  // "Square metre" names the area model, not the linear one.
  if (matches.includes("m2")) matches = matches.filter((key) => key !== "meter")
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) return null
  return /\b(unit|per)\b|eenheid|unité/.test(text) ? "unit" : null
}
