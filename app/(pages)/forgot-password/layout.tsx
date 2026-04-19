import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("/forgot-password", "Forgot password");

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
