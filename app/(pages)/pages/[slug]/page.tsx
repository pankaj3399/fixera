import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { publicGetCms } from "@/lib/cms";
import RichTextRenderer from "@/components/cms/RichTextRenderer";
import { buildMetadata } from "@/lib/seo/metadata";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/jsonLd";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const landing = await publicGetCms("landing", slug);
  const content = landing || (await publicGetCms("policy", slug));
  if (!content) return buildMetadata({ title: "Page not found", path: `/pages/${slug}`, noindex: true });
  return buildMetadata({
    title: content.seo?.titleTag || content.title,
    description: content.seo?.metaDescription || content.excerpt,
    path: content.seo?.canonical || `/pages/${content.slug}`,
    image: content.seo?.ogImage || content.coverImage,
    noindex: content.seo?.noindex,
  });
}

export default async function GenericCmsPage({ params }: Props) {
  const { slug } = await params;
  const landing = await publicGetCms("landing", slug);
  const policy = !landing ? await publicGetCms("policy", slug) : null;
  const content = landing || policy;
  if (!content) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white pt-24 pb-20">
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: content.title, path: `/pages/${content.slug}` },
        ])}
      />
      {content.coverImage && (
        <div className="mx-auto max-w-5xl px-6">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 p-[1.5px] shadow-xl shadow-rose-100">
            <img src={content.coverImage} alt={content.title} className="aspect-[16/7] w-full rounded-[calc(1.5rem-1.5px)] object-cover" />
          </div>
        </div>
      )}
      <div className="mx-auto mt-10 max-w-3xl px-6">
        <h1 className="bg-gradient-to-r from-rose-700 via-pink-600 to-rose-500 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
          {content.title}
        </h1>
        {content.excerpt && <p className="mt-4 text-lg text-rose-600/80">{content.excerpt}</p>}
        <div className="mt-8">
          <RichTextRenderer html={content.body} />
        </div>
      </div>
    </div>
  );
}
