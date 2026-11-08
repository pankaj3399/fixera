import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

/** Marketing unsubscribe confirmation. Token-driven and personal, so never indexed. */
export function generateMetadata(): Metadata {
  return noindexMetadata("/unsubscribe", "Unsubscribe");
}

export default function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
