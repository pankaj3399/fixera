"use client";

import { useEffect, type ReactNode } from "react";
import {
  ANNOUNCE_BANNER_HEIGHT_PX,
  trackPromoView,
} from "@/lib/marketing/siteAnnouncements";
import { useAnnouncementsCtx } from "./context";
import { AnnouncementTopBar } from "./TopBar";
import { useActiveTopBar } from "./useActiveTopBar";

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
  return (
    <div
      className="shrink-0"
      style={{ height: bar ? `calc(${NAV_HEIGHT} + ${BANNER_HEIGHT})` : NAV_HEIGHT }}
      aria-hidden
    />
  );
}

export function SiteAnnouncementBanner() {
  const { onCta, topBar } = useAnnouncementsCtx();
  const { bar, isPreview } = useActiveTopBar();

  useEffect(() => {
    if (!topBar || isPreview) return;
    trackPromoView(topBar);
  }, [topBar, isPreview]);

  if (!bar) return null;

  return (
    <AnnouncementTopBar
      announcement={bar}
      isPreview={isPreview}
      onCta={() => onCta(bar)}
    />
  );
}
