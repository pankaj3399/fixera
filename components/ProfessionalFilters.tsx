'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ProfessionalFilters = ({ resultsCount }: { resultsCount: number }) => {
  const t = useTranslations('search')

  return (
    <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
      <h2 className="text-xl font-semibold text-gray-800">
        {t('professionalFilters.available', { count: resultsCount })}
      </h2>
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-600">{t('professionalFilters.sortBy')}</span>
        <Select defaultValue="recommended">
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('professionalFilters.sortPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recommended">{t('professionalFilters.recommended')}</SelectItem>
            <SelectItem value="top-rated">{t('professionalFilters.topRated')}</SelectItem>
            <SelectItem value="newest">{t('professionalFilters.newest')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export default ProfessionalFilters
