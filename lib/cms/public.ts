import { sanitizeRichText } from "@/lib/cms/sanitize";
import type {
  CmsContent,
  CmsContentType,
  CmsListResponse,
  FaqCategory,
  FaqGroup,
} from "@/lib/cms";

const API = process.env.NEXT_PUBLIC_BACKEND_URL || "";

async function parseJsonRequired<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    throw new Error(`Request returned no body (${res.status}) but a response was expected`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text
        ? `Request failed (${res.status}): ${text.slice(0, 200)}`
        : `Request failed (${res.status})`
    );
  }
  const data = await res.json();
  if (!res.ok || data?.success === false) {
    throw new Error(data?.msg || `Request failed (${res.status})`);
  }
  return (data?.data ?? data) as T;
}

export async function publicListCms(
  type: CmsContentType,
  params: { page?: number; limit?: number; tag?: string; serviceSlug?: string; country?: string } = {}
): Promise<CmsListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.tag) qs.set("tag", params.tag);
  if (params.serviceSlug) qs.set("serviceSlug", params.serviceSlug);
  if (params.country) qs.set("country", params.country);
  const res = await fetch(`${API}/api/public/cms/${type}?${qs.toString()}`, {
    next: { revalidate: 60, tags: ["cms", `cms:${type}`] },
  });
  const data = await parseJsonRequired<CmsListResponse>(res);
  data.items = data.items.map((item) => ({ ...item, body: sanitizeRichText(item.body || "") }));
  return data;
}

export async function publicGetCms(
  type: CmsContentType,
  slug: string,
  country?: string
): Promise<CmsContent | null> {
  const qs = new URLSearchParams();
  if (country) qs.set("country", country);
  const query = qs.toString();
  const res = await fetch(
    `${API}/api/public/cms/${type}/${encodeURIComponent(slug)}${query ? `?${query}` : ""}`,
    {
      next: { revalidate: 60, tags: ["cms", `cms:${type}`, `cms:${type}:${slug}`] },
    },
  );
  if (res.status === 404) return null;
  const data = await parseJsonRequired<CmsContent>(res);
  return { ...data, body: sanitizeRichText(data.body || "") };
}

export async function fetchCmsPostWithError(
  type: CmsContentType,
  slug: string,
  country?: string
): Promise<{ post: CmsContent | null; fetchError: boolean }> {
  try {
    const post = await publicGetCms(type, slug, country);
    return { post, fetchError: false };
  } catch {
    return { post: null, fetchError: true };
  }
}

export async function publicGetFaq(country?: string): Promise<{ groups: FaqGroup[]; categories: FaqCategory[] }> {
  const qs = new URLSearchParams();
  if (country) qs.set("country", country);
  const query = qs.toString();
  const res = await fetch(`${API}/api/public/cms/faq${query ? `?${query}` : ""}`, {
    next: { revalidate: 60, tags: ["cms", "cms:faq"] },
  });
  const data = await parseJsonRequired<{ groups: FaqGroup[]; categories: FaqCategory[] }>(res);
  data.groups = data.groups.map((g) => ({
    ...g,
    items: g.items.map((it) => ({ ...it, body: sanitizeRichText(it.body || "") })),
  }));
  return data;
}
