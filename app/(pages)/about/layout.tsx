import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";

// Adds this route's client message namespaces (i18n/clientNamespaces.ts).
export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <ScopedIntlProvider scope="about">{children}</ScopedIntlProvider>;
}
