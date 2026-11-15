import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { noindexMetadata } from "@/lib/seo/metadata";
import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";
import { routeContext, type RouteContextParams } from "@/lib/server/routeContext";

export async function generateMetadata({ params }: { params: RouteContextParams }): Promise<Metadata> {
  await routeContext(params);
  const t = await getTranslations("proArea");
  return noindexMetadata("/professional/onboarding", t("meta.onboarding"));
}

export default async function OnboardingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: RouteContextParams;
}) {
  await routeContext(params);
  return <ScopedIntlProvider scope="authenticated">{children}</ScopedIntlProvider>;
}
