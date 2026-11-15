import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema, localBusinessSchema } from "@/lib/seo/jsonLd";
import { buildMetadata, noindexMetadata } from "@/lib/seo/metadata";
import { getPublicProfessional } from "@/lib/server/publicEntities";
import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";
import { routeContext } from "@/lib/server/routeContext";

interface Props {
  children: React.ReactNode;
  params: Promise<{ ctx: string; id: string }>;
}

/** Rendered on the first visit of each profile, then cached (ISR). */
export function generateStaticParams(): Array<{ id: string }> {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ ctx: string; id: string }> }): Promise<Metadata> {
  await routeContext(params);
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
  const professional = lookup.data;
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
  await routeContext(params);
  const { id } = await params;
  const t = await getTranslations("professionalProfile");
  const lookup = await getPublicProfessional(id);
  const professional = lookup.status === "found" ? lookup.data : null;

  const schemas: Array<Record<string, unknown>> = [
    breadcrumbSchema([
      { name: t("meta.breadcrumbHome"), path: "/" },
      { name: t("meta.breadcrumbProfessionals"), path: "/professionals" },
      { name: professional?.name || t("meta.breadcrumbFallback"), path: `/professional/${id}` },
    ]),
  ];

  // Rating data is left out here: it comes from the reviews endpoint, not from this record.
  if (professional) {
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
      })
    );
  }

  return (
    <ScopedIntlProvider scope="professionalProfile">
      <JsonLd data={schemas} />
      {children}
    </ScopedIntlProvider>
  );
}
