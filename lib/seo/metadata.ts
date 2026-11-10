import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALES, OG_LOCALES, isLocale, type Locale } from "@/i18n/config";
import { SITE_NAME, SITE_DESCRIPTION, OG_DEFAULT_IMAGE, absoluteUrl, siteUrl } from "./site";

export interface BuildMetadataInput {
  title?: string;
  description?: string;
  path: string;
  image?: string;
  noindex?: boolean;
  type?: "website" | "article";
  keywords?: string[];
  publishedTime?: string;
  modifiedTime?: string;
  authorName?: string;
  /** Override the request locale (defaults to the active next-intl locale). */
  locale?: Locale;
}

function assembleMetadata(
  input: BuildMetadataInput,
  locale: Locale,
  defaultDescription: string,
): Metadata {
  const {
    title,
    path,
    image,
    noindex,
    type = "website",
    keywords,
    publishedTime,
    modifiedTime,
    authorName,
  } = input;

  const description = input.description || defaultDescription;
  const canonical = absoluteUrl(path);
  const ogImage = absoluteUrl(image || OG_DEFAULT_IMAGE);
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const alternateLocale = LOCALES.filter((candidate) => candidate !== locale).map(
    (candidate) => OG_LOCALES[candidate]
  );

  const metadata: Metadata = {
    title: title || SITE_NAME,
    description,
    alternates: { canonical },
    keywords,
    openGraph: {
      type,
      url: canonical,
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: fullTitle }],
      locale: OG_LOCALES[locale],
      alternateLocale,
      ...(type === "article" && publishedTime ? { publishedTime } : {}),
      ...(type === "article" && modifiedTime ? { modifiedTime } : {}),
      ...(type === "article" && authorName ? { authors: [authorName] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [ogImage],
    },
  };

  if (noindex) {
    metadata.robots = { index: false, follow: false, nocache: true };
  }

  return metadata;
}

/**
 * Locale-aware page metadata.
 *
 * The OpenGraph locale and the default description follow the active request
 * locale, so a page rendered in Dutch/French never advertises en_US metadata.
 * Canonical URLs stay locale-free (one URL per page; language is a preference,
 * not a route). Callers are `generateMetadata()` functions and can simply
 * `return buildMetadata(...)` — the promise is awaited by Next.
 */
export async function buildMetadata(input: BuildMetadataInput): Promise<Metadata> {
  const locale = input.locale ?? (await getLocale());
  const t = await getTranslations("common");
  return assembleMetadata(input, locale, t("meta.siteDescription"));
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
 * so a nl/fr request can receive en content: OpenGraph must then say en_US,
 * not the visitor's language. Unknown values defer to the request locale.
 */
export function servedContentLocale(value: string | null | undefined): Locale | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
  return isLocale(normalized) ? normalized : undefined;
}

export { siteUrl };
