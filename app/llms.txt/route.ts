import { buildLlmsTxt } from "@/lib/seo/llmsTxt";

// Rendered per request. A prerendered copy would bake in the origin of the build
// environment, which falls back to localhost when NEXT_PUBLIC_SITE_URL is not set there.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
