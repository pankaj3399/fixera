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
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { hasConsented, CONSENT_EVENT } from "@/lib/consent";
import { PREVIEW_DURATION_MS, shouldSkipAnnouncements } from "@/lib/marketing/siteAnnouncements/constants";
import { fetchPublicSiteAnnouncements } from "@/lib/marketing/siteAnnouncements/api";
import {
  dismissAnnouncement,
  isAnnouncementFrequencyBlocked,
  isAnnouncementDismissed,
} from "@/lib/marketing/siteAnnouncements/dismissStorage";
import { trackPromoClick } from "@/lib/marketing/siteAnnouncements/analytics";
import type { SiteAnnouncement } from "@/lib/marketing/siteAnnouncements/types";
import {
  AnnouncementsContext,
  PreviewContext,
  type AnnouncementsCtx,
  type PreviewCtx,
} from "./context";

export function SiteAnnouncementsProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("content");
  const pathname = usePathname();
  const skip = shouldSkipAnnouncements(pathname);

  const [items, setItems] = useState<SiteAnnouncement[]>([]);
  const [consent, setConsent] = useState({ marketingOk: false, analyticsOk: false });
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const [preview, setPreview] = useState<SiteAnnouncement | null>(null);
  const [clock, setClock] = useState(() => Date.now());
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
      toast.message(
        t("announcements.previewToast", { seconds: PREVIEW_DURATION_MS / 1000 }),
      );
      previewTimerRef.current = setTimeout(() => {
        setPreview(null);
        previewTimerRef.current = undefined;
      }, PREVIEW_DURATION_MS);
    },
    [clearPreview, t],
  );

  useEffect(() => () => clearPreview(), [clearPreview]);

  useEffect(() => {
    const refresh = () => {
      setConsent({
        marketingOk: hasConsented("marketing"),
        analyticsOk: hasConsented("analytics"),
      });
    };
    refresh();
    window.addEventListener(CONSENT_EVENT, refresh);
    return () => window.removeEventListener(CONSENT_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (skip) return;

    setClock(Date.now());
    let activeController: AbortController | null = null;
    let loading = false;
    const refresh = async () => {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      const controller = new AbortController();
      activeController = controller;
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      try {
        const announcements = await fetchPublicSiteAnnouncements({
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setItems(announcements);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn("[site-announcements] fetch failed", err);
      } finally {
        window.clearTimeout(timeout);
        if (activeController === controller) activeController = null;
        loading = false;
      }
    };
    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), 5 * 60 * 1000);
    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", refreshOnVisibility);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 60 * 1000);

    return () => {
      activeController?.abort();
      document.removeEventListener("visibilitychange", refreshOnVisibility);
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [skip]);

  const hide = useCallback((announcement: SiteAnnouncement) => {
    if (announcement.dismissible) dismissAnnouncement(announcement);
    setHiddenIds((prev) =>
      new Set(prev).add(`${announcement._id}:${announcement.updatedAt}`),
    );
  }, []);

  const onCta = useCallback(
    (announcement: SiteAnnouncement) => {
      hide(announcement);
      if (consent.analyticsOk) trackPromoClick(announcement);
    },
    [consent.analyticsOk, hide],
  );

  const announcementsValue = useMemo<AnnouncementsCtx>(() => {
    const visible = skip
      ? []
      : items.filter((item) => {
          const startsAt = new Date(item.startsAt).getTime();
          const endsAt = new Date(item.endsAt).getTime();
          if (
            !Number.isFinite(startsAt) ||
            !Number.isFinite(endsAt) ||
            startsAt > clock ||
            endsAt < clock
          ) {
            return false;
          }
          if (
            hiddenIds.has(`${item._id}:${item.updatedAt}`) ||
            isAnnouncementDismissed(item) ||
            isAnnouncementFrequencyBlocked(item)
          ) {
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
    // pathname re-runs the localStorage dismissal/frequency predicates after client-side navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, pathname, consent.marketingOk, items, hiddenIds, hide, onCta, clock]);

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
