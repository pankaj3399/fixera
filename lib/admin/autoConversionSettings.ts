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

/** Assigned ISO 3166-1 alpha-2 codes: https://www.iso.org/obp/ui/#search/code/ */
const ASSIGNED_COUNTRY_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS
MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS
RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW
TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`.trim().split(/\s+/);
const assignedCountries = new Set(ASSIGNED_COUNTRY_CODES);
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

/** All assigned countries are editable, including stored non-European roll-outs. */
export const ROLLOUT_COUNTRY_OPTIONS: RolloutCountryOption[] = ASSIGNED_COUNTRY_CODES.map((code) => ({
  code,
  name: EU_COUNTRIES.find((country) => country.code === code)?.name ?? countryNames.of(code) ?? code,
  flag: flagFor(code),
})).sort((a, b) => a.name.localeCompare(b.name, "en"));

const isAssignedCountry = (code: string) => assignedCountries.has(normalizeCountryCode(code) ?? "");

/** A complete settings value, rather than a partial or malformed success response. */
export function isAutoConversionConfig(value: unknown): value is AutoConversionConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const config = value as AutoConversionConfig;
  return typeof config.defaultCountry === "string" && isAssignedCountry(config.defaultCountry) &&
    Array.isArray(config.enabledCountries) && config.enabledCountries.every((code) => typeof code === "string" && isAssignedCountry(code));
}

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
  if (!isAssignedCountry(draft.defaultCountry)) return "Choose a default country.";
  if (draft.enabledCountries.some((code) => !isAssignedCountry(code))) {
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
 * page supplies `initial` only from a settings GET, never an unrelated PUT
 * response. A refreshed initial value must not wipe a dirty draft.
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

/** Adopt a successful save only if the current draft is still the one submitted. */
export function savedAutoConversionCard(
  state: AutoConversionCardState,
  saved: unknown,
  submitted: AutoConversionDraft = state.draft,
): AutoConversionCardState {
  if (state.draft !== submitted) return { ...state, dirty: true };
  return { draft: hydrateAutoConversion(saved), dirty: false, source: state.source };
}
