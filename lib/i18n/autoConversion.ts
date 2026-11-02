/**
 * Admin-controlled geolocation "auto-conversion" roll-out (Super Admin →
 * Platform settings → Auto-conversion).
 *
 * In roll-out countries the visitor's geo country drives region/content,
 * language and currency (Booking.com style, unchanged behaviour). Every other
 * country is served as the configured default country. Manual language and
 * currency choices always win; that precedence lives in middleware.
 *
 * Pure and dependency-free so it runs in the edge middleware and in tests.
 * Wire contract: GET /api/public/auto-conversion →
 *   { success, data: { configured, enabledCountries, defaultCountry } }
 */

export interface AutoConversionConfig {
  enabledCountries: string[];
  defaultCountry: string;
}

export const AUTO_CONVERSION_FALLBACK_DEFAULT_COUNTRY = "BE";

const COUNTRY_CODE = /^[A-Z]{2}$/;

export function normalizeCountryCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const code = value.trim().toUpperCase();
  return COUNTRY_CODE.test(code) ? code : undefined;
}

export function normalizeCountryList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const code = normalizeCountryCode(entry);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/**
 * Parse the public endpoint body. Returns null when the roll-out is not
 * configured (or the body is unusable): callers then keep today's behaviour of
 * auto-converting in every country.
 */
export function parseAutoConversionResponse(json: unknown): AutoConversionConfig | null {
  if (!json || typeof json !== "object") return null;
  const body = json as { success?: unknown; data?: unknown };
  if (body.success !== true || !body.data || typeof body.data !== "object") return null;
  const data = body.data as { configured?: unknown; enabledCountries?: unknown; defaultCountry?: unknown };
  if (data.configured !== true) return null;
  return {
    enabledCountries: normalizeCountryList(data.enabledCountries),
    defaultCountry:
      normalizeCountryCode(data.defaultCountry) ?? AUTO_CONVERSION_FALLBACK_DEFAULT_COUNTRY,
  };
}

export interface EffectiveCountry {
  /** Country used for content, locale and currency defaults. */
  country: string | undefined;
  /** True when the visitor's own geo country drives the defaults. */
  autoConverted: boolean;
}

export function resolveEffectiveCountry(
  geoCountry: string | undefined,
  config: AutoConversionConfig | null,
): EffectiveCountry {
  const geo = normalizeCountryCode(geoCountry);
  if (!config) return { country: geo, autoConverted: Boolean(geo) };
  if (geo && config.enabledCountries.includes(geo)) {
    return { country: geo, autoConverted: true };
  }
  return { country: config.defaultCountry, autoConverted: false };
}
