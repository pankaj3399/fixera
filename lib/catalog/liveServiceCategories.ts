import { PUBLIC_CACHE_TAGS, PUBLIC_REVALIDATE_SECONDS } from "@/lib/publicCache";

/**
 * The live service catalog (`GET /api/service-categories/active?country=`), the same
 * source the category pages resolve their slugs against. Shared by the server layout
 * reader (lib/server/serviceCategories.ts, which adds the outage fallback) and the
 * sitemap (which must never list a slug the live catalog does not serve).
 */

export interface LiveServiceCategory {
  name: string;
  slug: string;
  icon?: string;
  /**
   * True only for the app's static outage fallback. The subnav translates
   * these known labels; names returned by the API stay untouched.
   */
  isFallback?: boolean;
  services: Array<{
    name: string;
    slug: string;
    icon?: string;
  }>;
}

const isNonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isServiceItem = (
  value: unknown,
): value is LiveServiceCategory["services"][number] =>
  typeof value === "object" &&
  value !== null &&
  isNonBlankString((value as { name?: unknown }).name) &&
  isNonBlankString((value as { slug?: unknown }).slug) &&
  ((value as { icon?: unknown }).icon === undefined ||
    typeof (value as { icon?: unknown }).icon === "string");

export const isLiveServiceCategory = (value: unknown): value is LiveServiceCategory =>
  typeof value === "object" &&
  value !== null &&
  isNonBlankString((value as { name?: unknown }).name) &&
  isNonBlankString((value as { slug?: unknown }).slug) &&
  ((value as { icon?: unknown }).icon === undefined ||
    typeof (value as { icon?: unknown }).icon === "string") &&
  Array.isArray((value as { services?: unknown }).services) &&
  (value as { services: unknown[] }).services.every(isServiceItem);

/**
 * Reads the live catalog for one country. Throws when the backend is not configured,
 * unreachable, slow, or returns something other than a valid category list; an empty
 * list is a valid answer (no active categories in that country).
 */
export async function fetchLiveServiceCategories(
  country: string,
  timeoutMs: number,
): Promise<LiveServiceCategory[]> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) throw new Error("NEXT_PUBLIC_BACKEND_URL is not set");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${backendUrl}/api/service-categories/active?country=${encodeURIComponent(country)}`,
      {
        next: { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: [PUBLIC_CACHE_TAGS.serviceCategories] },
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`Service categories request failed (${response.status})`);
    const categories: unknown = await response.json();
    if (!Array.isArray(categories) || !categories.every(isLiveServiceCategory)) {
      throw new Error("Invalid service categories response");
    }
    return categories;
  } finally {
    clearTimeout(timeoutId);
  }
}
