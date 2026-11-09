import type { PublicProjectDto } from "@/types/project";
import { normalizePublicProject } from "@/lib/publicProjectShape";

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
 *
 * Deadline: every backend read has a timeout. A stalled backend aborts the request and
 * gives the same `unavailable` outcome as an outage, so a page or layout still renders.
 */

export const PUBLIC_ENTITY_REVALIDATE_SECONDS = 300;
export const SITEMAP_ENTITY_REVALIDATE_SECONDS = 3600;
export const SITEMAP_ENTITY_PAGE_SIZE = 1000;
/** Per-type safety valve, below the 50,000-URL limit of a single sitemap file. */
export const SITEMAP_ENTITY_MAX_PER_TYPE = 20000;
/** Upper bound for one backend read, including reading the response body. */
export const BACKEND_READ_TIMEOUT_MS = 10_000;

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

/** Fetch with the deadline applied. Throws on network failure or timeout. */
const backendFetch = (path: string, revalidate: number) =>
  fetch(backendPath(path), {
    next: { revalidate },
    signal: AbortSignal.timeout(BACKEND_READ_TIMEOUT_MS),
  });

async function fetchPublicEntity<T>(
  path: string,
  label: string,
  pick: (json: unknown) => T | null,
): Promise<EntityLookup<T>> {
  let res: Response;
  try {
    res = await backendFetch(path, PUBLIC_ENTITY_REVALIDATE_SECONDS);
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
      // A record without a usable professional or id is treated as unavailable here.
      return body?.success ? normalizePublicProject(body.project) : null;
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

/** Entities per sitemap file. 5,000 entities in 3 languages is 15,000 URLs, under the 50,000 limit. */
export const SITEMAP_ENTITY_CHUNK_SIZE = 5000;
/** Chunks per type, from the per-type safety valve. Fixed slots keep sitemap URLs stable. */
export const SITEMAP_ENTITY_MAX_CHUNKS = SITEMAP_ENTITY_MAX_PER_TYPE / SITEMAP_ENTITY_CHUNK_SIZE;

export interface SitemapEntityPage {
  items: SitemapEntity[];
  hasMore: boolean;
  total: number;
}

/**
 * One page of `GET /api/public/sitemap/entities`. Throws on any failure or unexpected
 * body, so the caller can log it and drop only the file that needed it.
 */
export async function fetchSitemapEntityPage(
  type: SitemapEntityType,
  page: number,
): Promise<SitemapEntityPage> {
  const res = await backendFetch(
    `/api/public/sitemap/entities?type=${type}&page=${page}&limit=${SITEMAP_ENTITY_PAGE_SIZE}`,
    SITEMAP_ENTITY_REVALIDATE_SECONDS,
  );
  if (!res.ok) {
    throw new Error(`sitemap entities (${type}) page ${page} failed with HTTP ${res.status}`);
  }
  const json = await res.json();
  const total = json?.data?.pagination?.total;
  if (!json?.success || !Array.isArray(json.data?.items) || typeof total !== "number") {
    throw new Error(`sitemap entities (${type}) page ${page} returned an unexpected body`);
  }
  return {
    items: json.data.items as SitemapEntity[],
    hasMore: json.data.pagination?.hasMore === true,
    total,
  };
}

/**
 * Number of entities of a type that the sitemap may list (capped at the safety valve).
 * Logs when the cap truncates the list.
 */
export async function countSitemapEntities(type: SitemapEntityType): Promise<number> {
  const { total } = await fetchSitemapEntityPage(type, 1);
  if (total > SITEMAP_ENTITY_MAX_PER_TYPE) {
    console.warn(
      `[sitemap] ${type} entities truncated at ${SITEMAP_ENTITY_MAX_PER_TYPE}; raise the cap and add sitemap chunks`,
    );
  }
  return Math.min(total, SITEMAP_ENTITY_MAX_PER_TYPE);
}

/**
 * Entities of one chunk (1-based). A chunk covers the backend pages it needs, so a
 * sitemap file reads only its own slice of the list.
 */
export async function fetchSitemapEntityChunk(
  type: SitemapEntityType,
  chunk: number,
): Promise<SitemapEntity[]> {
  const pagesPerChunk = SITEMAP_ENTITY_CHUNK_SIZE / SITEMAP_ENTITY_PAGE_SIZE;
  const firstPage = (chunk - 1) * pagesPerChunk + 1;
  const items: SitemapEntity[] = [];
  for (let page = firstPage; page < firstPage + pagesPerChunk; page += 1) {
    const result = await fetchSitemapEntityPage(type, page);
    items.push(...result.items);
    if (!result.hasMore) break;
  }
  return items;
}
