"use client";

import { usePathname } from "next/navigation";
import { toVisiblePathname } from "@/lib/routeContext";

/**
 * `usePathname()` as the visitor sees it. Pages are rewritten to an internal
 * `/<ctx>/...` route (lib/routeContext.ts); a server render (and the cached
 * HTML) would otherwise see that internal path while the browser sees the
 * visible one, which breaks hydration and path checks such as `/admin`.
 */
export function useVisiblePathname(): string {
  return toVisiblePathname(usePathname() ?? "");
}
