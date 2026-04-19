import type { Metadata } from "next";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema, localBusinessSchema } from "@/lib/seo/jsonLd";
import { buildMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

interface Props {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

interface ProfessionalData {
  _id?: string;
  name?: string;
  username?: string;
  profileImage?: string;
  businessInfo?: {
    description?: string;
    city?: string;
    country?: string;
    website?: string;
  };
  location?: { city?: string; country?: string };
}

interface RatingsSummary {
  totalReviews?: number;
  averageOverall?: number;
  avgOverall?: number;
  overallAverage?: number;
}

async function fetchProfessional(id: string): Promise<{ professional: ProfessionalData | null; ratings: RatingsSummary | null }> {
  try {
    const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
    const res = await fetch(`${base}/api/public/professionals/${id}/reviews?page=1&limit=1`, { cache: "no-store" });
    if (!res.ok) return { professional: null, ratings: null };
    const data = await res.json();
    return {
      professional: data?.data?.professional || null,
      ratings: data?.data?.ratingsSummary || null,
    };
  } catch {
    return { professional: null, ratings: null };
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { professional } = await fetchProfessional(id);
  if (!professional) {
    return buildMetadata({
      title: "Professional",
      description: "View a verified Fixera professional's profile, services, and reviews.",
      path: `/professional/${id}`,
    });
  }
  const name = professional.name || "Professional";
  const city = professional.businessInfo?.city || professional.location?.city;
  const country = professional.businessInfo?.country || professional.location?.country;
  const where = [city, country].filter(Boolean).join(", ");
  const description =
    professional.businessInfo?.description ||
    `${name}${where ? ` — verified Fixera professional in ${where}` : " on Fixera"}. View services, reviews, and book directly.`;
  return buildMetadata({
    title: name,
    description,
    path: `/professional/${id}`,
    image: professional.profileImage,
  });
}

export default async function ProfessionalLayout({ children, params }: Props) {
  const { id } = await params;
  const { professional, ratings } = await fetchProfessional(id);

  const schemas: Array<Record<string, unknown>> = [
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Professionals", path: "/professionals" },
      { name: professional?.name || "Profile", path: `/professional/${id}` },
    ]),
  ];

  if (professional) {
    const rating =
      ratings?.averageOverall ?? ratings?.avgOverall ?? ratings?.overallAverage;
    const reviewCount = ratings?.totalReviews || 0;
    schemas.push(
      localBusinessSchema({
        name: professional.name || "Professional",
        path: `/professional/${id}`,
        image: professional.profileImage,
        description: professional.businessInfo?.description,
        address: {
          addressLocality: professional.businessInfo?.city || professional.location?.city,
          addressCountry: professional.businessInfo?.country || professional.location?.country,
        },
        aggregateRating:
          typeof rating === "number" && reviewCount > 0
            ? { ratingValue: Number(rating.toFixed(2)), reviewCount }
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
