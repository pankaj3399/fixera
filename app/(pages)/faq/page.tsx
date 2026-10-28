import Link from "next/link";
import { HelpCircle } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { type FaqGroup } from "@/lib/cms";
import { publicGetFaq } from "@/lib/cms/public";
import FaqAccordion from "@/components/cms/FaqAccordion";
import { buildMetadata } from "@/lib/seo/metadata";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/jsonLd";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

export const revalidate = 21600;

/**
 * FAQ group names come from the backend's hardcoded FAQ_CATEGORIES list, so the
 * public labels are translated here by category slug (unknown slugs fall back
 * to the backend name).
 */
const FAQ_CATEGORY_KEYS = {
  general: "faq.categories.general",
  booking: "faq.categories.booking",
  "payments-invoicing": "faq.categories.paymentsInvoicing",
  "warranty-disputes": "faq.categories.warrantyDisputes",
  professionals: "faq.categories.professionals",
  account: "faq.categories.account",
} as const;

function faqCategoryKey(slug: string) {
  return FAQ_CATEGORY_KEYS[slug as keyof typeof FAQ_CATEGORY_KEYS];
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("content");
  return buildMetadata({
    title: t("faq.metaTitle"),
    description: t("faq.metaDescription"),
    path: "/faq",
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default async function FaqPage() {
  const t = await getTranslations("content");

  let groups: FaqGroup[];
  try {
    const res = await publicGetFaq();
    groups = res.groups;
  } catch (error) {
    if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) throw error;
    groups = [];
  }

  const faqItems = groups.flatMap((g) =>
    (g.items || []).map((it) => ({
      question: it.title,
      answer: stripHtml(it.body || ""),
    }))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white pb-20">
      {faqItems.length > 0 && <JsonLd data={faqSchema(faqItems)} />}
      <JsonLd
        data={breadcrumbSchema([
          { name: t("breadcrumbs.home"), path: "/" },
          { name: t("breadcrumbs.faq"), path: "/faq" },
        ])}
      />
      <div className="mx-auto max-w-4xl px-6 pt-24">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 p-[1.5px] shadow-md shadow-rose-100">
          <div className="relative rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white via-rose-50/50 to-pink-50/50 px-8 py-12 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-lg shadow-rose-200">
              <HelpCircle size={22} />
            </div>
            <h1 className="bg-gradient-to-r from-rose-600 via-pink-500 to-orange-500 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
              {t("faq.title")}
            </h1>
            <p className="mt-3 text-rose-600/80">{t("faq.subtitle")}</p>
          </div>
        </div>

        {groups.length > 0 && (
          <nav className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {groups.map((g) => {
              const key = faqCategoryKey(g.slug);
              return (
                <a
                  key={g.slug}
                  href={`#${g.slug}`}
                  className="rounded-full border border-pink-200 bg-white/60 px-4 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-gradient-to-r hover:from-rose-100 hover:to-pink-100 hover:text-rose-900"
                >
                  {key ? t(key) : g.name}
                </a>
              );
            })}
          </nav>
        )}

        <div className="mt-10">
          {groups.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-pink-300 bg-gradient-to-br from-rose-50 via-pink-50 to-white py-20 text-center">
              <h2 className="text-xl font-semibold text-rose-900">{t("faq.emptyTitle")}</h2>
              <p className="mt-2 text-sm text-rose-500">{t("faq.emptyDescription")}</p>
            </div>
          ) : (
            <FaqAccordion groups={groups} />
          )}
        </div>

        <div className="mt-14 rounded-3xl bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 p-[1.5px] shadow-lg shadow-rose-200">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-white px-8 py-10 text-center">
            <h3 className="text-xl font-bold text-rose-900">{t("faq.stillQuestions")}</h3>
            <p className="mt-2 text-sm text-rose-600">{t("faq.happyToHelp")}</p>
            <Link
              href="/chat"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:shadow-lg hover:shadow-rose-300 hover:scale-[1.02]"
            >
              {t("faq.contactSupport")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
