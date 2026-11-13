import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { noindexMetadata } from "@/lib/seo/metadata";
import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support");
  return noindexMetadata("/support", t("meta.title"));
}

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return <ScopedIntlProvider scope="support">{children}</ScopedIntlProvider>;
}
