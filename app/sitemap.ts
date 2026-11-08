import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";
import { absoluteUrl } from "@/lib/seo/site";
import { localeAlternateUrls, localizedPath } from "@/lib/seo/localeUrls";
import { publicListSitemapEntries, type CmsContentType } from "@/lib/cms";
import { serviceCategories } from "@/data/content";
import {
  SITEMAP_ENTITY_CHUNK_SIZE,
  SITEMAP_ENTITY_MAX_CHUNKS,
  countSitemapEntities,
  fetchSitemapEntityChunk,
  type SitemapEntityType,
} from "@/lib/server/publicEntities";

export const revalidate = 3600;

type Sitemap = MetadataRoute.Sitemap;
type Entry = Sitemap[number];

/**
 * Only routes that exist and are meant to be indexed. `/categories` and `/projects`
 * have no index page (they 404), and `/search` is a query-driven results page, so
 * none of them are listed. Static routes carry no `lastModified`: a build time is
 * not a real modification date.
 */
const STATIC_ROUTES: Array<{ path: string; changeFrequency: Entry["changeFrequency"]; priority: number }> = [
  { path: "/", changeFrequency: "daily", priority: 1.0 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/blog", changeFrequency: "daily", priority: 0.8 },
  { path: "/news", changeFrequency: "daily", priority: 0.8 },
  { path: "/faq", changeFrequency: "weekly", priority: 0.7 },
  { path: "/services", changeFrequency: "weekly", priority: 0.8 },
  { path: "/professionals", changeFrequency: "daily", priority: 0.7 },
  { path: "/join", changeFrequency: "monthly", priority: 0.6 },
];

const RESERVED_POLICY_SLUGS: Record<string, string> = {
  about: "/about",
  "privacy-policy": "/privacy-policy",
};

const CMS_PATH_PREFIX = {
  blog: (slug: string) => `/blog/${slug}`,
  news: (slug: string) => `/news/${slug}`,
  landing: (slug: string) => `/pages/${slug}`,
  policy: (slug: string) => RESERVED_POLICY_SLUGS[slug] || `/pages/${slug}`,
} satisfies Partial<Record<CmsContentType, (slug: string) => string>>;

const ENTITY_PATH_PREFIX: Record<SitemapEntityType, string> = {
  project: "/projects",
  professional: "/professional",
};

const ENTITY_TYPES: readonly SitemapEntityType[] = ["project", "professional"];

const STATIC_ROUTE_PATHS = new Set<string>(STATIC_ROUTES.map((r) => r.path));

/**
 * Sitemap index layout (numeric ids, so `/sitemap/<id>.xml` never changes meaning):
 * - 0: static pages, service pages, categories and CMS pages.
 * - 1..MAX: project chunks; MAX+1..2*MAX: professional chunks (fixed slots).
 * Each entity chunk lists at most SITEMAP_ENTITY_CHUNK_SIZE entities in each language,
 * so no file comes near the 50,000-URL limit even at the per-type cap.
 */
const STATIC_SITEMAP_ID = 0;

function entitySitemapId(type: SitemapEntityType, chunk: number): number {
  const typeOffset = type === "project" ? 0 : SITEMAP_ENTITY_MAX_CHUNKS;
  return typeOffset + chunk;
}

function parseSitemapId(id: number):
  | { kind: "static" }
  | { kind: "entities"; type: SitemapEntityType; chunk: number }
  | null {
  if (id === STATIC_SITEMAP_ID) return { kind: "static" };
  if (!Number.isInteger(id) || id < 1 || id > SITEMAP_ENTITY_MAX_CHUNKS * 2) return null;
  const type: SitemapEntityType = id <= SITEMAP_ENTITY_MAX_CHUNKS ? "project" : "professional";
  const chunk = id - (type === "project" ? 0 : SITEMAP_ENTITY_MAX_CHUNKS);
  return { kind: "entities", type, chunk };
}

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/**
 * One entry per language, each with the same hreflang alternates. The unprefixed URL is
 * the x-default alternate; it is not listed on its own.
 */
function localizedEntries(
  path: string,
  fields: Pick<Entry, "changeFrequency" | "priority" | "lastModified">,
): Entry[] {
  const languages = localeAlternateUrls(path);
  return LOCALES.map((locale) => ({
    url: absoluteUrl(localizedPath(locale, path)),
    ...fields,
    alternates: { languages },
  }));
}

/** Keeps one entry per URL, with the most recent lastModified (CMS translations share slugs). */
function dedupeByUrl(entries: Sitemap): Sitemap {
  const byUrl = new Map<string, Entry>();
  for (const entry of entries) {
    const existing = byUrl.get(entry.url);
    if (!existing) {
      byUrl.set(entry.url, entry);
      continue;
    }
    const existingTime = existing.lastModified ? new Date(existing.lastModified).getTime() : 0;
    const entryTime = entry.lastModified ? new Date(entry.lastModified).getTime() : 0;
    if (entryTime > existingTime) byUrl.set(entry.url, entry);
  }
  return [...byUrl.values()];
}

async function staticSitemap(): Promise<Sitemap> {
  const entries: Sitemap = [];

  for (const r of STATIC_ROUTES) {
    entries.push(...localizedEntries(r.path, { changeFrequency: r.changeFrequency, priority: r.priority }));
  }

  for (const cat of serviceCategories) {
    entries.push(
      ...localizedEntries(`/categories/${cat.slug}`, { changeFrequency: "weekly", priority: 0.6 }),
    );
    for (const sub of cat.subCategories || []) {
      for (const svc of sub.services || []) {
        entries.push(
          ...localizedEntries(`/services/${svc.id}`, { changeFrequency: "weekly", priority: 0.7 }),
        );
      }
    }
  }

  try {
    let page = 1;
    while (true) {
      const { items, pagination } = await publicListSitemapEntries({ page });
      for (const item of items) {
        const pathBuilder = CMS_PATH_PREFIX[item.type as keyof typeof CMS_PATH_PREFIX];
        if (!pathBuilder) continue;
        const path = pathBuilder(item.slug);
        if (STATIC_ROUTE_PATHS.has(path)) continue;
        entries.push(
          ...localizedEntries(path, {
            lastModified: toDate(item.updatedAt || item.publishedAt),
            changeFrequency: item.type === "blog" || item.type === "news" ? "weekly" : "monthly",
            priority: item.type === "blog" || item.type === "news" ? 0.7 : 0.5,
          }),
        );
      }
      if (!pagination.hasMore) break;
      page += 1;
    }
  } catch (err) {
    console.error(
      "[sitemap] CMS fetch failed; blog, news and landing URLs are omitted from this sitemap until the next successful build. event=sitemap.cms.fetch_failure",
      err
    );
  }

  return dedupeByUrl(entries);
}

async function entitySitemap(type: SitemapEntityType, chunk: number): Promise<Sitemap> {
  try {
    const rows = await fetchSitemapEntityChunk(type, chunk);
    const entries: Sitemap = [];
    for (const row of rows) {
      entries.push(
        ...localizedEntries(`${ENTITY_PATH_PREFIX[type]}/${encodeURIComponent(row.id)}`, {
          lastModified: toDate(row.updatedAt),
          changeFrequency: "weekly",
          priority: 0.6,
        }),
      );
    }
    return dedupeByUrl(entries);
  } catch (err) {
    // Only this file is dropped; the static file and the other chunks are unaffected.
    console.error(
      `[sitemap] ${type} entity chunk ${chunk} failed; its URLs are omitted from this sitemap. event=sitemap.entities.fetch_failure type=${type}`,
      err,
    );
    return [];
  }
}

/**
 * Lists the static sitemap plus one file per entity chunk that has entities. A type that
 * cannot be counted contributes no chunks (logged), and the static file is still served.
 */
export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  const plan: Array<{ id: number }> = [{ id: STATIC_SITEMAP_ID }];
  for (const type of ENTITY_TYPES) {
    let count = 0;
    try {
      count = await countSitemapEntities(type);
    } catch (err) {
      console.error(
        `[sitemap] ${type} entity count failed; ${type} detail URLs are omitted from this sitemap index. event=sitemap.entities.fetch_failure type=${type}`,
        err,
      );
    }
    const chunks = Math.ceil(count / SITEMAP_ENTITY_CHUNK_SIZE);
    for (let chunk = 1; chunk <= chunks; chunk += 1) {
      plan.push({ id: entitySitemapId(type, chunk) });
    }
  }
  return plan;
}

export default async function sitemap({ id }: { id: number }): Promise<Sitemap> {
  const target = parseSitemapId(Number(id));
  if (!target) return [];
  if (target.kind === "static") return staticSitemap();
  return entitySitemap(target.type, target.chunk);
}
