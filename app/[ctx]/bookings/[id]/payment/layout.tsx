import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";
import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";
import { routeContext, type RouteContextParams } from "@/lib/server/routeContext";

/** Payment and return pages for one booking. Transactional, so never indexed. */
export async function generateMetadata({ params }: { params: Promise<{ ctx: string; id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return noindexMetadata(`/bookings/${encodeURIComponent(id)}/payment`, "Payment");
}

export default async function BookingPaymentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: RouteContextParams;
}) {
  await routeContext(params);
  return <ScopedIntlProvider scope="authenticated">{children}</ScopedIntlProvider>;
}
