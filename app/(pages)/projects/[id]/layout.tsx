import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema, serviceSchema } from "@/lib/seo/jsonLd";
import { buildMetadata, noindexMetadata } from "@/lib/seo/metadata";
import { getPublicProject } from "@/lib/server/publicEntities";

interface Props {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

const SCHEMA_DESCRIPTION_LENGTH = 300;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("projects");
  const safePath = `/projects/${encodeURIComponent(id)}`;
  const lookup = await getPublicProject(id);
  if (lookup.status === "not_found") {
    return noindexMetadata(safePath, t("meta.projectTitle"));
  }
  const project = lookup.status === "found" ? lookup.data : null;
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
  // No project image here: buildMetadata declares 1200x630, which a project photo does not match.
  return buildMetadata({
    title,
    description,
    path: safePath,
  });
}

export default async function ProjectLayout({ children, params }: Props) {
  const { id } = await params;
  const t = await getTranslations("projects");
  const lookup = await getPublicProject(id);
  const project = lookup.status === "found" ? lookup.data : null;
  const safePath = `/projects/${encodeURIComponent(id)}`;
  const title = project?.title || t("meta.projectTitle");

  // There is no /projects index page, so the trail goes Home > project.
  const schemas: Array<Record<string, unknown>> = [
    breadcrumbSchema([
      { name: t("meta.breadcrumbHome"), path: "/" },
      { name: title, path: safePath },
    ]),
  ];

  if (project) {
    // Service schema for the project's scope. Prices are left out on purpose: the amount
    // a customer sees depends on their pricing and currency, not on the public record.
    schemas.push(
      serviceSchema({
        name: title,
        description: project.description?.slice(0, SCHEMA_DESCRIPTION_LENGTH) || undefined,
        path: safePath,
      }),
    );
  }

  return (
    <>
      <JsonLd data={schemas} />
      {children}
    </>
  );
}
