import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { serviceCategories } from "@/data/content";
import { buildMetadata } from "@/lib/seo/metadata";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/jsonLd";
import { getServiceCategories } from "@/lib/server/serviceCategories";
import { parseVisitorCountryCode } from "@/lib/cms/visitorCountry";
import { findCategoryForLayout, type CategoryLayoutMatch } from "@/lib/catalog/categoryLayoutLookup";

interface Props {
  children: React.ReactNode;
  params: Promise<{ categorySlug: string }>;
}

/** Catalog categories with translated copy in the `catalog` namespace. */
const TRANSLATED_CATEGORY_SLUGS = [
  "interior-services",
  "exterior-structural",
  "outdoor-garden",
] as const;

function isTranslatedCategorySlug(
  slug: string
): slug is (typeof TRANSLATED_CATEGORY_SLUGS)[number] {
  return (TRANSLATED_CATEGORY_SLUGS as readonly string[]).includes(slug);
}

/**
 * Static marketing slugs first, then the live catalog the subnav links to
 * (cached fetch; outage falls back to the built-in category list). Deduped
 * per request so metadata and layout share one lookup.
 */
const resolveCategory = cache(async (categorySlug: string): Promise<CategoryLayoutMatch | null> => {
  const staticMatch = findCategoryForLayout(categorySlug, serviceCategories, []);
  if (staticMatch) return staticMatch;
  const country = parseVisitorCountryCode((await headers()).get("x-vercel-ip-country")) ?? "BE";
  return findCategoryForLayout(categorySlug, [], await getServiceCategories(country));
});

export async function generateMetadata({ params }: { params: Promise<{ categorySlug: string }> }): Promise<Metadata> {
  const { categorySlug } = await params;
  const t = await getTranslations("catalog");
  const cat = await resolveCategory(categorySlug);
  if (!cat) notFound();
  const slug = cat.slug;
  const name = isTranslatedCategorySlug(slug) ? t(`names.categories.${slug}.name`) : cat.name;
  return buildMetadata({
    title: name,
    description: isTranslatedCategorySlug(slug)
      ? t(`names.categories.${slug}.description`)
      : cat.description || t("categoryLayout.fallbackDescription", { category: name.toLowerCase() }),
    path: `/categories/${cat.slug}`,
  });
}

export default async function CategoryLayout({ children, params }: Props) {
  const { categorySlug } = await params;
  const t = await getTranslations("catalog");
  const cat = await resolveCategory(categorySlug);
  if (!cat) notFound();
  const slug = cat.slug;
  const categoryName = isTranslatedCategorySlug(slug)
    ? t(`names.categories.${slug}.name`)
    : cat.name;
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
