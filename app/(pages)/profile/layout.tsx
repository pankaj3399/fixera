import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("/profile", "Profile");

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
