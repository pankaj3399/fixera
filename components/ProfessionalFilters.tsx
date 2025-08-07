'use client'

import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ProfessionalFilters = ({ resultsCount }: { resultsCount: number }) => {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
      <h2 className="text-xl font-semibold text-gray-800">
        {resultsCount} professionals available
      </h2>
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-600">Sort by:</span>
        <Select defaultValue="recommended">
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recommended">Recommended</SelectItem>
            <SelectItem value="top-rated">Top Rated</SelectItem>
            <SelectItem value="newest">Newest Arrivals</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export default ProfessionalFilters