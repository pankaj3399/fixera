import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("/join", "Join Fixera");

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
