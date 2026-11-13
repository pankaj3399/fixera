import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";
import AdminAccessGate from "@/components/admin/AdminAccessGate";
import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = noindexMetadata("/admin", "Admin");

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ScopedIntlProvider scope="authenticated">
      <AdminAccessGate>{children}</AdminAccessGate>
    </ScopedIntlProvider>
  );
}
