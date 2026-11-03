export interface CatalogServiceItem {
  name: string;
  slug: string;
  icon?: string;
}

export interface CatalogCategoryItem {
  name: string;
  slug: string;
  services: CatalogServiceItem[];
}

/** Normalize a category slug from the URL: decode, trim, lowercase, unify separators. */
export function normalizeCategorySlug(raw: unknown): string {
  let slug = typeof raw === "string" ? raw : "";
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // Keep the raw value when it is not valid percent-encoding.
  }
  return slug
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-{2,}/g, "-");
}

/** Find a category by normalized slug. Returns the match (canonical slug preserved). */
export function matchCatalogCategory<T extends CatalogCategoryItem>(
  categories: T[],
  rawSlug: unknown,
): T | undefined {
  const normalized = normalizeCategorySlug(rawSlug);
  if (!normalized || !Array.isArray(categories)) return undefined;
  return categories.find(
    (category) =>
      typeof category?.slug === "string" &&
      normalizeCategorySlug(category.slug) === normalized,
  );
}

/**
 * Resolve the catalog country from geolocation (middleware geo cookie) first,
 * then the browser locale region — never a hardcoded universal value. Falls
 * back to the platform home market only when no region can be derived.
 * A known market never silently switches to another country.
 */
export function resolveCatalogCountry(
  geoCountry?: string | null,
  language?: string,
  fallback = "BE",
): string {
  const geo = typeof geoCountry === "string" ? geoCountry.trim().toUpperCase() : "";
  if (geo && /^[A-Z]{2}$/.test(geo)) return geo;
  const region = languageTagRegion(language);
  return region ?? fallback;
}

/**
 * Region subtag of a BCP 47 language tag ("nl-NL" -> "NL", "zh-Hant-TW" ->
 * "TW"). Only subtags before the first singleton are considered, so
 * extension/private-use subtags such as the calendar key in
 * "en-u-ca-gregory" are never mistaken for a region.
 */
function languageTagRegion(language: unknown): string | undefined {
  if (typeof language !== "string") return undefined;
  const subtags = language.split(";")[0].trim().split(/[-_]/);
  for (let i = 1; i < subtags.length; i++) {
    const subtag = subtags[i];
    if (subtag.length === 1) break; // extension (u, t, ...) or private use (x)
    if (/^[A-Za-z]{2}$/.test(subtag)) return subtag.toUpperCase();
  }
  return undefined;
}

export const CATALOG_HOME_COUNTRY = "BE";
