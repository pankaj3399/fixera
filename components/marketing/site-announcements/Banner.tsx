"use client";

import { useEffect, type ReactNode } from "react";
import { ANNOUNCE_BANNER_HEIGHT_PX } from "@/lib/marketing/siteAnnouncements/constants";
import { trackPromoView } from "@/lib/marketing/siteAnnouncements/analytics";
import { useAnnouncementsCtx } from "./context";
import { AnnouncementTopBar } from "./TopBar";
import { useActiveTopBar } from "./useActiveTopBar";
import { useAnalyticsConsentFlag } from "./useAnalyticsConsentFlag";

const NAV_HEIGHT = "4rem";
const BANNER_HEIGHT = ANNOUNCE_BANNER_HEIGHT_PX;

/** Fixed header stack: navbar + thin banner */
export function SiteHeaderStack({ children }: { children: ReactNode }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {children}
      <SiteAnnouncementBanner />
    </div>
  );
}

export function SiteHeaderSpacer() {
  const { bar } = useActiveTopBar();
  const height = bar ? `calc(${NAV_HEIGHT} + ${BANNER_HEIGHT})` : NAV_HEIGHT;
  useEffect(() => {
    // Shared header-stack token: full-viewport surfaces (chat) subtract the
    // real fixed-header height instead of a hardcoded 64px, so the composer
    // stays visible with or without an announcement banner.
    document.documentElement.style.setProperty("--header-offset", height);
    return () => {
      document.documentElement.style.removeProperty("--header-offset");
    };
  }, [height]);
  return (
    <div
      className="shrink-0"
      style={{ height }}
      aria-hidden
    />
  );
}

export function SiteAnnouncementBanner() {
  const { onCta, topBar } = useAnnouncementsCtx();
  const { bar, isPreview } = useActiveTopBar();
  const analyticsOk = useAnalyticsConsentFlag();

  useEffect(() => {
    if (!analyticsOk || !topBar || isPreview) return;
    trackPromoView(topBar);
  }, [analyticsOk, topBar, isPreview]);

  if (!bar) return null;

  return (
    <AnnouncementTopBar
      announcement={bar}
      isPreview={isPreview}
      onCta={() => onCta(bar)}
    />
  );
}
