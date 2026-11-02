"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPromoView } from "@/lib/marketing/siteAnnouncements/analytics";
import { markAnnouncementShown } from "@/lib/marketing/siteAnnouncements/dismissStorage";
import { recordAnnouncementEvent } from "@/lib/marketing/siteAnnouncements/events";
import { useAnnouncementsCtx, useSiteAnnouncementPreview } from "./context";
import { PromoOverlay } from "./PromoOverlay";
import { useAnalyticsConsentFlag } from "./useAnalyticsConsentFlag";
import { useDelayedReveal } from "./useDelayedReveal";
import { useExitIntent } from "./useExitIntent";

export function SiteAnnouncementOverlays() {
  const { skip, modal, exitIntent, hide, onCta } = useAnnouncementsCtx();
  const analyticsOk = useAnalyticsConsentFlag();
  const pathname = usePathname();

  const showModal = useDelayedReveal(
    modal
      ? `${modal._id}:${modal.frequency === "once_pageview" ? pathname ?? "" : "campaign"}`
      : null,
    (modal?.delaySeconds ?? 3) * 1000,
  );
  // Do not arm exit while a timed modal campaign is still present.
  const showExit = useExitIntent(
    Boolean(exitIntent) && !modal,
    Math.max(1500, (exitIntent?.delaySeconds ?? 3) * 1000),
    exitIntent?.frequency === "once_pageview" ? pathname : null,
  );

  // One impression per reveal: a `once_pageview` campaign re-reveals (and
  // counts) on every page; other frequencies reveal once per page load.
  const modalOccurrence = modal?.frequency === "once_pageview" ? pathname ?? "" : "campaign";
  const exitOccurrence = exitIntent?.frequency === "once_pageview" ? pathname ?? "" : "campaign";

  useEffect(() => {
    if (skip || !showModal || !modal) return;
    markAnnouncementShown(modal);
    recordAnnouncementEvent(modal, "impression", modalOccurrence);
  }, [skip, showModal, modal, modalOccurrence]);

  useEffect(() => {
    if (skip || showModal || !showExit || !exitIntent) return;
    markAnnouncementShown(exitIntent);
    recordAnnouncementEvent(exitIntent, "impression", exitOccurrence);
  }, [skip, showModal, showExit, exitIntent, exitOccurrence]);

  useEffect(() => {
    if (!analyticsOk || !showModal || !modal) return;
    trackPromoView(modal);
  }, [analyticsOk, showModal, modal]);

  useEffect(() => {
    if (!analyticsOk || showModal || !showExit || !exitIntent) return;
    trackPromoView(exitIntent);
  }, [analyticsOk, showModal, showExit, exitIntent]);

  if (skip) return null;

  return (
    <>
      {modal && showModal ? (
        <PromoOverlay
          testId="site-announce-modal"
          variant="offer"
          announcement={modal}
          onClose={() => hide(modal)}
          onCta={() => onCta(modal)}
        />
      ) : null}
      {!showModal && exitIntent && showExit ? (
        <PromoOverlay
          testId="site-announce-exit"
          variant="exit"
          announcement={exitIntent}
          onClose={() => hide(exitIntent)}
          onCta={() => onCta(exitIntent)}
        />
      ) : null}
    </>
  );
}

export function SiteAnnouncementPreviewOverlays() {
  const { preview, clearPreview } = useSiteAnnouncementPreview();
  if (!preview || preview.type === "top_bar") return null;

  return (
    <PromoOverlay
      testId="site-announce-preview"
      variant={preview.type === "exit_intent" ? "exit" : "offer"}
      announcement={preview}
      isPreview
      onClose={clearPreview}
      onCta={() => undefined}
    />
  );
}
