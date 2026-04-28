import { authFetch } from "@/lib/utils";

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
  authorOverride?: string;
  publishedAt?: string;
  seo: CmsSeo;
  relatedContent?: Array<{ _id: string; title?: string; slug?: string; type?: CmsContentType } | string>;
  relatedServices?: Array<{ _id: string; name?: string; slug?: string } | string>;
  viewCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CmsUpsertPayload {
  type?: CmsContentType;
  title?: string;
  slug?: string;
  locale?: string;
  body?: string;
  excerpt?: string;
  coverImage?: string;
  category?: string;
  tags?: string[];
  status?: CmsContentStatus;
  author?: string;
  authorOverride?: string;
  publishedAt?: string;
  seo?: CmsSeo;
  relatedContent?: string[];
  relatedServices?: string[];
}

export function cmsAuthorName(item: Pick<CmsContent, "author" | "authorOverride">): string | undefined {
  if (item.authorOverride && item.authorOverride.trim()) return item.authorOverride.trim();
  if (typeof item.author === "object" && item.author) {
    const name = item.author.name?.trim();
    if (name) return name;
  }
  if (typeof item.author === "string" && item.author.trim()) return item.author.trim();
  return undefined;
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

async function parseJson<T>(res: Response): Promise<T | undefined> {
  if (res.status === 204) return undefined;
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
  return data.data as T;
}

async function parseJsonRequired<T>(res: Response): Promise<T> {
  const data = await parseJson<T>(res);
  if (data === undefined) {
    throw new Error(`Request returned no body (${res.status}) but a response was expected`);
  }
  return data;
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
  return parseJsonRequired<CmsListResponse>(res);
}

export async function adminGetCms(id: string): Promise<CmsContent> {
  const res = await authFetch(`${API()}/api/admin/cms/${id}`);
  return parseJsonRequired<CmsContent>(res);
}

export async function adminCreateCms(payload: CmsUpsertPayload): Promise<CmsContent> {
  const res = await authFetch(`${API()}/api/admin/cms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonRequired<CmsContent>(res);
}

export async function adminUpdateCms(id: string, payload: CmsUpsertPayload): Promise<CmsContent> {
  const res = await authFetch(`${API()}/api/admin/cms/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonRequired<CmsContent>(res);
}

export async function adminDeleteCms(id: string): Promise<void> {
  const res = await authFetch(`${API()}/api/admin/cms/${id}`, { method: "DELETE" });
  await parseJson<void>(res);
}

export async function adminUploadCmsImage(file: File): Promise<{ url: string; key: string }> {
  const form = new FormData();
  form.append("image", file);
  const res = await authFetch(`${API()}/api/admin/cms/upload-image`, {
    method: "POST",
    body: form,
  });
  return parseJsonRequired<{ url: string; key: string }>(res);
}

export async function adminListFaqCategories(): Promise<FaqCategory[]> {
  const res = await authFetch(`${API()}/api/admin/cms/faq-categories`);
  return parseJsonRequired<FaqCategory[]>(res);
}

export interface CmsLandingSlot {
  slug: string;
  label: string;
  usedFor: string;
  category?: string;
  reserved: boolean;
  item: {
    _id: string;
    status: CmsContentStatus;
    title: string;
    updatedAt: string;
  } | null;
}

export async function adminListLandingSlots(): Promise<CmsLandingSlot[]> {
  const res = await authFetch(`${API()}/api/admin/cms/landing-slots`);
  const data = await parseJsonRequired<{ slots: CmsLandingSlot[] }>(res);
  return data.slots;
}

export async function adminSyncLandingSlots(): Promise<{ created: number }> {
  const res = await authFetch(`${API()}/api/admin/cms/landing-slots/sync`, { method: "POST" });
  return parseJsonRequired<{ created: number }>(res);
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
  return parseJsonRequired<CmsListResponse>(res);
}

export async function publicGetCms(
  type: CmsContentType,
  slug: string
): Promise<CmsContent | null> {
  const res = await fetch(`${API()}/api/public/cms/${type}/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  return parseJsonRequired<CmsContent>(res);
}

export async function fetchCmsPostWithError(
  type: CmsContentType,
  slug: string
): Promise<{ post: CmsContent | null; fetchError: boolean }> {
  try {
    const post = await publicGetCms(type, slug);
    return { post, fetchError: false };
  } catch {
    return { post: null, fetchError: true };
  }
}

export interface FaqGroup {
  slug: string;
  name: string;
  items: Array<Pick<CmsContent, "_id" | "title" | "slug" | "body" | "category" | "publishedAt" | "updatedAt">>;
}

export async function publicGetFaq(): Promise<{ groups: FaqGroup[]; categories: FaqCategory[] }> {
  const res = await fetch(`${API()}/api/public/cms/faq`, { cache: "no-store" });
  return parseJsonRequired<{ groups: FaqGroup[]; categories: FaqCategory[] }>(res);
}

export interface PolicyLink {
  title: string;
  slug: string;
  path: string;
}

export async function publicListPolicyLinks(): Promise<PolicyLink[]> {
  try {
    const res = await fetch(`${API()}/api/public/cms/policy-links`, { cache: "no-store" });
    const data = await parseJsonRequired<{ items: PolicyLink[] }>(res);
    return data.items || [];
  } catch {
    return [];
  }
}

export interface SitemapEntry {
  type: CmsContentType;
  slug: string;
  locale: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface SitemapPage {
  items: SitemapEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
}

export async function publicListSitemapEntries(
  params: { page?: number; limit?: number } = {}
): Promise<SitemapPage> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(`${API()}/api/public/cms/sitemap${suffix}`, { cache: "no-store" });
  return parseJsonRequired<SitemapPage>(res);
}

// ---------- Utils ----------

export interface CmsReservedPolicy {
  slug: string;
  label: string;
  path: string;
  usedFor: string;
}

export const CMS_RESERVED_POLICIES: CmsReservedPolicy[] = [
  { slug: "privacy-policy", label: "Privacy Policy", path: "/privacy-policy", usedFor: "Footer link" },
  { slug: "terms-of-service", label: "Terms of Service", path: "/pages/terms-of-service", usedFor: "Footer link + Pro onboarding T&C (read) link" },
  { slug: "cookie-policy", label: "Cookie Policy", path: "/pages/cookie-policy", usedFor: "Footer link" },
  { slug: "gdpr-compliance", label: "GDPR Compliance", path: "/pages/gdpr-compliance", usedFor: "Footer link" },
];

export const CMS_RESERVED_LANDINGS: CmsReservedPolicy[] = [
  { slug: "about", label: "About", path: "/about", usedFor: "About page (overrides hardcoded content)" },
];

const RESERVED_POLICY_PATHS: Record<string, string> = Object.fromEntries(
  CMS_RESERVED_POLICIES.map((r) => [r.slug, r.path])
);

const RESERVED_LANDING_PATHS: Record<string, string> = Object.fromEntries(
  CMS_RESERVED_LANDINGS.map((r) => [r.slug, r.path])
);

export function getPublicPathForCms(type: CmsContentType, slug: string): string | null {
  if (!slug) return null;
  switch (type) {
    case "blog":
      return `/blog/${slug}`;
    case "news":
      return `/news/${slug}`;
    case "landing":
      return RESERVED_LANDING_PATHS[slug] || `/pages/${slug}`;
    case "policy":
      return RESERVED_POLICY_PATHS[slug] || `/pages/${slug}`;
    case "faq":
      return `/faq#${slug}`;
    default:
      return null;
  }
}

export function getLandingServicePath(slug: string): string | null {
  if (!slug || RESERVED_LANDING_PATHS[slug]) return null;
  return `/services/${slug}`;
}

export function getPublicSlugPrefixForCms(type: CmsContentType): string | null {
  switch (type) {
    case "blog":
      return "/blog/";
    case "news":
      return "/news/";
    case "landing":
    case "policy":
      return "/pages/";
    case "faq":
    default:
      return null;
  }
}

export function slugify(input: string): string {
  const normalized = (input || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase()
    .trim();

  const ascii = normalized
    .replace(/[^\p{L}\p{N}\s-]+/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);

  if (ascii) return ascii;
  return `untitled-${Math.random().toString(36).slice(2, 8)}`;
}
