import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { CmsContent, CmsContentType, humanizeCmsSlug } from "@/lib/cms";
import {
  findServiceMeta,
  isTranslatedServiceId,
  navServiceNameKey,
} from "@/lib/services/serviceNames";
import BlogCard from "@/components/cms/BlogCard";

interface Props {
  relatedServiceSlug?: string;
  relatedServiceLabel?: string;
  relatedContent?: CmsContent["relatedContent"];
}

type RelatedCard = {
  item: CmsContent;
  basePath: "blog" | "news";
};

function asRelatedCards(relatedContent?: CmsContent["relatedContent"]): RelatedCard[] {
  if (!Array.isArray(relatedContent)) return [];
  const out: RelatedCard[] = [];

  for (const r of relatedContent) {
    if (!r || typeof r === "string") continue;
    if (!r._id || !r.title || !r.slug) continue;
    const type = r.type as CmsContentType | undefined;
    if (type !== "blog" && type !== "news") continue;
    out.push({
      basePath: type,
      item: {
        _id: r._id,
        title: r.title,
        slug: r.slug,
        type,
        locale: "en",
        body: "",
        excerpt: r.excerpt,
        coverImage: r.coverImage,
        coverImageAlt: r.coverImageAlt,
        tags: [],
        status: "published",
        publishedAt: r.publishedAt,
        updatedAt: r.updatedAt || r.publishedAt || "",
        createdAt: r.createdAt || "",
        seo: {},
      },
    });
  }
  return out;
}

export default async function ArticleRelatedSections({
  relatedServiceSlug,
  relatedServiceLabel,
  relatedContent,
}: Props) {
  const t = await getTranslations("content");
  const tCatalog = await getTranslations("catalog");
  const serviceSlug = relatedServiceSlug?.trim();
  const cards = asRelatedCards(relatedContent);
  // Prefer the localized catalog name over a humanized slug so e.g. French
  // articles link "Découvrir Services de plomberie", not English fragments.
  const serviceMeta = serviceSlug ? findServiceMeta(serviceSlug) : null;
  const serviceNameKey = serviceMeta
    ? isTranslatedServiceId(serviceMeta.id)
      ? (`names.services.${serviceMeta.id}.name` as const)
      : navServiceNameKey(serviceMeta)
    : undefined;
  const serviceLabel =
    relatedServiceLabel?.trim() ||
    (serviceNameKey ? tCatalog(serviceNameKey) : undefined) ||
    (serviceSlug ? humanizeCmsSlug(serviceSlug) : "");

  if (!serviceSlug && cards.length === 0) return null;

  return (
    <div className="mt-14 space-y-12 border-t border-rose-100 pt-10">
      {serviceSlug && (
        <section className="rounded-3xl bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 p-[1.5px] shadow-md shadow-rose-100">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white via-rose-50/40 to-pink-50/40 px-6 py-6 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">{t("articleRelated.relatedService")}</p>
            <h2 className="mt-1 text-xl font-bold text-rose-900 sm:text-2xl">
              {t("articleRelated.exploreService", { service: serviceLabel })}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-rose-600/80">
              {t("articleRelated.serviceDescription")}
            </p>
            <Link
              href={`/services/${encodeURIComponent(serviceSlug)}`}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:shadow-lg hover:shadow-rose-300"
            >
              {t("articleRelated.viewService", { service: serviceLabel })} <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      )}

      {cards.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-rose-900">{t("articleRelated.relatedReading")}</h2>
          <p className="mt-1 text-sm text-rose-600/80">{t("articleRelated.relatedReadingDescription")}</p>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            {cards.map(({ item, basePath }) => (
              <BlogCard key={item._id} item={item} basePath={basePath} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
