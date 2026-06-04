/**
 * Analytics Event Helpers
 * Typed helper functions for all GA4 key events tracked in Fixera.
 * Each function wraps `trackEvent` from the core analytics module.
 */

import { trackEvent } from './analytics';

// ---------------------------------------------------------------------------
// Purchase Funnel Events
// ---------------------------------------------------------------------------

/** Fired when user performs a search */
export function trackProjectSearch(params: {
  search_query: string;
  search_type: 'professionals' | 'projects';
  results_count: number;
  country?: string;
}) {
  trackEvent('project_search', {
    search_term: params.search_query,
    search_type: params.search_type,
    results_count: params.results_count,
    country: params.country,
  });
}

/** Fired when user views a project detail page */
export function trackProjectView(params: {
  project_id: string;
  project_title: string;
  category?: string;
  service?: string;
  professional_id?: string;
  price?: number;
  currency?: string;
  country?: string;
}) {
  trackEvent('project_view', {
    item_id: params.project_id,
    item_name: params.project_title,
    item_category: params.category,
    item_variant: params.service,
    professional_id: params.professional_id,
    value: params.price,
    currency: params.currency || 'EUR',
    country: params.country,
  });
}

/** Fired when user opens/starts the RFQ form */
export function trackBeginRFQ(params: {
  booking_type: 'professional' | 'project';
  professional_id?: string;
  project_id?: string;
  country?: string;
}) {
  trackEvent('begin_rfq', {
    booking_type: params.booking_type,
    professional_id: params.professional_id,
    item_id: params.project_id,
    country: params.country,
  });
}

/** Fired when RFQ is successfully submitted */
export function trackCompleteRFQ(params: {
  booking_type: 'professional' | 'project';
  professional_id?: string;
  project_id?: string;
  service_type?: string;
  urgency?: string;
  budget_min?: number;
  budget_max?: number;
  currency?: string;
  country?: string;
}) {
  trackEvent('complete_rfq', {
    booking_type: params.booking_type,
    professional_id: params.professional_id,
    item_id: params.project_id,
    service_type: params.service_type,
    urgency: params.urgency,
    value: params.budget_max || params.budget_min,
    currency: params.currency || 'EUR',
    country: params.country,
  });
}

/** Fired when user initiates checkout / payment */
export function trackBeginCheckout(params: {
  value: number;
  currency: string;
  booking_type?: string;
  project_id?: string;
  professional_id?: string;
  country?: string;
}) {
  trackEvent('begin_checkout', {
    value: params.value,
    currency: params.currency,
    booking_type: params.booking_type,
    item_id: params.project_id,
    professional_id: params.professional_id,
    country: params.country,
  });
}

/** Fired when booking/payment is completed (GA4 recommended purchase event) */
export function trackCompleteBooking(params: {
  transaction_id: string;
  value: number;
  currency: string;
  booking_type?: string;
  project_id?: string;
  professional_id?: string;
  country?: string;
}) {
  trackEvent('purchase', {
    transaction_id: params.transaction_id,
    value: params.value,
    currency: params.currency,
    booking_type: params.booking_type,
    item_id: params.project_id,
    professional_id: params.professional_id,
    country: params.country,
  });
}

// ---------------------------------------------------------------------------
// Search & Filter Events
// ---------------------------------------------------------------------------

/** Fired when search filters are applied */
export function trackSearchFilterApplied(params: {
  filter_name: string;
  filter_value: string;
  search_type: 'professionals' | 'projects';
}) {
  trackEvent('search_filter_applied', {
    filter_name: params.filter_name,
    filter_value: params.filter_value,
    search_type: params.search_type,
  });
}

// ---------------------------------------------------------------------------
// User & Auth Events
// ---------------------------------------------------------------------------

/** Fired on successful signup */
export function trackSignUp(params: {
  method: string;
  role?: string;
  country?: string;
}) {
  trackEvent('sign_up', {
    method: params.method,
    user_role: params.role,
    country: params.country,
  });
}

/** Fired on successful login */
export function trackLogin(params: {
  method: string;
  role?: string;
  country?: string;
}) {
  trackEvent('login', {
    method: params.method,
    user_role: params.role,
    country: params.country,
  });
}

// ---------------------------------------------------------------------------
// Engagement Events
// ---------------------------------------------------------------------------

/** Fired when user views a professional profile */
export function trackProfessionalView(params: {
  professional_id: string;
  professional_name?: string;
  category?: string;
  country?: string;
}) {
  trackEvent('professional_view', {
    professional_id: params.professional_id,
    professional_name: params.professional_name,
    item_category: params.category,
    country: params.country,
  });
}

/** Fired when user opens chat with a professional */
export function trackProfessionalContact(params: {
  professional_id: string;
  contact_method: 'chat' | 'phone' | 'email';
  country?: string;
}) {
  trackEvent('professional_contact', {
    professional_id: params.professional_id,
    contact_method: params.contact_method,
    country: params.country,
  });
}

/** Fired when user adds a project or professional to favorites */
export function trackAddToFavorites(params: {
  item_type: 'project' | 'professional';
  item_id: string;
  item_name?: string;
  country?: string;
}) {
  trackEvent('add_to_favorites', {
    item_type: params.item_type,
    item_id: params.item_id,
    item_name: params.item_name,
    country: params.country,
  });
}

/** Fired when a user views a service category page */
export function trackServiceCategoryView(params: {
  category_name: string;
  country?: string;
}) {
  trackEvent('service_category_view', {
    item_category: params.category_name,
    country: params.country,
  });
}

/** Fired when user scrolls past 80% of a blog post */
export function trackBlogReadComplete(params: {
  article_title: string;
  article_slug: string;
  country?: string;
}) {
  trackEvent('blog_read_complete', {
    article_title: params.article_title,
    article_slug: params.article_slug,
    country: params.country,
  });
}

/** Fired when user uploads attachment in RFQ form */
export function trackRFQAttachmentUploaded(params: {
  booking_type: 'professional' | 'project';
  file_count?: number;
}) {
  trackEvent('rfq_attachment_uploaded', {
    booking_type: params.booking_type,
    file_count: params.file_count,
  });
}

/** Fired when a customer submits a review */
export function trackReviewSubmitted(params: {
  item_type: 'project' | 'professional' | 'booking';
  item_id: string;
  rating: number;
  country?: string;
}) {
  trackEvent('review_submitted', {
    item_type: params.item_type,
    item_id: params.item_id,
    rating: params.rating,
    country: params.country,
  });
}

// ---------------------------------------------------------------------------
// Cookie Consent Events
// ---------------------------------------------------------------------------

/**
 * Fired when user makes a cookie consent decision.
 * This event is special: it fires regardless of consent state since it IS
 * the consent action. Uses the gtag consent mechanism directly.
 */
export function trackCookieConsentDecision(params: {
  action: 'accept_all' | 'reject_all' | 'custom';
  analytics_accepted: boolean;
  marketing_accepted: boolean;
}) {
  // Fire this directly — don't gate on consent since this IS the consent event
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', 'cookie_consent_decision', {
    action: params.action,
    analytics_accepted: params.analytics_accepted,
    marketing_accepted: params.marketing_accepted,
  });
}

// ---------------------------------------------------------------------------
// Project Booking Form Events
// ---------------------------------------------------------------------------

/** Fired when user selects a package/subproject in the booking form */
export function trackPackageSelected(params: {
  project_id: string;
  package_name?: string;
  package_index: number;
  price?: number;
  currency?: string;
}) {
  trackEvent('package_selected', {
    item_id: params.project_id,
    item_name: params.package_name,
    package_index: params.package_index,
    value: params.price,
    currency: params.currency || 'EUR',
  });
}

/** Fired when user selects a booking date */
export function trackBookingDateSelected(params: {
  project_id: string;
  selected_date: string;
}) {
  trackEvent('booking_date_selected', {
    item_id: params.project_id,
    selected_date: params.selected_date,
  });
}
