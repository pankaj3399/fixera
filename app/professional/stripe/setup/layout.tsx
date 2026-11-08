import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

/** Stripe Connect return page. Account-specific and transactional, so never indexed. */
export function generateMetadata(): Metadata {
  return noindexMetadata("/professional/stripe/setup", "Stripe onboarding");
}

export default function StripeSetupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
