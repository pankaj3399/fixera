import { SITE_NAME, SITE_DESCRIPTION, absoluteUrl, siteUrl } from "./site";

export function organizationSchema() {
  const sameAs = (process.env.NEXT_PUBLIC_SOCIAL_URLS || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: siteUrl(),
    logo: absoluteUrl("/fixera-logo.png"),
    description: SITE_DESCRIPTION,
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: siteUrl(),
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl()}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export interface ArticleSchemaInput {
  title: string;
  description?: string;
  path: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  authorName?: string;
  tags?: string[];
}

export function articleSchema(input: ArticleSchemaInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    image: input.image ? absoluteUrl(input.image) : absoluteUrl("/fixera-logo.png"),
    datePublished: input.datePublished,
    dateModified: input.dateModified || input.datePublished,
    author: input.authorName
      ? { "@type": "Person", name: input.authorName }
      : { "@type": "Organization", name: SITE_NAME },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: absoluteUrl("/fixera-logo.png") },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(input.path) },
    keywords: input.tags?.join(", "),
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function faqSchema(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}

export interface ServiceSchemaInput {
  name: string;
  description?: string;
  path: string;
  category?: string;
  image?: string;
}

export function serviceSchema(input: ServiceSchemaInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    image: input.image ? absoluteUrl(input.image) : undefined,
    category: input.category,
    provider: { "@type": "Organization", name: SITE_NAME, url: siteUrl() },
  };
}

export interface LocalBusinessSchemaInput {
  name: string;
  path: string;
  image?: string;
  description?: string;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
  telephone?: string;
  aggregateRating?: { ratingValue: number; reviewCount: number };
  priceRange?: string;
}

export function localBusinessSchema(input: LocalBusinessSchemaInput) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: input.name,
    url: absoluteUrl(input.path),
    description: input.description,
    image: input.image ? absoluteUrl(input.image) : absoluteUrl("/fixera-logo.png"),
    priceRange: input.priceRange,
    telephone: input.telephone,
  };
  if (input.address) {
    schema.address = { "@type": "PostalAddress", ...input.address };
  }
  if (input.aggregateRating && input.aggregateRating.reviewCount > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: input.aggregateRating.ratingValue,
      reviewCount: input.aggregateRating.reviewCount,
    };
  }
  return schema;
}
