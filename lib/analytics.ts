/**
 * Core Analytics Module
 * Consent-aware GA4 and MS Clarity initialization.
 * All tracking functions are no-ops when consent is not granted or during SSR.
 */

import { getConsent, CONSENT_EVENT } from './consent';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
    clarity: (...args: any[]) => void;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type PageType =
  | 'landing_page'
  | 'blog'
  | 'service_page'
  | 'project_page'
  | 'search_page'
  | 'professional_profile'
  | 'booking_page'
  | 'checkout_page'
  | 'dashboard'
  | 'auth_page'
  | 'static_page'
  | 'category_page'
  | 'admin_page'
  | 'chat_page'
  | 'faq_page'
  | 'news_page';

export type DeviceCategory = 'desktop' | 'tablet' | 'mobile';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let ga4Initialized = false;
let clarityInitialized = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isBrowser = () => typeof window !== 'undefined';

/** Detect device category from screen width */
export function getDeviceCategory(): DeviceCategory {
  if (!isBrowser()) return 'desktop';
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

/** Classify a pathname into a page type for the Pages Engagement report */
export function classifyPageType(pathname: string): PageType {
  if (pathname === '/') return 'landing_page';
  if (pathname.startsWith('/blog')) return 'blog';
  if (pathname.startsWith('/news')) return 'news_page';
  if (pathname.startsWith('/services')) return 'service_page';
  if (pathname.startsWith('/categories')) return 'category_page';
  if (pathname.startsWith('/projects')) return 'project_page';
  if (pathname.startsWith('/search')) return 'search_page';
  if (pathname.startsWith('/professionals')) return 'professional_profile';
  if (/^\/professional\/[a-f0-9]{24}$/.test(pathname)) return 'professional_profile';
  if (pathname.startsWith('/bookings')) return 'booking_page';
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/admin')) return 'admin_page';
  if (pathname.startsWith('/chat')) return 'chat_page';
  if (pathname.startsWith('/faq')) return 'faq_page';
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/join') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password')
  ) {
    return 'auth_page';
  }
  if (pathname.startsWith('/professional')) return 'dashboard'; // professional dashboard area
  return 'static_page';
}

// ---------------------------------------------------------------------------
// GA4
// ---------------------------------------------------------------------------

function loadGA4Script(measurementId: string) {
  if (!isBrowser()) return;
  if (document.querySelector(`script[src*="gtag/js?id=${measurementId}"]`)) return;

  // Initialize dataLayer
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };

  // Default consent state (denied until user consents)
  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
  });

  // Set timestamp
  window.gtag('js', new Date());

  // Configure GA4
  window.gtag('config', measurementId, {
    send_page_view: false, // We'll send page views manually for better control
  });

  // Load script
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
}

/** Initialize GA4 — should be called once on mount */
export function initGA4(measurementId: string) {
  if (!isBrowser() || ga4Initialized || !measurementId) return;
  loadGA4Script(measurementId);
  ga4Initialized = true;
}

/** Update GA4 consent state based on user choice */
export function updateGA4Consent(analytics: boolean, marketing: boolean) {
  if (!isBrowser() || !window.gtag) return;
  window.gtag('consent', 'update', {
    analytics_storage: analytics ? 'granted' : 'denied',
    ad_storage: marketing ? 'granted' : 'denied',
    ad_user_data: marketing ? 'granted' : 'denied',
    ad_personalization: marketing ? 'granted' : 'denied',
  });
}

/** Send a GA4 event */
export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>
) {
  if (!isBrowser() || !window.gtag) return;
  const consent = getConsent();
  if (!consent?.analytics) return;

  // Add device category to all events
  const enrichedParams = {
    ...params,
    device_category: getDeviceCategory(),
  };

  // Strip undefined values
  const cleanParams: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(enrichedParams)) {
    if (v !== undefined) cleanParams[k] = v;
  }

  window.gtag('event', eventName, cleanParams);
}

/** Send a page view event with page type classification */
export function trackPageView(pathname: string, title?: string) {
  if (!isBrowser() || !window.gtag) return;
  const consent = getConsent();
  if (!consent?.analytics) return;

  window.gtag('event', 'page_view', {
    page_path: pathname,
    page_title: title || document.title,
    page_type: classifyPageType(pathname),
    device_category: getDeviceCategory(),
  });
}

/** Set GA4 user properties */
export function setUserProperties(properties: Record<string, string | number | boolean | undefined>) {
  if (!isBrowser() || !window.gtag) return;
  const consent = getConsent();
  if (!consent?.analytics) return;

  const cleanProps: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (v !== undefined) cleanProps[k] = v;
  }

  window.gtag('set', 'user_properties', cleanProps);
}

/** Set the GA4 user ID */
export function setUserId(userId: string | null) {
  if (!isBrowser() || !window.gtag) return;
  const consent = getConsent();
  if (!consent?.analytics) return;

  if (userId) {
    window.gtag('set', { user_id: userId });
  } else {
    window.gtag('set', { user_id: null });
  }
}

// ---------------------------------------------------------------------------
// MS Clarity
// ---------------------------------------------------------------------------

function loadClarityScript(projectId: string) {
  if (!isBrowser()) return;
  if (document.querySelector('script[data-clarity]')) return;

  // Clarity initialization snippet
  const script = document.createElement('script');
  script.setAttribute('data-clarity', projectId);
  script.textContent = `
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${projectId}");
  `;
  document.head.appendChild(script);
}

/** Initialize MS Clarity — should be called once when consent is granted */
export function initClarity(projectId: string) {
  if (!isBrowser() || clarityInitialized || !projectId) return;
  const consent = getConsent();
  if (!consent?.analytics) return;
  loadClarityScript(projectId);
  clarityInitialized = true;
}

/** Set a Clarity custom tag */
export function setClarityTag(key: string, value: string) {
  if (!isBrowser() || !window.clarity) return;
  const consent = getConsent();
  if (!consent?.analytics) return;
  window.clarity('set', key, value);
}

/** Identify a user in Clarity */
export function setClarityUserId(userId: string, sessionId?: string, pageId?: string) {
  if (!isBrowser() || !window.clarity) return;
  const consent = getConsent();
  if (!consent?.analytics) return;
  window.clarity('identify', userId, sessionId, pageId);
}

// ---------------------------------------------------------------------------
// Consent Listener Setup
// ---------------------------------------------------------------------------

/** Listen for consent changes and initialize/update analytics accordingly */
export function setupConsentListener(
  ga4MeasurementId: string,
  clarityProjectId: string
) {
  if (!isBrowser()) return;

  const handleConsentChange = () => {
    const consent = getConsent();
    if (!consent) return;

    // Update GA4 consent mode
    updateGA4Consent(consent.analytics, consent.marketing);

    // Initialize Clarity if consent granted (idempotent)
    if (consent.analytics && clarityProjectId) {
      initClarity(clarityProjectId);
    }
  };

  // Check current consent state
  handleConsentChange();

  // Listen for future changes
  window.addEventListener(CONSENT_EVENT, handleConsentChange);

  return () => {
    window.removeEventListener(CONSENT_EVENT, handleConsentChange);
  };
}
