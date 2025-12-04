'use client';

import React, { useState, useEffect, Suspense, ComponentProps } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, Search as SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProfessionalCard from '@/components/search/ProfessionalCard';
import ProjectCard from '@/components/search/ProjectCard';
import SearchFilters, { type SearchFiltersState } from '@/components/search/SearchFilters';
import { useFilterOptions } from '@/hooks/useFilterOptions';

type ProfessionalResult = ComponentProps<typeof ProfessionalCard>['professional'];
type ProjectResult = ComponentProps<typeof ProjectCard>['project'];
type SearchResult = ProfessionalResult | ProjectResult;

type PaginationState = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

function SearchPageContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const initialLocation = searchParams.get('loc') || '';
  const initialType = (searchParams.get('type') || 'professionals') as 'professionals' | 'projects';

  const [searchType, setSearchType] = useState<'professionals' | 'projects'>(initialType);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });

  const [filters, setFilters] = useState<SearchFiltersState>({
    query: initialQuery,
    location: initialLocation,
    priceMin: '',
    priceMax: '',
    category: '',
    availability: false,
    sortBy: 'relevant',
    // Search filters
    services: [],
    geographicArea: '',
    priceModel: [],
    projectTypes: [],
    includedItems: [],
    startDateFrom: undefined,
    startDateTo: undefined,
  });

  const [categories, setCategories] = useState<string[]>([]);

  // Fetch dynamic filter options using the custom hook
  const { filterOptions, isLoading: isLoadingFilters } = useFilterOptions({ country: 'BE' });

  const professionalResults = results as ProfessionalResult[];
  const projectResults = results as ProjectResult[];

  // Fetch categories on mount (kept for backward compatibility)
  useEffect(() => {
    fetchCategories();
  }, []);

  // Fetch results when filters or search type changes
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    searchType,
    filters.query,
    filters.location,
    filters.priceMin,
    filters.priceMax,
    filters.category,
    filters.availability,
    filters.sortBy,
    filters.services,
    filters.geographicArea,
    filters.priceModel,
    filters.projectTypes,
    filters.includedItems,
    filters.startDateFrom,
    filters.startDateTo,
    pagination.page
  ]);

  const fetchCategories = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/service-categories/active?country=BE`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = (await response.json()) as Array<{ name: string }>;
        const categoryNames = data.map((cat) => cat.name);
        setCategories(categoryNames);
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  };

  const performSearch = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        type: searchType,
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (filters.query) params.append('q', filters.query);
      if (filters.location) params.append('loc', filters.location);
      if (filters.priceMin) params.append('priceMin', filters.priceMin);
      if (filters.priceMax) params.append('priceMax', filters.priceMax);
      if (filters.category) params.append('category', filters.category);
      if (filters.availability) params.append('availability', 'true');
      if (filters.sortBy) params.append('sortBy', filters.sortBy);

      // New filters
      if (filters.services.length > 0) params.append('services', filters.services.join(','));
      if (filters.geographicArea) params.append('geographicArea', filters.geographicArea);
      if (filters.priceModel.length > 0) params.append('priceModel', filters.priceModel.join(','));
      if (filters.projectTypes.length > 0) params.append('projectTypes', filters.projectTypes.join(','));
      if (filters.includedItems.length > 0) params.append('includedItems', filters.includedItems.join(','));
      if (filters.startDateFrom) params.append('startDateFrom', filters.startDateFrom.toISOString());
      if (filters.startDateTo) params.append('startDateTo', filters.startDateTo.toISOString());

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      const searchUrl = `${backendUrl}/api/search?${params.toString()}`;

      console.log('Searching:', searchUrl);

      const response = await fetch(searchUrl, { credentials: 'include' });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Search API error:', response.status, errorText);
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = (await response.json()) as {
        results?: SearchResult[];
        pagination?: PaginationState;
      };
      console.log('Search response:', data);
      console.log('Results count:', data.results?.length || 0);
      setResults(data.results ?? []);
      setPagination((prev) => data.pagination ?? prev);
    } catch (err) {
      console.error('Search error:', err);
      const message =
        err instanceof Error ? err.message : 'Failed to perform search. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = <K extends keyof SearchFiltersState>(key: K, value: SearchFiltersState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset to page 1 on filter change
  };

  const handleClearFilters = () => {
    setFilters({
      query: initialQuery,
      location: '',
      priceMin: '',
      priceMax: '',
      category: '',
      availability: false,
      sortBy: 'relevant',
      // Reset new filters
      services: [],
      geographicArea: '',
      priceModel: [],
      projectTypes: [],
      includedItems: [],
      startDateFrom: undefined,
      startDateTo: undefined,
    });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchTypeChange = (newType: 'professionals' | 'projects') => {
    setSearchType(newType);
    // Reset to page 1 when changing search type
    setPagination((prev) => ({ ...prev, page: 1 }));
    // Clear results to show loading state
    setResults([]);
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Search Results
            {filters.query && (
              <span className="text-blue-600"> for &quot;{filters.query}&quot;</span>
            )}
          </h1>
          <p className="text-gray-600">
            {isLoading ? 'Searching...' : `${pagination.total} results found`}
          </p>
        </div>

        {/* Search Type Tabs */}
        <Tabs value={searchType} onValueChange={(val) => handleSearchTypeChange(val as 'professionals' | 'projects')} className="mb-8">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="professionals">Professionals</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24">
              <SearchFilters
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
                searchType={searchType}
                categories={categories}
                filterOptions={filterOptions}
              />
            </div>
          </aside>

          {/* Results Grid */}
          <div className="lg:col-span-3">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <p className="text-gray-600 text-lg">Searching...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Search Failed</h2>
                <p className="text-gray-600 mb-6">{error}</p>
                <Button onClick={performSearch}>Try Again</Button>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <SearchIcon className="w-16 h-16 text-gray-300 mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">No Results Found</h2>
                <p className="text-gray-600 mb-6">
                  Try adjusting your search or filters to find what you&apos;re looking for.
                </p>
                <Button onClick={handleClearFilters}>Clear Filters</Button>
              </div>
            ) : (
              <>
                {/* Results Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
                  {searchType === 'professionals'
                    ? professionalResults.map((professional) => (
                        <ProfessionalCard key={professional._id} professional={professional} />
                      ))
                    : projectResults.map((project) => (
                        <ProjectCard key={project._id} project={project} />
                      ))}
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <Button
                      variant="outline"
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                        let pageNum;
                        if (pagination.totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (pagination.page <= 3) {
                          pageNum = i + 1;
                        } else if (pagination.page >= pagination.totalPages - 2) {
                          pageNum = pagination.totalPages - 4 + i;
                        } else {
                          pageNum = pagination.page - 2 + i;
                        }

                        return (
                          <Button
                            key={pageNum}
                            variant={pagination.page === pageNum ? 'default' : 'outline'}
                            onClick={() => handlePageChange(pageNum)}
                            className="w-10 h-10 p-0"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
