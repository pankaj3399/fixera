import { isLocale, type Locale } from "@/i18n/config";
import { localizedPath } from "@/lib/seo/localeUrls";

/**
 * Request context carried in the first path segment of every page route
 * (`app/[ctx]/...`).
 *
 * Middleware resolves the visitor's locale, content country and URL shape, then
 * rewrites the page request to `/<ctx>/<path>`. Pages read it from `params`
 * instead of request headers or cookies, so a public page renders the same HTML
 * for everyone with the same context and can be cached (ISR) per context.
 *
 * Format: `<locale>-<country>-<mode>[~<page>[~<tag>]]`, e.g. `nl-BE-p`.
 * - locale:  en | nl | fr (the rendered language)
 * - country: content country (ISO 3166-1 alpha-2), or `00` when unknown
 * - mode:    `p` = the visible URL has a language prefix (`/nl/about`; affects the
 *            canonical URL), `u` = unprefixed, `a` = admin area (unprefixed, document
 *            language English)
 * - `~<page>~<tag>`: blog/news index pagination and tag filter (base64url), which
 *   would otherwise be `searchParams` and make the index dynamic.
 *
 * Pure: shared by middleware (edge runtime), server code and client hooks.
 */

export type RouteContextMode = "p" | "u" | "a";

export interface RouteListing {
  /** 1-based page number. */
  page: number;
  /** Tag filter, if any. */
  tag?: string;
}

export interface RouteContext {
  locale: Locale;
  /** Content country for CMS/catalog reads; undefined when unknown. */
  country?: string;
  mode: RouteContextMode;
  /** Blog/news index listing (absent means page 1, no tag). */
  listing?: RouteListing;
}

const UNKNOWN_COUNTRY = "00";
/** Keeps the encoded segment well below file-name limits of the ISR cache. */
export const MAX_LISTING_TAG_BYTES = 150;
const ROUTE_CONTEXT_PATTERN =
  /^(en|nl|fr)-([A-Z]{2}|00)-([pua])(?:~([1-9][0-9]{0,5})(?:~([A-Za-z0-9_-]{1,200}))?)?$/;

function encodeTag(tag: string): string {
  const bytes = new TextEncoder().encode(tag);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeTag(encoded: string): string | undefined {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes) || undefined;
  } catch {
    return undefined;
  }
}

/** Blog/news listing from `?page=&tag=`, with the index page's own parsing rules. */
export function listingFromSearchParams(searchParams: URLSearchParams): RouteListing | undefined {
  const page = Math.min(999_999, Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1));
  const rawTag = searchParams.get("tag") || undefined;
  const tag =
    rawTag && new TextEncoder().encode(rawTag).length <= MAX_LISTING_TAG_BYTES ? rawTag : undefined;
  return page === 1 && !tag ? undefined : { page, tag };
}

export function formatRouteContext(context: RouteContext): string {
  const country = context.country && /^[A-Z]{2}$/.test(context.country) ? context.country : UNKNOWN_COUNTRY;
  let segment = `${context.locale}-${country}-${context.mode}`;
  if (context.listing) {
    segment += `~${context.listing.page}`;
    if (context.listing.tag) segment += `~${encodeTag(context.listing.tag)}`;
  }
  return segment;
}

/** Parses a `[ctx]` segment value; null when it is not one. */
export function parseRouteContext(segment: string | null | undefined): RouteContext | null {
  if (!segment) return null;
  let value = segment;
  // Route params may arrive percent-encoded; the format itself never needs it.
  if (value.includes("%")) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  const match = ROUTE_CONTEXT_PATTERN.exec(value);
  if (!match || !isLocale(match[1])) return null;
  const context: RouteContext = {
    locale: match[1],
    country: match[2] === UNKNOWN_COUNTRY ? undefined : match[2],
    mode: match[3] as RouteContextMode,
  };
  if (match[4]) {
    const tag = match[5] ? decodeTag(match[5]) : undefined;
    if (match[5] && !tag) return null;
    context.listing = { page: Number(match[4]), tag };
  }
  return context;
}

/** True when the first segment of `pathname` is a route context (an internal path). */
export function hasRouteContextPrefix(pathname: string): boolean {
  const first = pathname.split("/")[1];
  return parseRouteContext(first) !== null;
}

/** Locale of the visible URL's language prefix (`/nl/about`), if it has one. */
export function urlLocaleOf(context: RouteContext): Locale | undefined {
  return context.mode === "p" ? context.locale : undefined;
}

/** `<html lang>`: admin pages are English-only, everything else follows the locale. */
export function documentLocaleOf(context: RouteContext): Locale {
  return context.mode === "a" ? "en" : context.locale;
}

/**
 * The pathname the visitor sees for an internal `/<ctx>/...` pathname. Server
 * renders of a rewritten page see the internal path; the browser sees the
 * visible one. Visible pathnames are returned unchanged.
 */
export function toVisiblePathname(pathname: string): string {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  const context = match ? parseRouteContext(match[1]) : null;
  if (!match || !context) return pathname;
  const rest = match[2] || "/";
  return context.mode === "p" ? localizedPath(context.locale, rest) : rest;
}
