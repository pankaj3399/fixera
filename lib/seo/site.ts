export const siteUrl = (): string => {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return raw.replace(/\/$/, "");
};

export const SITE_NAME = "Fixera";
export const SITE_TAGLINE = "One Platform, Every Solution.";
export const SITE_DESCRIPTION =
  "Fixera connects customers with verified professionals for any property service — from minor repairs to full renovations. Get the job done with quality and security guaranteed.";
export const OG_DEFAULT_IMAGE = "/fixera-logo.png";

export const absoluteUrl = (path: string): string => {
  if (!path) return siteUrl();
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${p}`;
};
