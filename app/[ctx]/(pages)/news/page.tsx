import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { type CmsContent } from "@/lib/cms";
import { publicListCms, shortenCmsUnavailableCache } from "@/lib/cms/public";
import CmsUnavailable from "@/components/cms/CmsUnavailable";
import BlogCard from "@/components/cms/BlogCard";
import { buildMetadata } from "@/lib/seo/metadata";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/jsonLd";
import { routeContext, type RouteContextParams } from "@/lib/server/routeContext";

export const revalidate = 21600;

export async function generateMetadata({ params }: { params: RouteContextParams }): Promise<Metadata> {
  await routeContext(params);
  const t = await getTranslations("content");
  return buildMetadata({
    title: t("news.metaTitle"),
    description: t("news.metaDescription"),
    path: "/news",
  });
}

interface PageProps {
  params: RouteContextParams;
}

export default async function NewsIndexPage({ params }: PageProps) {
  // `?page=&tag=` arrive in the route context (middleware), not as searchParams,
  // so every listing page is cached like the index itself.
  const { listing } = await routeContext(params);
  const t = await getTranslations("content");
  const page = listing?.page ?? 1;
  const tag = listing?.tag;
  let res: Awaited<ReturnType<typeof publicListCms>>;
  try {
    res = await publicListCms("news", { page, limit: 12, tag });
  } catch {
    // CA4: a localized outage state, never Next's bare 500 page.
    await shortenCmsUnavailableCache();
    return <CmsUnavailable retryHref="/news" backHref="/" backLabel={t("breadcrumbs.home")} />;
  }
  const items: CmsContent[] = res.items;
  const pagination = res.pagination;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white pt-24 pb-20">
      <JsonLd
        data={breadcrumbSchema([
          { name: t("breadcrumbs.home"), path: "/" },
          { name: t("breadcrumbs.news"), path: "/news" },
        ])}
      />
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 p-[1.5px] shadow-md shadow-rose-100">
          <div className="relative rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white via-rose-50/50 to-pink-50/50 px-8 py-12">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-rose-300/30 to-pink-300/30 blur-2xl" />
            <h1 className="relative bg-gradient-to-r from-rose-600 via-pink-500 to-orange-500 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
              {t("news.title")}
            </h1>
            <p className="relative mt-3 max-w-xl text-rose-600/80">
              {t("news.subtitle")}
            </p>
          </div>
        </div>

        <div className="mt-10">
          {items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-pink-300 bg-gradient-to-br from-rose-50 via-pink-50 to-white py-20 text-center">
              <h2 className="text-xl font-semibold text-rose-900">{t("news.emptyTitle")}</h2>
              <p className="mt-2 text-sm text-rose-500">{t("news.emptyDescription")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <BlogCard key={item._id} item={item} basePath="news" />
              ))}
            </div>
          )}
        </div>

        {pagination.totalPages > 1 && (() => {
          const link = (p: number) => {
            const qs = new URLSearchParams({ page: String(p) });
            if (tag) qs.set("tag", tag);
            return `/news?${qs.toString()}`;
          };
          return (
            <div className="mt-10 flex items-center justify-center gap-2">
              {page > 1 && (
                <Link href={link(page - 1)} className="rounded-xl border border-pink-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50">
                  {t("pagination.previous")}
                </Link>
              )}
              <span className="rounded-xl bg-gradient-to-r from-rose-100 to-pink-100 px-4 py-2 text-sm font-medium text-rose-700">
                {t("pagination.pageOf", { page, totalPages: pagination.totalPages })}
              </span>
              {page < pagination.totalPages && (
                <Link href={link(page + 1)} className="rounded-xl bg-gradient-to-r from-rose-400 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:shadow-lg hover:shadow-rose-300">
                  {t("pagination.next")}
                </Link>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
