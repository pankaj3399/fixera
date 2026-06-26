'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { CONSENT_EVENT, getConsent } from '@/lib/consent';
import { getPageType, getTrafficAttribution, trackPageView } from '@/lib/analytics';

const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
const clarityProjectId = process.env.NEXT_PUBLIC_MS_CLARITY_PROJECT_ID?.trim();

export default function AnalyticsProvider() {
  const [analyticsConsented, setAnalyticsConsented] = useState(false);

  useEffect(() => {
    const readConsent = () => setAnalyticsConsented(getConsent()?.analytics === true);
    readConsent();
    window.addEventListener(CONSENT_EVENT, readConsent);
    return () => window.removeEventListener(CONSENT_EVENT, readConsent);
  }, []);

  return (
    <Suspense fallback={null}>
      <AnalyticsTracker analyticsConsented={analyticsConsented} />
    </Suspense>
  );
}

function AnalyticsTracker({ analyticsConsented }: { analyticsConsented: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!analyticsConsented) return;

    installGoogleAnalytics();
    installClarity();

    const search = searchParams.toString();
    trackPageView(pathname, search);

    if (window.clarity) {
      window.clarity('set', 'page_type', getPageType(pathname));
      window.clarity('set', 'traffic_bucket', getTrafficAttribution().traffic_bucket || 'unknown');
    }
  }, [analyticsConsented, pathname, searchParams]);

  return null;
}

function installGoogleAnalytics(): void {
  if (!gaMeasurementId || typeof window === 'undefined') return;

  window.dataLayer = window.dataLayer || [];

  if (!window.gtag) {
    // Must be a regular `function` (not arrow) so the special `arguments`
    // pseudo-array is available. GA4's dataLayer processor expects Arguments
    // objects — not plain arrays — for every queued command.
    // eslint-disable-next-line prefer-rest-params
    window.gtag = function gtag() { window.dataLayer!.push(arguments); } as Window['gtag'];
  }

  if (!document.getElementById('fixera-ga4-script')) {
    const script = document.createElement('script');
    script.id = 'fixera-ga4-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`;
    document.head.appendChild(script);

    window.gtag!('js', new Date());
    window.gtag!('config', gaMeasurementId, {
      send_page_view: false,
      anonymize_ip: true,
    });
  }
}

function installClarity(): void {
  if (!clarityProjectId || typeof window === 'undefined') return;

  window.clarity =
    window.clarity ||
    function clarity(...args: unknown[]) {
      (window.clarity!.q = window.clarity!.q || []).push(args);
    };

  if (document.getElementById('fixera-clarity-script')) return;

  const script = document.createElement('script');
  script.id = 'fixera-clarity-script';
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(clarityProjectId)}`;
  document.head.appendChild(script);
}
