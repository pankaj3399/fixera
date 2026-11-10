export const siteUrl = (): string => {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    const isBuild = process.env.NEXT_PHASE === "phase-production-build";
    if (process.env.NODE_ENV === "production" && !isBuild) {
      throw new Error(
        "siteUrl: NEXT_PUBLIC_SITE_URL must be set in production — unset would emit localhost URLs in sitemap, canonical, and OG tags."
      );
    }
    if (isBuild) {
      console.warn(
        "siteUrl: NEXT_PUBLIC_SITE_URL is not set during build — falling back to localhost. Ensure the env is configured in the deployment environment before serving traffic."
      );
    }
    return "http://localhost:3000";
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `siteUrl: NEXT_PUBLIC_SITE_URL="${raw}" is not a valid URL. Expected an absolute http(s) origin like https://fixtract.com.`
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `siteUrl: NEXT_PUBLIC_SITE_URL="${raw}" must use http: or https: protocol (got "${parsed.protocol}").`
    );
  }
  return parsed.origin;
};

export const SITE_NAME = "Fixtract";
export const SITE_TAGLINE = "One Platform, Every Solution.";
/**
 * English fallback for contexts without a request locale (manifest, JSON-LD,
 * synchronous noindex/admin metadata). Localized pages use
 * `common.meta.siteDescription` through `buildMetadata` / the root layout.
 */
export const SITE_DESCRIPTION =
  "Fixtract connects customers with verified professionals for any property service — from minor repairs to full renovations. Get the job done with quality and security guaranteed.";
/** 1200×630 social card (public/og-default.png). Matches the dimensions declared in metadata. */
export const OG_DEFAULT_IMAGE = "/og-default.png";

export const absoluteUrl = (path: string): string => {
  if (!path) return siteUrl();
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${p}`;
};
