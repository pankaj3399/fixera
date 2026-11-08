import { buildLlmsTxt } from "@/lib/seo/llmsTxt";

export const revalidate = 3600;

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
