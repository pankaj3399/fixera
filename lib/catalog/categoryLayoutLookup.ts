/**
 * Category route lookup for `/categories/[categorySlug]` metadata/layout.
 *
 * The subnav links to the backend's live category slugs (e.g. `interior`).
 * The layout used to accept only the static marketing slugs in `data/content`
 * (e.g. `interior-services`) and called notFound() for every live slug — the
 * framework 404 reported in Final Touches Part 2.
 *
 * Only live catalog categories are real category pages: the page body
 * (feat/final-touches-2) renders the live category's services and sends every
 * other slug to `/services`. The layout follows the same rules on the server
 * so crawlers never get a 200 + self-canonical for a URL that then redirects
 * in the browser:
 * - live slug                       → render (canonical = the live slug);
 * - live slug, other casing/spacing → permanent redirect to the live slug;
 * - legacy static marketing slug    → permanent redirect to `/services`;
 * - anything else                   → 404.
 */

export interface StaticCategoryLike {
  slug: string;
}

export interface LiveCategoryLike {
  slug: string;
  name: string;
}

export interface CategoryLayoutMatch {
  /** Canonical slug for canonical URLs and breadcrumbs. */
  slug: string;
  name: string;
}

export type CategoryRouteResolution =
  | { kind: "category"; category: CategoryLayoutMatch }
  | { kind: "redirect"; to: string }
  | { kind: "not_found" };

/** Where legacy static category slugs (and the page body's unknown slugs) go. */
export const CATEGORY_FALLBACK_PATH = "/services";

const decodeSlug = (raw: unknown): string => {
  const slug = typeof raw === "string" ? raw : "";
  try {
    return decodeURIComponent(slug);
  } catch {
    // keep the raw value when it is not valid percent-encoding
    return slug;
  }
};

/** Decode, trim and lowercase a route slug; separators unified to "-". */
export function normalizeRouteSlug(raw: unknown): string {
  return decodeSlug(raw).trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/-{2,}/g, "-");
}

export function resolveCategoryRoute(
  rawSlug: unknown,
  staticCategories: readonly StaticCategoryLike[],
  liveCategories: readonly LiveCategoryLike[],
): CategoryRouteResolution {
  const slug = normalizeRouteSlug(rawSlug);
  if (!slug) return { kind: "not_found" };
  const live = liveCategories.find(
    (category) => typeof category?.slug === "string" && normalizeRouteSlug(category.slug) === slug,
  );
  if (live) {
    return decodeSlug(rawSlug) === live.slug
      ? { kind: "category", category: { slug: live.slug, name: live.name } }
      : { kind: "redirect", to: `/categories/${encodeURIComponent(live.slug)}` };
  }
  if (staticCategories.some((category) => normalizeRouteSlug(category.slug) === slug)) {
    return { kind: "redirect", to: CATEGORY_FALLBACK_PATH };
  }
  return { kind: "not_found" };
}
