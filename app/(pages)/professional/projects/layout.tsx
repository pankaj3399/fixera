import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { noindexMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("proProjects");
  return noindexMetadata("/professional/projects", t("meta.title"));
}

export default function ProfessionalProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
