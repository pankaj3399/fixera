import { Shield } from "lucide-react";
import type { Metadata } from "next";
import RichTextRenderer from "@/components/cms/RichTextRenderer";
import { publicGetCms } from "@/lib/cms";
import { buildMetadata } from "@/lib/seo/metadata";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/jsonLd";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await publicGetCms("policy", "privacy-policy");
  return buildMetadata({
    title: content?.seo?.titleTag || content?.title || "Privacy Policy",
    description:
      content?.seo?.metaDescription ||
      content?.excerpt ||
      "Read Fixera's privacy policy — how we collect, use, and protect your personal data.",
    path: content?.seo?.canonical || "/privacy-policy",
    noindex: content?.seo?.noindex,
  });
}

export default async function PrivacyPolicyPage() {
  const content = await publicGetCms("policy", "privacy-policy");

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white pb-20">
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Privacy Policy", path: "/privacy-policy" },
        ])}
      />
      <div className="mx-auto max-w-4xl px-6 pt-24">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 p-[1.5px] shadow-md shadow-rose-100">
          <div className="relative rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white via-rose-50/50 to-pink-50/50 px-8 py-12 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-lg shadow-rose-200">
              <Shield size={22} />
            </div>
            <h1 className="bg-gradient-to-r from-rose-600 via-pink-500 to-orange-500 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
              {content?.title || "Privacy Policy"}
            </h1>
            {content?.excerpt && (
              <p className="mt-3 text-rose-600/80">{content.excerpt}</p>
            )}
          </div>
        </div>

        <div className="mt-10 rounded-3xl bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 p-[1.5px] shadow-md shadow-rose-100">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-white px-8 py-10">
            {content?.body ? (
              <RichTextRenderer html={content.body} />
            ) : (
              <div className="py-10 text-center">
                <h2 className="text-xl font-semibold text-rose-900">Privacy policy coming soon</h2>
                <p className="mt-2 text-sm text-rose-500">This content is being prepared and will be published shortly.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
