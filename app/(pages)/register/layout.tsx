import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("/register", "Register");

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
