import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { noindexMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bookings");
  return noindexMetadata("/bookings", t("page.title"));
}

export default function BookingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
