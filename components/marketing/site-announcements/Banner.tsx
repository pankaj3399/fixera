"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ANNOUNCE_BANNER_HEIGHT_PX,
  trackPromoView,
} from "@/lib/marketing/siteAnnouncements";
import { hasAnalyticsConsent } from "@/lib/analytics";
import { CONSENT_EVENT } from "@/lib/consent";
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
  const [analyticsOk, setAnalyticsOk] = useState(false);

  useEffect(() => {
    const refresh = () => setAnalyticsOk(hasAnalyticsConsent());
    refresh();
    window.addEventListener(CONSENT_EVENT, refresh);
    return () => window.removeEventListener(CONSENT_EVENT, refresh);
  }, []);

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
