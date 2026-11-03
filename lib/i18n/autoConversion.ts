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
 * What the middleware knows about the roll-out:
 * - `configured`: the backend returned the admin's roll-out (authoritative);
 * - `unconfigured`: the backend says nothing is configured (authoritative):
 *   today's behaviour, auto-conversion in every country;
 * - `unknown`: no answer yet (cold isolate, timeout, outage, unusable body)
 *   and no earlier answer to fall back on. This is NOT "unconfigured".
 */
export type AutoConversionState =
  | { status: "configured"; config: AutoConversionConfig }
  | { status: "unconfigured" }
  | { status: "unknown" };

export const AUTO_CONVERSION_UNKNOWN: AutoConversionState = { status: "unknown" };
export const AUTO_CONVERSION_UNCONFIGURED: AutoConversionState = { status: "unconfigured" };

/** Parse the public endpoint body; null when it is not a usable answer. */
export function parseAutoConversionState(json: unknown): AutoConversionState | null {
  if (!json || typeof json !== "object") return null;
  const body = json as { success?: unknown; data?: unknown };
  if (body.success !== true || !body.data || typeof body.data !== "object") return null;
  const data = body.data as { configured?: unknown; enabledCountries?: unknown; defaultCountry?: unknown };
  if (data.configured === false) return AUTO_CONVERSION_UNCONFIGURED;
  if (data.configured !== true) return null;
  return {
    status: "configured",
    config: {
      enabledCountries: normalizeCountryList(data.enabledCountries),
      defaultCountry:
        normalizeCountryCode(data.defaultCountry) ?? AUTO_CONVERSION_FALLBACK_DEFAULT_COUNTRY,
    },
  };
}

/** The roll-out config from a body, or null when not configured/unusable. */
export function parseAutoConversionResponse(json: unknown): AutoConversionConfig | null {
  const state = parseAutoConversionState(json);
  return state?.status === "configured" ? state.config : null;
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

export interface RequestCountryDecision extends EffectiveCountry {
  /**
   * True when the decision follows an authoritative answer; only then may the
   * middleware rewrite the geo cookies. While the config is unknown the
   * previous decision is kept and nothing is persisted.
   */
  authoritative: boolean;
}

/**
 * Country for one request. With an authoritative state this is
 * resolveEffectiveCountry (roll-out countries keep their geo country, others
 * get the default; unconfigured = everyone keeps their geo country). With an
 * unknown state the visitor's geo country is never granted on its own:
 * - the previous decision (the `fixera_geo_country` cookie the middleware
 *   wrote from an authoritative answer) is kept, so a cold or slow isolate
 *   does not flip a visitor between behaviours;
 * - without one, the platform fallback default country is used for this
 *   request only.
 */
export function resolveRequestCountry(
  geoCountry: string | undefined,
  previousCountry: string | undefined,
  state: AutoConversionState,
): RequestCountryDecision {
  if (state.status === "configured") {
    return { ...resolveEffectiveCountry(geoCountry, state.config), authoritative: true };
  }
  if (state.status === "unconfigured") {
    return { ...resolveEffectiveCountry(geoCountry, null), authoritative: true };
  }
  const previous = normalizeCountryCode(previousCountry);
  const country = previous ?? AUTO_CONVERSION_FALLBACK_DEFAULT_COUNTRY;
  return { country, autoConverted: country === normalizeCountryCode(geoCountry), authoritative: false };
}
