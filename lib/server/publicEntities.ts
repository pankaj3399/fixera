import type { PublicProjectDto } from "@/types/project";

/**
 * Server-side reads of the public project and professional records, for the SEO HTML
 * of the entity pages and their layouts (metadata, JSON-LD). The layout and the page
 * body call the same function with the same URL, so they share one fetch per cache
 * window.
 *
 * Only the entity record is read on the server. Reviews, ratings and every other
 * secondary value load on the client, so the server does not spend the per-IP
 * review budget of the backend.
 *
 * Failures: Next 15.4.10 writes a fetch response to the data cache only when it is
 * HTTP 200 (`next/dist/server/lib/patch-fetch.js`). A 429 or 5xx is therefore not held
 * for the revalidate window. It comes back here as `unavailable` for that render only,
 * and the next render asks the backend again.
 */

export const PUBLIC_ENTITY_REVALIDATE_SECONDS = 300;
export const SITEMAP_ENTITY_REVALIDATE_SECONDS = 3600;
export const SITEMAP_ENTITY_PAGE_SIZE = 1000;
/** Per-type safety valve, below the 50,000-URL limit of a single sitemap file. */
export const SITEMAP_ENTITY_MAX_PER_TYPE = 20000;

/**
 * `found`: data loaded. `not_found`: the backend says the entity is missing or not
 * public (404/400), so the page must return a real 404. `unavailable`: the backend
 * could not answer (network, 5xx, 429); the page renders its shell and the client
 * fetches as before, rather than wrongly reporting a 404.
 */
export type EntityLookup<T> =
  | { status: "found"; data: T }
  | { status: "not_found" }
  | { status: "unavailable" };

export interface ProfessionalData {
  _id: string;
  name?: string;
  username?: string;
  profileImage?: string;
  businessInfo?: {
    description?: string;
    website?: string;
    city?: string;
    country?: string;
  };
  serviceCategories?: string[];
  hourlyRate?: number;
  currency?: string;
  createdAt?: string;
  location?: { city?: string; country?: string };
}

const backendPath = (path: string) => `${process.env.NEXT_PUBLIC_BACKEND_URL || ""}${path}`;

async function fetchPublicEntity<T>(
  path: string,
  label: string,
  pick: (json: unknown) => T | null,
): Promise<EntityLookup<T>> {
  let res: Response;
  try {
    res = await fetch(backendPath(path), {
      next: { revalidate: PUBLIC_ENTITY_REVALIDATE_SECONDS },
    });
  } catch (error) {
    console.warn(`[public-entity] ${label} unavailable: request failed`, error);
    return { status: "unavailable" };
  }
  if (res.status === 404 || res.status === 400) return { status: "not_found" };
  if (!res.ok) {
    console.warn(`[public-entity] ${label} unavailable: HTTP ${res.status}`);
    return { status: "unavailable" };
  }
  try {
    const data = pick(await res.json());
    return data ? { status: "found", data } : { status: "unavailable" };
  } catch (error) {
    console.warn(`[public-entity] ${label} unavailable: invalid response`, error);
    return { status: "unavailable" };
  }
}

/** Response envelopes of the public endpoints this module reads. */
interface ProjectEnvelope {
  success?: boolean;
  project?: PublicProjectDto;
}
interface ProfessionalEnvelope {
  success?: boolean;
  data?: { professional?: ProfessionalData };
}

export function getPublicProject(id: string): Promise<EntityLookup<PublicProjectDto>> {
  return fetchPublicEntity<PublicProjectDto>(
    `/api/public/projects/${encodeURIComponent(id)}`,
    "project",
    (json) => {
      const body = json as ProjectEnvelope | null;
      return body?.success && body.project ? body.project : null;
    },
  );
}

/** Public profile record only (`GET /api/public/professionals/:id`). No reviews or ratings. */
export function getPublicProfessional(id: string): Promise<EntityLookup<ProfessionalData>> {
  return fetchPublicEntity<ProfessionalData>(
    `/api/public/professionals/${encodeURIComponent(id)}`,
    "professional",
    (json) => {
      const body = json as ProfessionalEnvelope | null;
      return body?.success && body.data?.professional ? body.data.professional : null;
    },
  );
}

export interface SitemapEntity {
  id: string;
  updatedAt: string | null;
}

export type SitemapEntityType = "project" | "professional";

/**
 * Pages through `GET /api/public/sitemap/entities`. Throws when a page fails, so the
 * caller can log it and keep the rest of the sitemap.
 */
export async function fetchSitemapEntities(type: SitemapEntityType): Promise<SitemapEntity[]> {
  const items: SitemapEntity[] = [];
  const maxPages = Math.ceil(SITEMAP_ENTITY_MAX_PER_TYPE / SITEMAP_ENTITY_PAGE_SIZE);
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await fetch(
      backendPath(
        `/api/public/sitemap/entities?type=${type}&page=${page}&limit=${SITEMAP_ENTITY_PAGE_SIZE}`,
      ),
      { next: { revalidate: SITEMAP_ENTITY_REVALIDATE_SECONDS } },
    );
    if (!res.ok) {
      throw new Error(`sitemap entities (${type}) page ${page} failed with HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json?.success || !Array.isArray(json.data?.items)) {
      throw new Error(`sitemap entities (${type}) page ${page} returned an unexpected body`);
    }
    items.push(...(json.data.items as SitemapEntity[]));
    if (!json.data.pagination?.hasMore) return items;
  }
  console.warn(
    `[sitemap] ${type} entities truncated at ${SITEMAP_ENTITY_MAX_PER_TYPE}; raise the cap or add a sitemap index`,
  );
  return items;
}
