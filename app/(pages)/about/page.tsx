import type { Metadata } from "next";
import AboutHero from "@/components/about-page/AboutHero";
import TeamSection from "@/components/about-page/TeamSection";
import CTASection from "@/components/CTASection";
import TestimonialsSection from "@/components/TestimonialsSection";
import RichTextRenderer from "@/components/cms/RichTextRenderer";
import { publicGetCms } from "@/lib/cms";
import { buildMetadata } from "@/lib/seo/metadata";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/jsonLd";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await publicGetCms("policy", "about");
  return buildMetadata({
    title: content?.seo?.titleTag || content?.title || "About Fixera",
    description:
      content?.seo?.metaDescription ||
      content?.excerpt ||
      "Learn about Fixera — our mission to connect customers with verified professionals for every property service.",
    path: content?.seo?.canonical || "/about",
    image: content?.seo?.ogImage || content?.coverImage,
    noindex: content?.seo?.noindex,
  });
}

export default async function AboutPage() {
  const content = await publicGetCms("policy", "about");

  return (
    <main className="mt-10">
      <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "About", path: "/about" }])} />
      <AboutHero />
      {content?.body && (
        <section className="bg-gradient-to-br from-rose-50 via-pink-50 to-white py-16">
          <div className="mx-auto max-w-3xl px-6">
            <div className="rounded-3xl bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 p-[1.5px] shadow-md shadow-rose-100">
              <div className="rounded-[calc(1.5rem-1.5px)] bg-white px-8 py-10">
                {content.title && (
                  <h2 className="mb-6 bg-gradient-to-r from-rose-700 via-pink-600 to-rose-500 bg-clip-text text-3xl font-bold text-transparent">
                    {content.title}
                  </h2>
                )}
                <RichTextRenderer html={content.body} />
              </div>
            </div>
          </div>
        </section>
      )}
      <TestimonialsSection />
      <TeamSection />
      <CTASection />
    </main>
  );
}
