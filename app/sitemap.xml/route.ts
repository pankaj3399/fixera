import { generateSitemaps } from "@/app/sitemap";
import { siteUrl } from "@/lib/seo/site";

// Rendered per request so a build made while the backend is down does not freeze an index
// that lists only the static file. The entity counts are cached by the fetch layer.
export const dynamic = "force-dynamic";

/**
 * Sitemap index at /sitemap.xml (robots.txt points here). Next serves the files that
 * `generateSitemaps` describes at /sitemap/<id>.xml, but does not write the index itself.
 */
export async function GET() {
  const base = siteUrl();
  const plan = await generateSitemaps();
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...plan.map(({ id }) => `  <sitemap><loc>${base}/sitemap/${id}.xml</loc></sitemap>`),
    "</sitemapindex>",
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
