import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";
import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";

/** Stripe Connect return page. Account-specific and transactional, so never indexed. */
export function generateMetadata(): Metadata {
  return noindexMetadata("/professional/stripe/refresh", "Stripe onboarding");
}

export default function StripeRefreshLayout({ children }: { children: React.ReactNode }) {
  return <ScopedIntlProvider scope="authenticated">{children}</ScopedIntlProvider>;
}
