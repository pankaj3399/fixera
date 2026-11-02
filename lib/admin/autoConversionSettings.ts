import { EU_COUNTRIES } from "@/lib/countries";
import {
  AUTO_CONVERSION_FALLBACK_DEFAULT_COUNTRY,
  normalizeCountryCode,
  normalizeCountryList,
  type AutoConversionConfig,
} from "@/lib/i18n/autoConversion";

/**
 * Admin Platform settings → Auto-conversion.
 * Wire contract (backend): GET /api/admin/platform-settings → data.autoConversion
 * ({ enabledCountries, defaultCountry } or absent when never configured);
 * PATCH /api/admin/platform-settings/auto-conversion with the same shape →
 * { success, data: { enabledCountries, defaultCountry } }.
 */

export interface RolloutCountryOption {
  code: string;
  name: string;
  flag: string;
}

const flagFor = (code: string) =>
  String.fromCodePoint(...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));

/** EU members plus the other European markets the currency layer supports. */
const EXTRA_COUNTRIES: Array<[string, string]> = [
  ["CH", "Switzerland"],
  ["GB", "United Kingdom"],
  ["IS", "Iceland"],
  ["LI", "Liechtenstein"],
  ["MC", "Monaco"],
  ["NO", "Norway"],
];

export const ROLLOUT_COUNTRY_OPTIONS: RolloutCountryOption[] = [
  ...EU_COUNTRIES.map(({ code, name, flag }) => ({ code, name, flag })),
  ...EXTRA_COUNTRIES.map(([code, name]) => ({ code, name, flag: flagFor(code) })),
].sort((a, b) => a.name.localeCompare(b.name, "en"));

export interface AutoConversionDraft extends AutoConversionConfig {
  /** False until the backend has stored a roll-out. */
  configured: boolean;
}

export function hydrateAutoConversion(raw: unknown): AutoConversionDraft {
  if (!raw || typeof raw !== "object") {
    return { configured: false, enabledCountries: [], defaultCountry: AUTO_CONVERSION_FALLBACK_DEFAULT_COUNTRY };
  }
  const value = raw as { enabledCountries?: unknown; defaultCountry?: unknown };
  return {
    configured: true,
    enabledCountries: normalizeCountryList(value.enabledCountries),
    defaultCountry: normalizeCountryCode(value.defaultCountry) ?? AUTO_CONVERSION_FALLBACK_DEFAULT_COUNTRY,
  };
}

export function toggleRolloutCountry(list: string[], code: string, enabled: boolean): string[] {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return list;
  const without = list.filter((entry) => entry !== normalized);
  return enabled ? [...without, normalized].sort() : without;
}

/** Returns a user-facing problem, or null when the draft can be saved. */
export function validateAutoConversionDraft(draft: AutoConversionConfig): string | null {
  if (!normalizeCountryCode(draft.defaultCountry)) return "Choose a default country.";
  if (draft.enabledCountries.some((code) => !normalizeCountryCode(code))) {
    return "Roll-out countries must be ISO 3166-1 alpha-2 codes.";
  }
  return null;
}

export function buildAutoConversionPayload(draft: AutoConversionConfig): AutoConversionConfig {
  return {
    enabledCountries: normalizeCountryList(draft.enabledCountries).sort(),
    defaultCountry: normalizeCountryCode(draft.defaultCountry) ?? AUTO_CONVERSION_FALLBACK_DEFAULT_COUNTRY,
  };
}
