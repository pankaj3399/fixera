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

interface Props {
  children: React.ReactNode;
  params: Promise<{ categorySlug: string }>;
}

/**
 * Live catalog categories only (cached fetch; outage falls back to the
 * built-in category list); see resolveCategoryRoute for the redirect/404
 * rules. Deduped per request so metadata and layout share one lookup.
 */
const resolveCategory = cache(async (categorySlug: string): Promise<CategoryLayoutMatch> => {
  const country = readContentCountry(await headers()) ?? "BE";
  const route = resolveCategoryRoute(categorySlug, serviceCategories, await getServiceCategories(country));
  if (route.kind === "redirect") permanentRedirect(route.to);
  if (route.kind === "not_found") notFound();
  return route.category;
});

export async function generateMetadata({ params }: { params: Promise<{ categorySlug: string }> }): Promise<Metadata> {
  const { categorySlug } = await params;
  const t = await getTranslations("catalog");
  const cat = await resolveCategory(categorySlug);
  return buildMetadata({
    title: cat.name,
    description: t("categoryLayout.fallbackDescription", { category: cat.name.toLowerCase() }),
    path: `/categories/${cat.slug}`,
  });
}

export default async function CategoryLayout({ children, params }: Props) {
  const { categorySlug } = await params;
  const t = await getTranslations("catalog");
  const cat = await resolveCategory(categorySlug);
  const categoryName = cat.name;
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: t("breadcrumbs.home"), path: "/" },
          { name: t("breadcrumbs.categories"), path: "/categories" },
          { name: categoryName, path: `/categories/${cat.slug}` },
        ])}
      />
      {children}
    </>
  );
}
