"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, ArrowRight, Copy, Check } from "lucide-react";
import { hasConsented, CONSENT_EVENT, getConsent } from "@/lib/consent";
import { trackEvent, trackOnce } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
const DISMISS_PREFIX = "fixera-announce-dismiss:";
export const ANNOUNCE_BANNER_HEIGHT_VAR = "--announce-banner-h";
const PREVIEW_DURATION_MS = 5000;

export type AnnouncementType = "top_bar" | "modal" | "exit_intent";

export interface SiteAnnouncement {
  _id: string;
  name: string;
  type: AnnouncementType;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
  discountCode?: string;
  activeCountries: string[];
  locale: string;
  delaySeconds: number;
  dismissible: boolean;
  requireMarketingConsent: boolean;
}

type AnnounceCtx = {
  skip: boolean;
  topBar?: SiteAnnouncement;
  modal?: SiteAnnouncement;
  exitIntent?: SiteAnnouncement;
  hide: (a: SiteAnnouncement) => void;
  onCta: (a: SiteAnnouncement) => void;
};

const AnnouncementsContext = createContext<AnnounceCtx | null>(null);

type PreviewCtx = {
  preview: SiteAnnouncement | null;
  startPreview: (announcement: SiteAnnouncement) => void;
  clearPreview: () => void;
};

const PreviewContext = createContext<PreviewCtx | null>(null);

export function useSiteAnnouncementPreview() {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("SiteAnnouncementsProvider required");
  return ctx;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function isDismissed(id: string): boolean {
  try {
    return localStorage.getItem(`${DISMISS_PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}

function dismiss(id: string) {
  try {
    localStorage.setItem(`${DISMISS_PREFIX}${id}`, "1");
  } catch {
    // ignore
  }
}

function resolveHref(announcement: SiteAnnouncement): string | undefined {
  if (announcement.ctaUrl) return announcement.ctaUrl;
  if (announcement.discountCode) {
    return `/services?discount=${encodeURIComponent(announcement.discountCode)}`;
  }
  return undefined;
}

function shouldSkipPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/register")
  );
}

function useAnnouncementsCtx(): AnnounceCtx {
  const ctx = useContext(AnnouncementsContext);
  if (!ctx) throw new Error("SiteAnnouncementsProvider required");
  return ctx;
}

export function SiteAnnouncementsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const skip = shouldSkipPath(pathname);

  const [items, setItems] = useState<SiteAnnouncement[]>([]);
  const [marketingOk, setMarketingOk] = useState(false);
  const [consentReady, setConsentReady] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Record<string, boolean>>({});
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

  const refreshConsent = useCallback(() => {
    const state = getConsent();
    setConsentReady(!!state);
    setMarketingOk(hasConsented("marketing"));
  }, []);

  useEffect(() => {
    refreshConsent();
    const onConsent = () => refreshConsent();
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, [refreshConsent]);

  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    const country = readCookie("fixera_geo_country") || "BE";
    const locale = readCookie("fixera_geo_locale") || "en";

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/public/site-announcements?country=${encodeURIComponent(country)}&locale=${encodeURIComponent(locale)}`,
          { credentials: "omit" }
        );
        const json = await res.json();
        if (cancelled) return;
        if (res.ok && json.success) {
          setItems(json.data.announcements || []);
        }
      } catch {
        // silent
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [skip]);

  const visible = useMemo(() => {
    if (skip || !consentReady) return [];
    return items.filter((a) => {
      if (hiddenIds[a._id] || isDismissed(a._id)) return false;
      if (a.requireMarketingConsent && !marketingOk) return false;
      return true;
    });
  }, [items, hiddenIds, consentReady, marketingOk, skip]);

  const hide = useCallback((a: SiteAnnouncement) => {
    if (a.dismissible) dismiss(a._id);
    setHiddenIds((prev) => ({ ...prev, [a._id]: true }));
  }, []);

  const onCta = useCallback((a: SiteAnnouncement) => {
    trackEvent("promo_click", {
      promo_id: a._id,
      promo_type: a.type,
      promo_name: a.name,
      discount_code: a.discountCode || undefined,
    });
  }, []);

  const value = useMemo<AnnounceCtx>(
    () => ({
      skip,
      topBar: visible.find((a) => a.type === "top_bar"),
      modal: visible.find((a) => a.type === "modal"),
      exitIntent: visible.find((a) => a.type === "exit_intent"),
      hide,
      onCta,
    }),
    [skip, visible, hide, onCta]
  );

  const previewValue = useMemo<PreviewCtx>(
    () => ({ preview, startPreview, clearPreview }),
    [preview, startPreview, clearPreview],
  );

  return (
    <PreviewContext.Provider value={previewValue}>
      <AnnouncementsContext.Provider value={value}>{children}</AnnouncementsContext.Provider>
    </PreviewContext.Provider>
  );
}

/** Fixed header stack: navbar + thin banner */
export function SiteHeaderStack({ children }: { children: ReactNode }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {children}
      <SiteAnnouncementBanner />
    </div>
  );
}

/** Thin strip below navbar — Elfsight-style */
export function SiteAnnouncementBanner() {
  const { skip, topBar, onCta } = useAnnouncementsCtx();
  const { preview } = useSiteAnnouncementPreview();
  const previewBar = preview?.type === "top_bar" ? preview : undefined;
  const bar = previewBar ?? (!skip ? topBar : undefined);
  const isPreview = !!previewBar;

  useEffect(() => {
    const h = bar ? "36px" : "0px";
    document.documentElement.style.setProperty(ANNOUNCE_BANNER_HEIGHT_VAR, h);
    return () => {
      if (!bar) {
        document.documentElement.style.setProperty(ANNOUNCE_BANNER_HEIGHT_VAR, "0px");
      }
    };
  }, [bar]);

  useEffect(() => {
    if (!topBar || isPreview) return;
    trackOnce("promo_view", `top_bar:${topBar._id}`, {
      promo_id: topBar._id,
      promo_type: "top_bar",
      promo_name: topBar.name,
    });
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

function AnnouncementTopBar({
  announcement,
  isPreview,
  onCta,
}: {
  announcement: SiteAnnouncement;
  isPreview?: boolean;
  onCta: () => void;
}) {
  const line = [announcement.title, announcement.message]
    .filter(Boolean)
    .join("  |  ")
    .toUpperCase();

  const content = (
    <p className="truncate text-center text-[11px] font-semibold tracking-wide sm:text-xs">
      {line}
      {announcement.discountCode && (
        <>
          {"  |  "}
          <span className="font-mono">{announcement.discountCode}</span>
        </>
      )}
    </p>
  );

  const href = resolveHref(announcement);
  const barClass =
    "w-full border-b border-black/10 bg-[#e24d3b] text-white";

  if (href && !isPreview) {
    return (
      <Link
        href={href}
        data-testid="site-announce-top-bar"
        className={`${barClass} block transition hover:bg-[#d64535]`}
        role="region"
        aria-label="Site promotion"
        onClick={onCta}
      >
        <div className="mx-auto flex h-9 max-w-7xl items-center justify-center px-3 sm:px-6">
          {content}
        </div>
      </Link>
    );
  }

  return (
    <div
      data-testid="site-announce-top-bar"
      className={barClass}
      role="region"
      aria-label={isPreview ? "Announcement preview" : "Site promotion"}
    >
      <div className="mx-auto flex h-9 max-w-7xl items-center justify-center px-3 sm:px-6">
        {content}
      </div>
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

export function SiteAnnouncementOverlays() {
  const { skip, modal, exitIntent, hide, onCta } = useAnnouncementsCtx();
  const [showModal, setShowModal] = useState(false);
  const [showExit, setShowExit] = useState(false);

  useEffect(() => {
    if (!modal) {
      setShowModal(false);
      return;
    }
    trackOnce("promo_view", `modal:${modal._id}`, {
      promo_id: modal._id,
      promo_type: "modal",
      promo_name: modal.name,
    });
    const t = setTimeout(() => setShowModal(true), (modal.delaySeconds ?? 3) * 1000);
    return () => clearTimeout(t);
  }, [modal]);

  useEffect(() => {
    if (!exitIntent) return;
    trackOnce("promo_view", `exit:${exitIntent._id}`, {
      promo_id: exitIntent._id,
      promo_type: "exit_intent",
      promo_name: exitIntent.name,
    });

    let armed = false;
    const armTimer = setTimeout(() => {
      armed = true;
    }, Math.max(1500, (exitIntent.delaySeconds ?? 3) * 1000));

    const onMouseOut = (e: MouseEvent) => {
      if (!armed || showExit) return;
      if (e.clientY <= 0) setShowExit(true);
    };

    const onScroll = () => {
      if (!armed || showExit) return;
      if (window.innerWidth >= 768) return;
      if (window.scrollY < 40) setShowExit(true);
    };

    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      clearTimeout(armTimer);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("scroll", onScroll);
    };
  }, [exitIntent, showExit]);

  if (skip) return null;

  return (
    <>
      {modal && showModal && (
        <PromoOverlay
          testId="site-announce-modal"
          variant="offer"
          announcement={modal}
          onClose={() => {
            hide(modal);
            setShowModal(false);
          }}
          onCta={() => onCta(modal)}
        />
      )}
      {exitIntent && showExit && (
        <PromoOverlay
          testId="site-announce-exit"
          variant="exit"
          announcement={exitIntent}
          onClose={() => {
            hide(exitIntent);
            setShowExit(false);
          }}
          onCta={() => onCta(exitIntent)}
        />
      )}
    </>
  );
}

function PromoOverlay({
  announcement,
  onClose,
  onCta,
  testId,
  variant,
  isPreview = false,
}: {
  announcement: SiteAnnouncement;
  onClose: () => void;
  onCta: () => void;
  testId: string;
  variant: "offer" | "exit";
  isPreview?: boolean;
}) {
  const href = resolveHref(announcement);
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (!announcement.discountCode) return;
    try {
      await navigator.clipboard.writeText(announcement.discountCode);
      setCopied(true);
      toast.success("Code copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy code");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
      onClick={(e) => {
        if (e.target === e.currentTarget && (announcement.dismissible || isPreview)) onClose();
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl ring-1 ring-black/5">
        {(announcement.dismissible || isPreview) && (
          <button
            type="button"
            aria-label="Close"
            className="absolute right-3 top-3 z-10 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="border-b border-slate-100 bg-slate-50 px-6 pb-5 pt-6">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {variant === "exit" ? "Before you go" : "Limited offer"}
          </p>
          <h2
            id={`${testId}-title`}
            className="mt-1 pr-8 text-xl font-semibold leading-snug text-slate-900"
          >
            {announcement.title}
          </h2>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm leading-relaxed text-slate-600">{announcement.message}</p>

          {announcement.discountCode && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Promo code
                </p>
                <p className="font-mono text-base font-semibold text-slate-900">
                  {announcement.discountCode}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={copyCode}>
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="sm" className="order-2 sm:order-1" onClick={onClose}>
              Maybe later
            </Button>
            {href && !isPreview ? (
              <Button asChild size="sm" className="order-1 sm:order-2" onClick={onCta}>
                <Link href={href} className="gap-1.5">
                  {announcement.ctaLabel || "Claim offer"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : href ? (
              <Button size="sm" className="order-1 sm:order-2" type="button" tabIndex={-1}>
                {announcement.ctaLabel || "Claim offer"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
