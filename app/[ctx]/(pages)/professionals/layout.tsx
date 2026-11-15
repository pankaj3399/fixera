import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";
import { routeContext, type RouteContextParams } from "@/lib/server/routeContext";

// Adds this route's client message namespaces (i18n/clientNamespaces.ts).
export default async function ProfessionalsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: RouteContextParams;
}) {
  await routeContext(params);
  return <ScopedIntlProvider scope="professionals">{children}</ScopedIntlProvider>;
}
