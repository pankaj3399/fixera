import "server-only";

import { fetchLiveServiceCategories, type LiveServiceCategory } from "@/lib/catalog/liveServiceCategories";

export type ServiceCategoryItem = LiveServiceCategory;

const SERVICE_CATEGORY_TIMEOUT_MS = 3_000;

const FALLBACK_SERVICE_CATEGORIES: ServiceCategoryItem[] = [
  { name: "Small tasks", slug: "small-tasks", services: [], isFallback: true },
  { name: "Interior", slug: "interior", services: [], isFallback: true },
  { name: "Exterior", slug: "exterior", services: [], isFallback: true },
  { name: "Outdoor work", slug: "outdoor-work", services: [], isFallback: true },
  { name: "Renovation", slug: "renovation", services: [], isFallback: true },
  { name: "Inspections", slug: "inspections", services: [], isFallback: true },
];

export async function getServiceCategories(
  country = "BE",
): Promise<ServiceCategoryItem[]> {
  try {
    const categories = await fetchLiveServiceCategories(country, SERVICE_CATEGORY_TIMEOUT_MS);
    return categories.length > 0 ? categories : FALLBACK_SERVICE_CATEGORIES;
  } catch {
    return FALLBACK_SERVICE_CATEGORIES;
  }
}
