import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { noindexMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("chat");
  return noindexMetadata("/chat", t("meta.title"));
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
