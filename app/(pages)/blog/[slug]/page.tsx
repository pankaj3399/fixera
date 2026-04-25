import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Tag } from "lucide-react";
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  let post;
  try {
    post = await publicGetCms("blog", slug);
  } catch {
    return buildMetadata({ title: "Post not found", path: `/blog/${slug}`, noindex: true });
  }
  if (!post) return buildMetadata({ title: "Post not found", path: `/blog/${slug}`, noindex: true });
  return buildMetadata({
    title: post.seo?.titleTag || post.title,
    description: post.seo?.metaDescription || post.excerpt,
    path: post.seo?.canonical || `/blog/${post.slug}`,
    image: post.seo?.ogImage || post.coverImage,
    noindex: post.seo?.noindex,
    type: "article",
    keywords: post.tags,
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    authorName: cmsAuthorName(post),
  });
}

export default async function BlogDetailPage({ params }: Props) {
  const { slug } = await params;
  let post;
  let fetchError = false;
  try {
    post = await publicGetCms("blog", slug);
  } catch {
    fetchError = true;
  }
  if (!post && !fetchError) notFound();
  if (!post) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white px-6 pt-32 pb-20 text-center">
        <h1 className="text-3xl font-bold text-rose-700">This post is temporarily unavailable</h1>
        <p className="mt-3 text-rose-500">Please try again in a moment.</p>
        <Link href="/blog" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-400 to-pink-500 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200">Back to blog</Link>
      </div>
    );
  }

  const authorName = cmsAuthorName(post);
  const date = post.publishedAt || post.updatedAt;

  return (
    <article className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white pb-20">
      <JsonLd
        data={[
          articleSchema({
            title: post.title,
            description: post.excerpt,
            path: `/blog/${post.slug}`,
            image: post.coverImage,
            datePublished: post.publishedAt,
            dateModified: post.updatedAt,
            authorName,
            tags: post.tags,
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />
      <div className="mx-auto max-w-4xl px-6 pt-24">
        <Link href="/blog" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50">
          <ArrowLeft size={16} /> Back to blog
        </Link>
      </div>

      {post.coverImage && (
        <div className="mx-auto mt-4 max-w-5xl px-6">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 p-[1.5px] shadow-xl shadow-rose-100">
            <img
              src={post.coverImage}
              alt={post.title}
              className="aspect-[16/7] w-full rounded-[calc(1.5rem-1.5px)] object-cover"
            />
          </div>
        </div>
      )}

      <div className="mx-auto mt-10 max-w-3xl px-6">
        {post.tags?.length ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <Link
                key={t}
                href={`/blog?tag=${encodeURIComponent(t)}`}
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-100 to-pink-100 px-3 py-1 text-xs font-medium text-rose-700 transition hover:from-rose-200 hover:to-pink-200"
              >
                <Tag size={10} /> {t}
              </Link>
            ))}
          </div>
        ) : null}
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
        {post.excerpt && (
          <p className="mt-6 border-l-4 border-rose-300 bg-gradient-to-r from-rose-50 to-transparent px-5 py-3 text-lg italic text-rose-700 rounded-r-xl">
            {post.excerpt}
          </p>
        )}
        <div className="mt-8">
          <RichTextRenderer html={post.body} className="prose-lg" />
        </div>
      </div>
    </article>
  );
}
