import type { Metadata } from "next";
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
    const res = await fetch(`${base}/api/public/projects/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.project || data?.data || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const project = await fetchProject(id);
  if (!project) {
    return buildMetadata({
      title: "Project",
      description: "View a published project on Fixera.",
      path: `/projects/${id}`,
    });
  }
  const title = project.title || "Project";
  const description =
    (project.description && project.description.slice(0, 160)) ||
    `A ${title.toLowerCase()} project listed by a verified Fixera professional.`;
  const image = project.coverImage || project.images?.[0];
  return buildMetadata({
    title,
    description,
    path: `/projects/${id}`,
    image,
  });
}

export default async function ProjectLayout({ children, params }: Props) {
  const { id } = await params;
  const project = await fetchProject(id);
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Projects", path: "/projects" },
          { name: project?.title || "Project", path: `/projects/${id}` },
        ])}
      />
      {children}
    </>
  );
}
