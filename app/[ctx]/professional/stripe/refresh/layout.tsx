import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";
import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";
import { routeContext, type RouteContextParams } from "@/lib/server/routeContext";

/** Stripe Connect return page. Account-specific and transactional, so never indexed. */
export function generateMetadata(): Metadata {
  return noindexMetadata("/professional/stripe/refresh", "Stripe onboarding");
}

export default async function StripeRefreshLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: RouteContextParams;
}) {
  await routeContext(params);
  return <ScopedIntlProvider scope="authenticated">{children}</ScopedIntlProvider>;
}
