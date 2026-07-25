"use client";

import { useEffect, type ReactNode } from "react";
import {
  ANNOUNCE_BANNER_HEIGHT_PX,
  ANNOUNCE_BANNER_HEIGHT_VAR,
  trackPromoView,
} from "@/lib/marketing/siteAnnouncements";
import { useAnnouncementsCtx, useSiteAnnouncementPreview } from "./context";
import { AnnouncementTopBar } from "./TopBar";

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
  return (
    <div
      className="shrink-0"
      style={{ height: "calc(4rem + var(--announce-banner-h, 0px))" }}
      aria-hidden
    />
  );
}

export function SiteAnnouncementBanner() {
  const { skip, topBar, onCta } = useAnnouncementsCtx();
  const { preview } = useSiteAnnouncementPreview();
  const previewBar = preview?.type === "top_bar" ? preview : undefined;
  const bar = previewBar ?? (!skip ? topBar : undefined);
  const isPreview = Boolean(previewBar);

  useEffect(() => {
    document.documentElement.style.setProperty(
      ANNOUNCE_BANNER_HEIGHT_VAR,
      bar ? ANNOUNCE_BANNER_HEIGHT_PX : "0px",
    );
    return () => {
      document.documentElement.style.setProperty(ANNOUNCE_BANNER_HEIGHT_VAR, "0px");
    };
  }, [bar]);

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
