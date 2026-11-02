/**
 * Category route lookup for `/categories/[categorySlug]` metadata/layout.
 *
 * The subnav links to the backend's live category slugs (e.g. `interior`),
 * while the layout used to accept only the static marketing slugs in
 * `data/content` (e.g. `interior-services`) and called notFound() for every
 * live slug — the framework 404 reported in Final Touches Part 2. A slug is
 * now valid when it matches either source.
 */

export interface StaticCategoryLike {
  slug: string;
  name: string;
  description?: string;
}

export interface LiveCategoryLike {
  slug: string;
  name: string;
}

export interface CategoryLayoutMatch {
  /** Canonical slug for canonical URLs and breadcrumbs. */
  slug: string;
  name: string;
  description?: string;
  source: "static" | "live";
}

/** Decode, trim and lowercase a route slug; separators unified to "-". */
export function normalizeRouteSlug(raw: unknown): string {
  let slug = typeof raw === "string" ? raw : "";
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // keep the raw value when it is not valid percent-encoding
  }
  return slug.trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/-{2,}/g, "-");
}

export function findCategoryForLayout(
  rawSlug: unknown,
  staticCategories: readonly StaticCategoryLike[],
  liveCategories: readonly LiveCategoryLike[],
): CategoryLayoutMatch | null {
  const slug = normalizeRouteSlug(rawSlug);
  if (!slug) return null;
  const fixed = staticCategories.find((category) => normalizeRouteSlug(category.slug) === slug);
  if (fixed) {
    return { slug: fixed.slug, name: fixed.name, description: fixed.description, source: "static" };
  }
  const live = liveCategories.find(
    (category) => typeof category?.slug === "string" && normalizeRouteSlug(category.slug) === slug,
  );
  return live ? { slug: live.slug, name: live.name, source: "live" } : null;
}
