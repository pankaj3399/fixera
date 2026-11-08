import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo/site";
import { publicListSitemapEntries, type CmsContentType } from "@/lib/cms";
import { serviceCategories } from "@/data/content";
import { fetchSitemapEntities, type SitemapEntityType } from "@/lib/server/publicEntities";

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

const STATIC_ROUTE_PATHS = new Set<string>(STATIC_ROUTES.map((r) => r.path));

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export default async function sitemap(): Promise<Sitemap> {
  const base = siteUrl();

  const entries: Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${base}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  for (const cat of serviceCategories) {
    entries.push({
      url: `${base}/categories/${cat.slug}`,
      changeFrequency: "weekly",
      priority: 0.6,
    });
    for (const sub of cat.subCategories || []) {
      for (const svc of sub.services || []) {
        entries.push({
          url: `${base}/services/${svc.id}`,
          changeFrequency: "weekly",
          priority: 0.7,
        });
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
        entries.push({
          url: `${base}${path}`,
          lastModified: toDate(item.updatedAt || item.publishedAt),
          changeFrequency: item.type === "blog" || item.type === "news" ? "weekly" : "monthly",
          priority: item.type === "blog" || item.type === "news" ? 0.7 : 0.5,
        });
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

  // Published projects and approved professionals, with their own modification time.
  // A failure is logged and only drops that type; the rest of the sitemap is served.
  for (const type of ["project", "professional"] as const) {
    try {
      const rows = await fetchSitemapEntities(type);
      for (const row of rows) {
        entries.push({
          url: `${base}${ENTITY_PATH_PREFIX[type]}/${encodeURIComponent(row.id)}`,
          lastModified: toDate(row.updatedAt),
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    } catch (err) {
      console.error(
        `[sitemap] ${type} entity fetch failed; ${type} detail URLs are omitted from this sitemap. event=sitemap.entities.fetch_failure type=${type}`,
        err
      );
    }
  }

  // Auto-translated CMS docs (nl/fr) share the English slug and the language is
  // switched on the same URL, so the backend list can contain the same
  // type+slug (i.e. the same URL) several times. Keep one entry per URL, with
  // the most recent lastModified.
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
