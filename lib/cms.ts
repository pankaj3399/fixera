import { authFetch, getAuthFetchOptions } from "@/lib/utils";

export type CmsContentType = "blog" | "news" | "faq" | "policy" | "landing";
export type CmsContentStatus = "draft" | "published";

export const CMS_TYPE_LABELS: Record<CmsContentType, string> = {
  blog: "Blog",
  news: "News",
  faq: "FAQ",
  policy: "Policy",
  landing: "Landing Page",
};

export const CMS_TYPE_ORDER: CmsContentType[] = ["blog", "news", "faq", "policy", "landing"];

export interface CmsSeo {
  titleTag?: string;
  metaDescription?: string;
  ogTitle?: string;
  ogImage?: string;
  canonical?: string;
  noindex?: boolean;
}

export interface CmsContent {
  _id: string;
  type: CmsContentType;
  title: string;
  slug: string;
  locale: string;
  body: string;
  excerpt?: string;
  coverImage?: string;
  category?: string;
  tags: string[];
  status: CmsContentStatus;
  author?: { _id: string; name?: string; email?: string } | string;
  publishedAt?: string;
  seo: CmsSeo;
  relatedContent?: Array<{ _id: string; title?: string; slug?: string; type?: CmsContentType } | string>;
  relatedServices?: Array<{ _id: string; name?: string; slug?: string } | string>;
  viewCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FaqCategory {
  slug: string;
  name: string;
}

export interface CmsListResponse {
  items: CmsContent[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const API = () => process.env.NEXT_PUBLIC_BACKEND_URL || "";

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok || data?.success === false) {
    throw new Error(data?.msg || `Request failed (${res.status})`);
  }
  return data.data as T;
}

// ---------- Admin ----------

export async function adminListCms(params: {
  type?: CmsContentType;
  status?: CmsContentStatus;
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
}): Promise<CmsListResponse> {
  const qs = new URLSearchParams();
  if (params.type) qs.set("type", params.type);
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.category) qs.set("category", params.category);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));

  const res = await authFetch(`${API()}/api/admin/cms?${qs.toString()}`);
  return parseJson<CmsListResponse>(res);
}

export async function adminGetCms(id: string): Promise<CmsContent> {
  const res = await authFetch(`${API()}/api/admin/cms/${id}`);
  return parseJson<CmsContent>(res);
}

export async function adminCreateCms(payload: Partial<CmsContent>): Promise<CmsContent> {
  const res = await authFetch(`${API()}/api/admin/cms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson<CmsContent>(res);
}

export async function adminUpdateCms(id: string, payload: Partial<CmsContent>): Promise<CmsContent> {
  const res = await authFetch(`${API()}/api/admin/cms/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson<CmsContent>(res);
}

export async function adminDeleteCms(id: string): Promise<void> {
  const res = await authFetch(`${API()}/api/admin/cms/${id}`, { method: "DELETE" });
  await parseJson(res);
}

export async function adminUploadCmsImage(file: File): Promise<{ url: string; key: string }> {
  const form = new FormData();
  form.append("image", file);
  const res = await authFetch(`${API()}/api/admin/cms/upload-image`, {
    method: "POST",
    body: form,
  });
  return parseJson<{ url: string; key: string }>(res);
}

export async function adminListFaqCategories(): Promise<FaqCategory[]> {
  const res = await authFetch(`${API()}/api/admin/cms/faq-categories`);
  return parseJson<FaqCategory[]>(res);
}

// ---------- Public ----------

export async function publicListCms(
  type: CmsContentType,
  params: { page?: number; limit?: number; tag?: string } = {}
): Promise<CmsListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.tag) qs.set("tag", params.tag);
  const res = await fetch(`${API()}/api/public/cms/${type}?${qs.toString()}`, { cache: "no-store" });
  return parseJson<CmsListResponse>(res);
}

export async function publicGetCms(
  type: CmsContentType,
  slug: string
): Promise<CmsContent | null> {
  const res = await fetch(`${API()}/api/public/cms/${type}/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  return parseJson<CmsContent>(res);
}

export interface FaqGroup {
  slug: string;
  name: string;
  items: Array<Pick<CmsContent, "_id" | "title" | "slug" | "body" | "category" | "publishedAt" | "updatedAt">>;
}

export async function publicGetFaq(): Promise<{ groups: FaqGroup[]; categories: FaqCategory[] }> {
  const res = await fetch(`${API()}/api/public/cms/faq`, { cache: "no-store" });
  return parseJson<{ groups: FaqGroup[]; categories: FaqCategory[] }>(res);
}

export async function publicListSitemapEntries(): Promise<
  Array<{ type: CmsContentType; slug: string; locale: string; updatedAt: string; publishedAt?: string }>
> {
  const res = await fetch(`${API()}/api/public/cms/sitemap`, { cache: "no-store" });
  return parseJson(res);
}

// ---------- Utils ----------

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);
}
