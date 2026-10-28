import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { noindexMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("proArea");
  return noindexMetadata("/professional/earnings", t("meta.earnings"));
}

export default function EarningsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
