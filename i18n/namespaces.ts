/**
 * Message namespaces for the app.
 *
 * Convention: one JSON file per namespace per locale, stored in
 * `messages/<locale>/<namespace>.json` (locales: en, nl, fr).
 * `i18n/request.ts` merges every namespace file into a single message tree
 * shaped like `{ [namespace]: json }`, so the JSON files must NOT wrap their
 * content in the namespace name.
 *
 * Adding a namespace later = add the name here + 3 json files.
 * Admin panel (app/(pages)/admin/**, components/admin/**) deliberately stays
 * English and must never get a namespace here unless explicitly approved.
 */
export const NAMESPACES = [
  "common",
  "nav",
  "footer",
  "cookieConsent",
  "localeSwitcher",
  "home",
  "content",
  "catalog",
  "auth",
  "search",
  "professionalProfile",
  "favorites",
  "projects",
  "chat",
] as const;

export type Namespace = (typeof NAMESPACES)[number];
