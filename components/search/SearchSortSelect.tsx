'use client';

import { useTranslations } from 'next-intl';
import { ArrowUpDown } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SORT_OPTION_KEYS, type SortOption } from '@/components/search/SearchFilters';

interface SearchSortSelectProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
  searchType: 'professionals' | 'projects';
}

/**
 * Result ordering, shown at the top right of the search results (FT1-11)
 * instead of at the bottom of the long filter sidebar.
 */
export default function SearchSortSelect({ value, onChange, searchType }: SearchSortSelectProps) {
  const t = useTranslations('search');
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="sortBy" className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-gray-700">
        <ArrowUpDown className="h-4 w-4 text-gray-500" aria-hidden="true" />
        {t('filters.sortBy')}
      </Label>
      <Select value={value} onValueChange={(val) => onChange(val as SortOption)}>
        <SelectTrigger id="sortBy" className="w-48 bg-white">
          <SelectValue placeholder={t('filters.sortPlaceholder')} />
        </SelectTrigger>
        <SelectContent align="end">
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
  );
}
