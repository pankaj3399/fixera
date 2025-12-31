'use client';

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import Calendar from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Filter, X, ChevronDown, ChevronUp, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import LocationAutocomplete, { type LocationData } from '@/components/search/LocationAutocomplete';

export type SortOption = 'relevant' | 'price_low' | 'price_high' | 'newest' | 'availability' | 'popularity';

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
}

interface SearchFiltersProps {
  filters: SearchFiltersState;
  onFilterChange: <K extends SearchFilterKey>(key: K, value: SearchFiltersState[K]) => void;
  onClearFilters: () => void;
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
  searchType,
  categories = [],
  filterOptions,
  facets,
  onLocationCoordinatesChange,
}: SearchFiltersProps) => {
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
    priceModel: false,
    projectType: false,
    includedItems: false,
    areaOfWork: false,
    startDate: false,
    price: false,
  });

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
    if (counts && Object.keys(counts).length > 0) {
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count }));
    }
    return (fallback || []).map(value => ({ value }));
  };

  const dynamicServices = searchType === 'projects'
    ? buildOptions(facets?.services)
    : buildOptions(undefined, servicesList);

  const dynamicProjectTypes = searchType === 'projects'
    ? buildOptions(facets?.projectTypes)
    : buildOptions(undefined, projectTypesList);

  const dynamicIncludedItems = searchType === 'projects'
    ? buildOptions(facets?.includedItems)
    : buildOptions(undefined, includedItemsList);

  const dynamicAreasOfWork = searchType === 'projects'
    ? buildOptions(facets?.areasOfWork)
    : buildOptions(undefined, areasOfWorkList);

  const dynamicCategories = searchType === 'projects'
    ? buildOptions(facets?.categories)
    : buildOptions(undefined, categoriesList);

  const dynamicPriceModels = searchType === 'projects'
    ? (facets?.priceModels && Object.keys(facets.priceModels).length > 0
        ? Object.entries(facets.priceModels)
            .sort((a, b) => b[1] - a[1])
            .map(([value, count]) => ({ value, count }))
        : priceModelsList.map(model => ({ value: model.value, count: undefined })))
    : priceModelsList.map(model => ({ value: model.value, count: undefined }));

  const getPriceModelLabel = (value: string) =>
    priceModelsList.find(model => model.value === value)?.label ||
    value.replace(/^\w/, char => char.toUpperCase());

  const renderOptionContent = (label: string, count?: number) => (
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
    filters.geographicArea.trim() !== '',
    filters.priceModel.length > 0,
    filters.projectTypes.length > 0,
    filters.includedItems.length > 0,
    filters.areasOfWork.length > 0,
    filters.startDateFrom !== undefined || filters.startDateTo !== undefined,
    filters.priceMin !== '' || filters.priceMax !== '',
    filters.location.trim() !== '',
    filters.category.trim() !== '',
    filters.availability,
  ].filter(Boolean).length;

  // Helper to toggle array values
  const toggleArrayValue = (
    key: 'services' | 'priceModel' | 'projectTypes' | 'includedItems' | 'areasOfWork',
    value: string
  ) => {
    const currentArray = filters[key] as string[];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(v => v !== value)
      : [...currentArray, value];
    onFilterChange(key, newArray as SearchFiltersState[typeof key]);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
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
          Clear All
        </Button>
      </div>

      {/* Service Filter - Only for projects */}
      {searchType === 'projects' && dynamicServices.length > 0 && (
        <div className="space-y-2 border-b pb-4">
          <button
            onClick={() => toggleSection('service')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              Service {filters.services.length > 0 && `(${filters.services.length})`}
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

      {/* Area of Work Filter - Only for projects */}
      {searchType === 'projects' && dynamicAreasOfWork.length > 0 && (
        <div className="space-y-2 border-b pb-4">
          <button
            onClick={() => toggleSection('areaOfWork')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              Area of Work {filters.areasOfWork.length > 0 && `(${filters.areasOfWork.length})`}
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

      {/* Geographic Area Filter */}
      <div className="space-y-2 border-b pb-4">
        <button
          onClick={() => toggleSection('location')}
          className="flex items-center justify-between w-full text-left"
        >
          <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
            Location {(filters.location || filters.geographicArea) && '✓'}
          </Label>
          {expandedSections.location ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {expandedSections.location && (
          <div className="space-y-2 mt-2">
            <LocationAutocomplete
              value={filters.geographicArea || filters.location}
              onChange={(location: string, locationData?: LocationData) => {
                onFilterChange('geographicArea', location);
                onFilterChange('location', location);

                // Send coordinates to parent if callback is provided
                if (onLocationCoordinatesChange) {
                  onLocationCoordinatesChange(locationData?.coordinates || null);
                }
              }}
              placeholder="City, Region, or Postal Code"
              className="border rounded-md px-3 py-2"
            />
          </div>
        )}
      </div>

      {/* Price Model Filter - Only for projects */}
      {searchType === 'projects' && dynamicPriceModels.length > 0 && (
        <div className="space-y-2 border-b pb-4">
          <button
            onClick={() => toggleSection('priceModel')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              Price Model {filters.priceModel.length > 0 && `(${filters.priceModel.length})`}
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
                    className="text-sm font-normal text-gray-700 cursor-pointer"
                  >
                    {renderOptionContent(getPriceModelLabel(value), count)}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Project Type Filter - Only for projects */}
      {searchType === 'projects' && dynamicProjectTypes.length > 0 && (
        <div className="space-y-2 border-b pb-4">
          <button
            onClick={() => toggleSection('projectType')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              Project Type {filters.projectTypes.length > 0 && `(${filters.projectTypes.length})`}
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

      {/* Included Items Filter - Only for projects */}
      {searchType === 'projects' && dynamicIncludedItems.length > 0 && (
        <div className="space-y-2 border-b pb-4">
          <button
            onClick={() => toggleSection('includedItems')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              Included Items {filters.includedItems.length > 0 && `(${filters.includedItems.length})`}
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
        <div className="space-y-2 border-b pb-4">
          <button
            onClick={() => toggleSection('startDate')}
            className="flex items-center justify-between w-full text-left"
          >
            <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
              Start Date Range {(filters.startDateFrom || filters.startDateTo) && '✓'}
            </Label>
            {expandedSections.startDate ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.startDate && (
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-xs text-gray-600 mb-1">From Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.startDateFrom ? format(filters.startDateFrom, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={filters.startDateFrom}
                      onSelect={(date) => onFilterChange('startDateFrom', date)}
                      disabled={filters.startDateTo ? (date: Date) => date > filters.startDateTo! : undefined}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1">To Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.startDateTo ? format(filters.startDateTo, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={filters.startDateTo}
                      onSelect={(date) => onFilterChange('startDateTo', date)}
                      disabled={filters.startDateFrom ? (date: Date) => date < filters.startDateFrom! : undefined}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Price Range Filter */}
      <div className="space-y-2 border-b pb-4">
        <button
          onClick={() => toggleSection('price')}
          className="flex items-center justify-between w-full text-left"
        >
          <Label className="text-sm font-semibold text-gray-900 cursor-pointer">
            {searchType === 'professionals' ? 'Hourly Rate (€)' : 'Price Range (€)'} {(filters.priceMin || filters.priceMax) && '✓'}
          </Label>
          {expandedSections.price ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {expandedSections.price && (
          <div className="space-y-3 mt-2">
            <div className="px-2">
              <Slider
                min={0}
                max={500}
                step={10}
                value={priceRange}
                onValueChange={handlePriceChange}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Input
                type="number"
                value={filters.priceMin}
                onChange={(e) => onFilterChange('priceMin', e.target.value)}
                className="w-20 h-8 text-xs"
                placeholder="Min"
              />
              <span>-</span>
              <Input
                type="number"
                value={filters.priceMax}
                onChange={(e) => onFilterChange('priceMax', e.target.value)}
                className="w-20 h-8 text-xs"
                placeholder="Max"
              />
            </div>
          </div>
        )}
      </div>

      {/* Category Filter */}
      {dynamicCategories.length > 0 && (
        <div className="space-y-2 border-b pb-4">
          <Label htmlFor="category" className="text-sm font-semibold text-gray-900">
            Service Category
          </Label>
          <Select value={filters.category || 'all'} onValueChange={(val) => onFilterChange('category', val === 'all' ? '' : val)}>
            <SelectTrigger id="category" className="w-full">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {dynamicCategories.map(({ value, count }) => (
                <SelectItem key={value} value={value}>
                  {renderOptionContent(value, count)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Availability Filter - Only for professionals */}
      {searchType === 'professionals' && (
        <div className="space-y-2 border-b pb-4">
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
              Available for booking
            </Label>
          </div>
        </div>
      )}

      {/* Sort By */}
      <div className="space-y-2 pt-4">
        <Label htmlFor="sortBy" className="text-sm font-semibold text-gray-900">
          Sort By
        </Label>
        <Select value={filters.sortBy} onValueChange={(val) => onFilterChange('sortBy', val as SortOption)}>
          <SelectTrigger id="sortBy" className="w-full">
            <SelectValue placeholder="Most Relevant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevant">Most Relevant</SelectItem>
            <SelectItem value="price_low">Price: Low to High</SelectItem>
            <SelectItem value="price_high">Price: High to Low</SelectItem>
            <SelectItem value="newest">Newest First</SelectItem>
            {searchType === 'projects' && (
              <SelectItem value="availability">Availability</SelectItem>
            )}
            <SelectItem value="popularity" disabled>
              Popularity (Coming Soon)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default SearchFilters;
