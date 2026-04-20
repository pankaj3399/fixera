import Link from "next/link";
import type { Metadata } from "next";
import { publicListCms, type CmsContent } from "@/lib/cms";
import BlogCard from "@/components/cms/BlogCard";
import { buildMetadata } from "@/lib/seo/metadata";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/jsonLd";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Blog",
  description: "Insights, guides, and stories from the Fixera community. Tips for homeowners and professionals on renovation, maintenance, and building projects.",
  path: "/blog",
});

interface PageProps {
  searchParams: Promise<{ page?: string; tag?: string }>;
}

export default async function BlogIndexPage({ searchParams }: PageProps) {
  const { page: pageRaw, tag } = await searchParams;
  const page = Math.max(1, parseInt(pageRaw || "1", 10) || 1);

  const res = await publicListCms("blog", { page, limit: 12, tag });
  const items: CmsContent[] = res.items;
  const pagination = res.pagination;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white pt-24 pb-20">
      <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }])} />
      <div className="mx-auto max-w-6xl px-6">
        <Header title="The Fixera Blog" subtitle="Tips, stories, and insider advice on home projects." />

        {tag && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-100 to-pink-100 px-4 py-1.5 text-sm text-rose-700">
            Filtered by <span className="font-semibold">#{tag}</span>
            <Link href="/blog" className="text-rose-500 hover:text-rose-700">×</Link>
          </div>
        )}

        <div className="mt-10">
          {items.length === 0 ? (
            <EmptyBlog />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <BlogCard key={item._id} item={item} basePath="blog" />
              ))}
            </div>
          )}
        </div>

        {pagination.totalPages > 1 && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            basePath="/blog"
            tag={tag}
          />
        )}
      </div>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 p-[1.5px] shadow-md shadow-rose-100">
      <div className="relative rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white via-rose-50/50 to-pink-50/50 px-8 py-12">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-rose-300/30 to-pink-300/30 blur-2xl" />
        <div className="absolute -left-6 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-orange-300/30 to-rose-300/30 blur-2xl" />
        <h1 className="relative bg-gradient-to-r from-rose-600 via-pink-500 to-orange-500 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
          {title}
        </h1>
        <p className="relative mt-3 max-w-xl text-rose-600/80">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyBlog() {
  return (
    <div className="rounded-3xl border border-dashed border-pink-300 bg-gradient-to-br from-rose-50 via-pink-50 to-white py-20 text-center">
      <h2 className="text-xl font-semibold text-rose-900">Nothing published yet</h2>
      <p className="mt-2 text-sm text-rose-500">Stay tuned — new posts are on the way.</p>
    </div>
  );
}

function Pagination({ page, totalPages, basePath, tag }: { page: number; totalPages: number; basePath: string; tag?: string }) {
  const link = (p: number) => {
    const qs = new URLSearchParams({ page: String(p) });
    if (tag) qs.set("tag", tag);
    return `${basePath}?${qs.toString()}`;
  };
  return (
    <div className="mt-10 flex items-center justify-center gap-2">
      {page > 1 && (
        <Link href={link(page - 1)} className="rounded-xl border border-pink-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50">
          Previous
        </Link>
      )}
      <span className="rounded-xl bg-gradient-to-r from-rose-100 to-pink-100 px-4 py-2 text-sm font-medium text-rose-700">
        Page {page} of {totalPages}
      </span>
      {page < totalPages && (
        <Link href={link(page + 1)} className="rounded-xl bg-gradient-to-r from-rose-400 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:shadow-lg hover:shadow-rose-300">
          Next
        </Link>
      )}
    </div>
  );
}
