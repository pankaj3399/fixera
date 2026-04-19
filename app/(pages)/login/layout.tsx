import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("/login", "Sign in");

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
