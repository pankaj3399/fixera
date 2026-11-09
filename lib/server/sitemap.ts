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

type Sitemap = MetadataRoute.Sitemap;
type Entry = Sitemap[number];
type PathFields = Pick<Entry, "changeFrequency" | "priority" | "lastModified">;
interface ContentPath {
  path: string;
  fields: PathFields;
}

export interface SitemapFileRef {
  id: number;
}

export interface SitemapPlan {
  /** Every sitemap file that should exist, in index order. */
  files: SitemapFileRef[];
  /**
   * False when a count or read the plan needs failed. The index is then missing links,
   * so it must not be cached.
   */
  complete: boolean;
}

/**
 * Paths per content file. 5,000 paths in 3 languages is 15,000 URLs, under the
 * 50,000-URL limit of one sitemap file.
 */
export const SITEMAP_PATH_CHUNK_SIZE = 5000;
/** Safety valve on content paths (static, services, categories, CMS): four content files. */
export const SITEMAP_PATH_MAX_CHUNKS = 4;
export const SITEMAP_PATH_MAX = SITEMAP_PATH_CHUNK_SIZE * SITEMAP_PATH_MAX_CHUNKS;

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

const STATIC_ROUTE_PATHS = new Set<string>(STATIC_ROUTES.map((r) => r.path));

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

/**
 * Fixed numeric ids, so `/sitemap/<id>.xml` keeps its meaning:
 * - 0..3: content files (static routes, service pages, categories and CMS pages), in order.
 * - 101..104: project files, one per entity chunk (1-based chunk).
 * - 201..204: professional files.
 */
const ENTITY_ID_BASE: Record<SitemapEntityType, number> = { project: 100, professional: 200 };

type SitemapTarget =
  | { kind: "content"; index: number }
  | { kind: "entities"; type: SitemapEntityType; chunk: number };

function parseSitemapId(id: number): SitemapTarget | null {
  if (Number.isInteger(id) && id >= 0 && id < SITEMAP_PATH_MAX_CHUNKS) {
    return { kind: "content", index: id };
  }
  for (const type of ENTITY_TYPES) {
    const chunk = id - ENTITY_ID_BASE[type];
    if (Number.isInteger(chunk) && chunk >= 1 && chunk <= SITEMAP_ENTITY_MAX_CHUNKS) {
      return { kind: "entities", type, chunk };
    }
  }
  return null;
}

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const timeOf = (value: Entry["lastModified"]): number => (value ? new Date(value).getTime() : 0);

/**
 * One entry per language, each with the same hreflang alternates. The unprefixed URL is
 * the x-default alternate; it is not listed on its own.
 */
function localizedEntries(path: string, fields: PathFields): Entry[] {
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
    if (!existing || timeOf(entry.lastModified) > timeOf(existing.lastModified)) {
      byUrl.set(entry.url, entry);
    }
  }
  return [...byUrl.values()];
}

/**
 * Every content path, once, in a fixed order. Static routes, service and category pages
 * and CMS pages share this list, so the content files can be chunked by path count.
 * Throws when the CMS listing cannot be read: a partial list must never be cached.
 */
async function loadContentPaths(): Promise<ContentPath[]> {
  const byPath = new Map<string, ContentPath>();
  const add = (path: string, fields: PathFields) => {
    const existing = byPath.get(path);
    if (!existing || timeOf(fields.lastModified) > timeOf(existing.fields.lastModified)) {
      byPath.set(path, { path, fields });
    }
  };

  for (const r of STATIC_ROUTES) {
    add(r.path, { changeFrequency: r.changeFrequency, priority: r.priority });
  }
  for (const cat of serviceCategories) {
    add(`/categories/${cat.slug}`, { changeFrequency: "weekly", priority: 0.6 });
    for (const sub of cat.subCategories || []) {
      for (const svc of sub.services || []) {
        add(`/services/${svc.id}`, { changeFrequency: "weekly", priority: 0.7 });
      }
    }
  }

  let page = 1;
  while (true) {
    const { items, pagination } = await publicListSitemapEntries({ page });
    for (const item of items) {
      const pathBuilder = CMS_PATH_PREFIX[item.type as keyof typeof CMS_PATH_PREFIX];
      if (!pathBuilder) continue;
      const path = pathBuilder(item.slug);
      if (STATIC_ROUTE_PATHS.has(path)) continue;
      add(path, {
        lastModified: toDate(item.updatedAt || item.publishedAt),
        changeFrequency: item.type === "blog" || item.type === "news" ? "weekly" : "monthly",
        priority: item.type === "blog" || item.type === "news" ? 0.7 : 0.5,
      });
    }
    if (!pagination.hasMore) break;
    page += 1;
  }

  const paths = [...byPath.values()];
  if (paths.length > SITEMAP_PATH_MAX) {
    console.warn(
      `[sitemap] content paths truncated at ${SITEMAP_PATH_MAX}; raise the cap and add sitemap files. event=sitemap.paths.truncated`,
    );
  }
  return paths.slice(0, SITEMAP_PATH_MAX);
}

/**
 * Lists the sitemap files that should exist and whether the list is complete. A failed
 * count or CMS read leaves its files out and sets `complete` to false, so the index is
 * not cached and the next request tries again.
 */
export async function planSitemapFiles(): Promise<SitemapPlan> {
  const files: SitemapFileRef[] = [];
  let complete = true;

  try {
    const paths = await loadContentPaths();
    const contentFiles = Math.ceil(paths.length / SITEMAP_PATH_CHUNK_SIZE);
    for (let index = 0; index < contentFiles; index += 1) files.push({ id: index });
  } catch (err) {
    complete = false;
    console.error(
      "[sitemap] CMS fetch failed; static, service and CMS files are left out of the sitemap index until the next request. event=sitemap.cms.fetch_failure",
      err,
    );
  }

  for (const type of ENTITY_TYPES) {
    let count = 0;
    try {
      count = await countSitemapEntities(type);
    } catch (err) {
      complete = false;
      console.error(
        `[sitemap] ${type} entity count failed; ${type} detail URLs are left out of the sitemap index until the next request. event=sitemap.entities.fetch_failure type=${type}`,
        err,
      );
    }
    const chunks = Math.ceil(count / SITEMAP_ENTITY_CHUNK_SIZE);
    for (let chunk = 1; chunk <= chunks; chunk += 1) {
      files.push({ id: ENTITY_ID_BASE[type] + chunk });
    }
  }

  return { files, complete };
}

/**
 * One content file. A failed CMS read throws instead of returning a partial list, so the
 * response is an error and nothing partial is cached or handed to crawlers as complete.
 */
async function contentFile(index: number): Promise<Sitemap> {
  let paths: ContentPath[];
  try {
    paths = await loadContentPaths();
  } catch (err) {
    console.error(
      "[sitemap] CMS fetch failed; this content file is not served, so no partial sitemap is cached. event=sitemap.cms.fetch_failure",
      err,
    );
    throw err;
  }
  const start = index * SITEMAP_PATH_CHUNK_SIZE;
  return paths
    .slice(start, start + SITEMAP_PATH_CHUNK_SIZE)
    .flatMap(({ path, fields }) => localizedEntries(path, fields));
}

/** One entity file (1-based chunk). A failed read throws, for the same reason as contentFile. */
async function entityFile(type: SitemapEntityType, chunk: number): Promise<Sitemap> {
  let rows: Awaited<ReturnType<typeof fetchSitemapEntityChunk>>;
  try {
    rows = await fetchSitemapEntityChunk(type, chunk);
  } catch (err) {
    console.error(
      `[sitemap] ${type} entity chunk ${chunk} failed; this file is not served, so no partial sitemap is cached. event=sitemap.entities.fetch_failure type=${type}`,
      err,
    );
    throw err;
  }
  return dedupeByUrl(
    rows.flatMap((row) =>
      localizedEntries(`${ENTITY_PATH_PREFIX[type]}/${encodeURIComponent(row.id)}`, {
        lastModified: toDate(row.updatedAt),
        changeFrequency: "weekly",
        priority: 0.6,
      }),
    ),
  );
}

/** The entries of one sitemap file, or an empty list for an id this site does not use. */
export async function buildSitemapFile(id: number): Promise<Sitemap> {
  const target = parseSitemapId(id);
  if (!target) return [];
  if (target.kind === "content") return contentFile(target.index);
  return entityFile(target.type, target.chunk);
}
