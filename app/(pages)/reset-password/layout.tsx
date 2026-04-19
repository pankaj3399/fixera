import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("/reset-password", "Reset password");

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
