"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { hasConsented, CONSENT_EVENT } from "@/lib/consent";
import {
  PREVIEW_DURATION_MS,
  dismissAnnouncement,
  fetchPublicSiteAnnouncements,
  isAnnouncementDismissed,
  shouldSkipAnnouncements,
  trackPromoClick,
  type SiteAnnouncement,
} from "@/lib/marketing/siteAnnouncements";
import {
  AnnouncementsContext,
  PreviewContext,
  type AnnouncementsCtx,
  type PreviewCtx,
} from "./context";

export function SiteAnnouncementsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const skip = shouldSkipAnnouncements(pathname);

  const [items, setItems] = useState<SiteAnnouncement[]>([]);
  const [consent, setConsent] = useState({ marketingOk: false });
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const [preview, setPreview] = useState<SiteAnnouncement | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearPreview = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = undefined;
    }
    setPreview(null);
  }, []);

  const startPreview = useCallback(
    (announcement: SiteAnnouncement) => {
      clearPreview();
      setPreview(announcement);
      toast.message("Showing preview for 5 seconds");
      previewTimerRef.current = setTimeout(() => {
        setPreview(null);
        previewTimerRef.current = undefined;
      }, PREVIEW_DURATION_MS);
    },
    [clearPreview],
  );

  useEffect(() => () => clearPreview(), [clearPreview]);

  useEffect(() => {
    const refresh = () => {
      setConsent({ marketingOk: hasConsented("marketing") });
    };
    refresh();
    window.addEventListener(CONSENT_EVENT, refresh);
    return () => window.removeEventListener(CONSENT_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (skip) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const announcements = await fetchPublicSiteAnnouncements({
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setItems(announcements);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn("[site-announcements] fetch failed", err);
      }
    })();

    return () => controller.abort();
  }, [skip]);

  const hide = useCallback((announcement: SiteAnnouncement) => {
    if (announcement.dismissible) dismissAnnouncement(announcement._id);
    setHiddenIds((prev) => new Set(prev).add(announcement._id));
  }, []);

  const onCta = useCallback((announcement: SiteAnnouncement) => {
    trackPromoClick(announcement);
  }, []);

  const announcementsValue = useMemo<AnnouncementsCtx>(() => {
    const visible = skip
      ? []
      : items.filter((item) => {
          if (hiddenIds.has(item._id) || isAnnouncementDismissed(item._id)) {
            return false;
          }
          if (item.requireMarketingConsent && !consent.marketingOk) {
            return false;
          }
          return true;
        });

    return {
      skip,
      topBar: visible.find((item) => item.type === "top_bar"),
      modal: visible.find((item) => item.type === "modal"),
      exitIntent: visible.find((item) => item.type === "exit_intent"),
      hide,
      onCta,
    };
  }, [skip, consent.marketingOk, items, hiddenIds, hide, onCta]);

  const previewValue = useMemo<PreviewCtx>(
    () => ({ preview, startPreview, clearPreview }),
    [preview, startPreview, clearPreview],
  );

  return (
    <PreviewContext.Provider value={previewValue}>
      <AnnouncementsContext.Provider value={announcementsValue}>
        {children}
      </AnnouncementsContext.Provider>
    </PreviewContext.Provider>
  );
}
