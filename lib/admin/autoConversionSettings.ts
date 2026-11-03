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

/**
 * Card state: the admin's draft plus whether it has unsaved edits. The parent
 * page hands the card a new `initial` object after every general settings
 * save (the PATCH response re-serializes autoConversion), so a prop change
 * alone must not wipe a dirty draft.
 */
export interface AutoConversionCardState {
  draft: AutoConversionDraft;
  dirty: boolean;
  /** The `initial` prop the state was last synced with. */
  source: unknown;
}

export function initAutoConversionCard(initial: unknown): AutoConversionCardState {
  return { draft: hydrateAutoConversion(initial), dirty: false, source: initial };
}

/** Same object when `initial` is unchanged; a dirty draft survives a new `initial`. */
export function syncAutoConversionCard(state: AutoConversionCardState, initial: unknown): AutoConversionCardState {
  if (state.source === initial) return state;
  if (state.dirty) return { ...state, source: initial };
  return initAutoConversionCard(initial);
}

export function editAutoConversionCard(
  state: AutoConversionCardState,
  update: (draft: AutoConversionDraft) => AutoConversionDraft,
): AutoConversionCardState {
  return { ...state, draft: update(state.draft), dirty: true };
}

/** After a successful auto-conversion save: the stored value, clean. */
export function savedAutoConversionCard(state: AutoConversionCardState, saved: unknown): AutoConversionCardState {
  return { draft: hydrateAutoConversion(saved), dirty: false, source: state.source };
}
