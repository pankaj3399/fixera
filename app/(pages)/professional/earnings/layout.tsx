import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("/professional/earnings", "Earnings");

export default function EarningsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
