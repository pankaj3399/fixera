import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Search",
  description: "Search Fixera for services, professionals, and projects across every category.",
  path: "/search",
});

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
