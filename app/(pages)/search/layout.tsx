import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("search");
  return buildMetadata({
    title: t("meta.title"),
    description: t("meta.description"),
    path: "/search",
  });
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
