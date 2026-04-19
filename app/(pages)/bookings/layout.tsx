import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("/bookings", "Bookings");

export default function BookingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
