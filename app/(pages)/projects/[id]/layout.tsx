import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/jsonLd";
import { buildMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

interface Props {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

interface ProjectData {
  _id?: string;
  title?: string;
  description?: string;
  coverImage?: string;
  images?: string[];
  professionalId?: { name?: string; businessInfo?: { companyName?: string } };
}

async function fetchProject(id: string): Promise<ProjectData | null> {
  try {
    const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
    const res = await fetch(`${base}/api/public/projects/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.project || data?.data || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("projects");
  const project = await fetchProject(id);
  const safePath = `/projects/${encodeURIComponent(id)}`;
  if (!project) {
    return buildMetadata({
      title: t("meta.projectTitle"),
      description: t("meta.projectDescription"),
      path: safePath,
    });
  }
  const title = project.title || t("meta.projectTitle");
  const description =
    (project.description && project.description.slice(0, 160)) ||
    t("meta.projectFallbackDescription", { title: title.toLowerCase() });
  const image = project.coverImage || project.images?.[0];
  return buildMetadata({
    title,
    description,
    path: safePath,
    image,
  });
}

export default async function ProjectLayout({ children, params }: Props) {
  const { id } = await params;
  const t = await getTranslations("projects");
  const project = await fetchProject(id);
  const safePath = `/projects/${encodeURIComponent(id)}`;
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: t("meta.breadcrumbHome"), path: "/" },
          { name: t("meta.breadcrumbProjects"), path: "/projects" },
          { name: project?.title || t("meta.projectTitle"), path: safePath },
        ])}
      />
      {children}
    </>
  );
}
