import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";
import { siteUrl } from "@/lib/seo/site";

/** Private page paths. Pages behind them are noindex; the list is also the disallow list. */
const PRIVATE_PAGE_PATHS = [
  "/admin",
  "/admin/*",
  "/dashboard",
  "/dashboard/*",
  "/chat",
  "/chat/*",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

/** Non-page paths that stay disallowed for every group. */
const NON_PAGE_PATHS = ["/api/*", "/offline.html"];

/**
 * Private pages under a language prefix. They are not rewritten, so they 404 today, but
 * a prefixed variant must never become crawlable if one is added later.
 */
const PREFIXED_PRIVATE_PATHS = LOCALES.flatMap((locale) =>
  PRIVATE_PAGE_PATHS.map((path) => `/${locale}${path}`),
);

const DISALLOW = [...PRIVATE_PAGE_PATHS, ...PREFIXED_PRIVATE_PATHS, ...NON_PAGE_PATHS];

/**
 * AI search and answer crawlers, and AI training crawlers. The owner chose to stay
 * discoverable, so each is allowed explicitly with the same disallow list as `*`.
 * Naming them is deliberate: a crawler that matches its own group ignores `*`.
 */
const AI_CRAWLERS = [
  // Training
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  // Search and answer
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "PerplexityBot",
] as const;

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
