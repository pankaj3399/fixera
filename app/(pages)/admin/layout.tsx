import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("/admin", "Admin");

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
