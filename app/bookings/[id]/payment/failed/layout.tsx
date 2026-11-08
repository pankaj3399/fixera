import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

/** Booking payment result page. Personal and transactional, so never indexed. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return noindexMetadata(`/bookings/${encodeURIComponent(id)}/payment/failed`, "Payment failed");
}

export default function BookingPaymentFailedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
