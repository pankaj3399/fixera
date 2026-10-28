import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("catalog");
  return buildMetadata({
    title: t("servicesLayout.metaTitle"),
    description: t("servicesLayout.metaDescription"),
    path: "/services",
  });
}

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
