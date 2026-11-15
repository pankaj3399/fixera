import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";
import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";

/** Payment and return pages for one booking. Transactional, so never indexed. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return noindexMetadata(`/bookings/${encodeURIComponent(id)}/payment`, "Payment");
}

export default function BookingPaymentLayout({ children }: { children: React.ReactNode }) {
  return <ScopedIntlProvider scope="authenticated">{children}</ScopedIntlProvider>;
}
