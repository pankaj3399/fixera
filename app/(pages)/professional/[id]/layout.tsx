import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema, localBusinessSchema } from "@/lib/seo/jsonLd";
import { buildMetadata, noindexMetadata } from "@/lib/seo/metadata";
import { getPublicProfessional } from "@/lib/server/publicEntities";

interface Props {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("professionalProfile");
  const path = `/professional/${id}`;
  const lookup = await getPublicProfessional(id);
  if (lookup.status === "not_found") {
    return noindexMetadata(path, t("meta.fallbackTitle"));
  }
  if (lookup.status !== "found") {
    return buildMetadata({
      title: t("meta.fallbackTitle"),
      description: t("meta.fallbackDescription"),
      path,
    });
  }
  const professional = lookup.data.professional;
  const name = professional.name || t("meta.fallbackTitle");
  const city = professional.businessInfo?.city || professional.location?.city;
  const country = professional.businessInfo?.country || professional.location?.country;
  const where = [city, country].filter(Boolean).join(", ");
  const description =
    professional.businessInfo?.description ||
    (where
      ? t("meta.descriptionWithLocation", { name, where })
      : t("meta.descriptionNoLocation", { name }));
  return buildMetadata({
    title: name,
    description,
    path,
    image: professional.profileImage,
  });
}

export default async function ProfessionalLayout({ children, params }: Props) {
  const { id } = await params;
  const t = await getTranslations("professionalProfile");
  const lookup = await getPublicProfessional(id);
  const data = lookup.status === "found" ? lookup.data : null;
  const professional = data?.professional ?? null;

  const schemas: Array<Record<string, unknown>> = [
    breadcrumbSchema([
      { name: t("meta.breadcrumbHome"), path: "/" },
      { name: t("meta.breadcrumbProfessionals"), path: "/professionals" },
      { name: professional?.name || t("meta.breadcrumbFallback"), path: `/professional/${id}` },
    ]),
  ];

  if (professional && data) {
    const { overallAverage, totalReviews } = data.ratingsSummary;
    schemas.push(
      localBusinessSchema({
        name: professional.name || t("meta.fallbackTitle"),
        path: `/professional/${id}`,
        image: professional.profileImage,
        description: professional.businessInfo?.description,
        address: {
          addressLocality: professional.businessInfo?.city || professional.location?.city,
          addressCountry: professional.businessInfo?.country || professional.location?.country,
        },
        aggregateRating:
          typeof overallAverage === "number" && totalReviews > 0
            ? { ratingValue: Number(overallAverage.toFixed(2)), reviewCount: totalReviews }
            : undefined,
      })
    );
  }

  return (
    <>
      <JsonLd data={schemas} />
      {children}
    </>
  );
}
