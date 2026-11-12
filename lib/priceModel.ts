/** Price-model tokens with translations (booking details and dashboard tables). */
export const PRICE_MODEL_KEYS = ["fixed", "unit", "rfq", "hour", "day", "meter", "m2", "room"] as const
export type PriceModelKey = (typeof PRICE_MODEL_KEYS)[number]

/**
 * Maps a recorded price model to its translation key. The backend sends a token,
 * but projects store the service configuration's pricing option name ("Fixed
 * Price", "Price per m²") as free text, and older records may still carry it or
 * an option type (fixed_price/price_per_unit). Mirrors the backend's
 * normalizePriceModel (fixera-server src/utils/bookingDetails/overviewRows.ts).
 * Null when the text names no known model, so the caller shows it as recorded.
 */
export function priceModelKey(value: string | null | undefined): PriceModelKey | null {
  if (typeof value !== "string") return null
  const text = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
  if (!text) return null
  if ((PRICE_MODEL_KEYS as readonly string[]).includes(text)) return text as PriceModelKey
  if (/\b(rfq|quote|quotation|request)\b|offerte|devis/.test(text)) return "rfq"
  if (/\b(fixed|total|flat|fixe)\b|vaste|forfait/.test(text)) return "fixed"
  if (/\b(hour|hours|hourly|uur)\b|heure/.test(text)) return "hour"
  if (/\b(day|days|daily|dag)\b|jour/.test(text)) return "day"
  if (/m²|\bm2\b|square met/.test(text)) return "m2"
  if (/\b(room|rooms|kamer)\b|pièce/.test(text)) return "room"
  if (/\b(metre|meter|linear|lineair)\b|mètre/.test(text)) return "meter"
  if (/\b(unit|per)\b|eenheid|unité/.test(text)) return "unit"
  return null
}
