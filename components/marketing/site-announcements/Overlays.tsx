"use client";

import { useEffect } from "react";
import { trackPromoView } from "@/lib/marketing/siteAnnouncements";
import { useAnnouncementsCtx, useSiteAnnouncementPreview } from "./context";
import { PromoOverlay } from "./PromoOverlay";
import { useDelayedReveal } from "./useDelayedReveal";
import { useExitIntent } from "./useExitIntent";

export function SiteAnnouncementOverlays() {
  const { skip, modal, exitIntent, hide, onCta } = useAnnouncementsCtx();

  const showModal = useDelayedReveal(
    modal?._id ?? null,
    (modal?.delaySeconds ?? 3) * 1000,
  );
  const showExit = useExitIntent(
    Boolean(exitIntent),
    Math.max(1500, (exitIntent?.delaySeconds ?? 3) * 1000),
  );

  useEffect(() => {
    if (!showModal || !modal) return;
    trackPromoView(modal);
  }, [showModal, modal]);

  useEffect(() => {
    if (!showExit || !exitIntent) return;
    trackPromoView(exitIntent);
  }, [showExit, exitIntent]);

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
      {exitIntent && showExit ? (
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
