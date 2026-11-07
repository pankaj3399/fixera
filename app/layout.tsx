import { CustomerPricingNotice } from "@/components/CustomerPricingNotice";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import {
  DOCUMENT_LOCALE_REQUEST_HEADER,
  LOCALES,
  OG_LOCALES,
  isLocale,
} from "@/i18n/config";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { getActiveCurrency } from "@/lib/currency/server";
import { getExchangeRates } from "@/lib/currency/rates";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubNavbar, { SubNavbarFallback } from "@/components/SubNavbar";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import CookieConsent from "@/components/cookie-consent/CookieConsent";
import AnalyticsProvider from "@/components/analytics/AnalyticsProvider";
import {
  SiteAnnouncementsProvider,
  SiteHeaderStack,
  SiteHeaderSpacer,
  SiteAnnouncementOverlays,
  SiteAnnouncementPreviewOverlays,
} from "@/components/marketing/site-announcements";
import JsonLd from "@/components/seo/JsonLd";
import DocumentLanguageSync from "@/components/locale/DocumentLanguageSync";
import { organizationSchema, websiteSchema } from "@/lib/seo/jsonLd";
import { SITE_NAME, OG_DEFAULT_IMAGE, siteUrl, absoluteUrl } from "@/lib/seo/site";
import FCMLayoutWrapper from "@/components/notifications/FCMLayoutWrapper";
import ServiceWorkerRegistrar from "@/components/pwa/ServiceWorkerRegistrar";
import { getServiceCategories } from "@/lib/server/serviceCategories";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  // Locale comes from the resolved next-intl request config (cookie/geo, no
  // URL segment), so OpenGraph metadata always matches the rendered language.
  const [locale, t] = await Promise.all([getLocale(), getTranslations("common")]);
  const description = t("meta.siteDescription");
  const alternateLocale = LOCALES.filter((candidate) => candidate !== locale).map(
    (candidate) => OG_LOCALES[candidate]
  );

  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: SITE_NAME,
      template: `%s | ${SITE_NAME}`,
    },
    description,
    applicationName: SITE_NAME,
    icons: {
      icon: [
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: SITE_NAME,
      description,
      url: siteUrl(),
      locale: OG_LOCALES[locale],
      alternateLocale,
      images: [{ url: absoluteUrl(OG_DEFAULT_IMAGE), width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
      description,
      images: [absoluteUrl(OG_DEFAULT_IMAGE)],
    },
    alternates: {
      canonical: siteUrl(),
    },
    appleWebApp: {
      capable: true,
      title: SITE_NAME,
      statusBarStyle: "default",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#4032f7",
};

async function SubNavbarWithCategories() {
  const serviceCategories = await getServiceCategories();
  return <SubNavbar categories={serviceCategories} />;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [requestHeaders, locale, messages, currency, exchangeRates, t] =
    await Promise.all([
      headers(),
      getLocale(),
      getMessages(),
      getActiveCurrency(),
      // One cached fetch (1h) seeds the client provider so prices don't flash
      // from EUR to the selected currency after hydration.
      getExchangeRates().catch(() => null),
      getTranslations("common"),
    ]);

  const documentLocale = requestHeaders.get(DOCUMENT_LOCALE_REQUEST_HEADER);

  return (
    <html lang={isLocale(documentLocale) ? documentLocale : locale}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <CurrencyProvider
            initialCurrency={currency}
            initialRates={exchangeRates?.rates ?? null}
          >
            <ServiceWorkerRegistrar />
            <DocumentLanguageSync />
            <JsonLd
              data={[
                organizationSchema(t("meta.siteDescription")),
                websiteSchema(),
              ]}
            />
            <AnalyticsProvider />
            <AuthProvider>
              <FCMLayoutWrapper>
                <SiteAnnouncementsProvider>
                  <SiteHeaderStack>
                    <Navbar stacked />
                  </SiteHeaderStack>
                  <SiteHeaderSpacer />
                  <Suspense fallback={<SubNavbarFallback />}>
                    <SubNavbarWithCategories />
                  </Suspense>
                  <main className="flex flex-col min-h-screen">
                    <Toaster></Toaster>
                    <CustomerPricingNotice />
                    {children}
                  </main>
                  <Footer />
                  <CookieConsent />
                  <SiteAnnouncementOverlays />
                  <SiteAnnouncementPreviewOverlays />
                </SiteAnnouncementsProvider>
              </FCMLayoutWrapper>
            </AuthProvider>
          </CurrencyProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
