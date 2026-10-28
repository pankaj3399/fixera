import common from "../messages/en/common.json";
import nav from "../messages/en/nav.json";
import footer from "../messages/en/footer.json";
import cookieConsent from "../messages/en/cookieConsent.json";
import localeSwitcher from "../messages/en/localeSwitcher.json";
import home from "../messages/en/home.json";
import content from "../messages/en/content.json";
import catalog from "../messages/en/catalog.json";
import auth from "../messages/en/auth.json";
import account from "../messages/en/account.json";
import notifications from "../messages/en/notifications.json";
import search from "../messages/en/search.json";
import professionalProfile from "../messages/en/professionalProfile.json";
import favorites from "../messages/en/favorites.json";
import bookings from "../messages/en/bookings.json";
import checkout from "../messages/en/checkout.json";
import quotation from "../messages/en/quotation.json";
import projects from "../messages/en/projects.json";
import projectBooking from "../messages/en/projectBooking.json";
import projectWizard from "../messages/en/projectWizard.json";
import projectWizardSteps from "../messages/en/projectWizardSteps.json";
import proTools from "../messages/en/proTools.json";
import calendar from "../messages/en/calendar.json";
import chat from "../messages/en/chat.json";

/**
 * Type-safety for next-intl: message trees are typed from the English files,
 * so a missing or misspelled translation key fails `tsc` for all locales.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: "en" | "nl" | "fr";
    Messages: {
      common: typeof common;
      nav: typeof nav;
      footer: typeof footer;
      cookieConsent: typeof cookieConsent;
      localeSwitcher: typeof localeSwitcher;
      home: typeof home;
      content: typeof content;
      catalog: typeof catalog;
      auth: typeof auth;
      account: typeof account;
      notifications: typeof notifications;
      search: typeof search;
      professionalProfile: typeof professionalProfile;
      favorites: typeof favorites;
      bookings: typeof bookings;
      checkout: typeof checkout;
      quotation: typeof quotation;
      projects: typeof projects;
      projectBooking: typeof projectBooking;
      projectWizard: typeof projectWizard;
      projectWizardSteps: typeof projectWizardSteps;
      proTools: typeof proTools;
      calendar: typeof calendar;
      chat: typeof chat;
    };
  }
}
