import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo/metadata";
import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";
import { routeContext, type RouteContextParams } from "@/lib/server/routeContext";

export async function generateMetadata({ params }: { params: RouteContextParams }): Promise<Metadata> {
  await routeContext(params);
  const t = await getTranslations("catalog");
  return buildMetadata({
    title: t("categoriesLayout.metaTitle"),
    description: t("categoriesLayout.metaDescription"),
    path: "/categories",
  });
}

export default async function CategoriesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: RouteContextParams;
}) {
  await routeContext(params);
  return <ScopedIntlProvider scope="categories">{children}</ScopedIntlProvider>;
}
