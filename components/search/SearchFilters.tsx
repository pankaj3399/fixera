'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Filter, X, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { formatSearchDateDraft, isSearchDateRangeValid, parseSearchDateDraft } from '@/lib/search/dateDraft';
import LocationAutocomplete, { type LocationData } from '@/components/search/LocationAutocomplete';
import {
  PROFESSIONAL_LEVELS,
  ADMIN_TAG_PRESETS,
  getLevelColor,
  getAdminTagStyle,
  formatAdminTagLabel,
} from '@/lib/professionalLevel';

export type SortOption = 'relevant' | 'price_low' | 'price_high' | 'newest' | 'availability' | 'popularity';

const SORT_OPTION_KEYS: Record<SortOption, 'filters.sort.relevant' | 'filters.sort.priceLow' | 'filters.sort.priceHigh' | 'filters.sort.newest' | 'filters.sort.availability' | 'filters.sort.popularity'> = {
  relevant: 'filters.sort.relevant',
  price_low: 'filters.sort.priceLow',
  price_high: 'filters.sort.priceHigh',
  newest: 'filters.sort.newest',
  availability: 'filters.sort.availability',
  popularity: 'filters.sort.popularity',
};

const PRICE_MODEL_KEYS = {
  fixed: 'priceModels.fixed',
  unit: 'priceModels.unit',
  rfq: 'priceModels.rfq',
  hour: 'priceModels.hour',
  day: 'priceModels.day',
  meter: 'priceModels.meter',
  m2: 'priceModels.m2',
  room: 'priceModels.room',
} as const;

const PROFESSIONAL_LEVEL_KEYS = {
  new: 'professionalLevels.new',
  'level 1': 'professionalLevels.level1',
  'level 2': 'professionalLevels.level2',
  'level 3': 'professionalLevels.level3',
  expert: 'professionalLevels.expert',
} as const;

const ADMIN_TAG_KEYS = {
  verified: 'adminTags.verified',
  'our choice': 'adminTags.ourChoice',
} as const;

export interface SearchFiltersState {
  query: string;
  location: string;
  priceMin: string;
  priceMax: string;
  category: string;
  availability: boolean;
  sortBy: SortOption;
  services: string[];
  geographicArea: string;
  priceModel: string[];
  projectTypes: string[];
  includedItems: string[];
  areasOfWork: string[];
  startDateFrom: Date | undefined;
  startDateTo: Date | undefined;
  professionalLevels: string[];
  adminTags: string[];
  minProjectRating: number;
}

export type SearchFilterKey = keyof SearchFiltersState;

// Re-export FilterOptions from shared types for backward compatibility
export type { FilterOptions } from '@/types/filters';
import { type FilterOptions, DEFAULT_PRICE_MODELS } from '@/types/filters';

export interface ProjectFacetCounts {
  categories: Record<string, number>;
  services: Record<string, number>;
  areasOfWork: Record<string, number>;
  priceModels: Record<string, number>;
  projectTypes: Record<string, number>;
  includedItems: Record<string, number>;
  professionalLevels: Record<string, number>;
  adminTags: Record<string, number>;
  minRating: Record<'any' | '1' | '2' | '3' | '4' | '5', number>;
}

interface SearchFiltersProps {
  filters: SearchFiltersState;
  onFilterChange: <K extends SearchFilterKey>(key: K, value: SearchFiltersState[K]) => void;
  onClearFilters: () => void;
  resetVersion?: number;
  searchType: 'professionals' | 'projects';
  categories?: string[];
  filterOptions?: FilterOptions;
  facets?: ProjectFacetCounts | null;
  onLocationCoordinatesChange?: (coordinates: { lat: number; lng: number } | null) => void;
}

// Common services list
const COMMON_SERVICES = [
  'Plumbing', 'Electrical', 'HVAC', 'Carpentry', 'Painting',
  'Roofing', 'Flooring', 'Landscaping', 'Masonry', 'Drywall'
];

// Project types
const PROJECT_TYPES = [
  'Residential', 'Commercial', 'Industrial', 'Outdoor', 'Renovation', 'New Construction'
];

// Common included items
const COMMON_INCLUDED_ITEMS = [
  'Materials', 'Labor', 'Permits', 'Cleanup', 'Disposal', 'Tools & Equipment',
  'Transportation', 'Design Services', 'Consultation', 'Warranty'
];

// Use shared price models constant (with fallback for type safety)
const PRICE_MODELS = DEFAULT_PRICE_MODELS ?? [
  { value: 'fixed', label: 'Fixed Price' },
  { value: 'unit', label: 'Unit Based' },
  { value: 'rfq', label: 'Request for Quote' }
];

const SearchFilters = ({
  filters,
  onFilterChange,
  onClearFilters,
  resetVersion = 0,
  searchType,
  categories = [],
  filterOptions,
  facets,
  onLocationCoordinatesChange,
}: SearchFiltersProps) => {
  const t = useTranslations('search');
  const { currency, rates } = useCurrency();
  const priceCurrency = currency === 'EUR' || rates?.[currency] ? currency : 'EUR';
  // Use dynamic filter options if provided, otherwise fall back to hardcoded values
  const servicesList = filterOptions?.services || COMMON_SERVICES;
  const projectTypesList = filterOptions?.projectTypes || PROJECT_TYPES;
  const includedItemsList = filterOptions?.includedItems || COMMON_INCLUDED_ITEMS;
  const areasOfWorkList = filterOptions?.areasOfWork || [];
  const priceModelsList = filterOptions?.priceModels || PRICE_MODELS;
  const categoriesList = filterOptions?.categories || categories;
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    service: true,
    location: true,
    category: false,
    priceModel: false,
    projectType: false,
    includedItems: false,
    areaOfWork: false,
    startDate: false,
    price: false,
    professionalLevel: false,
    adminTags: false,
    minRating: false,
  });
  const [dateDraft, setDateDraft] = useState({ from: formatSearchDateDraft(filters.startDateFrom), to: formatSearchDateDraft(filters.startDateTo) });
  const [dateError, setDateError] = useState('');
  const minPriceValue = filters.priceMin === '' ? undefined : Number(filters.priceMin);
  const maxPriceValue = filters.priceMax === '' ? undefined : Number(filters.priceMax);
  const priceBoundsInvalid = [minPriceValue, maxPriceValue].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0)) || (minPriceValue !== undefined && maxPriceValue !== undefined && minPriceValue > maxPriceValue);
  useEffect(() => {
    setDateDraft({ from: formatSearchDateDraft(filters.startDateFrom), to: formatSearchDateDraft(filters.startDateTo) });
    if (!filters.startDateFrom && !filters.startDateTo) setDateError('');
  }, [filters.startDateFrom, filters.startDateTo, resetVersion]);

  const commitDate = (side: 'from' | 'to') => {
    const parsed = parseSearchDateDraft(dateDraft[side]);
    if (parsed.error) {
      setDateError(t('filters.invalidDate'));
      return;
    }
    if (!parsed.date) {
      onFilterChange(side === 'from' ? 'startDateFrom' : 'startDateTo', undefined);
      setDateError('');
      return;
    }
    const nextFrom = side === 'from' ? parsed.date : filters.startDateFrom;
    const nextTo = side === 'to' ? parsed.date : filters.startDateTo;
    if (!isSearchDateRangeValid(nextFrom, nextTo)) {
      setDateError(t('filters.invalidDateRange'));
      return;
    }
    onFilterChange(side === 'from' ? 'startDateFrom' : 'startDateTo', parsed.date);
    setDateError('');
  };

  const priceRange = [
    parseInt(filters.priceMin || '0'),
    parseInt(filters.priceMax || '500'),
  ];

  const handlePriceChange = (values: number[]) => {
    onFilterChange('priceMin', values[0].toString());
    onFilterChange('priceMax', values[1].toString());
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  type FacetOption = {
    value: string
    count?: number
  }

  // Helper to build dynamic option lists with counts
  const buildOptions = (counts?: Record<string, number>, fallback?: string[]): FacetOption[] => {
    const values = new Set([...(fallback || []), ...Object.keys(counts || {})]);
    return [...values].sort((a, b) => (counts?.[b] || 0) - (counts?.[a] || 0)).map(value => ({ value, count: counts?.[value] || 0 }));
  };

  const dynamicServices = buildOptions(searchType === 'projects' ? facets?.services : undefined, servicesList);

  const dynamicProjectTypes = buildOptions(searchType === 'projects' ? facets?.projectTypes : undefined, projectTypesList);

  const dynamicIncludedItems = buildOptions(searchType === 'projects' ? facets?.includedItems : undefined, includedItemsList);

  const dynamicAreasOfWork = buildOptions(searchType === 'projects' ? facets?.areasOfWork : undefined, areasOfWorkList);

  const dynamicCategories = buildOptions(searchType === 'projects' ? facets?.categories : undefined, categoriesList);

  const dynamicPriceModels = buildOptions(
    searchType === 'projects' ? facets?.priceModels : undefined,
    priceModelsList.map(model => model.value)
  );

  const getPriceModelLabel = (value: string) => {
    const key = PRICE_MODEL_KEYS[value.toLowerCase() as keyof typeof PRICE_MODEL_KEYS];
    if (key) return t(key);
    return priceModelsList.find(model => model.value === value)?.label ||
      value.replace(/^\w/, char => char.toUpperCase());
  };

  const professionalLevelLabel = (level: string) => {
    const key = PROFESSIONAL_LEVEL_KEYS[level.toLowerCase() as keyof typeof PROFESSIONAL_LEVEL_KEYS];
    return key ? t(key) : level;
  };

  const adminTagLabel = (tag: string) => {
    const key = ADMIN_TAG_KEYS[tag.toLowerCase() as keyof typeof ADMIN_TAG_KEYS];
    return key ? t(key) : formatAdminTagLabel(tag);
  };

  const sectionLabel = (label: string, count: number) =>
    count > 0 ? t('filters.sectionCount', { label, count }) : label;

  const renderOptionContent = (label: React.ReactNode, count?: number) => (
    <span className="flex w-full items-center justify-between">
      <span>{label}</span>
      {typeof count === 'number' && (
        <span className="text-xs text-gray-500 ml-2">{count}</span>
      )}
    </span>
  );

  // Calculate active filters count
  const activeFiltersCount = [
    filters.services.length > 0,
    (filters.geographicArea || filters.location).trim() !== '',
    filters.priceModel.length > 0,
    filters.projectTypes.length > 0,
    filters.includedItems.length > 0,
    filters.areasOfWork.length > 0,
    filters.startDateFrom !== undefined || filters.startDateTo !== undefined,
    filters.priceMin !== '' || filters.priceMax !== '',
    filters.category.trim() !== '',
    filters.availability,
    filters.professionalLevels.length > 0,
    filters.adminTags.length > 0,
    filters.minProjectRating > 0,
  ].filter(Boolean).length;

  // Helper to toggle array values
  const toggleArrayValue = (
    key: 'services' | 'priceModel' | 'projectTypes' | 'includedItems' | 'areasOfWork' | 'professionalLevels' | 'adminTags',
    value: string
  ) => {
    const currentArray = filters[key] as string[];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(v => v !== value)
      : [...currentArray, value];
    onFilterChange(key, newArray as SearchFiltersState[typeof key]);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">{t('filters.title')}</h3>
          {activeFiltersCount > 0 && (
            <Badge variant="default" className="ml-1">
              {activeFiltersCount}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          type="button"
          size="sm"
          onClick={onClearFilters}
          className="text-gray-600 hover:text-gray-900"
        >
          <X className="w-4 h-4 mr-1" />
          {t('filters.clearAll')}
        </Button>
      </div>

      {/* Sort By */}
      <div className="space-y-2 border-b pb-4 order-last">
        <Label htmlFor="sortBy" className="text-sm font-semibold text-gray-900">
          {t('filters.sortBy')}
        </Label>
        <Select value={filters.sortBy} onValueChange={(val) => onFilterChange('sortBy', val as SortOption)}>
          <SelectTrigger id="sortBy" className="w-full">
            <SelectValue placeholder={t('filters.sortPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevant">{t(SORT_OPTION_KEYS.relevant)}</SelectItem>
            <SelectItem value="price_low">{t(SORT_OPTION_KEYS.price_low)}</SelectItem>
            <SelectItem value="price_high">{t(SORT_OPTION_KEYS.price_high)}</SelectItem>
            <SelectItem value="newest">{t(SORT_OPTION_KEYS.newest)}</SelectItem>
            {searchType === 'projects' && (
              <SelectItem value="availability">{t(SORT_OPTION_KEYS.availability)}</SelectItem>
            )}
            <SelectItem value="popularity">{t(SORT_OPTION_KEYS.popularity)}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Geographic Area Filter */}
      <div className="space-y-2 border-b pb-4 order-1">
        <button
          type="button"
          onClick={() => toggleSection('location')}
          className="flex items-center justify-between w-full text-left"
        >
          <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
            {t('filters.location')} {(filters.location || filters.geographicArea) && '✓'}
          </Label>
          {expandedSections.location ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {expandedSections.location && (
          <div className="space-y-2 mt-2">
            <LocationAutocomplete
              value={filters.geographicArea || filters.location}
              onChange={(location: string, locationData?: LocationData) => {
                if (searchType === 'projects') {
                  onFilterChange('geographicArea', location);
                  onFilterChange('location', '');
                } else {
                  onFilterChange('location', location);
                  onFilterChange('geographicArea', '');
                }

                // Send coordinates to parent if callback is provided
                if (onLocationCoordinatesChange) {
                  onLocationCoordinatesChange(locationData?.coordinates || null);
                }
              }}
              placeholder={t('filters.locationPlaceholder')}
              className="border rounded-md px-3 py-2"
            />
          </div>
        )}
      </div>

      {/* Service Filter */}
      {dynamicServices.length > 0 && (
        <div className={`space-y-2 border-b pb-4 ${searchType === 'projects' ? 'order-5' : 'order-2'}`}>
          <button
            type="button"
            onClick={() => toggleSection('service')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              {sectionLabel(t('filters.service'), filters.services.length)}
            </Label>
            {expandedSections.service ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.service && (
            <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
              {dynamicServices.map(({ value, count }) => (
                <div key={value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`service-${value}`}
                    checked={filters.services.includes(value)}
                    onCheckedChange={() => toggleArrayValue('services', value)}
                  />
                  <Label
                    htmlFor={`service-${value}`}
                    className="text-sm font-normal text-gray-700 cursor-pointer w-full"
                  >
                    <span className="flex w-full items-center justify-between">
                      <Badge variant="secondary" className="font-medium bg-blue-50 text-blue-700 border-blue-200">{value}</Badge>
                      {typeof count === 'number' && (
                        <span className="text-xs text-gray-500 ml-2">{count}</span>
                      )}
                    </span>
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Professional Level Filter */}
      <div className={`space-y-2 border-b pb-4 ${searchType === 'projects' ? 'order-6' : 'order-3'}`}>
        <button
          type="button"
          onClick={() => toggleSection('professionalLevel')}
          className="flex items-center justify-between w-full text-left"
        >
          <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
            {sectionLabel(t('filters.professionalLevel'), filters.professionalLevels.length)}
          </Label>
          {expandedSections.professionalLevel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {expandedSections.professionalLevel && (
          <div className="space-y-2 mt-2">
            {PROFESSIONAL_LEVELS.map((level) => (
              <div key={level} className="flex items-center space-x-2">
                <Checkbox
                  id={`level-${level}`}
                  checked={filters.professionalLevels.includes(level)}
                  onCheckedChange={() => toggleArrayValue('professionalLevels', level)}
                />
                <Label
                  htmlFor={`level-${level}`}
                  className="text-sm font-normal text-gray-700 cursor-pointer w-full"
                >
                  {renderOptionContent(<Badge variant="secondary" className={`font-medium ${getLevelColor(level)}`}>{professionalLevelLabel(level)}</Badge>, facets?.professionalLevels?.[level] || 0)}
                </Label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin Tags Filter */}
      <div className={`space-y-2 border-b pb-4 ${searchType === 'projects' ? 'order-7' : 'order-4'}`}>
        <button
          type="button"
          onClick={() => toggleSection('adminTags')}
          className="flex items-center justify-between w-full text-left"
        >
          <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
            {sectionLabel(t('filters.professionalTags'), filters.adminTags.length)}
          </Label>
          {expandedSections.adminTags ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {expandedSections.adminTags && (
          <div className="space-y-2 mt-2">
            {ADMIN_TAG_PRESETS.map((tag) => (
              <div key={tag} className="flex items-center space-x-2">
                <Checkbox
                  id={`tag-${tag}`}
                  checked={filters.adminTags.includes(tag)}
                  onCheckedChange={() => toggleArrayValue('adminTags', tag)}
                />
                <Label
                  htmlFor={`tag-${tag}`}
                  className="text-sm font-normal text-gray-700 cursor-pointer w-full"
                >
                  {renderOptionContent(<Badge variant="outline" className={`font-medium ${getAdminTagStyle(tag)}`}>{adminTagLabel(tag)}</Badge>, facets?.adminTags?.[tag] || 0)}
                </Label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Minimum Project Rating Filter - Only for projects */}
      {searchType === 'projects' && (
        <div className="space-y-2 border-b pb-4 order-8">
          <button
            type="button"
            onClick={() => toggleSection('minRating')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              {filters.minProjectRating > 0
                ? t('filters.minRatingValue', { rating: filters.minProjectRating })
                : t('filters.minRating')}
            </Label>
            {expandedSections.minRating ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.minRating && (
            <div className="flex flex-wrap gap-2 mt-2">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={filters.minProjectRating === n ? 'default' : 'outline'}
                  size="sm"
                  onClick={() =>
                    onFilterChange(
                      'minProjectRating',
                      filters.minProjectRating === n && n !== 0 ? 0 : n
                    )
                  }
                  className="flex items-center gap-1"
                >
                  {n === 0 ? t('filters.any') : (
                    <>
                      {n}
                      <Star className="w-3 h-3 fill-current" />
                    </>
                  )}
                  <span className="text-xs text-gray-500">{facets?.minRating?.[n === 0 ? 'any' : String(n) as '1' | '2' | '3' | '4' | '5'] ?? 0}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Area of Work Filter - Only for projects */}
      {searchType === 'projects' && dynamicAreasOfWork.length > 0 && (
        <div className="space-y-2 border-b pb-4 order-9">
          <button
            type="button"
            onClick={() => toggleSection('areaOfWork')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              {sectionLabel(t('filters.areaOfWork'), filters.areasOfWork.length)}
            </Label>
            {expandedSections.areaOfWork ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.areaOfWork && (
            <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
              {dynamicAreasOfWork.map(({ value, count }) => (
                <div key={value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`area-${value}`}
                    checked={filters.areasOfWork.includes(value)}
                    onCheckedChange={() => toggleArrayValue('areasOfWork', value)}
                  />
                  <Label
                    htmlFor={`area-${value}`}
                    className="text-sm font-normal text-gray-700 cursor-pointer"
                  >
                    {renderOptionContent(value, count)}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}



      {/* Price Model Filter - Only for projects */}
      {searchType === 'projects' && dynamicPriceModels.length > 0 && (
        <div className="space-y-2 border-b pb-4 order-10">
          <button
            type="button"
            onClick={() => toggleSection('priceModel')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              {sectionLabel(t('filters.priceModel'), filters.priceModel.length)}
            </Label>
            {expandedSections.priceModel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.priceModel && (
            <div className="space-y-2 mt-2">
              {dynamicPriceModels.map(({ value, count }) => (
                <div key={value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`priceModel-${value}`}
                    checked={filters.priceModel.includes(value)}
                    onCheckedChange={() => toggleArrayValue('priceModel', value)}
                  />
                  <Label
                    htmlFor={`priceModel-${value}`}
                    className="text-sm font-normal text-gray-700 cursor-pointer w-full"
                  >
                    <span className="flex w-full items-center justify-between">
                      <Badge variant="outline" className="font-medium text-emerald-700 border-emerald-200 bg-emerald-50">{getPriceModelLabel(value)}</Badge>
                      {typeof count === 'number' && (
                        <span className="text-xs text-gray-500 ml-2">{count}</span>
                      )}
                    </span>
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Project Type Filter - Only for projects */}
      {searchType === 'projects' && dynamicProjectTypes.length > 0 && (
        <div className="space-y-2 border-b pb-4 order-11">
          <button
            type="button"
            onClick={() => toggleSection('projectType')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              {sectionLabel(t('filters.projectType'), filters.projectTypes.length)}
            </Label>
            {expandedSections.projectType ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.projectType && (
            <div className="space-y-2 mt-2">
              {dynamicProjectTypes.map(({ value, count }) => (
                <div key={value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`projectType-${value}`}
                    checked={filters.projectTypes.includes(value)}
                    onCheckedChange={() => toggleArrayValue('projectTypes', value)}
                  />
                  <Label
                    htmlFor={`projectType-${value}`}
                    className="text-sm font-normal text-gray-700 cursor-pointer w-full"
                  >
                    <span className="flex w-full items-center justify-between">
                      <Badge className="font-medium bg-blue-600 hover:bg-blue-700 text-white border-transparent">{value}</Badge>
                      {typeof count === 'number' && (
                        <span className="text-xs text-gray-500 ml-2">{count}</span>
                      )}
                    </span>
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Included Items Filter - Only for projects */}
      {searchType === 'projects' && dynamicIncludedItems.length > 0 && (
        <div className="space-y-2 border-b pb-4 order-12">
          <button
            type="button"
            onClick={() => toggleSection('includedItems')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              {sectionLabel(t('filters.includedItems'), filters.includedItems.length)}
            </Label>
            {expandedSections.includedItems ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.includedItems && (
            <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
              {dynamicIncludedItems.map(({ value, count }) => (
                <div key={value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`includedItem-${value}`}
                    checked={filters.includedItems.includes(value)}
                    onCheckedChange={() => toggleArrayValue('includedItems', value)}
                  />
                  <Label
                    htmlFor={`includedItem-${value}`}
                    className="text-sm font-normal text-gray-700 cursor-pointer"
                  >
                    {renderOptionContent(value, count)}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Desired Start Date Range - Only for projects */}
      {searchType === 'projects' && (
        <div className="space-y-2 border-b pb-4 order-2">
          <button
            type="button"
            onClick={() => toggleSection('startDate')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              {t('filters.startDateRange')} {(filters.startDateFrom || filters.startDateTo) && '✓'}
            </Label>
            {expandedSections.startDate ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.startDate && (
            <div className="space-y-3 mt-2">
              <div>
                <Label htmlFor="startDateFrom" className="text-xs text-gray-600 mb-1">{t('filters.fromDate')}</Label>
                <Input id="startDateFrom" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={dateDraft.from} aria-invalid={Boolean(dateError)} onChange={(event) => setDateDraft((prev) => ({ ...prev, from: event.target.value }))} onBlur={() => commitDate('from')} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitDate('from'); } }} />
              </div>
              <div>
                <Label htmlFor="startDateTo" className="text-xs text-gray-600 mb-1">{t('filters.toDate')}</Label>
                <Input id="startDateTo" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={dateDraft.to} aria-invalid={Boolean(dateError)} onChange={(event) => setDateDraft((prev) => ({ ...prev, to: event.target.value }))} onBlur={() => commitDate('to')} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitDate('to'); } }} />
              </div>
              {dateError && <p role="alert" className="text-xs text-red-600">{dateError}</p>}
            </div>
          )}
        </div>
      )}

      {/* Price Range Filter */}
        <div className={`space-y-2 border-b pb-4 ${searchType === 'projects' ? 'order-3' : 'order-5'}`}>
        <button
          type="button"
          onClick={() => toggleSection('price')}
          className="flex items-center justify-between w-full text-left"
        >
          <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
            {searchType === 'professionals' ? t('filters.hourlyRate') : t('filters.priceRange', { currency: priceCurrency })} {(filters.priceMin || filters.priceMax) && '✓'}
          </Label>
          {expandedSections.price ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {expandedSections.price && (
          <div className="space-y-3 mt-2">
            <div className="px-2">
              <Slider
                min={0}
                max={500}
                step={1}
                value={priceRange}
                onValueChange={handlePriceChange}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Input
                type="number"
                min="0"
                step="any"
                value={filters.priceMin}
                aria-invalid={priceBoundsInvalid}
                onChange={(e) => onFilterChange('priceMin', e.target.value)}
                className="w-20 h-8 text-xs"
                placeholder={t('filters.min')}
              />
              <span>-</span>
              <Input
                type="number"
                min="0"
                step="any"
                value={filters.priceMax}
                aria-invalid={priceBoundsInvalid}
                onChange={(e) => onFilterChange('priceMax', e.target.value)}
                className="w-20 h-8 text-xs"
                placeholder={t('filters.max')}
              />
            </div>
            {priceBoundsInvalid && <p role="alert" className="text-xs text-red-600">{t('filters.invalidPriceRange')}</p>}
            {searchType === 'projects' && <p className="text-xs text-gray-500">{t('filters.priceUnitHelp')}</p>}
          </div>
        )}
      </div>

      {/* Category Filter */}
      {dynamicCategories.length > 0 && (
        <div className={`space-y-2 border-b pb-4 ${searchType === 'projects' ? 'order-4' : 'order-6'}`}>
          <button
            type="button"
            onClick={() => toggleSection('category')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              {sectionLabel(t('filters.category'), filters.category ? 1 : 0)}
            </Label>
            {expandedSections.category ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.category && (
            <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
              {dynamicCategories.map(({ value, count }) => (
                <div key={value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`category-${value}`}
                    checked={filters.category === value}
                    onCheckedChange={() => onFilterChange('category', filters.category === value ? '' : value)}
                  />
                  <Label
                    htmlFor={`category-${value}`}
                    className="text-sm font-normal text-gray-700 cursor-pointer w-full"
                  >
                    {renderOptionContent(value, count)}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Availability Filter - Only for professionals */}
      {searchType === 'professionals' && (
        <div className="space-y-2 border-b pb-4 order-13">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="availability"
              checked={filters.availability}
              onCheckedChange={(checked) => onFilterChange('availability', Boolean(checked))}
            />
            <Label
              htmlFor="availability"
              className="text-sm font-medium text-gray-700 cursor-pointer"
            >
              {t('filters.availability')}
            </Label>
          </div>
        </div>
      )}


    </div>
  );
};

export default SearchFilters;
