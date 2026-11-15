import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo/metadata";
import ScopedIntlProvider from "@/components/i18n/ScopedIntlProvider";
import { routeContext, type RouteContextParams } from "@/lib/server/routeContext";

// Results depend on the query string (`?q=`, `?loc=`, filters), which the server render
// reads per request (as before), so the search page is not cached.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: RouteContextParams }): Promise<Metadata> {
  await routeContext(params);
  const t = await getTranslations("search");
  return buildMetadata({
    title: t("meta.title"),
    description: t("meta.description"),
    path: "/search",
  });
}

export default async function SearchLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: RouteContextParams;
}) {
  await routeContext(params);
  return <ScopedIntlProvider scope="search">{children}</ScopedIntlProvider>;
}
