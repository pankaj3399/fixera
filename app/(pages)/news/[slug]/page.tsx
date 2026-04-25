import Link from "next/link";
import { ArrowLeft, Calendar } from "lucide-react";
import type { Metadata } from "next";
import { publicGetCms, cmsAuthorName } from "@/lib/cms";
import RichTextRenderer from "@/components/cms/RichTextRenderer";
import { buildMetadata } from "@/lib/seo/metadata";
import JsonLd from "@/components/seo/JsonLd";
import { articleSchema, breadcrumbSchema } from "@/lib/seo/jsonLd";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

async function fetchNewsPost(slug: string): Promise<{ post: Awaited<ReturnType<typeof publicGetCms>>; fetchError: boolean }> {
  try {
    const post = await publicGetCms("news", slug);
    return { post, fetchError: false };
  } catch {
    return { post: null, fetchError: true };
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { post, fetchError } = await fetchNewsPost(slug);
  if (fetchError) {
    return buildMetadata({ title: "News", path: `/news/${slug}` });
  }
  if (!post) return buildMetadata({ title: "News article not found", path: `/news/${slug}`, noindex: true });
  return buildMetadata({
    title: post.seo?.titleTag || post.title,
    description: post.seo?.metaDescription || post.excerpt,
    path: post.seo?.canonical || `/news/${post.slug}`,
    image: post.seo?.ogImage || post.coverImage,
    noindex: post.seo?.noindex,
    type: "article",
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
  });
}

export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params;
  const { post, fetchError } = await fetchNewsPost(slug);
  if (!post && fetchError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white px-6 pt-32 pb-20 text-center">
        <h1 className="text-3xl font-bold text-rose-700">This article is temporarily unavailable</h1>
        <p className="mt-3 text-rose-500">Please try again in a moment.</p>
        <Link href="/news" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-400 to-pink-500 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200">All news</Link>
      </div>
    );
  }
  if (!post) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white px-6 pt-32 pb-20 text-center">
        <h1 className="text-3xl font-bold text-rose-700">Article not found</h1>
        <p className="mt-3 text-rose-500">It may have been removed or is not yet published.</p>
        <Link href="/news" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-400 to-pink-500 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200">All news</Link>
      </div>
    );
  }

  const date = post.publishedAt || post.updatedAt;
  const authorName = cmsAuthorName(post);

  return (
    <article className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white pb-20">
      <JsonLd
        data={[
          articleSchema({
            title: post.title,
            description: post.excerpt,
            path: `/news/${post.slug}`,
            image: post.coverImage,
            datePublished: post.publishedAt,
            dateModified: post.updatedAt,
            authorName,
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "News", path: "/news" },
            { name: post.title, path: `/news/${post.slug}` },
          ]),
        ]}
      />
      <div className="mx-auto max-w-4xl px-6 pt-24">
        <Link href="/news" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50">
          <ArrowLeft size={16} /> All news
        </Link>
      </div>
      {post.coverImage && (
        <div className="mx-auto mt-4 max-w-5xl px-6">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 p-[1.5px] shadow-xl shadow-rose-100">
            <img src={post.coverImage} alt={post.title} className="aspect-[16/7] w-full rounded-[calc(1.5rem-1.5px)] object-cover" />
          </div>
        </div>
      )}
      <div className="mx-auto mt-10 max-w-3xl px-6">
        <h1 className="bg-gradient-to-r from-rose-700 via-pink-600 to-rose-500 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
          {post.title}
        </h1>
        <div className="mt-4 flex items-center gap-3 text-sm text-rose-500">
          {date && (
            <span className="inline-flex items-center gap-1">
              <Calendar size={14} />
              {new Date(date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
            </span>
          )}
          {authorName && <span>· by {authorName}</span>}
        </div>
        <div className="mt-8">
          <RichTextRenderer html={post.body} className="prose-lg" />
        </div>
      </div>
    </article>
  );
}
