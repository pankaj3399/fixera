import type { Metadata } from "next";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { SITE_DESCRIPTION, siteUrl } from "./site";
import { URL_LOCALE_REQUEST_HEADER } from "./localeUrls";
import { assembleMetadata, type BuildMetadataInput } from "./metadataAssembly";

export type { BuildMetadataInput } from "./metadataAssembly";
export { assembleMetadata } from "./metadataAssembly";

/**
 * Locale-aware page metadata.
 *
 * The OpenGraph locale and the default description follow the active request
 * locale, so a page rendered in Dutch/French never advertises en_US metadata.
 * The canonical follows the URL: a `/nl/...` page canonicalises to itself, and an
 * unprefixed page to itself too. Every localizable page lists its en/nl/fr twins and
 * x-default in `alternates.languages`. Callers are `generateMetadata()` functions and
 * can simply `return buildMetadata(...)` — the promise is awaited by Next.
 */
export async function buildMetadata(input: BuildMetadataInput): Promise<Metadata> {
  const locale = input.locale ?? (await getLocale());
  const t = await getTranslations("common");
  const requestHeaders = await headers();
  const urlLocaleHeader = requestHeaders.get(URL_LOCALE_REQUEST_HEADER);
  const urlLocale = isLocale(urlLocaleHeader) ? urlLocaleHeader : undefined;
  return assembleMetadata(input, locale, t("meta.siteDescription"), urlLocale);
}

/**
 * Synchronous noindex metadata (admin, auth, account pages). Admin metadata is
 * intentionally English and must also work from a static `metadata` export.
 */
export function noindexMetadata(path: string, title?: string): Metadata {
  return assembleMetadata(
    { title, path, noindex: true },
    DEFAULT_LOCALE,
    SITE_DESCRIPTION,
  );
}

/**
 * Locale of the content actually served, for `buildMetadata({ locale })`. The
 * public CMS falls back to the English document when a translation is missing,
 * so a nl/fr request (`/nl/blog/x`) can receive en content: OpenGraph must then
 * say en_US, not the visitor's language. Canonical and hreflang still follow the
 * URL (CMS translations share one slug, so `/en|nl|fr/...` are true twins).
 * Unknown values defer to the request locale.
 */
export function servedContentLocale(value: string | null | undefined): Locale | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
  return isLocale(normalized) ? normalized : undefined;
}

export { siteUrl };
