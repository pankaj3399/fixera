import { NAMESPACES, type Namespace } from "./namespaces";

/**
 * Which message namespaces are serialized to the browser.
 *
 * Every client component's `useTranslations` reads from the nearest
 * NextIntlClientProvider, and every byte of `messages` handed to it is
 * embedded in the page's HTML/RSC payload. Sending the whole catalogue
 * (~330 KB in en) on every page made each public render ship it through a
 * function, so:
 *
 * - The root layout sends only ROOT_CLIENT_NAMESPACES: what the root layout
 *   itself renders (navbar, footer, sub-navbar, cookie banner, chat widget,
 *   notification and level-up prompts, announcements, error and 404 pages).
 * - Each route subtree that needs more wraps itself, in its layout, in
 *   `<ScopedIntlProvider scope="...">`, which adds that scope's namespaces on
 *   top of the root set. Scopes live in layouts, never in the root layout,
 *   because the root layout is not re-rendered on client-side navigation.
 *
 * tests/i18nClientNamespaces.test.mjs recomputes these sets from the import
 * graph and fails when a component reachable from a route uses a namespace
 * its provider does not supply. Run `node tests/helpers/i18nClientClosure.mjs
 * <route dir>` to see what a subtree needs.
 */
export const ROOT_CLIENT_NAMESPACES = [
  "common",
  "nav",
  "footer",
  "cookieConsent",
  "localeSwitcher",
  "content",
  "auth",
  "notifications",
  "chat",
  "dashboardWidgets",
] as const satisfies readonly Namespace[];

/** Authenticated areas get the full catalogue: no saving needed there. */
export const ALL_NAMESPACES = "all";

export const CLIENT_MESSAGE_SCOPES = {
  home: ["home", "search"],
  about: ["home"],
  categories: ["catalog"],
  services: ["catalog", "home", "search"],
  search: ["search", "favorites", "projectBooking"],
  professionals: ["search"],
  professionalProfile: ["professionalProfile", "favorites"],
  projectDetail: ["projects", "projectBooking", "projectWizard", "favorites"],
  register: ["account"],
  signup: ["account", "projectWizard"],
  support: ["support"],
  authenticated: ALL_NAMESPACES,
} as const satisfies Record<string, readonly Namespace[] | typeof ALL_NAMESPACES>;

export type ClientMessageScope = keyof typeof CLIENT_MESSAGE_SCOPES;

const ROOT_SET: ReadonlySet<string> = new Set(ROOT_CLIENT_NAMESPACES);

/** Namespaces a scope adds on top of the root set (root ones excluded). */
export function scopeNamespaces(scope: ClientMessageScope): Namespace[] {
  const configured = CLIENT_MESSAGE_SCOPES[scope];
  const list: readonly Namespace[] = configured === ALL_NAMESPACES ? NAMESPACES : configured;
  return list.filter((namespace) => !ROOT_SET.has(namespace));
}

/** Copy only the given top-level namespaces out of a full message tree. */
export function pickMessages<T extends Record<string, unknown>>(
  messages: T,
  namespaces: readonly string[]
): Partial<T> {
  const picked: Partial<T> = {};
  for (const namespace of namespaces) {
    if (namespace in messages) {
      picked[namespace as keyof T] = messages[namespace as keyof T];
    }
  }
  return picked;
}
