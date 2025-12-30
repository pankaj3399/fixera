import { useState, useEffect } from 'react';

export interface FilterOptions {
  services: string[];
  projectTypes: string[];
  includedItems: string[];
  areasOfWork: string[];
  priceModels: Array<{ value: string; label: string }>;
  categories: string[];
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
    priceModels: [
      { value: 'fixed', label: 'Fixed Price' },
      { value: 'unit', label: 'Unit Based' },
      { value: 'rfq', label: 'Request for Quote' }
    ],
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
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/service-categories/active?country=${country}`,
          { credentials: 'include' }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch filter options: ${response.status}`);
        }

        const data = await response.json() as Array<{
          name: string;
          services: Array<{
            name: string;
          }>;
        }>;

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

        // For now, we'll use common values as fallback
        // These could be fetched from a dedicated filter options endpoint
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
          priceModels: [
            { value: 'fixed', label: 'Fixed Price' },
            { value: 'unit', label: 'Unit Based' },
            { value: 'rfq', label: 'Request for Quote' }
          ],
          categories,
        });
      } catch (err) {
        console.error('Failed to fetch filter options:', err);
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
          priceModels: [
            { value: 'fixed', label: 'Fixed Price' },
            { value: 'unit', label: 'Unit Based' },
            { value: 'rfq', label: 'Request for Quote' }
          ],
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
