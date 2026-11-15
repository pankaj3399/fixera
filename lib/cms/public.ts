import { getLocale } from "next-intl/server";
import { sanitizeRichText } from "@/lib/cms/sanitize";
import type {
  CmsContent,
  CmsContentType,
  CmsListResponse,
  FaqCategory,
  FaqGroup,
} from "@/lib/cms";
import {
  CONTENT_COUNTRY_REQUEST_HEADER,
  PLATFORM_COUNTRY_REQUEST_HEADER,
} from "@/lib/geo/contentCountryHeader";
import { currentRouteContext } from "@/lib/server/routeContext";
import { PUBLIC_REVALIDATE_SECONDS } from "@/lib/publicCache";
import { ApiRequestError, apiErrorFromBody } from "@/lib/apiErrors";

const API = process.env.NEXT_PUBLIC_BACKEND_URL || "";

async function parseJsonRequired<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    throw new ApiRequestError("The server returned an unexpected response.", {
      kind: "invalidResponse",
      status: res.status,
    });
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    await res.text().catch(() => "");
    throw new ApiRequestError("The server returned an unexpected response.", {
      kind: "invalidResponse",
      status: res.status,
    });
  }
  const data = await res.json();
  if (!res.ok || data?.success === false) {
    throw apiErrorFromBody(data, "The request could not be completed.", { status: res.status });
  }
  return (data?.data ?? data) as T;
}

function cmsFetchHeaders(): HeadersInit | undefined {
  // Content country resolved by middleware (auto-conversion aware, dev `?geo=`
  // override) and carried in the route context. The caller's page or layout has
  // called routeContext(); the country is part of the fetch cache key.
  const country = currentRouteContext()?.country;
  // The backend filters by x-vercel-ip-country today; the first-party header
  // is sent too so the backend can prefer it (a hosting edge in front of the
  // backend may replace x-vercel-ip-country with the caller's geo).
  return country
    ? { [PLATFORM_COUNTRY_REQUEST_HEADER]: country, [CONTENT_COUNTRY_REQUEST_HEADER]: country }
    : undefined;
}

/**
 * Content locale for public CMS reads. The backend serves `en` when a doc has
 * no translation, so we always pass the active locale.
 *
 * Cache note: the locale is part of the request URL, i.e. part of Next's fetch
 * cache key, so nl/fr renders never reuse the en entry. The revalidation tags
 * stay locale-agnostic on purpose: an admin save must flush every locale
 * variant, and `app/api/cms/revalidate` only knows the slug/type.
 */
async function resolveContentLocale(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  return getLocale();
}

export async function publicListCms(
  type: CmsContentType,
  params: { page?: number; limit?: number; tag?: string; serviceSlug?: string; locale?: string } = {}
): Promise<CmsListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.tag) qs.set("tag", params.tag);
  if (params.serviceSlug) qs.set("serviceSlug", params.serviceSlug);
  qs.set("locale", await resolveContentLocale(params.locale));
  const res = await fetch(`${API}/api/public/cms/${type}?${qs.toString()}`, {
    headers: cmsFetchHeaders(),
    next: { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["cms", `cms:${type}`] },
  });
  const data = await parseJsonRequired<CmsListResponse>(res);
  data.items = data.items.map((item) => ({ ...item, body: sanitizeRichText(item.body || "") }));
  return data;
}

export async function publicGetCms(
  type: CmsContentType,
  slug: string,
  params: { locale?: string } = {},
): Promise<CmsContent | null> {
  const qs = new URLSearchParams({
    locale: await resolveContentLocale(params.locale),
  });
  const res = await fetch(
    `${API}/api/public/cms/${type}/${encodeURIComponent(slug)}?${qs.toString()}`,
    {
      headers: cmsFetchHeaders(),
      next: { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["cms", `cms:${type}`, `cms:${type}:${slug}`] },
    },
  );
  if (res.status === 404) return null;
  const data = await parseJsonRequired<CmsContent>(res);
  return { ...data, body: sanitizeRichText(data.body || "") };
}

export async function fetchCmsPostWithError(
  type: CmsContentType,
  slug: string,
): Promise<{ post: CmsContent | null; fetchError: boolean }> {
  try {
    const post = await publicGetCms(type, slug);
    return { post, fetchError: false };
  } catch {
    return { post: null, fetchError: true };
  }
}

export async function publicGetFaq(
  params: { locale?: string } = {}
): Promise<{ groups: FaqGroup[]; categories: FaqCategory[] }> {
  const qs = new URLSearchParams({ locale: await resolveContentLocale(params.locale) });
  const res = await fetch(`${API}/api/public/cms/faq?${qs.toString()}`, {
    headers: cmsFetchHeaders(),
    next: { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["cms", "cms:faq"] },
  });
  const data = await parseJsonRequired<{ groups: FaqGroup[]; categories: FaqCategory[] }>(res);
  data.groups = data.groups.map((g) => ({
    ...g,
    items: g.items.map((it) => ({ ...it, body: sanitizeRichText(it.body || "") })),
  }));
  return data;
}
