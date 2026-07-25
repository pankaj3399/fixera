import { trackEvent, trackOnce } from "@/lib/analytics";
import type { SiteAnnouncement } from "./types";

export function trackPromoClick(announcement: SiteAnnouncement): void {
  trackEvent("promo_click", {
    promo_id: announcement._id,
    promo_type: announcement.type,
    promo_name: announcement.name,
    discount_code: announcement.discountCode || undefined,
  });
}

export function trackPromoView(announcement: SiteAnnouncement): void {
  trackOnce("promo_view", `${announcement.type}:${announcement._id}`, {
    promo_id: announcement._id,
    promo_type: announcement.type,
    promo_name: announcement.name,
  });
}
