import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubNavbar from "@/components/SubNavbar";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import ChatWidget from "@/components/chat/ChatWidget";
import JsonLd from "@/components/seo/JsonLd";
import { organizationSchema, websiteSchema } from "@/lib/seo/jsonLd";
import { SITE_NAME, SITE_DESCRIPTION, OG_DEFAULT_IMAGE, siteUrl, absoluteUrl } from "@/lib/seo/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: {
    icon: "/fixera-logo.png",
    apple: "/fixera-logo.png",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: siteUrl(),
    locale: "en_US",
    images: [{ url: absoluteUrl(OG_DEFAULT_IMAGE), width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [absoluteUrl(OG_DEFAULT_IMAGE)],
  },
  alternates: {
    canonical: siteUrl(),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <JsonLd data={[organizationSchema(), websiteSchema()]} />
        <AuthProvider>
          <Navbar/>
          <SubNavbar />
          <main className="flex flex-col min-h-screen">
            <Toaster></Toaster>
            {children}
          </main>
          <ChatWidget />
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
