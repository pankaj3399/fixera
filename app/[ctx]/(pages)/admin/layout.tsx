import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";
import AdminAccessGate from "@/components/admin/AdminAccessGate";
import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";
import { routeContext, type RouteContextParams } from "@/lib/server/routeContext";

export const dynamic = "force-dynamic";

export const metadata: Metadata = noindexMetadata("/admin", "Admin");

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: RouteContextParams;
}) {
  await routeContext(params);
  return (
    <ScopedIntlProvider scope="authenticated">
      <AdminAccessGate>{children}</AdminAccessGate>
    </ScopedIntlProvider>
  );
}
