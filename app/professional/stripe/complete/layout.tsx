import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";
import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";

/** Stripe Connect return page. Account-specific and transactional, so never indexed. */
export function generateMetadata(): Metadata {
  return noindexMetadata("/professional/stripe/complete", "Stripe onboarding");
}

export default function StripeCompleteLayout({ children }: { children: React.ReactNode }) {
  return <ScopedIntlProvider scope="authenticated">{children}</ScopedIntlProvider>;
}
