import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { noindexMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return noindexMetadata("/forgot-password", t("meta.forgotPassword"));
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
