import Link from "next/link";
import type { Metadata } from "next";
import { publicListCms, type CmsContent } from "@/lib/cms";
import BlogCard from "@/components/cms/BlogCard";
import { buildMetadata } from "@/lib/seo/metadata";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/jsonLd";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "News",
  description: "Platform updates, announcements, and product news from Fixera.",
  path: "/news",
});

interface PageProps {
  searchParams: Promise<{ page?: string; tag?: string }>;
}

export default async function NewsIndexPage({ searchParams }: PageProps) {
  const { page: pageRaw, tag } = await searchParams;
  const page = Math.max(1, parseInt(pageRaw || "1", 10) || 1);

  let items: CmsContent[] = [];
  let pagination = { page, limit: 12, total: 0, totalPages: 0 };
  try {
    const res = await publicListCms("news", { page, limit: 12, tag });
    items = res.items;
    pagination = res.pagination;
  } catch {
    items = [];
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white pt-24 pb-20">
      <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "News", path: "/news" }])} />
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 p-[1.5px] shadow-md shadow-rose-100">
          <div className="relative rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white via-rose-50/50 to-pink-50/50 px-8 py-12">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-rose-300/30 to-pink-300/30 blur-2xl" />
            <h1 className="relative bg-gradient-to-r from-rose-600 via-pink-500 to-orange-500 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
              Fixera News
            </h1>
            <p className="relative mt-3 max-w-xl text-rose-600/80">
              Platform updates, announcements, and product news.
            </p>
          </div>
        </div>

        <div className="mt-10">
          {items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-pink-300 bg-gradient-to-br from-rose-50 via-pink-50 to-white py-20 text-center">
              <h2 className="text-xl font-semibold text-rose-900">No news yet</h2>
              <p className="mt-2 text-sm text-rose-500">Check back soon.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <BlogCard key={item._id} item={item} basePath="news" />
              ))}
            </div>
          )}
        </div>

        {pagination.totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            {page > 1 && (
              <Link href={`/news?page=${page - 1}${tag ? `&tag=${tag}` : ""}`} className="rounded-xl border border-pink-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50">
                Previous
              </Link>
            )}
            <span className="rounded-xl bg-gradient-to-r from-rose-100 to-pink-100 px-4 py-2 text-sm font-medium text-rose-700">
              Page {page} of {pagination.totalPages}
            </span>
            {page < pagination.totalPages && (
              <Link href={`/news?page=${page + 1}${tag ? `&tag=${tag}` : ""}`} className="rounded-xl bg-gradient-to-r from-rose-400 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:shadow-lg hover:shadow-rose-300">
                Next
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
