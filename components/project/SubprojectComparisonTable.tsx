'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Check, Clock, Shield, ArrowRight, Calendar } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { emitChatWidgetOpen } from '@/lib/chatWidgetEvents'

interface SubprojectPricing {
  type: 'fixed' | 'unit' | 'rfq'
  amount?: number
  priceRange?: { min: number; max: number }
  minProjectValue?: number
}

interface Subproject {
  name: string
  description: string
  pricing: SubprojectPricing
  included: Array<{
    name: string
    description?: string
  }>
  executionDuration?: {
    value: number
    unit: 'hours' | 'days'
  }
  warrantyPeriod?: {
    value: number
    unit: 'months' | 'years'
  }
}

interface DateLabels {
  firstAvailable?: string | null
  shortestThroughput?: string | null
}

interface SubprojectComparisonTableProps {
  subprojects: Subproject[]
  onSelectPackage: (index: number) => void
  priceModel?: string
  selectedIndex: number
  onSelectIndex: (index: number) => void
  dateLabels?: DateLabels
  timeMode?: 'hours' | 'days' | 'mixed'
  companyAvailability?: {
    [key in 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday']?: {
      available: boolean;
      startTime?: string;
      endTime?: string;
    };
  }
  companyBlockedRanges?: Array<{
    startDate: string;
    endDate: string;
    reason?: string;
    isHoliday?: boolean;
  }>
  professionalId?: string
}

export default function SubprojectComparisonTable({
  subprojects,
  onSelectPackage,
  priceModel,
  selectedIndex,
  onSelectIndex,
  dateLabels,
  timeMode,
  companyAvailability,
  companyBlockedRanges,
  professionalId
}: SubprojectComparisonTableProps) {


  const formatDuration = (duration?: { value: number; unit: 'hours' | 'days' }): string => {
    if (!duration) return 'N/A'
    return `${duration.value} ${duration.unit}`
  }

  const formatWarranty = (warranty?: { value: number; unit: 'months' | 'years' }): string => {
    if (!warranty) return 'No warranty'
    return `${warranty.value} ${warranty.unit}`
  }

  const currentSubproject = subprojects[selectedIndex]

  const allIncludedItems = useMemo(() => {
    // Collect all unique included items across all subprojects, preserving their order of appearance
    const includedItemsMap = new Map<string, { name: string; description?: string }>();
    subprojects.forEach((sp) => {
      if (!Array.isArray(sp.included)) return;
      sp.included.forEach((item) => {
        if (!item) return;
        const name = typeof item === 'string' ? (item as string).trim() : item.name?.trim();
        if (!name) return;

        const description = typeof item === 'string' ? undefined : item.description;
        const existing = includedItemsMap.get(name);

        if (!existing) {
          includedItemsMap.set(name, { name, description });
        } else if (!existing.description && description) {
          includedItemsMap.set(name, { name, description });
        }
      });
    });

    return Array.from(includedItemsMap.values());
  }, [subprojects]);

  const currentIncludedNames = useMemo(() => {
    const names = new Set<string>();
    (currentSubproject.included || []).forEach((item) => {
      if (!item) return;
      const name = typeof item === 'string' ? (item as string).trim() : item.name?.trim();
      if (name) {
        names.add(name);
      }
    });
    return names;
  }, [currentSubproject?.included]);

  if (!subprojects || subprojects.length === 0 || !currentSubproject) {
    return null;
  }

  return (
    <div className="w-full">
      <Card className="border-2 border-blue-600 shadow-lg">
        <CardContent className="p-0">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <div className="flex">
              {subprojects.map((subproject, index) => (
                <button
                  key={index}
                  onClick={() => onSelectIndex(index)}
                  className={`flex-1 px-6 py-4 text-center font-semibold text-base transition-all relative ${selectedIndex === index
                    ? 'text-gray-900 border-b-2 border-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  {subproject.name}
                  {index === 1 && subprojects.length === 3 && (
                    <span className="absolute -top-2 right-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded">
                      Popular
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Package Content */}
          <div className="p-8">
            {/* Package Header */}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{currentSubproject.name}</h3>
              <p className="text-gray-600 text-sm mb-6">{currentSubproject.description}</p>

              {/* Price Display */}
              <div className="flex items-baseline justify-between mb-6">
                <div>
                  <div className="text-4xl font-bold text-gray-900">
                    {currentSubproject.pricing.type === 'rfq' ? (
                      <span className="text-2xl">Request Quote</span>
                    ) : currentSubproject.pricing.type === 'unit' ? (
                      <>
                        {formatCurrency(currentSubproject.pricing.amount)}
                        <span className="text-lg font-normal text-gray-500 ml-2">
                          /{priceModel || 'unit'}
                        </span>
                      </>
                    ) : (
                      formatCurrency(currentSubproject.pricing.amount)
                    )}
                  </div>
                  {currentSubproject.pricing.type === 'unit' && currentSubproject.pricing.minProjectValue && (
                    <p className="text-sm text-gray-500 mt-2">
                      Min. order: {formatCurrency(currentSubproject.pricing.minProjectValue)}
                    </p>
                  )}
                  {currentSubproject.pricing.type === 'rfq' && currentSubproject.pricing.priceRange && (
                    <p className="text-sm text-gray-500 mt-2">
                      Estimated range: {formatCurrency(currentSubproject.pricing.priceRange.min)} - {formatCurrency(currentSubproject.pricing.priceRange.max)}
                    </p>
                  )}
                </div>
              </div>

              {/* Duration, Warranty & Dates */}
              <div className="flex flex-col gap-2 mb-6">
                <div className="flex items-center gap-6">
                  {currentSubproject.executionDuration && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="w-4 h-4 mr-2 text-gray-500" />
                      <span>{formatDuration(currentSubproject.executionDuration)} delivery</span>
                    </div>
                  )}
                  {currentSubproject.warrantyPeriod && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Shield className="w-4 h-4 mr-2 text-gray-500" />
                      <span>{formatWarranty(currentSubproject.warrantyPeriod)} warranty</span>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* What's Included */}
            {allIncludedItems.length > 0 && (
              <div className="mb-8 border-t border-gray-100 pt-6">
                <h4 className="font-semibold text-base text-gray-900 mb-4">What&apos;s Included:</h4>
                <div className="space-y-3">
                  {allIncludedItems.map((item, itemIdx) => {
                    const isIncluded = currentIncludedNames.has(item.name);
                    return (
                      <div key={itemIdx} className="flex items-start space-x-3">
                        <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isIncluded ? 'text-green-500' : 'text-gray-300'}`} />
                        <div>
                          <p className={`text-sm font-medium ${isIncluded ? 'text-gray-900' : 'text-gray-400'}`}>{item.name}</p>
                          {item.description && (
                            <p className={`text-xs mt-0.5 ${isIncluded ? 'text-gray-600' : 'text-gray-400'}`}>{item.description}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Date Availability (Clean & Simplistic) */}
            <div className="mb-6 space-y-2">
              {dateLabels?.firstAvailable && (
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                  <span>First Available: <span className="font-medium text-gray-900">{dateLabels.firstAvailable}</span></span>
                </div>
              )}
              {timeMode !== 'hours' && dateLabels?.shortestThroughput && (
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                  <span>Shortest Throughput: <span className="font-medium text-gray-900">{dateLabels.shortestThroughput}</span></span>
                </div>
              )}
            </div>

            {/* Continue Button */}
            <Button
              onClick={() => onSelectPackage(selectedIndex)}
              className="w-full bg-black hover:bg-gray-900 text-white h-12 text-base font-semibold group"
            >
              Continue
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>

            {/* Contact Me Button */}
            {professionalId && (
              <Button
                variant="outline"
                className="w-full mt-3 mb-8 h-12 text-base font-medium border-gray-300 hover:bg-gray-50"
                onClick={() => emitChatWidgetOpen({ open: true, professionalId })}
              >
                Contact me
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
