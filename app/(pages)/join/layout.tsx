import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return buildMetadata({
    title: t("meta.joinTitle"),
    description: t("meta.joinDescription"),
    path: "/join",
  });
}

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
