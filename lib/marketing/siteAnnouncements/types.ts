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
