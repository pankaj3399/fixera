/**
 * Shared i18n constants. Must stay free of Node/browser/React imports so it can
 * be used in middleware (edge runtime), client components and server code.
 */
export const LOCALES = ["en", "nl", "fr"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Cookie or search param that may contain a locale. */
export function isLocale(value: string | null | undefined): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? "");
}

/** Cookie holding the user's manual language choice (set for 1 year). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Cookie holding the user's manual currency choice (set for 1 year). */
export const CURRENCY_COOKIE = "NEXT_CURRENCY";

/** Request headers middleware forwards the resolved locale on (cookies are not
 * visible to the same-request server render, headers are). */
export const LOCALE_REQUEST_HEADER = "x-fixera-locale";
/** Language of the rendered document; admin stays English while the visitor's
 * locale preference (and public pages) is unchanged. */
export const DOCUMENT_LOCALE_REQUEST_HEADER = "x-fixera-document-locale";

/** Two-way Intl tags used only for formatting (nl-BE / fr-BE / en-GB style). */
export const INTL_FORMAT_LOCALES: Record<Locale, string> = {
  en: "en-GB",
  nl: "nl-BE",
  fr: "fr-BE",
};

/** OpenGraph locale per app locale. */
export const OG_LOCALES: Record<Locale, string> = {
  en: "en_US",
  nl: "nl_BE",
  fr: "fr_BE",
};

/** 1 year, matching Booking.com-style persistent preferences. */
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
