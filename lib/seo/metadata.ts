import type { Metadata } from "next";
import { SITE_NAME, SITE_DESCRIPTION, OG_DEFAULT_IMAGE, absoluteUrl, siteUrl } from "./site";

export interface BuildMetadataInput {
  title?: string;
  description?: string;
  path: string;
  image?: string;
  noindex?: boolean;
  type?: "website" | "article";
  keywords?: string[];
  publishedTime?: string;
  modifiedTime?: string;
  authorName?: string;
}

export function buildMetadata(input: BuildMetadataInput): Metadata {
  const {
    title,
    description = SITE_DESCRIPTION,
    path,
    image,
    noindex,
    type = "website",
    keywords,
    publishedTime,
    modifiedTime,
    authorName,
  } = input;

  const canonical = absoluteUrl(path);
  const ogImage = absoluteUrl(image || OG_DEFAULT_IMAGE);
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;

  const metadata: Metadata = {
    title: title || SITE_NAME,
    description,
    alternates: { canonical },
    keywords,
    openGraph: {
      type,
      url: canonical,
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: fullTitle }],
      locale: "en_US",
      ...(type === "article" && publishedTime ? { publishedTime } : {}),
      ...(type === "article" && modifiedTime ? { modifiedTime } : {}),
      ...(type === "article" && authorName ? { authors: [authorName] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [ogImage],
    },
  };

  if (noindex) {
    metadata.robots = { index: false, follow: false, nocache: true };
  }

  return metadata;
}

export function noindexMetadata(path: string, title?: string): Metadata {
  return buildMetadata({
    title,
    path,
    noindex: true,
  });
}

export { siteUrl };
