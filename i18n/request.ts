import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, type Locale, isLocale } from "./config";
import { NAMESPACES, type Namespace } from "./namespaces";

/**
 * Messages are split per namespace in `messages/<locale>/<namespace>.json` so
 * parallel workstreams never touch the same file. They are merged here as
 * `{ [namespace]: json }`, i.e. the namespace files contain their keys
 * directly (no namespace wrapper).
 *
 * Translation keys are typed from the English files (see global.d.ts), while
 * this loader stays dynamic so adding a namespace only means adding it to
 * `i18n/namespaces.ts` plus three JSON files.
 */
type MessageTree = Record<string, unknown>;

const messageCache = new Map<string, MessageTree>();

async function loadNamespace(
  locale: Locale,
  namespace: Namespace
): Promise<MessageTree> {
  const cacheKey = `${locale}/${namespace}`;
  const cached = messageCache.get(cacheKey);
  if (cached) return cached;

  // The variable path is intentional: webpack creates one context module for
  // messages/<locale>/<namespace>.json, so all locale bundles are available.
  const loaded = (await import(`../messages/${locale}/${namespace}.json`)) as {
    default: MessageTree;
  };
  messageCache.set(cacheKey, loaded.default);
  return loaded.default;
}

async function loadMessages(locale: Locale): Promise<Record<string, MessageTree>> {
  const entries = await Promise.all(
    NAMESPACES.map(
      async (namespace) =>
        [namespace, await loadNamespace(locale, namespace)] as const
    )
  );
  return Object.fromEntries(entries);
}

/**
 * The locale comes from the route: middleware resolves it (URL prefix, ?lang,
 * NEXT_LOCALE cookie, geo) and encodes it in the `[ctx]` segment, and
 * `routeContext()` (lib/server/routeContext.ts) passes it to `setRequestLocale`.
 * Reading it from there instead of headers/cookies keeps public pages static.
 * Outside page routes (route handlers, the root 404) it is English.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  return {
    locale,
    messages: await loadMessages(locale),
  };
});
