import { LOCALES, type Locale, isLocale } from "@/i18n/config";
import { absoluteUrl } from "./site";

/**
 * Language-prefixed public URLs (`/en/about`, `/nl/about`, `/fr/about`).
 *
 * Pure helpers shared by middleware (edge runtime), metadata, sitemap, robots and
 * the client link/switcher code. No Node, React or next-intl imports.
 *
 * Middleware rewrites an allowlisted public route under a language prefix to the
 * existing route (`/nl/about` serves `app/(pages)/about`) and forces the locale for
 * that request. Unprefixed URLs keep the negotiated locale and act as x-default.
 */

/**
 * Set by middleware on a language-prefixed request, to the prefix locale. Absent
 * otherwise. Any client-supplied value is removed before middleware sets its own.
 */
export const URL_LOCALE_REQUEST_HEADER = "x-fixera-url-locale";

/** Public routes that exist under every language prefix, as route paths (no group names). */
const STATIC_LOCALIZED_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/about",
  "/blog",
  "/faq",
  "/join",
  "/news",
  "/privacy-policy",
  "/professionals",
  "/services",
]);

interface SegmentRule {
  /** The section, e.g. `/projects` for `/projects/[id]`. */
  section: string;
  /**
   * Static siblings of the dynamic segment in the same folder. They must not be read as
   * an id, or `/nl/projects/create` would serve the private create page under a prefix.
   */
  reserved: ReadonlySet<string>;
}

const SEGMENT_RULES: readonly SegmentRule[] = [
  { section: "/blog", reserved: new Set() },
  { section: "/news", reserved: new Set() },
  { section: "/pages", reserved: new Set() },
  { section: "/services", reserved: new Set() },
  { section: "/categories", reserved: new Set() },
  { section: "/projects", reserved: new Set(["create"]) },
  {
    section: "/professional",
    reserved: new Set(["earnings", "onboarding", "projects", "stripe", "support"]),
  },
];

/**
 * Decodes one path segment, or returns null for malformed percent-encoding. A malformed
 * segment is never localizable, so it cannot reach a route it was not meant for.
 */
function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** True when `path` (no language prefix, no query) is a public route that has a prefixed twin. */
export function isLocalizableRoute(path: string): boolean {
  if (STATIC_LOCALIZED_PATHS.has(path)) return true;
  const match = /^\/([^/]+)\/([^/]+)$/.exec(path);
  if (!match) return false;
  const section = `/${match[1]}`;
  // Reserved names are compared decoded, so `%63reate` is the same route as `create`.
  const slug = decodeSegment(match[2]);
  if (slug === null) return false;
  const rule = SEGMENT_RULES.find((candidate) => candidate.section === section);
  return rule !== undefined && !rule.reserved.has(slug);
}

const LOCALE_PREFIX = new RegExp(`^/(${LOCALES.join("|")})(?=/|$)(.*)$`);

/** Splits a leading `/en`, `/nl` or `/fr` off a pathname. `/nl` gives path `/`. */
export function splitLocalePrefix(pathname: string): { locale: Locale; path: string } | null {
  const match = LOCALE_PREFIX.exec(pathname);
  if (!match || !isLocale(match[1])) return null;
  return { locale: match[1], path: match[2] || "/" };
}

/**
 * The internal route a request should serve when it is a language-prefixed public page,
 * otherwise null. Private, auth, admin and unknown prefixed paths return null, so they
 * are not rewritten and are not reachable under a prefix.
 */
export function resolveLocalizedRequest(pathname: string): { locale: Locale; path: string } | null {
  const split = splitLocalePrefix(pathname);
  return split && isLocalizableRoute(split.path) ? split : null;
}

/** `/about` in `nl` is `/nl/about`; the home page is `/nl`, without a trailing slash. */
export function localizedPath(locale: Locale, path: string): string {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

export type HreflangKey = Locale | "x-default";

/**
 * Absolute hreflang map for one public route: each prefixed language URL, and the
 * unprefixed URL as x-default (the negotiated page).
 */
export function localeAlternateUrls(path: string): Record<HreflangKey, string> {
  return {
    en: absoluteUrl(localizedPath("en", path)),
    nl: absoluteUrl(localizedPath("nl", path)),
    fr: absoluteUrl(localizedPath("fr", path)),
    "x-default": absoluteUrl(path),
  };
}

/**
 * The same public page in another language, for the language switcher. Keeps the query
 * and hash, drops a stale `lang` parameter. Null when the URL is not a language-prefixed
 * public page, so the caller keeps the cookie-based behaviour.
 */
export function switchLocaleInUrl(relativeUrl: string, locale: Locale): string | null {
  const parsed = new URL(relativeUrl, "http://fixera.invalid");
  const current = resolveLocalizedRequest(parsed.pathname);
  if (!current) return null;
  parsed.searchParams.delete("lang");
  return `${localizedPath(locale, current.path)}${parsed.search}${parsed.hash}`;
}

/**
 * Keeps a same-site link on a language-prefixed page in its language. A localizable
 * route without a prefix gets the current locale; anything else is returned unchanged.
 */
export function keepLocaleInUrl(relativeUrl: string, locale: Locale): string {
  const parsed = new URL(relativeUrl, "http://fixera.invalid");
  if (splitLocalePrefix(parsed.pathname) || !isLocalizableRoute(parsed.pathname)) {
    return relativeUrl;
  }
  return `${localizedPath(locale, parsed.pathname)}${parsed.search}${parsed.hash}`;
}
