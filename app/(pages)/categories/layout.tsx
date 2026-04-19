import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Service Categories",
  description: "Explore Fixera service categories — interior, exterior, structural, and more.",
  path: "/categories",
});

export default function CategoriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
