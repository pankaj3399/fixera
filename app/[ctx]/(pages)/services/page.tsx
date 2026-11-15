import { getServiceCategories } from "@/lib/server/serviceCategories";
import { routeContext, type RouteContextParams } from "@/lib/server/routeContext";
import ServicesHubClient, { type ServiceCategory } from "./ServicesHubClient";

/**
 * Services index. The live catalog is read on the server (cached public
 * fetch) so the category/service list is part of the server-rendered HTML
 * that search engines and AI crawlers index. On a backend outage the static
 * fallback has no services; the client then loads and can retry.
 */
export default async function ServicesPage({ params }: { params: RouteContextParams }) {
  const { country } = await routeContext(params);
  const categories = await getServiceCategories(country ?? "BE");
  const live = categories.length > 0 && !categories.some((category) => category.isFallback);
  return <ServicesHubClient initialCategories={live ? (categories as unknown as ServiceCategory[]) : null} />;
}
