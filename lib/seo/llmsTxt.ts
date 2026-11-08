import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "./site";

/**
 * Body of /llms.txt: a short, plain-text map of the public sections for AI assistants
 * and crawlers. Built from the same origin as the sitemap, so links match the canonical host.
 */
export function buildLlmsTxt(base: string = siteUrl()): string {
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "## Main sections",
    `- [Services](${base}/services): service categories and the services customers can book.`,
    `- [Professionals](${base}/professionals): verified professionals on the platform.`,
    `- [Join as a professional](${base}/join): how professionals sign up.`,
    `- [FAQ](${base}/faq): common questions about booking and working with Fixtract.`,
    `- [About](${base}/about): who Fixtract is.`,
    "",
    "## Content",
    `- [Blog](${base}/blog): articles and guides.`,
    `- [News](${base}/news): company and platform news.`,
    "",
    "## Individual pages",
    `- Project pages: ${base}/projects/{id}: a published project with its scope, packages and reviews.`,
    `- Professional profiles: ${base}/professional/{id}: services, reviews and profile details of a verified professional.`,
    "",
    "## Languages",
    `- Public pages are also served under a language prefix: ${base}/en/, ${base}/nl/ and ${base}/fr/ (for example ${base}/nl/about, ${base}/fr/faq). Each language version lists the others as alternates.`,
    `- Without a prefix the page is shown in the visitor's language. Prefer the prefixed URL when citing a specific language.`,
    "",
    "## Optional",
    `- [Privacy policy](${base}/privacy-policy)`,
    "",
  ].join("\n");
}
