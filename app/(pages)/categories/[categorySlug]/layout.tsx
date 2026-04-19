import type { Metadata } from "next";
import { serviceCategories } from "@/data/content";
import { buildMetadata } from "@/lib/seo/metadata";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/jsonLd";

interface Props {
  children: React.ReactNode;
  params: Promise<{ categorySlug: string }>;
}

function prettify(slug: string) {
  return slug
    .split("-")
    .map((part) => (part.length ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export async function generateMetadata({ params }: { params: Promise<{ categorySlug: string }> }): Promise<Metadata> {
  const { categorySlug } = await params;
  const cat = serviceCategories.find((c) => c.slug === categorySlug);
  const name = cat?.name || prettify(categorySlug);
  return buildMetadata({
    title: name,
    description: cat?.description || `Browse verified professionals offering ${name.toLowerCase()} services on Fixera.`,
    path: `/categories/${categorySlug}`,
  });
}

export default async function CategoryLayout({ children, params }: Props) {
  const { categorySlug } = await params;
  const cat = serviceCategories.find((c) => c.slug === categorySlug);
  const name = cat?.name || prettify(categorySlug);
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Categories", path: "/categories" },
          { name, path: `/categories/${categorySlug}` },
        ])}
      />
      {children}
    </>
  );
}
