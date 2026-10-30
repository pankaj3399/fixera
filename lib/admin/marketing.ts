import { getErrorMessage } from "@/lib/apiErrors";
import { EU_COUNTRIES } from "@/lib/countries";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export const DEFAULT_LANGUAGES: ReadonlyArray<{ code: string; label: string; countries: string[] }> = [
  { code: "en", label: "English", countries: [] },
  { code: "nl", label: "Nederlands", countries: ["BE", "NL"] },
  { code: "fr", label: "Français", countries: ["BE", "FR"] },
  { code: "de", label: "Deutsch", countries: ["DE"] },
];

export interface LanguageOption { code: string; label: string; countries: string[] }
export interface ServiceOption { key: string; label: string; countries?: string[] }

export const MARKETING_CAMPAIGN_TYPES = ["newsletter", "promotion", "reengagement", "invitation"] as const;
export type MarketingCampaignType = (typeof MARKETING_CAMPAIGN_TYPES)[number];
export const MARKETING_CAMPAIGN_TYPE_LABELS: Record<MarketingCampaignType, string> = {
  newsletter: "Newsletter",
  promotion: "Promotion",
  reengagement: "Re-engagement",
  invitation: "Invitation",
};

export const MARKETING_AUDIENCE_TYPES = ["subscribers", "both", "leads"] as const;
export type MarketingAudienceType = (typeof MARKETING_AUDIENCE_TYPES)[number];
export const MARKETING_AUDIENCE_TYPE_LABELS: Record<MarketingAudienceType, string> = {
  subscribers: "Subscribers",
  both: "Subscribers+Leads",
  leads: "Leads",
};

export const MARKETING_ROLES = ["customer", "professional"] as const;
export type MarketingRole = (typeof MARKETING_ROLES)[number];

export function campaignRoleLocked(
  audienceType: MarketingAudienceType,
  role: MarketingRole,
  roles: readonly MarketingRole[],
): boolean {
  return (audienceType === "leads" && role === "customer") ||
    (audienceType !== "subscribers" && role === "professional" && roles.includes(role)) ||
    (roles.length === 1 && roles.includes(role));
}

export function marketingCountryOptions(services: readonly ServiceOption[], retained: readonly string[] = []) {
  const countries = new Map(EU_COUNTRIES.map((country) => [country.code, `${country.name} (${country.code})`]));
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  for (const value of [...services.flatMap((service) => service.countries || []), ...retained]) {
    const code = value.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code) && !countries.has(code)) {
      countries.set(code, `${names.of(code) || code} (${code})`);
    }
  }
  return Array.from(countries, ([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const INVITATION_FOOTER_COPY: Record<string, { message: string; unsubscribe: string }> = {
  en: { message: "You received this professional invitation from Fixtract. You can stop future marketing emails at any time.", unsubscribe: "Unsubscribe" },
  nl: { message: "Je ontvangt deze professionele uitnodiging van Fixtract. Je kunt je op elk moment afmelden voor marketing-e-mails.", unsubscribe: "Uitschrijven" },
  fr: { message: "Vous recevez cette invitation professionnelle de Fixtract. Vous pouvez vous désabonner des e-mails marketing à tout moment.", unsubscribe: "Se désabonner" },
  de: { message: "Sie erhalten diese professionelle Einladung von Fixtract. Sie können Marketing-E-Mails jederzeit abbestellen.", unsubscribe: "Abmelden" },
};

export function invitationFooterCopy(locale: string) {
  return INVITATION_FOOTER_COPY[locale] || INVITATION_FOOTER_COPY.en;
}

export function normalizeAudienceType(value: unknown): MarketingAudienceType {
  return audienceTypeOrNull(value) ?? "subscribers";
}

/**
 * Missing values mean Subscribers. Recognized values are returned. Unknown
 * stored values return null so the UI can refuse to relabel them silently.
 */
export function audienceTypeOrNull(value: unknown): MarketingAudienceType | null {
  if (value === undefined || value === null) return "subscribers";
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "subscribers";
  return (MARKETING_AUDIENCE_TYPES as readonly string[]).includes(normalized)
    ? (normalized as MarketingAudienceType)
    : null;
}

export function audienceTypeLabel(value: unknown): string {
  if (value === undefined || value === null || String(value).trim() === "") {
    return MARKETING_AUDIENCE_TYPE_LABELS.subscribers;
  }
  return audienceTypeOrNull(value)
    ? MARKETING_AUDIENCE_TYPE_LABELS[value as MarketingAudienceType]
    : "Invalid audience type";
}

export function isKnownAudienceType(value: unknown): boolean {
  return audienceTypeOrNull(value) !== null;
}

export function audienceIncludesLeads(value: unknown): boolean {
  return normalizeAudienceType(value) !== "subscribers";
}

export function campaignTypeLabel(value: unknown): string {
  return (MARKETING_CAMPAIGN_TYPES as readonly string[]).includes(String(value))
    ? MARKETING_CAMPAIGN_TYPE_LABELS[value as MarketingCampaignType]
    : String(value || "Unknown");
}

export function normalizeCampaignType(value: unknown): MarketingCampaignType {
  return (MARKETING_CAMPAIGN_TYPES as readonly string[]).includes(String(value))
    ? (value as MarketingCampaignType)
    : "newsletter";
}

export function campaignTypeAllowsLeadAudience(value: unknown): boolean {
  return value === "invitation";
}

/**
 * Mirrors the server's invitation-only policy. The UI keeps a lead selection
 * visible when the type changes, then blocks save until Subscribers is chosen.
 */
export function campaignAudienceValidation(
  type: unknown,
  audienceType: unknown,
  roles: readonly string[] | undefined,
): string | null {
  const audience = normalizeAudienceType(audienceType);
  if (audience !== "subscribers" && !campaignTypeAllowsLeadAudience(type)) {
    return "Lead audiences are only available for invitation campaigns. Select Subscribers before changing this campaign type.";
  }
  if (audience !== "subscribers" && !(roles || []).includes("professional")) {
    return "Lead audiences require the professional role.";
  }
  return null;
}

export type SubscriberSyncTone = "success" | "warning";
export interface SubscriberSyncSummary {
  tone: SubscriberSyncTone;
  message: string;
  counts: {
    upserted: number;
    unsubscribed: number;
    eligibleByRole?: Record<string, number>;
    syncedByRole?: Record<string, number>;
    skippedByRole?: Record<string, number>;
  };
}

function nonNegativeCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function roleCounts(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).map(
    ([role, count]) => [role, nonNegativeCount(count)] as const,
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function roleLabel(role: string, count: number): string {
  return `${count} ${role}${count === 1 ? "" : "s"}`;
}

function roleSplit(counts: Record<string, number> | undefined): string {
  if (!counts) return "";
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  if (!entries.length) return "";
  return ` (${entries.map(([role, count]) => roleLabel(role, count)).join(", ")})`;
}

function unmatchedRoleWarnings(
  eligible: Record<string, number> | undefined,
  synced: Record<string, number> | undefined,
  skipped: Record<string, number> | undefined,
): string[] {
  const gaps: string[] = [];
  const roles = new Set([
    ...Object.keys(eligible || {}),
    ...Object.keys(synced || {}),
    ...Object.keys(skipped || {}),
  ]);
  roles.forEach((role) => {
    const skippedCount = skipped?.[role] || 0;
    const inferred = eligible && synced ? Math.max(0, (eligible[role] || 0) - (synced[role] || 0)) : 0;
    const count = Math.max(skippedCount, inferred);
    if (count > 0) gaps.push(roleLabel(role, count));
  });
  return gaps;
}

/**
 * Formats only the counts the server actually returned. Older responses have
 * just `upserted` and never get an invented professional split.
 */
export function subscriberSyncSummary(data: unknown): SubscriberSyncSummary {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const upserted = nonNegativeCount(record.upserted);
  const unsubscribed = nonNegativeCount(record.unsubscribed);
  const eligibleByRole = roleCounts(record.eligibleByRole);
  const syncedByRole = roleCounts(record.syncedByRole);
  const skippedByRole = roleCounts(record.skippedByRole);
  const syncedTotal = syncedByRole
    ? Object.values(syncedByRole).reduce((total, count) => total + count, 0)
    : upserted;
  const counts = { upserted, unsubscribed, eligibleByRole, syncedByRole, skippedByRole };
  const split = roleSplit(syncedByRole);
  const base = `Subscriber sync complete: ${syncedTotal} synced${split}, ${unsubscribed} unsubscribed.`;
  const gaps = unmatchedRoleWarnings(eligibleByRole, syncedByRole, skippedByRole);

  if (gaps.length) {
    const gapText =
      gaps.length > 1 ? `${gaps.slice(0, -1).join(", ")} and ${gaps[gaps.length - 1]}` : gaps[0];
    return {
      tone: "warning",
      message: `Subscriber sync completed with gaps: ${gapText} matched but were not synced. ${syncedTotal} synced, ${unsubscribed} unsubscribed.`,
      counts,
    };
  }

  if (!syncedByRole && eligibleByRole) {
    return {
      tone: "success",
      message: `${base} Eligible${roleSplit(eligibleByRole)}.`,
      counts,
    };
  }

  return { tone: "success", message: base, counts };
}

export function errMessage(error: unknown, fallback: string) { return getErrorMessage(error, fallback); }
export function requireApiBase() { if (!API_BASE) throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured"); return API_BASE; }
export function formatDate(value?: string | null) { return value ? new Date(value).toLocaleString() : "—"; }

export function normalizeLanguages(value: unknown): LanguageOption[] { const source = Array.isArray(value) ? value : []; const normalized = source.map((item) => { if (typeof item === "string") return { code: item, label: item.toUpperCase(), countries: [] as string[] }; if (!item || typeof item !== "object") return null; const record = item as Record<string, unknown>; const code = String(record.code || record.locale || record.key || "").toLowerCase(); return code ? { code, label: String(record.label || record.name || code.toUpperCase()), countries: Array.isArray(record.countries) ? record.countries.map(String) : [] } : null; }).filter((item): item is LanguageOption => Boolean(item)); const merged = new Map<string, LanguageOption>(DEFAULT_LANGUAGES.map((item) => [item.code, { code: item.code, label: item.label, countries: [...item.countries] }])); normalized.forEach((item) => merged.set(item.code, item)); return Array.from(merged.values()); }
export function normalizeServices(value: unknown): ServiceOption[] { const source = Array.isArray(value) ? value : []; return source.map((item) => { if (typeof item === "string") return { key: item, label: item }; if (!item || typeof item !== "object") return null; const record = item as Record<string, unknown>; const key = String(record.key || record.serviceKey || record.value || ""); return key ? { key, label: String(record.label || record.name || key), countries: Array.isArray(record.countries) ? record.countries.map(String) : undefined } : null; }).filter((item): item is ServiceOption => Boolean(item)); }
