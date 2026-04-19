import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("/professional/projects", "Professional projects");

export default function ProfessionalProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
