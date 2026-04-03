'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Check, Clock, Shield, ArrowRight, Calendar } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { computeCustomerPriceWithRepeatBuyerDiscount } from '@/lib/projectPricing'
import { useCommissionRate } from '@/hooks/useCommissionRate'
import type { PublicProjectDto, ProjectSubproject } from '@/types/project'

interface DateLabels {
  firstAvailable?: string | null
  shortestThroughput?: string | null
}

interface SubprojectComparisonTableProps {
  subprojects: ProjectSubproject[]
  onSelectPackage: (index: number) => void
  priceModel?: PublicProjectDto["priceModel"]
  repeatBuyerDiscount?: PublicProjectDto["repeatBuyerDiscount"]
  repeatBuyerEligibility?: PublicProjectDto["repeatBuyerEligibility"]
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
  onContactProfessional?: () => void
}

export default function SubprojectComparisonTable({
  subprojects,
  onSelectPackage,
  priceModel,
  repeatBuyerDiscount,
  repeatBuyerEligibility,
  selectedIndex,
  onSelectIndex,
  dateLabels,
  timeMode,
  companyAvailability,
  companyBlockedRanges,
  onContactProfessional
}: SubprojectComparisonTableProps) {
  const { customerPrice } = useCommissionRate()


  const formatDuration = (duration?: { value?: number; unit: 'hours' | 'days' }): string => {
    if (!duration || duration.value == null) return 'N/A'
    return `${duration.value} ${duration.unit}`
  }

  const formatWarranty = (warranty?: { value: number; unit: 'months' | 'years' }): string => {
    if (!warranty) return 'No warranty'
    return `${warranty.value} ${warranty.unit}`
  }

  const formatProfessionalInputValue = (
    value: string | number | { min: number; max: number } | undefined
  ): string => {
    if (value == null || value === '') return 'Not provided'
    if (typeof value === 'object' && 'min' in value && 'max' in value) {
      return `${value.min} - ${value.max}`
    }
    return String(value)
  }

  const currentSubproject = subprojects[selectedIndex]
  const repeatBuyerEligible = repeatBuyerEligibility?.eligible === true
  const getCustomerPricing = (amount?: number | null) =>
    computeCustomerPriceWithRepeatBuyerDiscount({
      amount,
      customerPrice,
      eligible: repeatBuyerEligible,
      repeatBuyerDiscount,
    })

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
    (currentSubproject?.included || []).forEach((item) => {
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

  const currentPricing = getCustomerPricing(currentSubproject.pricing.amount)
  const currentCustomerAmount = currentPricing.customerAmount
  const currentDiscountedAmount = currentPricing.discountedAmount
  const canShowUnitDiscountRate =
    currentSubproject.pricing.type !== 'unit' ||
    repeatBuyerDiscount?.maxDiscountAmount == null
  const hasCurrentDiscount =
    canShowUnitDiscountRate &&
    currentCustomerAmount != null &&
    currentDiscountedAmount != null &&
    currentDiscountedAmount < currentCustomerAmount
  const minProjectPricing = getCustomerPricing(currentSubproject.pricing.minProjectValue)
  const minProjectCustomerAmount = minProjectPricing.customerAmount
  const minProjectDiscountedAmount = minProjectPricing.discountedAmount
  const hasMinProjectDiscount =
    minProjectCustomerAmount != null &&
    minProjectDiscountedAmount != null &&
    minProjectDiscountedAmount < minProjectCustomerAmount
  const minRangePricing = getCustomerPricing(currentSubproject.pricing.priceRange?.min)
  const maxRangePricing = getCustomerPricing(currentSubproject.pricing.priceRange?.max)
  const minRangeCustomerAmount = minRangePricing.customerAmount
  const minRangeDiscountedAmount = minRangePricing.discountedAmount
  const maxRangeCustomerAmount = maxRangePricing.customerAmount
  const maxRangeDiscountedAmount = maxRangePricing.discountedAmount
  const hasMinRangeDiscount =
    minRangeCustomerAmount != null &&
    minRangeDiscountedAmount != null &&
    minRangeDiscountedAmount < minRangeCustomerAmount
  const hasMaxRangeDiscount =
    maxRangeCustomerAmount != null &&
    maxRangeDiscountedAmount != null &&
    maxRangeDiscountedAmount < maxRangeCustomerAmount

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
                      <span className="text-2xl">RFQ</span>
                    ) : currentSubproject.pricing.type === 'unit' ? (
                      <>
                        {hasCurrentDiscount ? (
                          <span className="flex flex-col">
                            <span className="text-xl font-semibold text-gray-400 line-through">
                              {formatCurrency(currentCustomerAmount)}
                            </span>
                            <span>{formatCurrency(currentDiscountedAmount)}</span>
                          </span>
                        ) : (
                          formatCurrency(currentCustomerAmount ?? currentSubproject.pricing.amount)
                        )}
                        <span className="text-lg font-normal text-gray-500 ml-2">
                          /{priceModel || 'unit'}
                        </span>
                      </>
                    ) : (
                      hasCurrentDiscount ? (
                        <span className="flex flex-col">
                          <span className="text-xl font-semibold text-gray-400 line-through">
                            {formatCurrency(currentCustomerAmount)}
                          </span>
                          <span>{formatCurrency(currentDiscountedAmount)}</span>
                        </span>
                      ) : (
                        formatCurrency(currentCustomerAmount ?? currentSubproject.pricing.amount)
                      )
                    )}
                  </div>
                  {currentSubproject.pricing.type === 'unit' && currentSubproject.pricing.minProjectValue && (
                    <p className="text-sm text-gray-500 mt-2">
                      Min. order: {hasMinProjectDiscount ? (
                        <>
                          <span className="line-through text-gray-400 mr-2">
                            {formatCurrency(minProjectCustomerAmount)}
                          </span>
                          <span>{formatCurrency(minProjectDiscountedAmount)}</span>
                        </>
                      ) : (
                        formatCurrency(minProjectCustomerAmount ?? currentSubproject.pricing.minProjectValue)
                      )}
                    </p>
                  )}
                  {currentSubproject.pricing.type === 'rfq' && currentSubproject.pricing.priceRange && (
                    <p className="text-sm text-gray-500 mt-2">
                      Estimated range: {hasMinRangeDiscount ? (
                        <>
                          <span className="line-through text-gray-400 mr-2">
                            {formatCurrency(minRangeCustomerAmount)}
                          </span>
                          <span>{formatCurrency(minRangeDiscountedAmount)}</span>
                        </>
                      ) : (
                        formatCurrency(minRangeCustomerAmount ?? currentSubproject.pricing.priceRange.min)
                      )}{" "}
                      -{" "}
                      {hasMaxRangeDiscount ? (
                        <>
                          <span className="line-through text-gray-400 mr-2">
                            {formatCurrency(maxRangeCustomerAmount)}
                          </span>
                          <span>{formatCurrency(maxRangeDiscountedAmount)}</span>
                        </>
                      ) : (
                        formatCurrency(maxRangeCustomerAmount ?? currentSubproject.pricing.priceRange.max)
                      )}
                    </p>
                  )}
                  {repeatBuyerDiscount?.enabled && hasCurrentDiscount && (
                    <p className="text-sm text-green-600 mt-2">
                      Returning customer price available
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

            {currentSubproject.professionalInputs &&
              currentSubproject.professionalInputs.length > 0 && (
                <div className="mb-8 border-t border-gray-100 pt-6">
                  <h4 className="font-semibold text-base text-gray-900 mb-4">
                    Service Parameters
                  </h4>
                  <div className="space-y-2">
                    {currentSubproject.professionalInputs.map((input, index) => (
                      <div
                        key={`${input.fieldName}-${index}`}
                        className="flex items-start justify-between gap-4 rounded-lg bg-gray-50 px-4 py-3"
                      >
                        <span className="text-sm font-medium text-gray-700">
                          {input.fieldName}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 text-right">
                          {formatProfessionalInputValue(input.value)}
                        </span>
                      </div>
                    ))}
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
            {onContactProfessional && (
              <Button
                variant="outline"
                className="w-full mt-3 mb-8 h-12 text-base font-medium border-gray-300 hover:bg-gray-50"
                onClick={onContactProfessional}
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
