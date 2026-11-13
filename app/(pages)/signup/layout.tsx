import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { noindexMetadata } from "@/lib/seo/metadata";
import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return noindexMetadata("/signup", t("meta.signup"));
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <ScopedIntlProvider scope="signup">{children}</ScopedIntlProvider>;
}
