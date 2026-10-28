import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projects");
  return buildMetadata({
    title: t("meta.projectsTitle"),
    description: t("meta.projectsDescription"),
    path: "/projects",
  });
}

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
