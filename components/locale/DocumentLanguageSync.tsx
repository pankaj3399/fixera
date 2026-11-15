"use client";

import { useEffect } from "react";
import { useVisiblePathname } from "@/hooks/useVisiblePathname";
import { useLocale } from "next-intl";

/**
 * Keep `<html lang>` accurate when the root layout is preserved across
 * client-side navigation. Admin pages are English-only; public pages follow
 * the resolved visitor locale. Server rendering already uses the same rule via
 * the route context (lib/routeContext.ts, `documentLocaleOf`).
 */
export default function DocumentLanguageSync() {
  const pathname = useVisiblePathname();
  const locale = useLocale();

  useEffect(() => {
    const isAdmin =
      pathname === "/admin" || pathname.startsWith("/admin/");
    document.documentElement.lang = isAdmin ? "en" : locale;
  }, [pathname, locale]);

  return null;
}
