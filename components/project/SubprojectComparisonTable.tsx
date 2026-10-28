'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Check, Clock, Shield, ArrowRight, Calendar, Info, Package } from 'lucide-react'
import { formatPriceModelLabel } from '@/lib/projectHighlights'
import { computeCustomerPriceWithRepeatBuyerDiscount } from '@/lib/projectPricing'
import { useCustomerPricing } from '@/hooks/useCustomerPricing'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { PublicProjectDto, ProjectSubproject } from '@/types/project'
import { PREDEFINED_ITEM_KEY_BY_ENGLISH_NAME } from '@/components/professional/project-wizard/Step2Subprojects'

const SUFFIXLESS_PRICE_MODEL_PREFIXES = ['rfq', 'fixed', 'total', 'unit'] as const

const UNIT_SUFFIX_KEYS = {
  hour: 'unitSuffixes.hour',
  day: 'unitSuffixes.day',
  meter: 'unitSuffixes.meter',
  m2: 'unitSuffixes.m2',
  room: 'unitSuffixes.room',
  unit: 'unitSuffixes.unit',
} as const

const isSuffixlessPriceModel = (model: string): boolean => {
  const normalized = model.trim().toLowerCase()
  if (!normalized) return false
  return SUFFIXLESS_PRICE_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

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
  const t = useTranslations('projects')
  const tWizard = useTranslations('projectWizard')
  const { formatPrice } = useCurrency()
  const { customerPrice, originalPrice, loyalty, commissionPercent, loyaltyLoaded } = useCustomerPricing()
  const isPricingReady = commissionPercent != null && loyaltyLoaded

  const unitSuffixLabel = (value: string) => {
    const key = UNIT_SUFFIX_KEYS[value.toLowerCase() as keyof typeof UNIT_SUFFIX_KEYS]
    return key ? t(key) : formatPriceModelLabel(value)
  }

  const formatAmount = (value?: number | null) =>
    value == null ? null : formatPrice(value)

  const formatDuration = (duration?: { value?: number; unit: 'hours' | 'days' }): string => {
    if (!duration || duration.value == null) return t('common.na')
    return t(duration.unit === 'days' ? 'units.days' : 'units.hours', { count: duration.value })
  }

  const formatWarranty = (warranty?: { value: number; unit: 'months' | 'years' }): string => {
    if (!warranty) return t('comparison.noWarranty')
    return t(warranty.unit === 'years' ? 'units.years' : 'units.months', { count: warranty.value })
  }

  const formatProfessionalInputValue = (
    value: string | number | { min: number; max: number } | undefined,
    unitLabel?: string
  ): string => {
    if (value == null || value === '') return t('common.notProvided')
    const suffix = unitLabel ? ` ${unitLabel}` : ''
    if (typeof value === 'object' && 'min' in value && 'max' in value) {
      return `${value.min}${suffix} - ${value.max}${suffix}`
    }
    if (typeof value === 'number') {
      return `${value}${suffix}`
    }
    return String(value)
  }

  const currentSubproject = subprojects[selectedIndex]
  const effectivePricingType = (sp: (typeof subprojects)[number]) =>
    sp.pricing?.type ?? (priceModel ? 'unit' : 'fixed')
  const repeatBuyerEligible = repeatBuyerEligibility?.eligible === true
  const getCustomerPricing = (amount?: number | null) => {
    const withRepeatBuyer = computeCustomerPriceWithRepeatBuyerDiscount({
      amount,
      customerPrice,
      eligible: repeatBuyerEligible,
      repeatBuyerDiscount,
    })
    if (amount == null || !Number.isFinite(amount)) {
      return { ...withRepeatBuyer, hasLoyaltyDiscount: false, hasRepeatBuyerDiscount: false }
    }
    const noDiscountAmount = originalPrice(amount)
    const afterAllDiscounts = withRepeatBuyer.discountedAmount ?? withRepeatBuyer.customerAmount
    const hasAnyDiscount =
      afterAllDiscounts != null && noDiscountAmount != null && afterAllDiscounts < noDiscountAmount
    const hasRepeatBuyerDiscount =
      withRepeatBuyer.discountedAmount != null &&
      withRepeatBuyer.customerAmount != null &&
      withRepeatBuyer.discountedAmount < withRepeatBuyer.customerAmount
    const hasLoyaltyDiscount =
      withRepeatBuyer.customerAmount != null &&
      noDiscountAmount != null &&
      withRepeatBuyer.customerAmount < noDiscountAmount
    return {
      customerAmount: noDiscountAmount,
      discountedAmount: hasAnyDiscount ? afterAllDiscounts : null,
      hasLoyaltyDiscount,
      hasRepeatBuyerDiscount,
    }
  }

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

  const enrichedIncludedItems = useMemo(() => {
    const normalize = (s: string) =>
      s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().trim();
    const paramMap = new Map(
      (currentSubproject?.professionalInputs || []).map((p) => [normalize(p.fieldName), p])
    );
    const priceModelLower = (priceModel || '').toLowerCase();
    const priceModelIsRealUnit =
      Boolean(priceModel) &&
      !isSuffixlessPriceModel(priceModelLower) &&
      (currentSubproject?.pricing?.type || '').toLowerCase() === 'unit';
    return allIncludedItems.map((item) => {
      const match = paramMap.get(normalize(item.name));
      const hasValue = match && match.value != null && match.value !== '';
      const valueIsNumeric =
        typeof match?.value === 'number' ||
        (typeof match?.value === 'object' && match?.value != null && 'min' in match.value);
      const nameLower = item.name.toLowerCase();
      const suffix =
        priceModelIsRealUnit &&
        valueIsNumeric &&
        priceModel &&
        !nameLower.includes(priceModelLower)
          ? priceModel
          : undefined;
      return { ...item, paramValue: hasValue ? formatProfessionalInputValue(match!.value, suffix ? unitSuffixLabel(suffix) : undefined) : undefined };
    });
  }, [allIncludedItems, currentSubproject?.professionalInputs, currentSubproject?.pricing?.type, priceModel]);

  if (!subprojects || subprojects.length === 0 || !currentSubproject) {
    return null;
  }

  const currentPricing = getCustomerPricing(currentSubproject.pricing.amount)
  const currentCustomerAmount = currentPricing.customerAmount
  const currentDiscountedAmount = currentPricing.discountedAmount
  const hasCurrentDiscount =
    (currentPricing.hasLoyaltyDiscount || currentPricing.hasRepeatBuyerDiscount) &&
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
                      {t('comparison.popular')}
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
                    {effectivePricingType(currentSubproject) === 'rfq' ? (
                      <span className="text-2xl">{t('comparison.rfq')}</span>
                    ) : !isPricingReady ? (
                      <span className="inline-block h-10 w-32 animate-pulse rounded bg-gray-200" aria-label={t('comparison.loadingPrice')} />
                    ) : effectivePricingType(currentSubproject) === 'unit' ? (
                      <>
                        {hasCurrentDiscount ? (
                          <span className="flex flex-col">
                            <span className="text-xl font-semibold text-gray-400 line-through">
                              {formatAmount(currentCustomerAmount)}
                            </span>
                            <span>{formatAmount(currentDiscountedAmount)}</span>
                          </span>
                        ) : (
                          formatAmount(currentCustomerAmount ?? currentSubproject.pricing.amount)
                        )}
                        {priceModel && !isSuffixlessPriceModel(priceModel) && (
                          <span className="text-lg font-normal text-gray-500 ml-2">
                            /{unitSuffixLabel(priceModel)}
                          </span>
                        )}
                      </>
                    ) : (
                      hasCurrentDiscount ? (
                        <span className="flex flex-col">
                          <span className="text-xl font-semibold text-gray-400 line-through">
                            {formatAmount(currentCustomerAmount)}
                          </span>
                          <span>{formatAmount(currentDiscountedAmount)}</span>
                        </span>
                      ) : (
                        formatAmount(currentCustomerAmount ?? currentSubproject.pricing.amount)
                      )
                    )}
                  </div>
                  {isPricingReady && effectivePricingType(currentSubproject) === 'unit' && currentSubproject.pricing.minProjectValue && (
                    <p className="text-sm text-gray-500 mt-2">
                      {t('comparison.minOrder')} {hasMinProjectDiscount ? (
                        <>
                          <span className="line-through text-gray-400 mr-2">
                            {formatAmount(minProjectCustomerAmount)}
                          </span>
                          <span>{formatAmount(minProjectDiscountedAmount)}</span>
                        </>
                      ) : (
                        formatAmount(minProjectCustomerAmount ?? currentSubproject.pricing.minProjectValue)
                      )}
                    </p>
                  )}
                  {isPricingReady && effectivePricingType(currentSubproject) === 'rfq' && currentSubproject.pricing.priceRange && (
                    <p className="text-sm text-gray-500 mt-2">
                      {t('comparison.estimatedRange')} {hasMinRangeDiscount ? (
                        <>
                          <span className="line-through text-gray-400 mr-2">
                            {formatAmount(minRangeCustomerAmount)}
                          </span>
                          <span>{formatAmount(minRangeDiscountedAmount)}</span>
                        </>
                      ) : (
                        formatAmount(minRangeCustomerAmount ?? currentSubproject.pricing.priceRange.min)
                      )}{" "}
                      -{" "}
                      {hasMaxRangeDiscount ? (
                        <>
                          <span className="line-through text-gray-400 mr-2">
                            {formatAmount(maxRangeCustomerAmount)}
                          </span>
                          <span>{formatAmount(maxRangeDiscountedAmount)}</span>
                        </>
                      ) : (
                        formatAmount(maxRangeCustomerAmount ?? currentSubproject.pricing.priceRange.max)
                      )}
                    </p>
                  )}
                  {isPricingReady && repeatBuyerDiscount?.enabled && currentPricing.hasRepeatBuyerDiscount && (
                    <p className="text-sm text-green-600 mt-2">
                      {t('comparison.returningCustomerPrice')}
                    </p>
                  )}
                  {isPricingReady && loyalty && loyalty.percentage > 0 && currentPricing.hasLoyaltyDiscount && (
                    <p className="text-sm text-amber-700 mt-1">
                      {t('comparison.memberSavings', { level: loyalty.level })}
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
                      <span>{t('comparison.delivery', { duration: formatDuration(currentSubproject.executionDuration) })}</span>
                    </div>
                  )}
                  {currentSubproject.warrantyPeriod && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Shield className="w-4 h-4 mr-2 text-gray-500" />
                      <span>{t('comparison.warranty', { duration: formatWarranty(currentSubproject.warrantyPeriod) })}</span>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* What's Included */}
            {enrichedIncludedItems.length > 0 && (
              <div className="mb-8 border-t border-gray-100 pt-6">
                <h4 className="font-semibold text-base text-gray-900 mb-4">{t('comparison.whatsIncluded')}</h4>
                <div className="space-y-3">
                  {enrichedIncludedItems.map((item, itemIdx) => {
                    const isIncluded = currentIncludedNames.has(item.name);
                    // Stored canonical English for predefined quick-adds; show the
                    // active-locale label and leave custom/admin names as-is.
                    const predefinedKey = PREDEFINED_ITEM_KEY_BY_ENGLISH_NAME.get(item.name);
                    return (
                      <div key={itemIdx} className="flex items-start space-x-3">
                        <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isIncluded ? 'text-green-500' : 'text-gray-300'}`} />
                        <div>
                          <p className={`text-sm font-medium ${isIncluded ? 'text-gray-900' : 'text-gray-400'}`}>
                            {predefinedKey ? tWizard(`step2.predefinedItems.${predefinedKey}`) : item.name}
                            {item.paramValue && (
                              <span className="font-bold"> {item.paramValue}</span>
                            )}
                          </p>
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

            {/* Materials — always shown with included / not included indicator */}
            <div className="mb-8 border-t border-gray-100 pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-4 h-4 text-gray-500" />
                <h4 className="font-semibold text-base text-gray-900">
                  {t('comparison.materials')}{' '}
                  {currentSubproject.materialsIncluded ? (
                    <span className="text-green-600 font-semibold">{t('comparison.included')}</span>
                  ) : (
                    <span className="text-gray-500 font-semibold">{t('comparison.notIncluded')}</span>
                  )}
                </h4>
              </div>
              {currentSubproject.materialsIncluded && currentSubproject.materials && currentSubproject.materials.length > 0 && (
                <div className="space-y-2">
                  {currentSubproject.materials.map((mat, matIdx) => (
                    <div key={matIdx} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{mat.name}</span>
                        {mat.description && (
                          <span className="relative group">
                            <button type="button" aria-describedby={`mat-tooltip-${matIdx}`} className="inline-flex focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-400 rounded">
                              <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" aria-hidden="true" />
                              <span className="sr-only">{t('comparison.materialInfo')}</span>
                            </button>
                            <span id={`mat-tooltip-${matIdx}`} role="tooltip" className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block group-focus-within:block w-48 px-3 py-2 text-xs text-white bg-gray-900 rounded-lg shadow-lg z-10">
                              {mat.description}
                            </span>
                          </span>
                        )}
                      </div>
                      {(mat.quantity || mat.unit) && (
                        <span className="text-sm font-semibold text-gray-900">
                          {[mat.quantity, mat.unit].filter(Boolean).join(' ')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Date Availability (Clean & Simplistic) */}
            <div className="mb-6 space-y-2">
              {dateLabels?.firstAvailable && (
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                  <span>{t.rich('comparison.firstAvailable', { date: dateLabels.firstAvailable, strong: (chunks) => <span className="font-medium text-gray-900">{chunks}</span> })}</span>
                </div>
              )}
              {timeMode !== 'hours' && dateLabels?.shortestThroughput && (
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                  <span>{t.rich('comparison.shortestThroughput', { date: dateLabels.shortestThroughput, strong: (chunks) => <span className="font-medium text-gray-900">{chunks}</span> })}</span>
                </div>
              )}
            </div>

            {/* Continue Button */}
            <Button
              onClick={() => onSelectPackage(selectedIndex)}
              className="w-full bg-black hover:bg-gray-900 text-white h-12 text-base font-semibold group"
            >
              {currentSubproject.pricing?.type === 'rfq' ? t('comparison.requestQuote') : t('comparison.continue')}
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>

            {/* Contact Me Button */}
            {onContactProfessional && (
              <Button
                variant="outline"
                className="w-full mt-3 mb-8 h-12 text-base font-medium border-gray-300 hover:bg-gray-50"
                onClick={onContactProfessional}
              >
                {t('comparison.contactMe')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
