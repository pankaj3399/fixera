import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";
import { routeContext, type RouteContextParams } from "@/lib/server/routeContext";

/** Booking payment result page. Personal and transactional, so never indexed. */
export async function generateMetadata({ params }: { params: Promise<{ ctx: string; id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return noindexMetadata(`/bookings/${encodeURIComponent(id)}/payment/failed`, "Payment failed");
}

export default async function BookingPaymentFailedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: RouteContextParams;
}) {
  await routeContext(params);
  return children;
}
