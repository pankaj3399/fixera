import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { noindexMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return noindexMetadata("/profile", t("meta.profile"));
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
