import type { Metadata } from "next";
import { LOCALES, OG_LOCALES, type Locale } from "@/i18n/config";
import { SITE_NAME, OG_DEFAULT_IMAGE, absoluteUrl } from "./site";
import {
  isLocalizableRoute,
  localeAlternateUrls,
  localizedPath,
} from "./localeUrls";

/**
 * Pure metadata assembly (no next-intl or request APIs), so it can be unit tested.
 * `buildMetadata` in ./metadata.ts resolves the locale and URL prefix, then calls this.
 */

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

/**
 * Builds the page metadata for one request.
 *
 * `urlLocale` is the language prefix of the request URL (`/nl/about` → `nl`), or
 * undefined for an unprefixed URL. For a localizable route:
 * - a prefixed request gets a canonical of its own prefixed URL;
 * - an unprefixed request keeps its unprefixed canonical (it is the negotiated page);
 * - both carry `alternates.languages` with en, nl and fr (prefixed) and x-default.
 * Noindex pages and routes without a prefixed twin get a plain canonical.
 */
export function assembleMetadata(
  input: BuildMetadataInput,
  locale: Locale,
  defaultDescription: string,
  urlLocale?: Locale,
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
  const localizable = isLocalizableRoute(path);
  const canonical = absoluteUrl(
    urlLocale && localizable ? localizedPath(urlLocale, path) : path,
  );
  const alternates: NonNullable<Metadata["alternates"]> = { canonical };
  if (localizable && !noindex) alternates.languages = localeAlternateUrls(path);
  const ogImage = absoluteUrl(image || OG_DEFAULT_IMAGE);
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const alternateLocale = LOCALES.filter((candidate) => candidate !== locale).map(
    (candidate) => OG_LOCALES[candidate]
  );

  const metadata: Metadata = {
    title: title || SITE_NAME,
    description,
    alternates,
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
