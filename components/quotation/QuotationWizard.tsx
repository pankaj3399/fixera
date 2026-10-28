'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Loader2, Plus, Trash2, Package, Clock, Shield, FileText, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import { getAuthToken } from '@/lib/utils'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { QuoteVersion, QuoteMaterial, QuotationMilestone, QuotationPricingLine, QuotationWizardFormData } from '@/types/quotation'
import { calculateVatTotalsFromPricingLines } from '@/lib/vatPricing'
import { parseFlexibleNumber } from '@/lib/numberInput'

interface QuotationWizardProps {
  bookingId: string
  existingVersion?: QuoteVersion
  isEditing?: boolean
  commissionPercent?: number
  onSuccess: () => void
  onCancel: () => void
}

interface VatRateOption {
  rate: number
  country: string
  label: string
  reverseCharge: boolean
  source: 'standard' | 'reduced' | 'b2b_exempt' | 'legacy'
  isCustom?: boolean
}

const EMPTY_MATERIAL: QuoteMaterial = { name: '', quantity: undefined, unit: '', description: '' }
const makePricingLineKey = () => `pricing-line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
const CUSTOM_VAT_RATE_PLACEHOLDER = 'Custom VAT rate (enter below)'
const isCustomVatRateLabel = (label?: string) =>
  label === CUSTOM_VAT_RATE_PLACEHOLDER || label === 'Enter custom VAT rate' || label === 'Custom VAT rate'

const createEmptyPricingLine = (vatRate = 0, vatCountry = '', vatLabel = CUSTOM_VAT_RATE_PLACEHOLDER, isCustom = isCustomVatRateLabel(vatLabel)): QuotationPricingLine => ({
  clientKey: makePricingLineKey(),
  description: '',
  price: 0,
  vatRate,
  vatCountry,
  vatLabel,
  vatRateMode: isCustom ? 'custom' : 'preset',
  vatRateExplicitlyEntered: !isCustom,
})
const EMPTY_MILESTONE: QuotationMilestone = {
  title: '',
  amount: 0,
  description: '',
  dueCondition: 'on_milestone_completion',
  order: 0,
  status: 'pending',
}

const FIRST_MILESTONE: QuotationMilestone = {
  ...EMPTY_MILESTONE,
  dueCondition: 'on_start',
}

const VALID_NON_FIRST_DUE_CONDITIONS = [
  'on_milestone_start',
  'on_milestone_completion',
  'custom_date',
] as const satisfies ReadonlyArray<QuotationMilestone['dueCondition']>

const FALLBACK_VAT_RATE_OPTIONS: VatRateOption[] = [{
  rate: 0,
  country: '',
  label: 'VAT unavailable — enter a booking address',
  reverseCharge: false,
  source: 'legacy',
  isCustom: false,
}]

const LEGACY_VAT_RATE_OPTION: VatRateOption = {
  rate: 0,
  country: 'BE',
  label: '0% VAT (legacy quote)',
  reverseCharge: false,
  source: 'legacy',
}

// Kept for read compatibility with quotations created before the tier-only
// selector was introduced. New quotations never add this option.
const CUSTOM_VAT_SELECT_OPTION: VatRateOption = {
  rate: 0,
  country: '',
  label: CUSTOM_VAT_RATE_PLACEHOLDER,
  reverseCharge: false,
  source: 'standard',
  isCustom: true,
}

const isLegacyVatPricingLine = (line: Pick<QuotationPricingLine, 'vatRate' | 'vatLabel'>) =>
  Number(line.vatRate) === 0 && line.vatLabel === LEGACY_VAT_RATE_OPTION.label

const getVatOptionValue = (option: VatRateOption) =>
  `${option.country}:${option.rate}:${option.source}:${option.label}`

const coerceNonFirstDueCondition = (
  value: unknown
): QuotationMilestone['dueCondition'] =>
  (VALID_NON_FIRST_DUE_CONDITIONS as readonly string[]).includes(value as string)
    ? (value as QuotationMilestone['dueCondition'])
    : 'on_milestone_completion'

const toLocalDayTimestamp = (value: string): number => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return Number.NaN

  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime()
}

const isImmediatelyPayableMilestone = (m: Pick<QuotationMilestone, 'dueCondition' | 'customDueDate'>): boolean => {
  if (m.dueCondition === 'on_start' || m.dueCondition === 'on_milestone_start') return true
  if (m.dueCondition === 'custom_date' && m.customDueDate) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const dueTimestamp = toLocalDayTimestamp(m.customDueDate)
    return Number.isFinite(dueTimestamp) && dueTimestamp <= today.getTime()
  }
  return false
}

const isImmediatelyPayableAndPositive = (
  m: Pick<QuotationMilestone, 'amount' | 'dueCondition' | 'customDueDate'>
): boolean => isImmediatelyPayableMilestone(m) && m.amount > 0

const getEarliestSubmittedMilestone = (
  milestones: QuotationMilestone[]
): QuotationMilestone | undefined =>
  milestones
    .filter((milestone) => milestone.title.trim())
    .reduce<QuotationMilestone | undefined>(
      (earliest, milestone) =>
        !earliest || milestone.order < earliest.order ? milestone : earliest,
      undefined
    )

const getDefaultFormData = (existing?: QuoteVersion): QuotationWizardFormData => {
  if (existing) {
    return {
      scope: existing.scope,
      warrantyDuration: { ...existing.warrantyDuration },
      materialsIncluded: existing.materialsIncluded,
      materials: existing.materials?.length ? [...existing.materials] : [{ ...EMPTY_MATERIAL }],
      description: existing.description,
      pricingLines: existing.pricingLines?.length
        ? existing.pricingLines.map(line => {
            const isCustom = isCustomVatRateLabel(line.vatLabel)
            return {
              ...line,
              clientKey: line.clientKey || makePricingLineKey(),
              vatRateMode: isCustom ? 'custom' as const : 'preset' as const,
              vatRateExplicitlyEntered: isCustom ? line.vatLabel === 'Custom VAT rate' : true,
            }
          })
        : [{
            clientKey: makePricingLineKey(),
            description: existing.description || existing.scope,
            price: existing.totalAmount,
            vatRate: 0,
            vatCountry: 'BE',
            vatLabel: '0% VAT (legacy quote)',
            vatRateMode: 'preset' as const,
            vatRateExplicitlyEntered: true,
          }],
      totalAmount: existing.totalAmount,
      currency: existing.currency || 'EUR',
      useMilestones: (existing.milestones?.length || 0) > 0,
      milestones: existing.milestones?.length
        ? [...existing.milestones]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((m, i) => ({
              title: m.title,
              amount: m.amount,
              description: m.description || '',
              dueCondition: i === 0
                ? ('on_start' as const)
                : coerceNonFirstDueCondition(m.dueCondition),
              customDueDate: m.customDueDate,
              order: i,
              status: 'pending' as const,
            }))
        : [{ ...FIRST_MILESTONE }],
      preparationDuration: { ...existing.preparationDuration },
      executionDuration: { ...existing.executionDuration },
      bufferDuration: existing.bufferDuration ? { ...existing.bufferDuration } : { value: 0, unit: 'days' },
      useBuffer: !!existing.bufferDuration?.value,
      validUntil: existing.validUntil ? (() => {
        const d = new Date(existing.validUntil)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })() : '',
      changeNote: '',
    }
  }

  const defaultValid = new Date()
  defaultValid.setDate(defaultValid.getDate() + 30)

  return {
    scope: '',
    warrantyDuration: { value: 12, unit: 'months' },
    materialsIncluded: null,
    materials: [{ ...EMPTY_MATERIAL }],
    description: '',
    pricingLines: [createEmptyPricingLine()],
    totalAmount: 0,
    currency: 'EUR',
    useMilestones: false,
    milestones: [{ ...FIRST_MILESTONE }],
    preparationDuration: { value: 1, unit: 'days' },
    executionDuration: { value: 1, unit: 'days' },
    bufferDuration: { value: 0, unit: 'days' },
    useBuffer: false,
    validUntil: `${defaultValid.getFullYear()}-${String(defaultValid.getMonth() + 1).padStart(2, '0')}-${String(defaultValid.getDate()).padStart(2, '0')}`,
    changeNote: '',
  }
}

export default function QuotationWizard({ bookingId, existingVersion, isEditing, commissionPercent, onSuccess, onCancel }: QuotationWizardProps) {
  const t = useTranslations('quotation')
  const { formatMoney } = useCurrency()
  const [form, setForm] = useState<QuotationWizardFormData>(getDefaultFormData(existingVersion))
  // Quotation amounts are stored in the quotation's own currency (never converted).
  const formatAmount = (amount: number) => formatMoney(amount, form.currency || 'EUR')
  const [submitting, setSubmitting] = useState(false)
  const [vatRateOptions, setVatRateOptions] = useState<VatRateOption[]>([])
  const [vatRateDrafts, setVatRateDrafts] = useState<Record<string, string>>({})

  // Stored VAT labels are identifiers (they are persisted with the quote), so
  // the built-in ones get a translated display label while the value stays put.
  const getVatOptionLabel = (option: VatRateOption): string => {
    if (option.isCustom) return t('wizard.vat.custom')
    if (option.label === LEGACY_VAT_RATE_OPTION.label) return t('wizard.vat.legacy')
    if (option.label === FALLBACK_VAT_RATE_OPTIONS[0].label) return t('wizard.vat.unavailable')
    return option.label
  }

  const effectiveVatRateOptions = useMemo(
    () => vatRateOptions.length > 0 ? vatRateOptions : FALLBACK_VAT_RATE_OPTIONS,
    [vatRateOptions],
  )

  const defaultVatOption = effectiveVatRateOptions[0] || FALLBACK_VAT_RATE_OPTIONS[0]

  // VAT country known -> Standard/Reduced only, no custom % (flowchart SSOT
  // resolves the country rate; eligibility rules are ignored for quotations).
  const vatCountryKnown = useMemo(
    () => effectiveVatRateOptions.some((o) => Boolean(o.country) && !o.isCustom),
    [effectiveVatRateOptions],
  )

  const selectVatRateOptions = useMemo(() => {
    const options = [...effectiveVatRateOptions]
    if (form.pricingLines.some(isLegacyVatPricingLine)) {
      const legacyValue = getVatOptionValue(LEGACY_VAT_RATE_OPTION)
      if (!options.some((option) => getVatOptionValue(option) === legacyValue)) {
        options.push(LEGACY_VAT_RATE_OPTION)
      }
    }
    return options
  }, [effectiveVatRateOptions, form.pricingLines, vatCountryKnown])

  const findVatOptionForPricingLine = (line: QuotationPricingLine) => {
    if (isLegacyVatPricingLine(line)) {
      return LEGACY_VAT_RATE_OPTION
    }
    if (line.vatRateMode === 'custom') {
      return CUSTOM_VAT_SELECT_OPTION
    }
    return selectVatRateOptions.find((option) =>
      option.country === (line.vatCountry || defaultVatOption.country)
      && option.rate === line.vatRate
      && option.label === (line.vatLabel || defaultVatOption.label)
    ) || selectVatRateOptions.find((option) =>
      option.country === (line.vatCountry || defaultVatOption.country)
      && option.rate === line.vatRate
    ) || defaultVatOption
  }

  useEffect(() => {
    let cancelled = false

    const loadVatRateOptions = async () => {
      try {
        const token = getAuthToken()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers.Authorization = `Bearer ${token}`

        const serviceCountry = form.serviceLocation?.country?.trim() || ''
        const query = serviceCountry ? `?serviceCountry=${encodeURIComponent(serviceCountry)}` : ''
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/${bookingId}/vat-rates${query}`,
          {
            method: 'GET',
            headers,
            credentials: 'include',
          },
        )
        const data = await response.json()
        if (!response.ok || !data?.success || !Array.isArray(data.data?.options)) {
          return
        }

        if (!cancelled) {
          setVatRateOptions(data.data.options)
          const firstOption = data.data.options[0] as VatRateOption | undefined
          if (!existingVersion && firstOption) {
            setForm(prev => {
              const isPristine = prev.pricingLines.every((line) =>
                !line.description.trim() && Number(line.price) === 0 &&
                line.vatRateMode === 'custom' && line.vatRateExplicitlyEntered !== true
              )
              if (!isPristine) return prev
              return {
                ...prev,
                pricingLines: prev.pricingLines.map(line => ({
                  ...line,
                  vatRate: firstOption.rate,
                  vatCountry: firstOption.country,
                  vatLabel: firstOption.label,
                  vatRateMode: firstOption.isCustom ? 'custom' : 'preset',
                  vatRateExplicitlyEntered: firstOption.isCustom ? false : true,
                })),
              }
            })
          }
        }
      } catch (error) {
        console.error('Failed to load quotation VAT options:', error)
      }
    }

    void loadVatRateOptions()

    return () => {
      cancelled = true
    }
  }, [bookingId, existingVersion, form.serviceLocation?.country])

  const updateForm = <K extends keyof QuotationWizardFormData>(key: K, value: QuotationWizardFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Materials helpers
  const addMaterial = () => updateForm('materials', [...form.materials, { ...EMPTY_MATERIAL }])
  const removeMaterial = (index: number) => updateForm('materials', form.materials.filter((_, i) => i !== index))
  const updateMaterial = (index: number, field: keyof QuoteMaterial, value: string | number | undefined) => {
    const updated = [...form.materials]
    updated[index] = { ...updated[index], [field]: value }
    updateForm('materials', updated)
  }

  const validPricingLinesForTotal = useMemo(
    () => form.pricingLines.filter((line) => {
      const price = Number(line.price)
      const vatRate = Number(line.vatRate)
      const hasEnteredCustomRate = line.vatRateMode !== 'custom' || line.vatRateExplicitlyEntered === true
      return line.description.trim() && Number.isFinite(price) && price > 0 && hasEnteredCustomRate && Number.isFinite(vatRate) && vatRate >= 0 && vatRate <= 100
    }),
    [form.pricingLines],
  )
  const pricingVatTotals = useMemo(
    () => calculateVatTotalsFromPricingLines(validPricingLinesForTotal),
    [validPricingLinesForTotal],
  )
  const pricingTotal = pricingVatTotals.netAmount

  const addPricingLine = () => updateForm('pricingLines', [
    ...form.pricingLines,
    createEmptyPricingLine(defaultVatOption.rate, defaultVatOption.country, defaultVatOption.label, !!defaultVatOption.isCustom),
  ])
  const removePricingLine = (index: number) => updateForm('pricingLines', form.pricingLines.filter((_, i) => i !== index))
  const updatePricingLine = (index: number, field: keyof QuotationPricingLine, value: string | number) => {
    const updated = [...form.pricingLines]
    updated[index] = { ...updated[index], [field]: value }
    updateForm('pricingLines', updated)
  }

  const updatePricingLineVat = (index: number, option: VatRateOption) => {
    const key = form.pricingLines[index]?.clientKey || `line-${index}`
    const updated = [...form.pricingLines]
    updated[index] = {
      ...updated[index],
      vatRate: option.rate,
      vatCountry: option.country,
      vatLabel: option.label,
      vatRateMode: option.isCustom ? 'custom' : 'preset',
      vatRateExplicitlyEntered: option.isCustom ? false : true,
    }
    updateForm('pricingLines', updated)
    setVatRateDrafts(prev => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // Milestones helpers
  const addMilestone = () => updateForm('milestones', [...form.milestones, { ...EMPTY_MILESTONE, order: form.milestones.length }])
  const removeMilestone = (index: number) => {
    const updated = form.milestones
      .filter((_, i) => i !== index)
      .map((m, i) => ({
        ...m,
        order: i,
        dueCondition: i === 0 ? 'on_start' : m.dueCondition,
      })) as QuotationMilestone[]
    updateForm('milestones', updated)
  }
  const updateMilestone = (index: number, field: keyof QuotationMilestone, value: string | number) => {
    if (index === 0 && field === 'dueCondition') return
    const updated = [...form.milestones]
    updated[index] = { ...updated[index], [field]: value }
    updateForm('milestones', updated)
  }

  const milestoneSum = form.milestones.reduce((sum, m) => sum + (m.amount || 0), 0)
  const milestoneSumMatches = !form.useMilestones || Math.abs(milestoneSum - pricingTotal) < 0.01

  const handleSubmit = async () => {
    // Validation
    if (!form.scope || form.scope.length < 10 || form.scope.length > 100) {
      toast.error(t('wizard.validation.scopeLength'))
      return
    }
    if (!form.description) {
      toast.error(t('wizard.validation.descriptionRequired'))
      return
    }
    if (form.materialsIncluded === null) {
      toast.error(t('wizard.validation.materialsRequired'))
      return
    }
    if (!form.serviceLocation?.country?.trim()) {
      toast.error(t('wizard.validation.countryRequired'))
      return
    }
    const invalidVatLine = form.pricingLines.find((line, index) => {
      const hasContent = line.description.trim() || Number(line.price) > 0
      if (!hasContent) return false

      const key = line.clientKey || `line-${index}`
      const draft = vatRateDrafts[key]
      const vatRate = draft === undefined ? Number(line.vatRate) : parseFlexibleNumber(draft)
      return (
        (draft === undefined && line.vatRateMode === 'custom' && line.vatRateExplicitlyEntered !== true) ||
        !Number.isFinite(vatRate) ||
        vatRate < 0 ||
        vatRate > 100
      )
    })
    if (invalidVatLine) {
      toast.error(t('wizard.validation.invalidVatRate'))
      return
    }

    const pricingLinesWithDrafts = form.pricingLines.map((line, index) => {
      const key = line.clientKey || `line-${index}`
      const draft = vatRateDrafts[key]
      if (draft === undefined) return line
      return { ...line, vatRate: parseFlexibleNumber(draft) }
    })
    const validPricingLines = pricingLinesWithDrafts.filter((line) => {
      const price = Number(line.price)
      const vatRate = Number(line.vatRate)
      return line.description.trim() && Number.isFinite(price) && price > 0 && Number.isFinite(vatRate) && vatRate >= 0 && vatRate <= 100
    })
    if (validPricingLines.length === 0) {
      toast.error(t('wizard.validation.noPricingLines'))
      return
    }
    if (validPricingLines.some(line => !line.price || line.price <= 0)) {
      toast.error(t('wizard.validation.linePricePositive'))
      return
    }
    if (!pricingTotal || pricingTotal <= 0) {
      toast.error(t('wizard.validation.totalPositive'))
      return
    }
    if (!form.validUntil) {
      toast.error(t('wizard.validation.validUntilRequired'))
      return
    }
    if (form.useMilestones) {
      const validMilestones = form.milestones.filter(m => m.title.trim())
      const validSum = validMilestones.reduce((sum, m) => sum + (m.amount || 0), 0)
      if (Math.abs(validSum - pricingTotal) >= 0.01) {
        toast.error(t('wizard.validation.milestoneSumMismatch'))
        return
      }
      const missingDate = validMilestones.find(m => m.dueCondition === 'custom_date' && !m.customDueDate)
      if (missingDate) {
        toast.error(t('wizard.validation.milestoneDateRequired'))
        return
      }
      const earliestMilestone = getEarliestSubmittedMilestone(validMilestones)
      if (!earliestMilestone || !isImmediatelyPayableAndPositive(earliestMilestone)) {
        toast.error(t('wizard.validation.upfrontMilestone'))
        return
      }
    }
    if (isEditing && !form.changeNote) {
      toast.error(t('wizard.validation.changeReasonRequired'))
      return
    }

    setSubmitting(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const body: Record<string, unknown> = {
        scope: form.scope,
        ...(form.serviceLocation?.country ? { serviceLocation: form.serviceLocation } : {}),
        warrantyDuration: form.warrantyDuration,
        materialsIncluded: form.materialsIncluded,
        materials: form.materialsIncluded ? form.materials.filter(m => m.name.trim()) : [],
        description: form.description,
        pricingLines: validPricingLines.map((line) => {
          const submittedLine = { ...line }
          delete submittedLine.clientKey
          delete submittedLine.vatRateMode
          delete submittedLine.vatRateExplicitlyEntered
          return submittedLine
        }),
        totalAmount: pricingTotal,
        currency: form.currency,
        milestones: form.useMilestones ? form.milestones.filter(m => m.title.trim()) : [],
        preparationDuration: form.preparationDuration,
        executionDuration: form.executionDuration,
        bufferDuration: form.useBuffer ? form.bufferDuration : undefined,
        validUntil: form.validUntil,
        changeNote: form.changeNote || (isEditing ? 'Updated quotation' : 'Initial quotation'),
      }

      const url = isEditing
        ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/${bookingId}/edit`
        : `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/${bookingId}/submit`

      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (response.ok && data?.success) {
        toast.success(isEditing ? t('wizard.updateSuccess') : t('wizard.submitSuccess'))
        onSuccess()
      } else {
        toast.error(data?.error?.message || data?.msg || t('wizard.submitFailed'))
      }
    } catch (err) {
      console.error('Error submitting quotation:', err)
      toast.error(t('wizard.submitFailedRetry'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50/50 to-indigo-50/50">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg text-purple-900 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {isEditing ? t('wizard.titleEdit') : t('wizard.titleCreate')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Scope */}
        <div>
          <Label className="text-sm font-medium">{t('wizard.scopeLabel')}</Label>
          <p className="text-xs text-gray-500 mb-1">{t('wizard.scopeHint')}</p>
          <Input
            value={form.scope}
            onChange={e => updateForm('scope', e.target.value)}
            placeholder={t('wizard.scopePlaceholder')}
            maxLength={100}
          />
          <p className="text-xs text-gray-400 mt-1">{t('wizard.scopeCounter', { count: form.scope.length })}</p>
        </div>

        {/* Booking address — flowchart SSOT needs the service/property address
            to determine VAT country for Standard/Reduced tier resolution. */}
        <div>
          <Label className="text-sm font-medium">{t('wizard.addressLabel')}</Label>
          <p className="text-xs text-gray-500 mb-1">{t('wizard.addressHint')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            <Input
              value={form.serviceLocation?.country || ''}
              onChange={e => updateForm('serviceLocation', { ...(form.serviceLocation || { country: '' }), country: e.target.value })}
              placeholder={t('wizard.countryPlaceholder')}
              maxLength={50}
            />
            <Input
              value={form.serviceLocation?.postalCode || ''}
              onChange={e => updateForm('serviceLocation', { ...(form.serviceLocation || { country: '' }), postalCode: e.target.value })}
              placeholder={t('wizard.postalCodePlaceholder')}
              maxLength={50}
            />
            <Input
              value={form.serviceLocation?.city || ''}
              onChange={e => updateForm('serviceLocation', { ...(form.serviceLocation || { country: '' }), city: e.target.value })}
              placeholder={t('wizard.cityPlaceholder')}
              maxLength={200}
            />
            <Input
              value={form.serviceLocation?.address || ''}
              onChange={e => updateForm('serviceLocation', { ...(form.serviceLocation || { country: '' }), address: e.target.value })}
              placeholder={t('wizard.streetPlaceholder')}
              maxLength={500}
            />
          </div>
        </div>

        {/* Warranty */}
        <div>
          <Label className="text-sm font-medium flex items-center gap-1">
            <Shield className="h-4 w-4" /> {t('wizard.warrantyLabel')}
          </Label>
          <div className="flex gap-2 mt-1">
            <Input
              type="number"
              min={0}
              value={form.warrantyDuration.value}
              onChange={e => updateForm('warrantyDuration', { ...form.warrantyDuration, value: parseInt(e.target.value) || 0 })}
              className="w-24"
            />
            <Select
              value={form.warrantyDuration.unit}
              onValueChange={v => updateForm('warrantyDuration', { ...form.warrantyDuration, unit: v as 'months' | 'years' })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="months">{t('wizard.units.months')}</SelectItem>
                <SelectItem value="years">{t('wizard.units.years')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Materials */}
        <div>
          <Label className="text-sm font-medium flex items-center gap-1">
            <Package className="h-4 w-4" /> {t('wizard.materialsLabel')}
          </Label>
          <RadioGroup
            value={form.materialsIncluded === null ? '' : form.materialsIncluded ? 'yes' : 'no'}
            onValueChange={v => updateForm('materialsIncluded', v === 'yes')}
            className="flex gap-4 mt-1"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id="mat-yes" />
              <Label htmlFor="mat-yes" className="text-sm">{t('wizard.yes')}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id="mat-no" />
              <Label htmlFor="mat-no" className="text-sm">{t('wizard.no')}</Label>
            </div>
          </RadioGroup>

          {form.materialsIncluded && (
            <div className="mt-3 space-y-2">
              {form.materials.map((mat, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input
                    placeholder={t('wizard.materialNamePlaceholder')}
                    value={mat.name}
                    onChange={e => updateMaterial(i, 'name', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder={t('wizard.materialQuantityPlaceholder')}
                    value={mat.quantity ?? ''}
                    onChange={e => updateMaterial(i, 'quantity', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-20"
                  />
                  <Input
                    placeholder={t('wizard.materialUnitPlaceholder')}
                    value={mat.unit ?? ''}
                    onChange={e => updateMaterial(i, 'unit', e.target.value)}
                    className="w-20"
                  />
                  {form.materials.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeMaterial(i)} className="shrink-0 text-red-500 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addMaterial}>
                <Plus className="h-4 w-4 mr-1" /> {t('wizard.addMaterial')}
              </Button>
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <Label className="text-sm font-medium">{t('wizard.descriptionLabel')}</Label>
          <Textarea
            value={form.description}
            onChange={e => updateForm('description', e.target.value)}
            placeholder={t('wizard.descriptionPlaceholder')}
            rows={4}
            className="mt-1"
          />
        </div>

        {/* Price */}
        <div>
          <Label className="text-sm font-medium flex items-center gap-1">
            <CreditCard className="h-4 w-4" /> {t('wizard.pricingLinesLabel')}
          </Label>
          <div className="mt-2 space-y-3">
            {!vatCountryKnown && (
              <p className="text-sm text-amber-700">{t('wizard.vatCountryMissing')}</p>
            )}
            {form.pricingLines.map((line, index) => (
              <div key={line.clientKey || `pricing-line-${index}`} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_180px_40px] gap-2 items-start">
                <Input
                  value={line.description}
                  onChange={e => updatePricingLine(index, 'description', e.target.value)}
                  placeholder={t('wizard.pricingLineDescriptionPlaceholder')}
                />
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={line.price || ''}
                  onChange={e => updatePricingLine(index, 'price', parseFloat(e.target.value) || 0)}
                  placeholder={t('wizard.pricePlaceholder')}
                />
                <Select
                  value={getVatOptionValue(findVatOptionForPricingLine(line))}
                  onValueChange={v => {
                    const option = selectVatRateOptions.find(candidate => getVatOptionValue(candidate) === v)
                    if (option) updatePricingLineVat(index, option)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectVatRateOptions.map(option => (
                      <SelectItem
                        key={getVatOptionValue(option)}
                        value={getVatOptionValue(option)}
                      >
                        {getVatOptionLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="icon" onClick={() => removePricingLine(index)} disabled={form.pricingLines.length === 1} className="text-red-500 hover:text-red-700">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addPricingLine}>
              <Plus className="h-4 w-4 mr-1" /> {t('wizard.addPricingLine')}
            </Button>
          </div>

          <div className="mt-2 space-y-1">
            <p className="text-sm text-gray-600">
              {t('wizard.netTotal')} <span className="font-medium text-gray-800">{formatAmount(pricingTotal)}</span>
            </p>
            <p className="text-sm text-gray-600">
              {t('wizard.vatTotal')} <span className="font-medium text-gray-800">{formatAmount(pricingVatTotals.vatAmount)}</span>
            </p>
            <p className="text-sm font-medium text-gray-700">
              {t('wizard.totalInclVat')} <span className="font-semibold text-gray-900">{formatAmount(pricingVatTotals.total)}</span>
            </p>
          </div>

          {pricingVatTotals.total > 0 && typeof commissionPercent === 'number' && commissionPercent > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {t('wizard.priceShownToCustomer')} <span className="font-semibold text-gray-700">{formatAmount(pricingVatTotals.total * (1 + commissionPercent / 100))}</span>
              <span className="text-gray-400 ml-1">{t('wizard.commissionIncluded', { percent: commissionPercent })}</span>
            </p>
          )}

          {/* Milestone toggle */}
          <div className="mt-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.useMilestones}
                onChange={e => updateForm('useMilestones', e.target.checked)}
                className="rounded border-gray-300"
              />
              {t('wizard.splitMilestones')}
            </label>
          </div>

          {form.useMilestones && (
            <div className="mt-3 space-y-3 bg-white/50 rounded-lg p-3 border">
              <p className="text-xs text-gray-500">{t('wizard.milestonesHint')}</p>
              {form.milestones.map((ms, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <Input
                      placeholder={t('wizard.milestoneTitlePlaceholder')}
                      value={ms.title}
                      onChange={e => updateMilestone(i, 'title', e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder={t('wizard.milestoneAmountPlaceholder')}
                        value={ms.amount || ''}
                        onChange={e => updateMilestone(i, 'amount', parseFloat(e.target.value) || 0)}
                        className="w-32"
                      />
                      {i === 0 ? (
                        <div className="flex-1 flex items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">
                          {t('wizard.onProjectStartLocked')}
                        </div>
                      ) : (
                        <Select
                          value={ms.dueCondition}
                          onValueChange={v => updateMilestone(i, 'dueCondition', v)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="on_milestone_start">{t('wizard.dueConditions.onMilestoneStart')}</SelectItem>
                            <SelectItem value="on_milestone_completion">{t('wizard.dueConditions.onMilestoneCompletion')}</SelectItem>
                            <SelectItem value="custom_date">{t('wizard.dueConditions.customDate')}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {i === 0 && ms.amount <= 0 && (
                      <p className="text-xs text-amber-600">
                        {t('wizard.firstMilestoneHint')}
                      </p>
                    )}
                    {ms.dueCondition === 'custom_date' && (
                      <Input
                        type="date"
                        value={ms.customDueDate || ''}
                        onChange={e => updateMilestone(i, 'customDueDate', e.target.value)}
                      />
                    )}
                  </div>
                  {form.milestones.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeMilestone(i)} className="shrink-0 text-red-500 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addMilestone}>
                <Plus className="h-4 w-4 mr-1" /> {t('wizard.addMilestone')}
              </Button>
              <div className={`text-xs font-medium ${milestoneSumMatches ? 'text-green-600' : 'text-red-600'}`}>
                {milestoneSumMatches
                  ? t('wizard.milestoneTotal', { current: formatAmount(milestoneSum), total: formatAmount(pricingTotal) })
                  : t('wizard.milestoneTotalMismatch', { current: formatAmount(milestoneSum), total: formatAmount(pricingTotal) })}
              </div>
            </div>
          )}
        </div>

        {/* Durations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium flex items-center gap-1">
              <Clock className="h-4 w-4" /> {t('wizard.preparationLabel')}
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                min={0}
                value={form.preparationDuration.value}
                onChange={e => updateForm('preparationDuration', { ...form.preparationDuration, value: parseInt(e.target.value) || 0 })}
                className="w-20"
              />
              <Select
                value={form.preparationDuration.unit}
                onValueChange={v => updateForm('preparationDuration', { ...form.preparationDuration, unit: v as 'hours' | 'days' })}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">{t('wizard.units.hours')}</SelectItem>
                  <SelectItem value="days">{t('wizard.units.days')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium flex items-center gap-1">
              <Clock className="h-4 w-4" /> {t('wizard.executionLabel')}
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                min={0}
                value={form.executionDuration.value}
                onChange={e => updateForm('executionDuration', { ...form.executionDuration, value: parseInt(e.target.value) || 0 })}
                className="w-20"
              />
              <Select
                value={form.executionDuration.unit}
                onValueChange={v => updateForm('executionDuration', { ...form.executionDuration, unit: v as 'hours' | 'days' })}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">{t('wizard.units.hours')}</SelectItem>
                  <SelectItem value="days">{t('wizard.units.days')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Buffer */}
        <div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.useBuffer}
              onChange={e => updateForm('useBuffer', e.target.checked)}
              className="rounded border-gray-300"
            />
            {t('wizard.includeBuffer')}
          </label>
          {form.useBuffer && (
            <div className="flex gap-2 mt-2">
              <Input
                type="number"
                min={0}
                value={form.bufferDuration.value}
                onChange={e => updateForm('bufferDuration', { ...form.bufferDuration, value: parseInt(e.target.value) || 0 })}
                className="w-20"
              />
              <Select
                value={form.bufferDuration.unit}
                onValueChange={v => updateForm('bufferDuration', { ...form.bufferDuration, unit: v as 'hours' | 'days' })}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">{t('wizard.units.hours')}</SelectItem>
                  <SelectItem value="days">{t('wizard.units.days')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Validity */}
        <div>
          <Label className="text-sm font-medium">{t('wizard.validUntilLabel')}</Label>
          <Input
            type="date"
            value={form.validUntil}
            onChange={e => updateForm('validUntil', e.target.value)}
            className="mt-1 w-48"
          />
        </div>

        {/* Change note (required for editing) */}
        {isEditing && (
          <div>
            <Label className="text-sm font-medium">{t('wizard.changeReasonLabel')}</Label>
            <Textarea
              value={form.changeNote}
              onChange={e => updateForm('changeNote', e.target.value)}
              placeholder={t('wizard.changeReasonPlaceholder')}
              rows={2}
              className="mt-1"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isEditing ? t('wizard.updating') : t('wizard.submitting')}
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                {isEditing ? t('wizard.updateQuotation') : t('wizard.submitQuotation')}
              </>
            )}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            {t('wizard.cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
