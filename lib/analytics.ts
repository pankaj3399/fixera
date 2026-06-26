'use client';

import { getConsent } from '@/lib/consent';

export type GtagCommand = 'config' | 'event' | 'js' | 'set' | 'consent';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: GtagCommand, target: string | Date, params?: Record<string, unknown>) => void;
    clarity?: ((command: string, ...args: unknown[]) => void) & { q?: unknown[] };
  }
}

const TRAFFIC_SESSION_KEY = 'fixera-traffic-attribution-v1';
const EVENT_DEDUPE_PREFIX = 'fixera-analytics-event:';

export type AnalyticsEventParams = Record<string, string | number | boolean | null | undefined | AnalyticsItem[]>;

export interface AnalyticsItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_category2?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
  index?: number;
}

interface ProjectLike {
  _id?: string;
  title?: string;
  category?: string;
  service?: string;
  priceModel?: string;
  subprojects?: Array<{
    name?: string;
    pricing?: {
      type?: 'fixed' | 'unit' | 'rfq';
      amount?: number;
      priceRange?: { min?: number; max?: number };
    };
  }>;
}

interface BookingLike {
  bookingNumber?: string;
  payment?: {
    currency?: string;
    totalWithVat?: number;
    netAmount?: number;
  };
  quote?: {
    amount?: number;
    currency?: string;
    description?: string;
  };
  project?: ProjectLike;
  selectedSubprojectIndex?: number;
}

export function hasAnalyticsConsent(): boolean {
  return getConsent()?.analytics === true;
}

export function getPageType(pathname: string): string {
  if (pathname === '/') return 'landing_page';
  if (pathname.startsWith('/blog')) return 'blog';
  if (pathname.startsWith('/news')) return 'news';
  if (pathname.startsWith('/services') || pathname.startsWith('/categories')) return 'service_landing';
  if (pathname.startsWith('/projects/') && !pathname.startsWith('/projects/create')) return 'project_detail';
  if (pathname === '/search') return 'search';
  if (pathname.startsWith('/professional/') && !pathname.startsWith('/professional/onboarding')) return 'professional_profile';
  if (pathname.startsWith('/pages/')) return 'landing_page';
  if (pathname.startsWith('/privacy-policy') || pathname.startsWith('/faq') || pathname.startsWith('/about')) return 'content_page';
  if (pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/signup')) return 'auth';
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/bookings') || pathname.startsWith('/chat') || pathname.startsWith('/profile')) return 'app';
  if (pathname.startsWith('/admin')) return 'admin';
  return 'other';
}

export function getTrafficAttribution(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const stored = window.sessionStorage.getItem(TRAFFIC_SESSION_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as Record<string, string>;
    } catch {
      window.sessionStorage.removeItem(TRAFFIC_SESSION_KEY);
    }
  }

  const url = new URL(window.location.href);
  const utmSource = url.searchParams.get('utm_source')?.trim() || '';
  const utmMedium = url.searchParams.get('utm_medium')?.trim() || '';
  const utmCampaign = url.searchParams.get('utm_campaign')?.trim() || '';
  const referrerHost = safeHostname(document.referrer);
  const source = utmSource || referrerHost || '(direct)';
  const medium = utmMedium || (referrerHost ? 'referral' : '(none)');
  const bucket = classifyTraffic({ source, medium, referrerHost });

  const attribution = {
    traffic_source: source,
    traffic_medium: medium,
    traffic_campaign: utmCampaign || '(not set)',
    traffic_bucket: bucket,
    referrer_host: referrerHost || '(none)',
  };

  window.sessionStorage.setItem(TRAFFIC_SESSION_KEY, JSON.stringify(attribution));
  return attribution;
}

export function trackPageView(pathname: string, search = ''): void {
  const pagePath = `${pathname}${search ? `?${search}` : ''}`;
  trackEvent('page_view', {
    page_location: typeof window !== 'undefined' ? `${window.location.origin}${pagePath}` : pagePath,
    page_title: typeof document !== 'undefined' ? document.title : undefined,
    page_type: getPageType(pathname),
  });
}

export function trackEvent(eventName: string, params: AnalyticsEventParams = {}): void {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;

  const payload = compactParams({
    ...getTrafficAttribution(),
    ...params,
  });

  window.gtag?.('event', eventName, payload);
  window.clarity?.('event', eventName);
}

export function trackOnce(eventName: string, dedupeId: string, params: AnalyticsEventParams = {}): void {
  if (typeof window === 'undefined') return;
  const key = `${EVENT_DEDUPE_PREFIX}${eventName}:${dedupeId}`;
  if (window.sessionStorage.getItem(key)) return;
  window.sessionStorage.setItem(key, '1');
  trackEvent(eventName, params);
}

export function projectAnalyticsItem(
  project: ProjectLike,
  subprojectIndex?: number | null
): AnalyticsItem {
  const selected =
    typeof subprojectIndex === 'number' ? project.subprojects?.[subprojectIndex] : project.subprojects?.[0];
  const price = getProjectPrice(project, subprojectIndex);

  const item: AnalyticsItem = {
    item_id: project._id || 'unknown-project',
    item_name: project.title || selected?.name || 'Project',
    quantity: 1,
  };

  if (project.category) item.item_category = project.category;
  if (project.service) item.item_category2 = project.service;
  if (selected?.pricing?.type || project.priceModel) item.item_variant = selected?.pricing?.type || project.priceModel;
  if (price > 0) item.price = price;
  if (typeof subprojectIndex === 'number') item.index = subprojectIndex;

  return item;
}

export function trackProjectSearch(params: {
  searchType: string;
  query?: string;
  location?: string;
  resultsCount: number;
  page: number;
  filtersCount: number;
}): void {
  const payload = {
    search_term: params.query || '(empty)',
    search_type: params.searchType,
    location: params.location || '(not set)',
    results_count: params.resultsCount,
    page: params.page,
    filters_count: params.filtersCount,
  };
  trackEvent('search', payload);
  if (params.searchType === 'projects') {
    trackEvent('project_search', payload);
  }
}

export function trackProjectView(project: ProjectLike): void {
  const value = getProjectPrice(project);
  trackEvent('view_item', {
    currency: 'EUR',
    value,
    project_id: project._id,
    project_category: project.category,
    project_service: project.service,
    items: [projectAnalyticsItem(project)],
  });
}

export function trackBeginRfq(project: ProjectLike, subprojectIndex?: number | null): void {
  trackEvent('begin_rfq', {
    currency: 'EUR',
    value: getProjectPrice(project, subprojectIndex),
    project_id: project._id,
    items: [projectAnalyticsItem(project, subprojectIndex)],
  });
}

export function trackCompleteRfq(project: ProjectLike, bookingId?: string, subprojectIndex?: number | null): void {
  trackOnce('complete_rfq', bookingId || project._id || 'project', {
    currency: 'EUR',
    value: getProjectPrice(project, subprojectIndex),
    project_id: project._id,
    booking_id: bookingId,
    items: [projectAnalyticsItem(project, subprojectIndex)],
  });
  trackEvent('generate_lead', {
    currency: 'EUR',
    value: getProjectPrice(project, subprojectIndex),
    project_id: project._id,
  });
}

export function trackBeginCheckout(bookingId: string, booking: BookingLike): void {
  const currency = booking.payment?.currency || booking.quote?.currency || 'EUR';
  const value = booking.payment?.totalWithVat ?? booking.payment?.netAmount ?? booking.quote?.amount ?? 0;
  trackOnce('begin_checkout', bookingId, {
    currency: currency.toUpperCase(),
    value,
    transaction_id: booking.bookingNumber || bookingId,
    booking_id: bookingId,
    items: [projectAnalyticsItem(booking.project || {}, booking.selectedSubprojectIndex)],
  });
}

export function trackCompleteBooking(bookingId: string, booking: BookingLike): void {
  const currency = booking.payment?.currency || booking.quote?.currency || 'EUR';
  const value = booking.payment?.totalWithVat ?? booking.payment?.netAmount ?? booking.quote?.amount ?? 0;
  const transactionId = booking.bookingNumber || bookingId;
  const payload = {
    currency: currency.toUpperCase(),
    value,
    transaction_id: transactionId,
    booking_id: bookingId,
    items: [projectAnalyticsItem(booking.project || {}, booking.selectedSubprojectIndex)],
  };

  trackOnce('complete_booking', bookingId, payload);
  trackOnce('purchase', transactionId, payload);
}

export function trackProfessionalContact(project: ProjectLike): void {
  trackEvent('contact_professional', {
    project_id: project._id,
    project_category: project.category,
    project_service: project.service,
  });
  trackEvent('generate_lead', {
    project_id: project._id,
    project_category: project.category,
    project_service: project.service,
  });
}

export function getProjectPrice(project: ProjectLike, subprojectIndex?: number | null): number {
  const selected =
    typeof subprojectIndex === 'number' ? project.subprojects?.[subprojectIndex] : project.subprojects?.[0];
  const pricing = selected?.pricing;
  if (!pricing) return 0;
  if (typeof pricing.amount === 'number' && Number.isFinite(pricing.amount)) return pricing.amount;
  if (typeof pricing.priceRange?.min === 'number' && Number.isFinite(pricing.priceRange.min)) {
    return pricing.priceRange.min;
  }
  return 0;
}

function classifyTraffic(input: { source: string; medium: string; referrerHost: string }): string {
  const source = input.source.toLowerCase();
  const medium = input.medium.toLowerCase();
  const host = input.referrerHost.toLowerCase();
  const isPaid = ['cpc', 'ppc', 'paid', 'paid_social', 'display', 'ads'].some((term) => medium.includes(term));
  const combined = `${source} ${host}`;

  if (source === '(direct)') return 'direct';
  if (medium.includes('email')) return 'email_campaign';
  if (isAiReferrer(combined)) return 'ai';
  if (combined.includes('google')) return isPaid ? 'google_ads' : 'google_organic';
  if (combined.includes('facebook') || combined.includes('fb.com')) return isPaid ? 'facebook_ads' : 'facebook';
  if (combined.includes('instagram')) return isPaid ? 'instagram_ads' : 'instagram';
  return medium === 'organic' ? 'organic_other' : 'referral_other';
}

function isAiReferrer(value: string): boolean {
  return [
    'chatgpt',
    'openai',
    'perplexity',
    'claude',
    'anthropic',
    'gemini',
    'bard.google',
    'copilot',
    'poe.com',
  ].some((needle) => value.includes(needle));
}

function safeHostname(value: string): string {
  if (!value) return '';
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function compactParams(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}
