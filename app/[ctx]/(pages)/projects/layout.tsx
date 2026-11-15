import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo/metadata";
import { routeContext, type RouteContextParams } from "@/lib/server/routeContext";

export async function generateMetadata({ params }: { params: RouteContextParams }): Promise<Metadata> {
  await routeContext(params);
  const t = await getTranslations("projects");
  return buildMetadata({
    title: t("meta.projectsTitle"),
    description: t("meta.projectsDescription"),
    path: "/projects",
  });
}

export default async function ProjectsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: RouteContextParams;
}) {
  await routeContext(params);
  return children;
}
