import { useState, useEffect } from 'react';
import { FilterOptions, DEFAULT_PRICE_MODELS } from '@/types/filters';
import { logError } from '@/lib/logger';

export type { FilterOptions } from '@/types/filters';

interface ServiceCategoryResponse {
  name: string;
  services: Array<{ name: string }>;
}

interface UseFilterOptionsParams {
  country?: string;
  enabled?: boolean;
}

export const useFilterOptions = ({
  country = 'BE',
  enabled = true
}: UseFilterOptionsParams = {}) => {
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    services: [],
    projectTypes: [],
    includedItems: [],
    areasOfWork: [],
    priceModels: DEFAULT_PRICE_MODELS,
    categories: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const fetchFilterOptions = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error('NEXT_PUBLIC_BACKEND_URL is not configured');
        }

        const response = await fetch(
          `${backendUrl}/api/service-categories/active?country=${country}`,
          { credentials: 'include' }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch filter options: ${response.status}`);
        }

        const data = await response.json() as ServiceCategoryResponse[];

        // Extract unique categories
        const categories = data.map(cat => cat.name);

        // Extract unique services from all categories
        const servicesSet = new Set<string>();
        data.forEach(cat => {
          cat.services.forEach(service => {
            servicesSet.add(service.name);
          });
        });
        const services = Array.from(servicesSet).sort();

        // Static defaults until a dedicated filter options endpoint is available
        const commonProjectTypes = [
          'Residential',
          'Commercial',
          'Industrial',
          'Outdoor',
          'Renovation',
          'New Construction',
          'New Built',
          'Extension',
          'Refurbishment'
        ];

        const commonIncludedItems = [
          'Materials',
          'Labor',
          'Permits',
          'Cleanup',
          'Disposal',
          'Tools & Equipment',
          'Transportation',
          'Design Services',
          'Consultation',
          'Warranty'
        ];

        setFilterOptions({
          services,
          projectTypes: commonProjectTypes,
          includedItems: commonIncludedItems,
          areasOfWork: [],
          priceModels: DEFAULT_PRICE_MODELS,
          categories,
        });
      } catch (err) {
        logError(err, 'Failed to fetch filter options', {
          endpoint: '/api/service-categories/active',
          params: { country },
          component: 'useFilterOptions',
          action: 'fetchFilterOptions',
        });
        setError(err instanceof Error ? err : new Error('Unknown error'));

        // Set fallback values on error
        setFilterOptions({
          services: [
            'Plumbing', 'Electrical', 'HVAC', 'Carpentry', 'Painting',
            'Roofing', 'Flooring', 'Landscaping', 'Masonry', 'Drywall'
          ],
          projectTypes: [
            'Residential', 'Commercial', 'Industrial', 'Outdoor', 'Renovation', 'New Construction'
          ],
          includedItems: [
            'Materials', 'Labor', 'Permits', 'Cleanup', 'Disposal', 'Tools & Equipment',
            'Transportation', 'Design Services', 'Consultation', 'Warranty'
          ],
          areasOfWork: [],
          priceModels: DEFAULT_PRICE_MODELS,
          categories: [],
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchFilterOptions();
  }, [country, enabled]);

  return { filterOptions, isLoading, error };
};
