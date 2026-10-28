import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { noindexMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return noindexMetadata("/dashboard", t("meta.title"));
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
