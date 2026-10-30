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
  const match =
    typeof language === "string"
      ? language.match(/[-_]([A-Za-z]{2})(?:[-_;]|$)/)
      : null;
  const region = match?.[1]?.toUpperCase();
  return region && /^[A-Z]{2}$/.test(region) ? region : fallback;
}

export const CATALOG_HOME_COUNTRY = "BE";
