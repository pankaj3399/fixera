'use client';

import React, { useState, useEffect, Suspense, ComponentProps, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertCircle, Search as SearchIcon } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProfessionalCard from '@/components/search/ProfessionalCard';
import ProjectCard from '@/components/search/ProjectCard';
import SearchFilters, { type SearchFiltersState, type ProjectFacetCounts } from '@/components/search/SearchFilters';
import { useFilterOptions } from '@/hooks/useFilterOptions';
import { useCustomerPricing } from '@/hooks/useCustomerPricing';
import { useFavoriteStatus } from '@/hooks/useFavoriteStatus';
import { trackProjectSearch } from '@/lib/analytics';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { getAuthToken } from '@/lib/utils';

type ProfessionalResult = ComponentProps<typeof ProfessionalCard>['professional'];
type ProjectResult = ComponentProps<typeof ProjectCard>['project'];
type SearchResult = ProfessionalResult | ProjectResult;

type PaginationState = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const countActiveFilters = (filters: SearchFiltersState): number => {
  return [
    filters.priceMin,
    filters.priceMax,
    filters.category,
    filters.availability,
    filters.geographicArea,
    filters.minProjectRating > 0,
    filters.services.length > 0,
    filters.priceModel.length > 0,
    filters.projectTypes.length > 0,
    filters.includedItems.length > 0,
    filters.areasOfWork.length > 0,
    Boolean(filters.startDateFrom),
    Boolean(filters.startDateTo),
    filters.professionalLevels.length > 0,
    filters.adminTags.length > 0,
  ].filter(Boolean).length;
};

const extractLocationDetails = (raw?: string | null) => {
  if (!raw) {
    return { city: undefined, state: undefined, country: undefined, address: undefined };
  }

  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { city: undefined, state: undefined, country: undefined, address: undefined };
  }

  const country = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const state = parts.length > 2 ? parts[parts.length - 2] : parts.length === 2 ? parts[1] : undefined;
  const city =
    parts.length >= 3
      ? parts[parts.length - 3]
      : parts[0] || undefined;

  return {
    city,
    state,
    country,
    address: raw.trim(),
  };
};

function SearchPageContent() {
  const searchParams = useSearchParams();
  const t = useTranslations('search');
  const getErrorText = useErrorMessage();
  const { user, loading: authLoading } = useAuth();
  const { convertToEur } = useCurrency();
  const initialQuery = searchParams.get('q') || '';
  const initialLocation = searchParams.get('loc') || '';
  const initialType = (searchParams.get('type') || 'professionals') as 'professionals' | 'projects';
  const initialLat = searchParams.get('lat');
  const initialLon = searchParams.get('lon');
  const initialCoordinates =
    initialLat !== null && initialLon !== null
      ? (() => {
          const lat = parseFloat(initialLat);
          const lng = parseFloat(initialLon);
          return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
        })()
      : null;

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
  const [projectFacets, setProjectFacets] = useState<ProjectFacetCounts | null>(null);

  const [filterResetVersion, setFilterResetVersion] = useState(0);
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
    areasOfWork: [],
    startDateFrom: undefined,
    startDateTo: undefined,
    professionalLevels: [],
    adminTags: [],
    minProjectRating: 0,
  });

  // Store location coordinates separately
  const [locationCoordinates, setLocationCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(initialCoordinates);

  const searchAbortRef = useRef<AbortController | null>(null);
  const resultsStartRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollAfterFilterRef = useRef(false);
  const profileLocationHydratedForUserRef = useRef<string | null>(
    initialLocation ? "__url_location__" : null,
  );
  const hasProfileDerivedLocationRef = useRef(false);

  // Fetch dynamic filter options using the custom hook
  const { filterOptions } = useFilterOptions({ country: 'BE' });
  const { customerPrice, originalPrice } = useCustomerPricing();

  const professionalResults = results as ProfessionalResult[];
  const projectResults = results as ProjectResult[];

  const professionalIds = useMemo(
    () => (searchType === 'professionals' ? professionalResults.map((p) => p._id) : []),
    [searchType, professionalResults]
  );
  const projectIds = useMemo(
    () => (searchType === 'projects' ? projectResults.map((p) => p._id) : []),
    [searchType, projectResults]
  );
  const favoritedProfessionals = useFavoriteStatus('professional', professionalIds);
  const favoritedProjects = useFavoriteStatus('project', projectIds);
  // Reuse the globally loaded auth principal instead of issuing another /me request.
  useEffect(() => {
    if (authLoading) return;

    const userId = user?._id ?? null;
    if (profileLocationHydratedForUserRef.current === userId) return;

    if (hasProfileDerivedLocationRef.current) {
      setFilters((prev) => ({ ...prev, location: '' }));
      setLocationCoordinates(null);
      hasProfileDerivedLocationRef.current = false;
    }

    if (!user || initialLocation) {
      profileLocationHydratedForUserRef.current = userId;
      return;
    }

    const coordinates = user?.location?.coordinates;
    if (!coordinates || coordinates.length !== 2) {
      profileLocationHydratedForUserRef.current = userId;
      return;
    }
    const [longitude, latitude] = coordinates;
    const locationParts = [user.location?.city, user.location?.country].filter(Boolean);
    if (locationParts.length === 0) {
      profileLocationHydratedForUserRef.current = userId;
      return;
    }

    setFilters((prev) => ({ ...prev, location: locationParts.join(', ') }));
    setLocationCoordinates({ lat: latitude, lng: longitude });
    hasProfileDerivedLocationRef.current = true;
    profileLocationHydratedForUserRef.current = userId;
  }, [authLoading, initialLocation, user]);

  // Fetch results when filters or search type changes
  useEffect(() => {
    if (authLoading) return;

    const timer = setTimeout(() => {
      performSearch();
    }, 300);
    return () => {
      clearTimeout(timer);
      searchAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authLoading,
    user?.role,
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
    filters.areasOfWork,
    filters.startDateFrom,
    filters.startDateTo,
    filters.professionalLevels,
    filters.adminTags,
    filters.minProjectRating,
    user?._id,
    pagination.page,
    locationCoordinates,
    convertToEur
  ]);

  const performSearch = async () => {
    searchAbortRef.current?.abort();
    const minPrice = filters.priceMin === '' ? undefined : Number(filters.priceMin);
    const maxPrice = filters.priceMax === '' ? undefined : Number(filters.priceMax);
    if (searchType === 'projects' && ([minPrice, maxPrice].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0)) || (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice))) {
      setIsLoading(false);
      setError(null);
      setResults([]);
      setPagination((prev) => ({ ...prev, total: 0, totalPages: 0, page: 1 }));
      return;
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
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
      const toBasePrice = (value: string) => searchType === 'projects' ? convertToEur(Number(value)) : value;
      if (filters.priceMin !== '') params.append('priceMin', String(toBasePrice(filters.priceMin)));
      if (filters.priceMax !== '') params.append('priceMax', String(toBasePrice(filters.priceMax)));
      if (filters.category) params.append('category', filters.category);
      if (filters.availability) params.append('availability', 'true');
      if (filters.sortBy) params.append('sortBy', filters.sortBy);

      // New filters
      if (filters.services.length > 0) params.append('services', filters.services.join(','));
      if (filters.geographicArea) params.append('geographicArea', filters.geographicArea);
      if (filters.priceModel.length > 0) params.append('priceModel', filters.priceModel.join(','));
      if (filters.projectTypes.length > 0) params.append('projectTypes', filters.projectTypes.join(','));
      if (filters.includedItems.length > 0) params.append('includedItems', filters.includedItems.join(','));
      if (filters.areasOfWork.length > 0) params.append('areaOfWork', filters.areasOfWork.join(','));
      const dateOnly = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
      if (filters.startDateFrom) params.append('startDateFrom', dateOnly(filters.startDateFrom));
      if (filters.startDateTo) params.append('startDateTo', dateOnly(filters.startDateTo));
      if (filters.professionalLevels.length > 0) params.append('professionalLevels', filters.professionalLevels.join(','));
      if (filters.adminTags.length > 0) params.append('adminTags', filters.adminTags.join(','));
      if (searchType === 'projects' && filters.minProjectRating > 0) {
        params.append('minRating', filters.minProjectRating.toString());
      }


      if (searchType === 'projects' && (filters.location || filters.geographicArea)) {
        const locationDetails = extractLocationDetails(filters.location || filters.geographicArea);
        if (locationDetails.city) params.append('customerCity', locationDetails.city);
        if (locationDetails.state) params.append('customerState', locationDetails.state);
        if (locationDetails.country) params.append('customerCountry', locationDetails.country);
        if (locationDetails.address) params.append('customerAddress', locationDetails.address);

        // Send GPS coordinates if available (for accurate distance filtering)
        if (locationCoordinates) {
          params.append('customerLat', locationCoordinates.lat.toString());
          params.append('customerLon', locationCoordinates.lng.toString());
        }
      }

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      const searchUrl = `${backendUrl}/api/search?${params.toString()}`;

      const token = getAuthToken();
      const response = await fetch(searchUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Search API error:', response.status, errorText);
        throw new Error(t('page.errorFallback'));
      }

      const data = (await response.json()) as {
        results?: SearchResult[];
        pagination?: PaginationState;
        facets?: ProjectFacetCounts;
      };
      if (controller.signal.aborted) return;
       if (searchType === 'projects' && Array.isArray(data.results)) {
        const availabilityDebug = data.results
          .map((project) => {
            const projectData = project as ProjectResult;
            const subprojects = projectData.subprojects || [];
            const missingSubprojects = subprojects
              .filter((subproject) => !subproject.firstAvailableDate)
              .map((subproject) => ({
                name: subproject.name,
                executionDuration: subproject.executionDuration,
                firstAvailableDate: subproject.firstAvailableDate ?? null,
              }));
            if (missingSubprojects.length === 0) {
              return null;
            }
            return {
              id: projectData._id,
              title: projectData.title,
              timeMode: projectData.timeMode,
              executionDuration: projectData.executionDuration,
              firstAvailableDate: projectData.firstAvailableDate ?? null,
              missingSubprojects,
            };
          })
          .filter(Boolean);
        if (availabilityDebug.length > 0) {
          if (process.env.NODE_ENV === 'development') {
            console.warn(
              '[SEARCH] Missing subproject availability data:',
              availabilityDebug
            );
          }
        }
      }
      setResults(data.results ?? []);
      setProjectFacets(searchType === 'projects' ? data.facets ?? null : null);
      setPagination((prev) => data.pagination ?? prev);
      trackProjectSearch({
        searchType,
        query: filters.query,
        location: filters.location || filters.geographicArea,
        resultsCount: data.pagination?.total ?? data.results?.length ?? 0,
        page: pagination.page,
        filtersCount: countActiveFilters(filters),
      });
      if (shouldScrollAfterFilterRef.current) {
        shouldScrollAfterFilterRef.current = false;
        requestAnimationFrame(() => resultsStartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      console.error('Search error:', err);
      setError(getErrorText(err, t('page.errorFallback')));
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setIsLoading(false);
      }
    }
  };

  const handleFilterChange = <K extends keyof SearchFiltersState>(key: K, value: SearchFiltersState[K]) => {
    shouldScrollAfterFilterRef.current = true;
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset to page 1 on filter change
  };

  const handleClearFilters = () => {
    setFilterResetVersion(version => version + 1);
    shouldScrollAfterFilterRef.current = true;
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
      areasOfWork: [],
      startDateFrom: undefined,
      startDateTo: undefined,
      professionalLevels: [],
      adminTags: [],
      minProjectRating: 0,
    });
    setPagination((prev) => ({ ...prev, page: 1 }));
    setLocationCoordinates(null);
  };

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchTypeChange = (newType: 'professionals' | 'projects') => {
    setProjectFacets(null);
    setSearchType(newType);
    setPagination((prev) => ({ ...prev, page: 1 }));
    setResults([]);
    if (newType !== 'projects' && filters.minProjectRating > 0) {
      setFilters((prev) => ({ ...prev, minProjectRating: 0 }));
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            {filters.query
              ? t.rich('page.headingFor', {
                  query: filters.query,
                  strong: (chunks) => <span className="text-blue-600">{chunks}</span>,
                })
              : t('page.heading')}
          </h1>
          <p className="text-gray-600">
            {isLoading ? t('page.searching') : t('page.resultsFound', { count: pagination.total })}
          </p>
        </div>

        {/* Search Type Tabs */}
        <Tabs value={searchType} onValueChange={(val) => handleSearchTypeChange(val as 'professionals' | 'projects')} className="mb-8">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="professionals">{t('page.tabProfessionals')}</TabsTrigger>
            <TabsTrigger value="projects">{t('page.tabProjects')}</TabsTrigger>
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
                resetVersion={filterResetVersion}
                searchType={searchType}
                categories={filterOptions.categories}
                filterOptions={filterOptions}
                facets={projectFacets}
                onLocationCoordinatesChange={setLocationCoordinates}
              />
            </div>
          </aside>

          {/* Results Grid */}
          <div ref={resultsStartRef} className="lg:col-span-3 scroll-mt-24 min-h-[24rem]">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 space-y-3">
                    <Skeleton className="h-40 w-full rounded-lg" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <div className="flex gap-2 pt-1">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('page.errorTitle')}</h2>
                <p role="alert" className="text-gray-600 mb-6">{error}</p>
                <Button onClick={performSearch}>{t('page.tryAgain')}</Button>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <SearchIcon className="w-16 h-16 text-gray-300 mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('page.emptyTitle')}</h2>
                <p className="text-gray-600 mb-6">
                  {t('page.emptyDescription')}
                </p>
                <Button onClick={handleClearFilters}>{t('page.clearFilters')}</Button>
              </div>
            ) : (
              <>
                {/* Results Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
                  {searchType === 'professionals'
                    ? professionalResults.map((professional) => (
                        <ProfessionalCard
                          key={professional._id}
                          professional={professional}
                          initialFavorited={Boolean(favoritedProfessionals[professional._id])}
                        />
                      ))
                    : projectResults.map((project) => (
                        <ProjectCard
                          key={project._id}
                          project={project}
                          customerPrice={customerPrice}
                          originalPrice={originalPrice}
                          initialFavorited={Boolean(favoritedProjects[project._id])}
                        />
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
                      {t('page.previous')}
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
                            aria-label={t('page.pageNumber', { page: pageNum })}
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
                      {t('page.next')}
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
      <div className="bg-gray-50 min-h-screen">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24">
          <div className="mb-8 space-y-3">
            <Skeleton className="h-10 w-52" />
            <Skeleton className="h-5 w-80" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 space-y-3">
                <Skeleton className="h-40 w-full rounded-lg" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        </main>
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
