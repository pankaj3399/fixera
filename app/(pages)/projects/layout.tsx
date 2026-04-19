import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Projects",
  description: "Browse projects from verified Fixera professionals — before/after galleries, case studies, and portfolios.",
  path: "/projects",
});

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
