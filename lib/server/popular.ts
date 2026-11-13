import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  normalizePopularProjectsQuery,
  popularProjectsPath,
  withoutInlineImages,
  type PopularProject,
} from "@/lib/popularProject";
import { PUBLIC_CACHE_TAGS, PUBLIC_REVALIDATE_SECONDS } from "@/lib/publicCache";

const POPULAR_TIMEOUT_MS = 4_000;

function backendUrl(): string | null {
  return process.env.NEXT_PUBLIC_BACKEND_URL || null;
}

async function fetchJson(
  path: string,
  cacheTags: string[],
): Promise<unknown | null> {
  const base = backendUrl();
  if (!base) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), POPULAR_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${path}`, {
      next: { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: cacheTags },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error("popular fetch returned non-ok", { path, cacheTags, status: response.status });
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("popular fetch failed", { path, cacheTags, error });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

const isNonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const optionalString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

function isPopularProject(value: unknown): value is PopularProject {
  if (typeof value !== "object" || value === null) return false;
  const project = value as Record<string, unknown>;
  return (
    isNonBlankString(project._id) &&
    isNonBlankString(project.title) &&
    isNonBlankString(project.category) &&
    isNonBlankString(project.service)
  );
}

function toPopularProject(value: unknown): PopularProject | null {
  if (!isPopularProject(value)) return null;
  const professional = value.professional as Record<string, unknown> | null;
  return {
    _id: value._id,
    title: value.title,
    category: value.category,
    service: value.service,
    image: optionalString(value.image),
    location: optionalString(value.location),
    startingPrice: typeof value.startingPrice === "number" ? value.startingPrice : null,
    priceType: typeof value.priceType === "string" ? value.priceType : "rfq",
    avgRating: typeof value.avgRating === "number" ? value.avgRating : 0,
    totalReviews: typeof value.totalReviews === "number" ? value.totalReviews : 0,
    professional:
      professional && typeof professional === "object"
        ? {
            name: isNonBlankString(professional.name) ? professional.name : "Unknown",
            profileImage: optionalString(professional.profileImage),
            city: optionalString(professional.city),
            country: optionalString(professional.country),
          }
        : null,
  };
}

export const getPopularServices = cache(async function getPopularServices(limit = 5): Promise<string[]> {
  const capped = Math.min(Math.max(limit, 1), 50);
  const data = await fetchJson(
    `/api/search/popular?limit=${capped}`,
    [PUBLIC_CACHE_TAGS.popularServices],
  );
  if (!data || typeof data !== "object") return [];
  const services = (data as { services?: unknown }).services;
  if (!Array.isArray(services)) return [];
  return services
    .map((item) =>
      typeof item === "object" && item !== null
        ? (item as { name?: unknown }).name
        : null,
    )
    .filter(isNonBlankString)
    .slice(0, capped);
});

/**
 * Fetches straight from the backend (no-store) and throws on any failure, so
 * only good results reach the unstable_cache entry below.
 */
async function fetchPopularProjectsFresh(path: string): Promise<PopularProject[]> {
  const base = backendUrl();
  if (!base) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), POPULAR_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${path}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`popular fetch returned non-ok (${response.status})`);
    }
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") return [];
    const projects = (data as { projects?: unknown }).projects;
    if (!Array.isArray(projects)) return [];
    return projects.flatMap((item) => {
      const project = toPopularProject(item);
      return project ? [withoutInlineImages(project)] : [];
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Popular projects for server-rendered carousels. Some records carry inline
 * base64 `data:` images (hundreds of KB each); caching the raw response made
 * every home render read a ~700 KB Data Cache entry and ship it in the HTML.
 * The trimmed list is cached instead (same 6h revalidate, same tags, so
 * /api/cms/revalidate and tag revalidation still purge it), and the carousel
 * fetches the dropped images in the browser.
 */
const getPopularProjectsCached = cache(async function getPopularProjectsCached(
  limit: number,
  service: string,
): Promise<PopularProject[]> {
  const path = popularProjectsPath({ limit, service });
  const cacheTags = [
    PUBLIC_CACHE_TAGS.popularProjects,
    ...(service ? [`${PUBLIC_CACHE_TAGS.popularProjects}:${service}`] : []),
  ];
  try {
    return await unstable_cache(
      () => fetchPopularProjectsFresh(path),
      ["popular-projects-trimmed", path],
      { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: cacheTags },
    )();
  } catch (error) {
    console.error("popular fetch failed", { path, cacheTags, error });
    return [];
  }
});

export async function getPopularProjects(options?: {
  limit?: number;
  service?: string;
}): Promise<PopularProject[]> {
  const { limit, service } = normalizePopularProjectsQuery(options);
  return getPopularProjectsCached(limit, service);
}
