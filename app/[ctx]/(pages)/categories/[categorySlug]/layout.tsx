import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { serviceCategories } from "@/data/content";
import { buildMetadata } from "@/lib/seo/metadata";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/jsonLd";
import { getServiceCategories } from "@/lib/server/serviceCategories";
import { resolveCategoryRoute, type CategoryLayoutMatch } from "@/lib/catalog/categoryLayoutLookup";
import { CatalogCountryProvider, type InitialCatalogCategory } from "@/components/catalog/CatalogCountryContext";
import { localizedPath } from "@/lib/seo/localeUrls";
import type { Locale } from "@/i18n/config";
import { urlLocaleOf, type RouteContext } from "@/lib/routeContext";
import { routeContext } from "@/lib/server/routeContext";

const categoryNameKeys = {
  "interior-services": "names.categories.interior-services.name",
  "exterior-structural": "names.categories.exterior-structural.name",
  "outdoor-garden": "names.categories.outdoor-garden.name",
} as const;

type CategoryParams = Promise<{ ctx: string; categorySlug: string }>;

interface Props {
  children: React.ReactNode;
  params: CategoryParams;
}

/** Category pages are rendered on their first visit, then cached (ISR). */
export function generateStaticParams(): Array<{ categorySlug: string }> {
  return [];
}

/**
 * Live catalog results authorize redirects/404s; the static outage fallback
 * preserves the route so its client can retry. Metadata and layout share
 * one request-scoped lookup.
 */
/** One content country per route context, shared by the server lookup and the client page. */
const contentCountryOf = (context: RouteContext): string => context.country ?? "BE";

/**
 * A redirect keeps the language prefix of the URL it came from: `/nl/categories/old` goes to
 * `/nl/categories/live`, not to the unprefixed page, which would switch the visitor's language.
 */
function redirectTarget(urlLocale: Locale | undefined, to: string): string {
  return urlLocale ? localizedPath(urlLocale, to) : to;
}

/** One live catalog read per country, shared by route resolution and the page's initial data. */
const loadLiveCategories = cache(async (country: string) => getServiceCategories(country));

const resolveCategoryCached = cache(async (
  country: string,
  urlLocale: Locale | undefined,
  categorySlug: string,
): Promise<CategoryLayoutMatch> => {
  const route = resolveCategoryRoute(categorySlug, serviceCategories, await loadLiveCategories(country));
  if (route.kind === "redirect") permanentRedirect(redirectTarget(urlLocale, route.to));
  if (route.kind === "not_found") notFound();
  return route.category;
});

const resolveCategory = (context: RouteContext, categorySlug: string) =>
  resolveCategoryCached(contentCountryOf(context), urlLocaleOf(context), categorySlug);

export async function generateMetadata({ params }: { params: CategoryParams }): Promise<Metadata> {
  const context = await routeContext(params);
  const { categorySlug } = await params;
  const t = await getTranslations("catalog");
  const cat = await resolveCategory(context, categorySlug);
  const nameKey = categoryNameKeys[cat.slug as keyof typeof categoryNameKeys];
  const categoryName = nameKey ? t(nameKey) : cat.name;
  return buildMetadata({
    title: categoryName,
    description: t("categoryLayout.fallbackDescription", { category: categoryName.toLowerCase() }),
    path: `/categories/${cat.slug}`,
  });
}

/** The live category with its services (null on the static outage fallback). */
async function initialCategoryFor(country: string, slug: string): Promise<InitialCatalogCategory | null> {
  const live = (await loadLiveCategories(country)).find((category) => category.slug === slug && !category.isFallback);
  if (!live) return null;
  return {
    name: live.name,
    slug: live.slug,
    services: (live.services || [])
      .filter((service) => typeof service?.slug === "string" && typeof service?.name === "string")
      .map((service) => ({ name: service.name, slug: service.slug })),
  };
}

export default async function CategoryLayout({ children, params }: Props) {
  const context = await routeContext(params);
  const { categorySlug } = await params;
  const t = await getTranslations("catalog");
  const cat = await resolveCategory(context, categorySlug);
  const country = contentCountryOf(context);
  const initialCategory = await initialCategoryFor(country, cat.slug);
  const nameKey = categoryNameKeys[cat.slug as keyof typeof categoryNameKeys];
  const categoryName = nameKey ? t(nameKey) : cat.name;
  return (
    <CatalogCountryProvider country={country} initialCategory={initialCategory}>
      <JsonLd
        data={breadcrumbSchema([
          { name: t("breadcrumbs.home"), path: "/" },
          // /categories has no index page; the services listing is the real parent.
          { name: t("breadcrumbs.services"), path: "/services" },
          { name: categoryName, path: `/categories/${cat.slug}` },
        ])}
      />
      {children}
    </CatalogCountryProvider>
  );
}
