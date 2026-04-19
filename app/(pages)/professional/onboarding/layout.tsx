import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("/professional/onboarding", "Professional onboarding");

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
