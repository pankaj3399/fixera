import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { serviceCategories } from "@/data/content";
import { buildMetadata } from "@/lib/seo/metadata";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/jsonLd";

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

export async function generateMetadata({ params }: { params: Promise<{ categorySlug: string }> }): Promise<Metadata> {
  const { categorySlug } = await params;
  const t = await getTranslations("catalog");
  const cat = serviceCategories.find((c) => c.slug === categorySlug);
  if (!cat) notFound();
  const translated = isTranslatedCategorySlug(categorySlug);
  const name = translated ? t(`names.categories.${categorySlug}.name`) : cat.name;
  return buildMetadata({
    title: name,
    description: translated
      ? t(`names.categories.${categorySlug}.description`)
      : cat.description || t("categoryLayout.fallbackDescription", { category: name.toLowerCase() }),
    path: `/categories/${categorySlug}`,
  });
}

export default async function CategoryLayout({ children, params }: Props) {
  const { categorySlug } = await params;
  const t = await getTranslations("catalog");
  const cat = serviceCategories.find((c) => c.slug === categorySlug);
  if (!cat) notFound();
  const categoryName = isTranslatedCategorySlug(categorySlug)
    ? t(`names.categories.${categorySlug}.name`)
    : cat.name;
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: t("breadcrumbs.home"), path: "/" },
          { name: t("breadcrumbs.categories"), path: "/categories" },
          { name: categoryName, path: `/categories/${categorySlug}` },
        ])}
      />
      {children}
    </>
  );
}
