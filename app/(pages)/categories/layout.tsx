import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("catalog");
  return buildMetadata({
    title: t("categoriesLayout.metaTitle"),
    description: t("categoriesLayout.metaDescription"),
    path: "/categories",
  });
}

export default function CategoriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
