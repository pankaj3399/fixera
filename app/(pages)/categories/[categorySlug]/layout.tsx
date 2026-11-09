import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { serviceCategories } from "@/data/content";
import { buildMetadata } from "@/lib/seo/metadata";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/jsonLd";
import { getServiceCategories } from "@/lib/server/serviceCategories";
import { readContentCountry } from "@/lib/geo/contentCountryHeader";
import { resolveCategoryRoute, type CategoryLayoutMatch } from "@/lib/catalog/categoryLayoutLookup";
import { CatalogCountryProvider } from "@/components/catalog/CatalogCountryContext";
import { isLocale } from "@/i18n/config";
import { URL_LOCALE_REQUEST_HEADER, localizedPath } from "@/lib/seo/localeUrls";

const categoryNameKeys = {
  "interior-services": "names.categories.interior-services.name",
  "exterior-structural": "names.categories.exterior-structural.name",
  "outdoor-garden": "names.categories.outdoor-garden.name",
} as const;

interface Props {
  children: React.ReactNode;
  params: Promise<{ categorySlug: string }>;
}

/**
 * Live catalog results authorize redirects/404s; the static outage fallback
 * preserves the route so its client can retry. Metadata and layout share
 * one request-scoped lookup.
 */
/** One content country per request, shared by the server lookup and the client page. */
const resolveContentCountry = cache(async (): Promise<string> => readContentCountry(await headers()) ?? "BE");

/**
 * A redirect keeps the language prefix of the URL it came from: `/nl/categories/old` goes to
 * `/nl/categories/live`, not to the unprefixed page, which would switch the visitor's language.
 */
async function redirectTarget(to: string): Promise<string> {
  const urlLocale = (await headers()).get(URL_LOCALE_REQUEST_HEADER);
  return isLocale(urlLocale) ? localizedPath(urlLocale, to) : to;
}

const resolveCategory = cache(async (categorySlug: string): Promise<CategoryLayoutMatch> => {
  const country = await resolveContentCountry();
  const route = resolveCategoryRoute(categorySlug, serviceCategories, await getServiceCategories(country));
  if (route.kind === "redirect") permanentRedirect(await redirectTarget(route.to));
  if (route.kind === "not_found") notFound();
  return route.category;
});

export async function generateMetadata({ params }: { params: Promise<{ categorySlug: string }> }): Promise<Metadata> {
  const { categorySlug } = await params;
  const t = await getTranslations("catalog");
  const cat = await resolveCategory(categorySlug);
  const nameKey = categoryNameKeys[cat.slug as keyof typeof categoryNameKeys];
  const categoryName = nameKey ? t(nameKey) : cat.name;
  return buildMetadata({
    title: categoryName,
    description: t("categoryLayout.fallbackDescription", { category: categoryName.toLowerCase() }),
    path: `/categories/${cat.slug}`,
  });
}

export default async function CategoryLayout({ children, params }: Props) {
  const { categorySlug } = await params;
  const t = await getTranslations("catalog");
  const cat = await resolveCategory(categorySlug);
  const country = await resolveContentCountry();
  const nameKey = categoryNameKeys[cat.slug as keyof typeof categoryNameKeys];
  const categoryName = nameKey ? t(nameKey) : cat.name;
  return (
    <CatalogCountryProvider country={country}>
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
