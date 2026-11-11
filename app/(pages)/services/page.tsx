import { headers } from "next/headers";
import { getServiceCategories } from "@/lib/server/serviceCategories";
import { readContentCountry } from "@/lib/geo/contentCountryHeader";
import ServicesHubClient, { type ServiceCategory } from "./ServicesHubClient";

/**
 * Services index. The live catalog is read on the server (cached public
 * fetch) so the category/service list is part of the server-rendered HTML
 * that search engines and AI crawlers index. On a backend outage the static
 * fallback has no services; the client then loads and can retry.
 */
export default async function ServicesPage() {
  const country = readContentCountry(await headers()) ?? "BE";
  const categories = await getServiceCategories(country);
  const live = categories.length > 0 && !categories.some((category) => category.isFallback);
  return <ServicesHubClient initialCategories={live ? (categories as unknown as ServiceCategory[]) : null} />;
}
