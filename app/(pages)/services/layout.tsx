import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Services",
  description: "Browse the full catalog of services offered on Fixera — interior, exterior, structural, and more. Find verified professionals near you.",
  path: "/services",
});

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
