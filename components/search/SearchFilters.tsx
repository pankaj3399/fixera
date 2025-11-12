'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Filter, X } from 'lucide-react';

export type SortOption = 'relevant' | 'price_low' | 'price_high' | 'newest';

export interface SearchFiltersState {
  query: string;
  location: string;
  priceMin: string;
  priceMax: string;
  category: string;
  availability: boolean;
  sortBy: SortOption;
}

export type SearchFilterKey = keyof SearchFiltersState;

interface SearchFiltersProps {
  filters: SearchFiltersState;
  onFilterChange: <K extends SearchFilterKey>(key: K, value: SearchFiltersState[K]) => void;
  onClearFilters: () => void;
  searchType: 'professionals' | 'projects';
  categories?: string[];
}

const SearchFilters = ({
  filters,
  onFilterChange,
  onClearFilters,
  searchType,
  categories = [],
}: SearchFiltersProps) => {
  const priceRange = [
    parseInt(filters.priceMin || '0'),
    parseInt(filters.priceMax || '500'),
  ];

  const handlePriceChange = (values: number[]) => {
    onFilterChange('priceMin', values[0].toString());
    onFilterChange('priceMax', values[1].toString());
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="text-gray-600 hover:text-gray-900"
        >
          <X className="w-4 h-4 mr-1" />
          Clear All
        </Button>
      </div>

      {/* Location Filter */}
      <div className="space-y-2">
        <Label htmlFor="location" className="text-sm font-semibold text-gray-900">
          Location
        </Label>
        <Input
          id="location"
          placeholder="City or Country"
          value={filters.location}
          onChange={(e) => onFilterChange('location', e.target.value)}
          className="w-full"
        />
      </div>

      {/* Price Range Filter */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold text-gray-900">
          {searchType === 'professionals' ? 'Hourly Rate (€)' : 'Price Range (€)'}
        </Label>
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

      {/* Category Filter */}
      {categories.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="category" className="text-sm font-semibold text-gray-900">
            Service Category
          </Label>
          <Select value={filters.category || 'all'} onValueChange={(val) => onFilterChange('category', val === 'all' ? '' : val)}>
            <SelectTrigger id="category" className="w-full">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Availability Filter - Only for professionals */}
      {searchType === 'professionals' && (
        <div className="space-y-2">
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
      <div className="space-y-2 pt-4 border-t">
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
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default SearchFilters;
