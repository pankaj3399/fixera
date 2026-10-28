import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import type { CmsContentType } from "@/lib/cms";
import { isPublicCacheTag } from "@/lib/publicCache";

const CMS_TYPES = new Set<CmsContentType>(["blog", "news", "faq", "policy", "landing"]);

export async function POST(request: NextRequest) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ success: false }, { status: 500 });
  }

  const cookie = request.headers.get("cookie") || "";
  const authorization = request.headers.get("authorization") || "";
  const authResponse = await fetch(`${backendUrl}/api/auth/me`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(authorization ? { authorization } : {}),
    },
  });
  if (!authResponse.ok) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const authData = await authResponse.json().catch(() => null);
  if (authData?.user?.role !== "admin") {
    return NextResponse.json({ success: false }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const type = body?.type as CmsContentType | undefined;
  const slugs: string[] = Array.isArray(body?.slugs)
    ? body.slugs.filter((slug: unknown): slug is string => typeof slug === "string" && slug.length > 0)
    : [];
  const tags: string[] = Array.isArray(body?.tags)
    ? body.tags.filter((tag: unknown): tag is string => typeof tag === "string" && isPublicCacheTag(tag))
    : [];

  const flushCms = tags.length === 0 || Boolean(type) || slugs.length > 0;
  if (flushCms) {
    // Tags are deliberately locale-agnostic: `lib/cms/public.ts` puts the locale
    // in the fetch URL (cache key) and reuses these tags, so one admin save
    // flushes the en/nl/fr variants together.
    revalidateTag("cms");
    if (type && CMS_TYPES.has(type)) {
      revalidateTag(`cms:${type}`);
      slugs.forEach((slug) => revalidateTag(`cms:${type}:${slug}`));
    }
  }

  tags.forEach((tag) => revalidateTag(tag));

  return NextResponse.json({ success: true });
}
