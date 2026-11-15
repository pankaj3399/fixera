import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";

// Adds this route's client message namespaces (i18n/clientNamespaces.ts).
export default function ProfessionalsLayout({ children }: { children: React.ReactNode }) {
  return <ScopedIntlProvider scope="professionals">{children}</ScopedIntlProvider>;
}
