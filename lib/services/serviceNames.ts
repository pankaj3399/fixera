import { serviceCategories, subNavbarCategories } from "@/data/content";

/**
 * Shared service-name resolution (catalog + nav services).
 * Extracted from the service detail page so CMS surfaces (related-service
 * headings, metadata) resolve the same localized names instead of
 * humanizing slugs.
 */

/** Catalog entries (hardcoded in `data/content`) with translated copy. */
export const TRANSLATED_SERVICE_IDS = [
  'interior-design',
  '3d-modeling',
  'plumbing-services',
  'electrical-work',
  'hvac-services',
  'painting-services',
  'flooring-tiling',
  'carpentry',
  'home-renovation',
  'roofing',
  'masonry-brickwork',
  'window-door-installation',
  'siding-cladding',
  'garden-landscaping',
  'lawn-care',
  'deck-patio-building',
  'fence-installation',
] as const;

export const TRANSLATED_CATEGORY_SLUGS = [
  'interior-services',
  'exterior-structural',
  'outdoor-garden',
] as const;

export const NAV_SERVICE_NAME_KEYS = {
  'full-renovation': 'names.navServices.full-renovation.name',
  'kitchen-remodeling': 'names.navServices.kitchen-remodeling.name',
  'bathroom-remodeling': 'names.navServices.bathroom-remodeling.name',
  'basement-finishing': 'names.navServices.basement-finishing.name',
  'roofing-services': 'names.navServices.roofing-services.name',
  'flooring-installation': 'names.navServices.flooring-installation.name',
  'demolition-services': 'names.navServices.demolition-services.name',
  'architectural-design': 'names.navServices.architectural-design.name',
  'landscape-design': 'names.navServices.landscape-design.name',
  'lighting-design': 'names.navServices.lighting-design.name',
  'permit-drawing': 'names.navServices.permit-drawing.name',
  'structural-engineering': 'names.navServices.structural-engineering.name',
  'space-planning': 'names.navServices.space-planning.name',
  'emergency-plumbing': 'names.navServices.emergency-plumbing.name',
  'pipe-installation': 'names.navServices.pipe-installation.name',
  'electrical-wiring': 'names.navServices.electrical-wiring.name',
  'fixture-installation': 'names.navServices.fixture-installation.name',
  'boiler-maintenance': 'names.navServices.boiler-maintenance.name',
  'solar-panel-installation': 'names.navServices.solar-panel-installation.name',
  'charging-station': 'names.navServices.charging-station.name',
  'interior-painting': 'names.navServices.interior-painting.name',
  'exterior-painting': 'names.navServices.exterior-painting.name',
  'wallpaper-installation': 'names.navServices.wallpaper-installation.name',
  'plastering-drywall': 'names.navServices.plastering-drywall.name',
  'tiling-services': 'names.navServices.tiling-services.name',
  'finish-carpentry': 'names.navServices.finish-carpentry.name',
  'cabinet-refinishing': 'names.navServices.cabinet-refinishing.name',
  'deck-staining': 'names.navServices.deck-staining.name',
  'garden-maintenance': 'names.navServices.garden-maintenance.name',
  'deck-patio-construction': 'names.navServices.deck-patio-construction.name',
  'driveway-paving': 'names.navServices.driveway-paving.name',
  'pool-installation': 'names.navServices.pool-installation.name',
  'tree-surgery': 'names.navServices.tree-surgery.name',
  'outdoor-lighting': 'names.navServices.outdoor-lighting.name',
  'irrigation-systems': 'names.navServices.irrigation-systems.name',
  'deep-house-cleaning': 'names.navServices.deep-house-cleaning.name',
  'window-cleaning': 'names.navServices.window-cleaning.name',
  'gutter-cleaning': 'names.navServices.gutter-cleaning.name',
  'pest-control': 'names.navServices.pest-control.name',
  'pressure-washing': 'names.navServices.pressure-washing.name',
  'handyman-services': 'names.navServices.handyman-services.name',
  'furniture-assembly': 'names.navServices.furniture-assembly.name',
  'appliance-repair': 'names.navServices.appliance-repair.name',
} as const;

export function isTranslatedServiceId(
  id: string
): id is (typeof TRANSLATED_SERVICE_IDS)[number] {
  return (TRANSLATED_SERVICE_IDS as readonly string[]).includes(id);
}

export function isTranslatedCategorySlug(
  slug: string
): slug is (typeof TRANSLATED_CATEGORY_SLUGS)[number] {
  return (TRANSLATED_CATEGORY_SLUGS as readonly string[]).includes(slug);
}

export function serviceKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function matchesServiceId(id: string, name: string, serviceId: string): boolean {
  const needle = serviceKey(serviceId);
  return id === serviceId || serviceKey(id) === needle || serviceKey(name) === needle;
}

export type ServiceMeta = {
  /** Canonical catalog id/slug (English), also used for API filters. */
  id: string;
  name: string;
  description?: string;
  category?: string;
  categorySlug?: string;
  /** Static `subNavbarCategories` entry: name/description are English fallback copy. */
  source?: 'catalog' | 'nav';
};

export function findServiceMeta(serviceId: string): ServiceMeta | null {
  for (const cat of serviceCategories) {
    for (const sub of cat.subCategories || []) {
      for (const svc of sub.services || []) {
        if (matchesServiceId(svc.id, svc.name, serviceId)) {
          return {
            id: svc.id,
            name: svc.name,
            description: svc.description,
            category: cat.name,
            categorySlug: cat.slug,
          };
        }
      }
    }
  }
  const navSvc = subNavbarCategories.flatMap((c) => c.services).find((s) => matchesServiceId(s.id, s.name, serviceId));
  if (navSvc) return { id: navSvc.id, name: navSvc.name, source: 'nav' };
  return null;
}

export function navServiceNameKey(meta: ServiceMeta): (typeof NAV_SERVICE_NAME_KEYS)[keyof typeof NAV_SERVICE_NAME_KEYS] | undefined {
  if (meta.source !== 'nav') return undefined;
  return NAV_SERVICE_NAME_KEYS[meta.id as keyof typeof NAV_SERVICE_NAME_KEYS];
}

