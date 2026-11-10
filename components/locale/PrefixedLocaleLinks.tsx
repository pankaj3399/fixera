"use client";

import { useEffect } from "react";
import { keepLocaleInUrl, splitLocalePrefix } from "@/lib/seo/localeUrls";

/**
 * On a language-prefixed page (`/nl/...`), a same-site link click does a full navigation
 * that keeps the language. A public page keeps its prefix; anything else loads unprefixed
 * and is negotiated as usual.
 *
 * Client-side navigation would not do this: the root layout is kept, so its locale stays
 * as it was, while the next page is rendered with the negotiated locale. The result is two
 * languages on one page. Unprefixed pages are unaffected and keep client-side navigation.
 */
export default function PrefixedLocaleLinks() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const { pathname, search } = window.location;
      const current = splitLocalePrefix(pathname);
      if (!current) return;

      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin) return;
      // Same page (a hash or a tab change on this URL): the page handles it.
      if (url.pathname === pathname && url.search === search) return;

      event.preventDefault();
      event.stopPropagation();
      window.location.assign(
        keepLocaleInUrl(`${url.pathname}${url.search}${url.hash}`, current.locale),
      );
    };

    // Capture on window, so the click never reaches the framework's link handler.
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
