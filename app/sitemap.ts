import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo/site";
import { publicListSitemapEntries } from "@/lib/cms";
import { serviceCategories } from "@/data/content";

export const dynamic = "force-dynamic";

const STATIC_ROUTES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }> = [
  { path: "/", changeFrequency: "daily", priority: 1.0 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/blog", changeFrequency: "daily", priority: 0.8 },
  { path: "/news", changeFrequency: "daily", priority: 0.8 },
  { path: "/faq", changeFrequency: "weekly", priority: 0.7 },
  { path: "/search", changeFrequency: "weekly", priority: 0.6 },
  { path: "/categories", changeFrequency: "weekly", priority: 0.7 },
  { path: "/services", changeFrequency: "weekly", priority: 0.8 },
  { path: "/projects", changeFrequency: "daily", priority: 0.7 },
  { path: "/professionals", changeFrequency: "daily", priority: 0.7 },
  { path: "/join", changeFrequency: "monthly", priority: 0.6 },
];

const RESERVED_POLICY_SLUGS: Record<string, string> = {
  about: "/about",
  "privacy-policy": "/privacy-policy",
};

const CMS_PATH_PREFIX: Record<string, (slug: string) => string> = {
  blog: (slug) => `/blog/${slug}`,
  news: (slug) => `/news/${slug}`,
  landing: (slug) => `/pages/${slug}`,
  policy: (slug) => RESERVED_POLICY_SLUGS[slug] || `/pages/${slug}`,
};

const STATIC_ROUTE_PATHS = new Set<string>();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  for (const r of STATIC_ROUTES) STATIC_ROUTE_PATHS.add(r.path);

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  for (const cat of serviceCategories) {
    entries.push({
      url: `${base}/categories/${cat.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    });
    for (const sub of cat.subCategories || []) {
      for (const svc of sub.services || []) {
        entries.push({
          url: `${base}/services/${svc.id}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }
    }
  }

  try {
    const cms = await publicListSitemapEntries();
    for (const item of cms) {
      const pathBuilder = CMS_PATH_PREFIX[item.type];
      if (!pathBuilder) continue;
      const path = pathBuilder(item.slug);
      if (STATIC_ROUTE_PATHS.has(path)) continue;
      const lastmod = item.updatedAt || item.publishedAt;
      entries.push({
        url: `${base}${path}`,
        lastModified: lastmod ? new Date(lastmod) : now,
        changeFrequency: item.type === "blog" || item.type === "news" ? "weekly" : "monthly",
        priority: item.type === "blog" || item.type === "news" ? 0.7 : 0.5,
      });
    }
  } catch {
    // CMS unreachable — skip dynamic entries
  }

  return entries;
}
