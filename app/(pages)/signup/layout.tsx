import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("/signup", "Sign up");

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
