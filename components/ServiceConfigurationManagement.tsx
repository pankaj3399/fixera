'use client'

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  X,
  CheckCircle,
  AlertCircle,
  Package,
  Image as ImageIcon,
  Copy
} from "lucide-react"
import { toast } from "sonner"
import IconPicker from "@/components/IconPicker"
import { iconMapData } from "@/data/icons"
import { parseFlexibleNumber } from "@/lib/numberInput"

interface DynamicField {
  fieldName: string
  fieldType: 'range' | 'dropdown' | 'number' | 'text'
  unit?: string
  label: string
  placeholder?: string
  isRequired: boolean
  options?: string[]
  min?: number
  max?: number
}

interface IncludedItem {
  name: string
  description?: string
  isDynamic: boolean
  dynamicField?: Partial<DynamicField>
}

interface ExtraOption {
  name: string
  description?: string
  isCustomizable: boolean
}

interface ConditionWarning {
  text: string
  type: 'condition' | 'warning'
}

interface PricingOption {
  name: string
  pricingType: 'fixed_price' | 'price_per_unit'
  unit?: string
}

interface VatQuestion {
  clientKey?: string
  question: string
  fieldName: string
  answerType: 'number' | 'yes_no' | 'checkboxes'
  unit?: string
  options?: string[]
  isRequired: boolean
}

const VAT_COUNTRY_OPTIONS = [
  ['AT', 'Austria'], ['BE', 'Belgium'], ['BG', 'Bulgaria'], ['CH', 'Switzerland'],
  ['CY', 'Cyprus'], ['CZ', 'Czechia'], ['DE', 'Germany'], ['DK', 'Denmark'],
  ['EE', 'Estonia'], ['ES', 'Spain'], ['FI', 'Finland'], ['FR', 'France'],
  ['GB', 'United Kingdom'], ['GR', 'Greece'], ['HR', 'Croatia'], ['HU', 'Hungary'],
  ['IE', 'Ireland'], ['IT', 'Italy'], ['LI', 'Liechtenstein'], ['LT', 'Lithuania'],
  ['LU', 'Luxembourg'], ['LV', 'Latvia'], ['MT', 'Malta'], ['NL', 'Netherlands'],
  ['NO', 'Norway'], ['PL', 'Poland'], ['PT', 'Portugal'], ['RO', 'Romania'],
  ['SE', 'Sweden'], ['SI', 'Slovenia'], ['SK', 'Slovakia'],
] as const

const parseCommaSeparatedOptions = (value: string): string[] => {
  const options: string[] = []
  let current = ''
  let quoted = false
  for (const character of value.replace(/\r/g, '')) {
    if (character === '"') {
      quoted = !quoted
      continue
    }
    if (!quoted && (character === ',' || character === '\n')) {
      const option = current.trim()
      if (option) options.push(option)
      current = ''
      continue
    }
    current += character
  }
  const finalOption = current.trim()
  if (finalOption) options.push(finalOption)
  return options
}

const VatOptionsEditor = ({
  options,
  onChange,
}: {
  options: string[]
  onChange: (options: string[]) => void
}) => (
  <div className="space-y-2 rounded-md border bg-white p-2">
    <p className="text-xs text-muted-foreground">
      Add each checkbox option separately. Commas and spaces are part of the option text.
    </p>
    {options.map((option, optionIndex) => (
      <div key={optionIndex} className="flex items-center gap-2">
        <Input
          value={option}
          onChange={(event) => {
            const next = [...options]
            next[optionIndex] = event.target.value
            onChange(next)
          }}
          placeholder="e.g. Repair, replacement"
          className="bg-white"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Remove checkbox option"
          onClick={() => onChange(options.filter((_, index) => index !== optionIndex))}
        >
          <X className="h-4 w-4 text-red-600" />
        </Button>
      </div>
    ))}
    <Button type="button" size="sm" variant="outline" onClick={() => onChange([...options, ''])}>
      <Plus className="mr-1 h-4 w-4" /> Add option
    </Button>
  </div>
)

const applyOptionDrafts = (
  data: ServiceConfiguration,
  drafts: Record<string, string>
): ServiceConfiguration => ({
  ...data,
  professionalInputFields: (data.professionalInputFields || []).map((field, index) => {
    const draft = drafts[`field:${index}`]
    return draft === undefined ? field : { ...field, options: parseCommaSeparatedOptions(draft) }
  }),
  vatManagement: data.vatManagement
    ? {
        ...data.vatManagement,
        reducedVatQuestions: (data.vatManagement.reducedVatQuestions || []).map((question, index) => {
          const draft = drafts[`vat:${index}`]
          return draft === undefined
            ? question
            : { ...question, options: parseCommaSeparatedOptions(draft) }
        }),
        professionalVatQuestions: (data.vatManagement.professionalVatQuestions || []).map((question, index) => {
          const draft = drafts[`pvat:${index}`]
          return draft === undefined
            ? question
            : { ...question, options: parseCommaSeparatedOptions(draft) }
        }),
      }
    : data.vatManagement,
})

interface VatLogicCondition {
  clientKey?: string
  fieldName: string
  operator: 'equals' | 'not_equals' | 'greater_than' | 'greater_than_or_equal' | 'less_than' | 'less_than_or_equal' | 'includes'
  value: string | number | boolean
  connector?: 'AND' | 'OR'
}

interface VatLogicRule {
  clientKey?: string
  country: string
  standardRate: number
  reducedRate: number
  conditions: VatLogicCondition[]
  action: 'reduced_rate' | 'rfq'
  customText?: string
  priority: number
  isActive: boolean
}

interface VatManagement {
  enabled: boolean
  rateRuleGroup?: string
  article47Classification?: 'movable' | 'immovable' | 'project_dependent'
  exemptFromBelgianReverseCharge?: boolean
  reducedVatQuestions: VatQuestion[]
  professionalVatQuestions?: VatQuestion[]
  logicRules: VatLogicRule[]
}

const ARTICLE_47_FIELD_NAME = 'article47_immovable'

interface ServiceConfiguration {
  _id?: string
  category: string
  service: string
  areaOfWork?: string
  pricingModel?: string
  pricingOptions: PricingOption[]
  icon?: string
  certificationRequired: boolean
  requiredCertifications?: string[]
  projectTypes: string[]
  includedItems: IncludedItem[]
  professionalInputFields: DynamicField[]
  extraOptions: ExtraOption[]
  conditionsAndWarnings: ConditionWarning[]
  vatManagement?: VatManagement
  isActive: boolean
  country?: string
  activeCountries?: string[]
  createdAt?: string
  updatedAt?: string
}

const CERTIFICATION_TYPES = [
  'ISO', 'EN', 'VCA', 'BREEAM', 'LEED', 'DGNB',
  'Architect', 'Demolition', 'EPC', 'Asbestos',
  'Gas & Oil', 'Electric', 'Waste Transport', 'Pest Control'
]

const EMPTY_FORM: ServiceConfiguration = {
  category: '',
  service: '',
  areaOfWork: '',
  pricingModel: '',
  pricingOptions: [],
  icon: '',
  certificationRequired: false,
  requiredCertifications: [],
  projectTypes: [],
  includedItems: [],
  professionalInputFields: [],
  extraOptions: [],
  conditionsAndWarnings: [],
  vatManagement: {
    enabled: false,
    rateRuleGroup: '',
    article47Classification: 'immovable',
    exemptFromBelgianReverseCharge: false,
    reducedVatQuestions: [],
    professionalVatQuestions: [],
    logicRules: [],
  },
  isActive: true,
  activeCountries: ['BE']
}

export default function ServiceConfigurationManagement() {
  const router = useRouter()
  const [services, setServices] = useState<ServiceConfiguration[]>([])
  const [loading, setLoading] = useState(true)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [formData, setFormData] = useState<ServiceConfiguration>(EMPTY_FORM)
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [countryFilter, setCountryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Compute unique countries
  const uniqueCountries = React.useMemo(() => {
    const countries = new Set<string>()
    services.forEach(service => {
      if (service.activeCountries?.length) {
        service.activeCountries.forEach(c => countries.add(c))
      } else if (service.country) {
        countries.add(service.country)
      }
    })
    return Array.from(countries).sort()
  }, [services])

  // Compute filtered services
  const filteredServices = React.useMemo(() => {
    return services.filter(service => {
      const serviceCountries = service.activeCountries?.length ? service.activeCountries : (service.country ? [service.country] : [])
      const matchCountry = countryFilter === 'all' || serviceCountries.includes(countryFilter)

      const matchStatus = statusFilter === 'all' ||
        (statusFilter === 'active' && service.isActive) ||
        (statusFilter === 'inactive' && !service.isActive)

      const matchSearch = searchQuery.trim() === '' ||
        service.service.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (service.areaOfWork && service.areaOfWork.toLowerCase().includes(searchQuery.toLowerCase()))

      return matchCountry && matchStatus && matchSearch
    })
  }, [services, countryFilter, statusFilter, searchQuery])


  // Fetch all services
  const fetchServices = async () => {
    console.log('📡 Fetching services from:', `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/service-configurations`)
    try {
      setLoading(true)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/service-configurations`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      console.log('📥 Response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('✅ Services fetched:', data)
        setServices(data.data || [])
      } else {
        const error = await response.json()
        console.error('❌ Fetch failed:', error)
        toast.error(error.message || 'Failed to fetch service configurations')
      }
    } catch (error) {
      console.error('💥 Error fetching services:', error)
      toast.error('Failed to load service configurations')
    } finally {
      setLoading(false)
    }
  }

  // Auto-generate legacy pricingModel string from pricingOptions
  const buildLegacyPricingModel = (options: PricingOption[]): string => {
    return options.map(o => o.name).join(' or ')
  }

  // Build a toast-friendly message from a backend error response that may carry fieldErrors
  const formatBackendError = (error: { message?: string; fieldErrors?: Array<{ path?: string; message?: string }> } | undefined, fallback: string) => {
    const detail = error?.fieldErrors?.map(fe => `${fe.path ?? 'field'}: ${fe.message ?? 'invalid'}`).join('; ')
    if (detail) return `${error?.message ?? fallback} — ${detail}`
    return error?.message || fallback
  }

  // Create new service
  const createService = async (dataOverride?: ServiceConfiguration) => {
    const cleanedActive = (dataOverride?.activeCountries ?? formData.activeCountries ?? []).filter(Boolean)
    if (cleanedActive.length === 0) {
      toast.error('Please select at least one active country')
      return
    }
    const base = dataOverride || { ...formData, activeCountries: cleanedActive }
    const payload = { ...base, pricingModel: buildLegacyPricingModel(base.pricingOptions) }
    console.log('Creating service:', payload)
    try {
      setSaving(true)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/service-configurations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      })

      console.log('Create response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('Service created:', data)
        toast.success('Service created successfully!')
        setEditDialogOpen(false)
        setFormData(EMPTY_FORM)
        setOptionDrafts({})
        setEditingId(null)
        await fetchServices()
        router.refresh()
      } else {
        const error = await response.json()
        console.error('Create failed:', error)
        toast.error(formatBackendError(error, 'Failed to create service'))
      }
    } catch (error) {
      console.error('Error creating service:', error)
      toast.error('Failed to create service')
    } finally {
      setSaving(false)
    }
  }

  // Update existing service
  const updateService = async (id: string, dataOverride?: ServiceConfiguration) => {
    const cleanedActive = (dataOverride?.activeCountries ?? formData.activeCountries ?? []).filter(Boolean)
    if (cleanedActive.length === 0) {
      toast.error('Please select at least one active country')
      return
    }
    const base = dataOverride || { ...formData, activeCountries: cleanedActive }
    const payload = { ...base, pricingModel: buildLegacyPricingModel(base.pricingOptions) }
    console.log(`Updating service ${id}:`, payload)
    try {
      setSaving(true)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/service-configurations/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      })

      console.log('Update response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('Service updated:', data)
        toast.success('Service updated successfully!')
        setEditDialogOpen(false)
        setFormData(EMPTY_FORM)
        setOptionDrafts({})
        setEditingId(null)
        await fetchServices()
        router.refresh()
      } else {
        const error = await response.json()
        console.error('Update failed:', error)
        toast.error(formatBackendError(error, 'Failed to update service'))
      }
    } catch (error) {
      console.error('Error updating service:', error)
      toast.error('Failed to update service')
    } finally {
      setSaving(false)
    }
  }

  // Delete service
  const deleteService = async (id: string) => {
    console.log(`🗑️ Deleting service: ${id}`)
    try {
      setDeleting(true)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/service-configurations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      console.log('📥 Delete response status:', response.status)

      if (response.ok) {
        console.log('✅ Service deleted')
        toast.success('Service deleted successfully')
        setDeleteDialogOpen(false)
        setDeleteId(null)
        await fetchServices()
        router.refresh()
      } else {
        const error = await response.json()
        console.error('❌ Delete failed:', error)
        toast.error(error.message || 'Failed to delete service')
      }
    } catch (error) {
      console.error('💥 Error deleting service:', error)
      toast.error('Failed to delete service')
    } finally {
      setDeleting(false)
    }
  }

  // Open dialog for adding new service
  const handleAddClick = () => {
    console.log('🆕 Opening add dialog')
    setFormData(EMPTY_FORM)
    setOptionDrafts({})
    setEditingId(null)
    setEditDialogOpen(true)
  }

  // Migrate legacy pricingModel string to structured pricingOptions
  const migratePricingOptions = (service: ServiceConfiguration): PricingOption[] => {
    if (service.pricingOptions && service.pricingOptions.length > 0) {
      return service.pricingOptions
    }
    if (!service.pricingModel) return []
    // Parse legacy "X or Y" format
    return service.pricingModel.split(' or ').map(m => {
      const name = m.trim()
      const lower = name.toLowerCase()
      const isFixed = lower === 'total price' || lower === 'total' || lower === 'fixed price'
      return {
        name,
        pricingType: isFixed ? 'fixed_price' as const : 'price_per_unit' as const,
        unit: isFixed ? undefined : (lower.includes('m²') || lower.includes('m2') ? 'm²' : undefined),
      }
    })
  }

  // Open dialog for editing service
  const handleEditClick = (service: ServiceConfiguration) => {
    console.log('✏️ Opening edit dialog for:', service)
    const legacyCountry = service.country
    const resolvedActiveCountries = Array.isArray(service.activeCountries) && service.activeCountries.length > 0
      ? service.activeCountries
      : legacyCountry ? [legacyCountry] : []
    const resolvedPricingOptions = migratePricingOptions(service)
    setFormData({
      ...service,
      activeCountries: resolvedActiveCountries,
      pricingOptions: resolvedPricingOptions,
      vatManagement: ensureVatManagement(service.vatManagement),
    })
    setEditingId(service._id || null)
    setEditDialogOpen(true)
    console.log('✏️ Edit dialog state set to:', true)
  }

  // Open dialog for duplicating a service
  const handleDuplicateClick = (service: ServiceConfiguration) => {
    console.log('📋 Opening duplicate dialog for:', service)
    const legacyCountry = service.country
    const resolvedActiveCountries = Array.isArray(service.activeCountries) && service.activeCountries.length > 0
      ? service.activeCountries
      : legacyCountry ? [legacyCountry] : []
    const resolvedPricingOptions = migratePricingOptions(service)

    const { _id, createdAt, updatedAt, ...rest } = service

    setFormData({
      ...rest,
      service: `${service.service} (Copy)`,
      activeCountries: resolvedActiveCountries,
      pricingOptions: resolvedPricingOptions,
    })
    setEditingId(null)
    setEditDialogOpen(true)
  }

  // Open delete confirmation dialog
  const handleDeleteClick = (id: string) => {
    console.log('🗑️ Opening delete dialog for:', id)
    setDeleteId(id)
    setDeleteDialogOpen(true)
    console.log('🗑️ Delete dialog state set to:', true)
  }

  // Handle save button click
  const handleSave = () => {
    const dataToSave = applyOptionDrafts(formData, optionDrafts)
    setFormData(dataToSave)
    setOptionDrafts({})

    // Validate pricing options
    for (const opt of dataToSave.pricingOptions) {
      if (!opt.name.trim()) {
        toast.error('Each pricing option must have a name')
        return
      }
      if (opt.pricingType === 'price_per_unit' && !opt.unit?.trim()) {
        toast.error(`Pricing option "${opt.name}" requires a unit (e.g., m², hour)`)
        return
      }
      if (opt.pricingType === 'fixed_price' && opt.unit?.trim()) {
        toast.error(`Pricing option "${opt.name}" must not have a unit (it is fixed price)`)
        return
      }
    }
    // Validate service parameter fields
    for (const field of dataToSave.professionalInputFields) {
      if (!field.fieldName?.trim() || !field.label?.trim()) {
        toast.error('Each service parameter must have a field name and label')
        return
      }
      if (field.fieldType === 'range') {
        if (field.max == null) {
          toast.error(`Range parameter "${field.label}" must have a Max Value`)
          return
        }
        if (field.min != null && field.min >= field.max) {
          toast.error(`Range parameter "${field.label}" needs Min Value less than Max Value`)
          return
        }
      }
    }

    const vat = ensureVatManagement(dataToSave.vatManagement)
    if (vat.enabled) {
      const allVatQuestions = [
        ...vat.reducedVatQuestions,
        ...(vat.professionalVatQuestions || []),
      ]
      const seenFieldNames = new Set<string>()
      for (const question of allVatQuestions) {
        if (!question.question.trim() || !question.fieldName.trim()) {
          toast.error('Each VAT question needs a question and field name')
          return
        }
        const fieldName = question.fieldName.trim()
        if (seenFieldNames.has(fieldName)) {
          toast.error(`Duplicate VAT question field name "${fieldName}"`)
          return
        }
        seenFieldNames.add(fieldName)
        if (question.answerType === 'checkboxes' && (!question.options || question.options.length === 0)) {
          toast.error(`VAT question "${question.question}" needs checkbox options`)
          return
        }
      }
      const validVatQuestionFields = new Set(seenFieldNames)
      if (vat.article47Classification === 'project_dependent') {
        validVatQuestionFields.add(ARTICLE_47_FIELD_NAME)
      }
      for (const rule of vat.logicRules) {
        if (!rule.country.trim()) {
          toast.error('Each VAT logic rule needs a country')
          return
        }
        if (
          !Number.isFinite(rule.standardRate) ||
          rule.standardRate <= 0 ||
          rule.standardRate > 100 ||
          !Number.isFinite(rule.reducedRate) ||
          rule.reducedRate < 0 ||
          rule.reducedRate > rule.standardRate
        ) {
          toast.error('Each VAT logic rule needs a positive standard rate and a reduced rate between 0 and the standard rate')
          return
        }
        for (const condition of rule.conditions) {
          const conditionFieldName = condition.fieldName?.trim()
          if (!conditionFieldName) {
            toast.error('Each VAT logic condition needs a field name')
            return
          }
          if (!validVatQuestionFields.has(conditionFieldName)) {
            toast.error(`VAT logic condition references unknown field "${conditionFieldName}"`)
            return
          }
        }
      }
    }

    if (editingId) {
      updateService(editingId, dataToSave)
    } else {
      createService(dataToSave)
    }
  }

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (deleteId) {
      deleteService(deleteId)
    }
  }

  // Project Type handlers
  const addProjectType = () => {
    setFormData(prev => ({
      ...prev,
      projectTypes: [...prev.projectTypes, '']
    }))
  }

  const removeProjectType = (index: number) => {
    setFormData(prev => ({
      ...prev,
      projectTypes: prev.projectTypes.filter((_, i) => i !== index)
    }))
  }

  const updateProjectType = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      projectTypes: prev.projectTypes.map((item, i) => i === index ? value : item)
    }))
  }

  // Included Item handlers
  const addIncludedItem = () => {
    setFormData(prev => ({
      ...prev,
      includedItems: [...prev.includedItems, { name: '', description: '', isDynamic: false }]
    }))
  }

  const removeIncludedItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      includedItems: prev.includedItems.filter((_, i) => i !== index)
    }))
  }

  const updateIncludedItem = (index: number, field: keyof IncludedItem, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      includedItems: prev.includedItems.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    }))
  }

  // Professional Input Fields handlers
  const addProfessionalInputField = () => {
    setFormData(prev => ({
      ...prev,
      professionalInputFields: [...prev.professionalInputFields, {
        fieldName: '',
        fieldType: 'text',
        label: '',
        isRequired: true,
      }]
    }))
  }

  const removeProfessionalInputField = (index: number) => {
    setFormData(prev => ({
      ...prev,
      professionalInputFields: prev.professionalInputFields.filter((_, i) => i !== index)
    }))
  }

  const updateProfessionalInputField = (index: number, field: string, value: string | boolean | number | string[] | undefined) => {
    setFormData(prev => ({
      ...prev,
      professionalInputFields: prev.professionalInputFields.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    }))
  }

  // Extra Options handlers
  const addExtraOption = () => {
    setFormData(prev => ({
      ...prev,
      extraOptions: [...prev.extraOptions, { name: '', description: '', isCustomizable: false }]
    }))
  }

  const removeExtraOption = (index: number) => {
    setFormData(prev => ({
      ...prev,
      extraOptions: prev.extraOptions.filter((_, i) => i !== index)
    }))
  }

  const updateExtraOption = (index: number, field: keyof ExtraOption, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      extraOptions: prev.extraOptions.map((opt, i) => i === index ? { ...opt, [field]: value } : opt)
    }))
  }

  // Conditions & Warnings handlers
  const addConditionWarning = () => {
    setFormData(prev => ({
      ...prev,
      conditionsAndWarnings: [...prev.conditionsAndWarnings, { text: '', type: 'condition' }]
    }))
  }

  const removeConditionWarning = (index: number) => {
    setFormData(prev => ({
      ...prev,
      conditionsAndWarnings: prev.conditionsAndWarnings.filter((_, i) => i !== index)
    }))
  }

  const updateConditionWarning = <K extends keyof ConditionWarning>(
    index: number,
    field: K,
    value: ConditionWarning[K]
  ) => {
    setFormData(prev => ({
      ...prev,
      conditionsAndWarnings: prev.conditionsAndWarnings.map((cw, i) =>
        i === index ? ({ ...cw, [field]: value } as ConditionWarning) : cw
      )
    }))
  }

  const makeClientKey = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  const ensureVatManagement = (vat?: VatManagement): VatManagement => ({
    enabled: vat?.enabled ?? false,
    rateRuleGroup: vat?.rateRuleGroup || '',
    article47Classification: vat?.article47Classification || 'immovable',
    exemptFromBelgianReverseCharge:
      (vat?.article47Classification || 'immovable') === 'movable'
        ? false
        : Boolean(vat?.exemptFromBelgianReverseCharge),
    reducedVatQuestions: (vat?.reducedVatQuestions || []).map((question) => ({
      ...question,
      clientKey: question.clientKey || makeClientKey('vat-question'),
    })),
    professionalVatQuestions: (vat?.professionalVatQuestions || []).map((question) => ({
      ...question,
      clientKey: question.clientKey || makeClientKey('pvat-question'),
    })),
    logicRules: (vat?.logicRules || []).map((rule) => ({
      ...rule,
      clientKey: rule.clientKey || makeClientKey('vat-rule'),
      conditions: (rule.conditions || []).map((condition) => ({
        ...condition,
        clientKey: condition.clientKey || makeClientKey('vat-condition'),
      })),
    })),
  })

  const updateVatManagement = (patch: Partial<VatManagement>) => {
    setFormData(prev => ({
      ...prev,
      vatManagement: { ...ensureVatManagement(prev.vatManagement), ...patch }
    }))
  }

  const addVatQuestion = () => {
    const vat = ensureVatManagement(formData.vatManagement)
    updateVatManagement({
      reducedVatQuestions: [
        ...vat.reducedVatQuestions,
        { question: '', fieldName: '', answerType: 'yes_no', unit: '', options: [], isRequired: true, clientKey: makeClientKey('vat-question') }
      ]
    })
  }

  const updateVatQuestion = (index: number, patch: Partial<VatQuestion>) => {
    const vat = ensureVatManagement(formData.vatManagement)
    updateVatManagement({
      reducedVatQuestions: vat.reducedVatQuestions.map((question, i) =>
        i === index ? { ...question, ...patch } : question
      )
    })
  }

  const removeVatQuestion = (index: number) => {
    const vat = ensureVatManagement(formData.vatManagement)
    updateVatManagement({
      reducedVatQuestions: vat.reducedVatQuestions.filter((_, i) => i !== index)
    })
  }

  const addProfessionalVatQuestion = () => {
    const vat = ensureVatManagement(formData.vatManagement)
    updateVatManagement({
      professionalVatQuestions: [
        ...(vat.professionalVatQuestions || []),
        { question: '', fieldName: '', answerType: 'yes_no', unit: '', options: [], isRequired: true, clientKey: makeClientKey('pvat-question') }
      ]
    })
  }

  const updateProfessionalVatQuestion = (index: number, patch: Partial<VatQuestion>) => {
    const vat = ensureVatManagement(formData.vatManagement)
    updateVatManagement({
      professionalVatQuestions: (vat.professionalVatQuestions || []).map((question, i) =>
        i === index ? { ...question, ...patch } : question
      )
    })
  }

  const removeProfessionalVatQuestion = (index: number) => {
    const vat = ensureVatManagement(formData.vatManagement)
    updateVatManagement({
      professionalVatQuestions: (vat.professionalVatQuestions || []).filter((_, i) => i !== index)
    })
  }

  const addVatLogicRule = () => {
    const vat = ensureVatManagement(formData.vatManagement)
    updateVatManagement({
      logicRules: [
        ...vat.logicRules,
        {
          country: 'BE',
          standardRate: 21,
          reducedRate: 6,
          conditions: [],
          action: 'reduced_rate',
          customText: '',
          priority: vat.logicRules.length,
          isActive: true,
          clientKey: makeClientKey('vat-rule'),
        }
      ]
    })
  }

  const updateVatLogicRule = (index: number, patch: Partial<VatLogicRule>) => {
    const vat = ensureVatManagement(formData.vatManagement)
    updateVatManagement({
      logicRules: vat.logicRules.map((rule, i) => i === index ? { ...rule, ...patch } : rule)
    })
  }

  const removeVatLogicRule = (index: number) => {
    const vat = ensureVatManagement(formData.vatManagement)
    updateVatManagement({ logicRules: vat.logicRules.filter((_, i) => i !== index) })
  }

  const addVatCondition = (ruleIndex: number) => {
    const vat = ensureVatManagement(formData.vatManagement)
    const fieldName = vat.reducedVatQuestions[0]?.fieldName || ''
    updateVatManagement({
      logicRules: vat.logicRules.map((rule, i) =>
        i === ruleIndex
          ? {
              ...rule,
              conditions: [
                ...rule.conditions,
                { fieldName, operator: 'equals', value: true, connector: rule.conditions.length === 0 ? 'AND' : 'AND', clientKey: makeClientKey('vat-condition') }
              ]
            }
          : rule
      )
    })
  }

  const updateVatCondition = (ruleIndex: number, conditionIndex: number, patch: Partial<VatLogicCondition>) => {
    const vat = ensureVatManagement(formData.vatManagement)
    updateVatManagement({
      logicRules: vat.logicRules.map((rule, i) =>
        i === ruleIndex
          ? {
              ...rule,
              conditions: rule.conditions.map((condition, ci) =>
                ci === conditionIndex ? { ...condition, ...patch } : condition
              )
            }
          : rule
      )
    })
  }

  const removeVatCondition = (ruleIndex: number, conditionIndex: number) => {
    const vat = ensureVatManagement(formData.vatManagement)
    updateVatManagement({
      logicRules: vat.logicRules.map((rule, i) =>
        i === ruleIndex
          ? { ...rule, conditions: rule.conditions.filter((_, ci) => ci !== conditionIndex) }
          : rule
      )
    })
  }

  useEffect(() => {
    fetchServices()
  }, [])

  useEffect(() => {
    console.log('🔄 Edit dialog state changed:', editDialogOpen)
  }, [editDialogOpen])

  useEffect(() => {
    console.log('🔄 Delete dialog state changed:', deleteDialogOpen)
  }, [deleteDialogOpen])

  if (loading) {
    return (
      <Card className="border-2 border-transparent bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Service Configuration Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 py-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-2 border-transparent bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg relative before:absolute before:inset-0 before:rounded-lg before:p-[2px] before:bg-gradient-to-br before:from-purple-300 before:via-pink-300 before:to-blue-300 before:-z-10">
        <datalist id="vat-country-options">
          {VAT_COUNTRY_OPTIONS.map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </datalist>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-600" />
                Service Configuration Management
              </CardTitle>
              <CardDescription>
                Manage your service configurations, pricing models, and requirements
              </CardDescription>
            </div>

            <Button
              onClick={handleAddClick}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Service
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {services.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No Services Yet</h3>
              <p className="text-muted-foreground mb-4">
                Start by adding your first service configuration
              </p>
              <Button onClick={handleAddClick} className="bg-gradient-to-r from-purple-500 to-pink-500">
                <Plus className="h-4 w-4 mr-2" />
                Add Service
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="text-sm text-muted-foreground whitespace-nowrap">
                  {filteredServices.length} service{filteredServices.length !== 1 ? 's' : ''} configured {services.length !== filteredServices.length && `(filtered from ${services.length})`}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                  <div className="relative w-full sm:w-[300px]">
                    <Input
                      placeholder="Search service or area of work..."
                      value={searchQuery || ''}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="country-filter" className="text-sm font-medium">Country:</Label>
                    <select
                      id="country-filter"
                      className="border rounded-md px-3 py-1.5 bg-white text-sm"
                      value={countryFilter}
                      onChange={(e) => setCountryFilter(e.target.value)}
                    >
                      <option value="all">All Countries</option>
                      {uniqueCountries.map(country => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label htmlFor="status-filter" className="text-sm font-medium">Status:</Label>
                    <select
                      id="status-filter"
                      className="border rounded-md px-3 py-1.5 bg-white text-sm"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="all">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-2 border-transparent bg-white rounded-lg overflow-hidden relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-blue-200 before:via-purple-200 before:to-pink-200 before:-z-10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Icon</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Area of Work</TableHead>
                      <TableHead>Pricing Model</TableHead>
                      <TableHead>Active Country</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServices.map((service) => (
                      <TableRow key={service._id}>
                        <TableCell>
                          {service.icon && iconMapData[service.icon as keyof typeof iconMapData] ? (
                            React.createElement(iconMapData[service.icon as keyof typeof iconMapData], { className: "h-5 w-5 text-gray-500" })
                          ) : (
                            <ImageIcon className="h-5 w-5 text-gray-300" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{service.category}</TableCell>
                        <TableCell>{service.service}</TableCell>
                        <TableCell>{service.areaOfWork || '-'}</TableCell>
                        <TableCell className="text-sm">
                          {service.pricingOptions?.length > 0
                            ? service.pricingOptions.map(o => o.name).join(', ')
                            : service.pricingModel || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {service.activeCountries?.length ? (
                              service.activeCountries.map(c => (
                                <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                              ))
                            ) : service.country ? (
                              <Badge variant="outline" className="text-xs">{service.country}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {service.isActive ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditClick(service)}
                              className="h-8 px-2 hover:bg-blue-50"
                              title="Edit service"
                            >
                              <Edit2 className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(service._id!)}
                              className="h-8 px-2 hover:bg-red-50"
                              title="Delete service"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDuplicateClick(service)}
                              className="h-8 px-2 hover:bg-green-50"
                              title="Duplicate service"
                            >
                              <Copy className="h-4 w-4 text-green-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        console.log('🔄 Dialog onOpenChange called with:', open)
        setEditDialogOpen(open)
        if (!open) {
          setFormData(EMPTY_FORM)
          setOptionDrafts({})
          setEditingId(null)
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              {editingId ? 'Edit Service Configuration' : 'Add New Service Configuration'}
            </DialogTitle>
            <DialogDescription>
              Configure the service details, pricing model, and requirements
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Basic Information */}
            <div className="space-y-4 p-4 rounded-lg border-2 border-transparent bg-white relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-purple-200 before:to-pink-200 before:-z-10">
              <h3 className="font-semibold text-lg">Basic Information</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="e.g., Exterior, Interior"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="service">Service *</Label>
                  <Input
                    id="service"
                    value={formData.service}
                    onChange={(e) => setFormData(prev => ({ ...prev, service: e.target.value }))}
                    placeholder="e.g., Architect, Plumbing"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Icon</Label>
                  <IconPicker
                    value={formData.icon || ''}
                    onChange={(icon) => setFormData(prev => ({ ...prev, icon }))}
                  />
                </div>

              </div>

              <div className="space-y-2">
                <Label htmlFor="areaOfWork">Area of Work</Label>
                <Input
                  id="areaOfWork"
                  value={formData.areaOfWork}
                  onChange={(e) => setFormData(prev => ({ ...prev, areaOfWork: e.target.value }))}
                  placeholder="e.g., Strip Foundations, Raft Foundation"
                />
              </div>

              {/* Pricing Options */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Pricing Options *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      pricingOptions: [...prev.pricingOptions, { name: '', pricingType: 'fixed_price' }]
                    }))}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Pricing Option
                  </Button>
                </div>

                {formData.pricingOptions.map((option, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 border rounded-lg bg-gray-50">
                    <div className="flex-1 grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Pricing Name *</Label>
                        <Input
                          value={option.name}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            pricingOptions: prev.pricingOptions.map((o, i) => i === index ? { ...o, name: e.target.value } : o)
                          }))}
                          placeholder="e.g., Total price"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Pricing Type *</Label>
                        <select
                          className="w-full border rounded-md px-3 py-2 bg-white text-sm"
                          value={option.pricingType}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            pricingOptions: prev.pricingOptions.map((o, i) => {
                              if (i !== index) return o
                              const nextType = e.target.value as 'fixed_price' | 'price_per_unit'
                              return nextType === 'fixed_price'
                                ? { ...o, pricingType: nextType, unit: undefined }
                                : { ...o, pricingType: nextType }
                            })
                          }))}
                        >
                          <option value="fixed_price">Fixed price</option>
                          <option value="price_per_unit">Price per unit</option>
                        </select>
                      </div>
                      {option.pricingType === 'price_per_unit' && (
                        <div className="space-y-1">
                          <Label className="text-xs">Unit *</Label>
                          <Input
                            value={option.unit || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              pricingOptions: prev.pricingOptions.map((o, i) => i === index ? { ...o, unit: e.target.value } : o)
                            }))}
                            placeholder="e.g., m², hour, room"
                          />
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        pricingOptions: prev.pricingOptions.filter((_, i) => i !== index)
                      }))}
                      className="h-8 px-2 hover:bg-red-50 mt-5"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ))}

                {formData.pricingOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">No pricing options added yet. Add at least one.</p>
                )}
              </div>

              {/* Active Countries */}
              <div className="space-y-2">
                <Label htmlFor="activeCountries">Active Countries</Label>
                <Input
                  id="activeCountries"
                  value={(formData.activeCountries || []).join(', ')}
                  onChange={(e) => {
                    console.log('ActiveCountries input change:', e.target.value)
                    const parts = e.target.value.split(',').map(s => s.trim())
                    setFormData(prev => ({ ...prev, activeCountries: parts }))
                  }}
                  placeholder="e.g., BE, NL, FR"
                />
                <p className="text-xs text-muted-foreground">Comma-separated ISO country codes</p>
              </div>

              {/* Certification Required Toggle */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="certificationRequired"
                  checked={formData.certificationRequired}
                  onCheckedChange={(checked) => {
                    const isChecked = Boolean(checked)
                    setFormData(prev => ({
                      ...prev,
                      certificationRequired: isChecked,
                      requiredCertifications: isChecked
                        ? (prev.requiredCertifications || [])
                        : []
                    }))
                  }}
                />
                <Label htmlFor="certificationRequired">Certification Required</Label>
              </div>

              {/* Required Certification Types */}
              {formData.certificationRequired && (
                <div className="space-y-2">
                  <Label>Required Certification Types</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {CERTIFICATION_TYPES.map((type) => {
                      const checked = (formData.requiredCertifications || []).includes(type)
                      return (
                        <div key={type} className="flex items-center space-x-2 p-2 border rounded">
                          <Checkbox
                            id={`cert-${type.replace(/\s+/g, '-').toLowerCase()}`}
                            checked={checked}
                            onCheckedChange={(v) => {
                              const isChecked = Boolean(v)
                              setFormData(prev => ({
                                ...prev,
                                requiredCertifications: isChecked
                                  ? [...(prev.requiredCertifications || []), type]
                                  : (prev.requiredCertifications || []).filter(t => t !== type)
                              }))
                            }}
                          />
                          <Label htmlFor={`cert-${type.replace(/\s+/g, '-').toLowerCase()}`} className="cursor-pointer text-sm">{type}</Label>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                />
                <Label htmlFor="isActive">Service Active</Label>
              </div>
            </div>

            {/* Project Types */}
            <div className="space-y-4 p-4 rounded-lg border-2 border-transparent bg-white relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-blue-200 before:to-purple-200 before:-z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Project Types</h3>
                <Button onClick={addProjectType} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Type
                </Button>
              </div>

              <div className="space-y-2">
                {formData.projectTypes.map((type, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={type}
                      onChange={(e) => updateProjectType(index, e.target.value)}
                      placeholder="e.g., New Built, Extension, Refurbishment"
                      className="flex-1"
                    />
                    <Button
                      onClick={() => removeProjectType(index)}
                      variant="ghost"
                      size="sm"
                      className="hover:bg-red-50"
                    >
                      <X className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ))}
                {formData.projectTypes.length === 0 && (
                  <p className="text-sm text-muted-foreground">No project types added yet</p>
                )}
              </div>
            </div>

            {/* Extra Options */}
            <div className="space-y-4 p-4 rounded-lg border-2 border-transparent bg-white relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-yellow-200 before:to-orange-200 before:-z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Extra Options</h3>
                <Button onClick={addExtraOption} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Extra
                </Button>
              </div>
              <div className="space-y-3">
                {(formData.extraOptions || []).map((opt, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-2 bg-gray-50">
                    <div className="flex gap-2">
                      <Input
                        value={opt.name}
                        onChange={(e) => updateExtraOption(index, 'name', e.target.value)}
                        placeholder="Extra name"
                        className="flex-1 bg-white"
                      />
                      <Button
                        onClick={() => removeExtraOption(index)}
                        variant="ghost"
                        size="sm"
                        className="hover:bg-red-50"
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                    <Input
                      value={opt.description || ''}
                      onChange={(e) => updateExtraOption(index, 'description', e.target.value)}
                      placeholder="Description (optional)"
                      className="bg-white"
                    />
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`extra-customizable-${index}`}
                        checked={!!opt.isCustomizable}
                        onCheckedChange={(checked) => updateExtraOption(index, 'isCustomizable', checked)}
                      />
                      <Label htmlFor={`extra-customizable-${index}`}>Customizable by professional</Label>
                    </div>
                  </div>
                ))}
                {(!formData.extraOptions || formData.extraOptions.length === 0) && (
                  <p className="text-sm text-muted-foreground">No extras added yet</p>
                )}
              </div>
            </div>

            {/* Conditions & Warnings */}
            <div className="space-y-4 p-4 rounded-lg border-2 border-transparent bg-white relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-red-200 before:to-pink-200 before:-z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Conditions & Warnings</h3>
                <Button onClick={addConditionWarning} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              <div className="space-y-3">
                {(formData.conditionsAndWarnings || []).map((cw, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-2 bg-gray-50">
                    <div className="flex gap-2">
                      <Input
                        value={cw.text}
                        onChange={(e) => updateConditionWarning(index, 'text', e.target.value)}
                        placeholder="Condition or warning text"
                        className="flex-1 bg-white"
                      />
                      <select
                        className="border rounded px-2 py-1 bg-white"
                        value={cw.type}
                        onChange={(e) => updateConditionWarning(index, 'type', e.target.value as 'condition' | 'warning')}
                      >
                        <option value="condition">Condition</option>
                        <option value="warning">Warning</option>
                      </select>
                      <Button
                        onClick={() => removeConditionWarning(index)}
                        variant="ghost"
                        size="sm"
                        className="hover:bg-red-50"
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                ))}
                {(!formData.conditionsAndWarnings || formData.conditionsAndWarnings.length === 0) && (
                  <p className="text-sm text-muted-foreground">No conditions or warnings added yet</p>
                )}
              </div>
            </div>

            {/* VAT Management */}
            <div className="space-y-4 p-4 rounded-lg border-2 border-transparent bg-white relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-emerald-200 before:to-cyan-200 before:-z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">VAT management</h3>
                <Switch
                  id="vat-enabled"
                  checked={!!formData.vatManagement?.enabled}
                  onCheckedChange={(checked) => updateVatManagement({
                    enabled: Boolean(checked),
                    ...(checked && !formData.vatManagement?.article47Classification
                      ? { article47Classification: 'immovable' as const }
                      : {}),
                  })}
                />
              </div>

              {formData.vatManagement?.enabled && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label>Rate rule group</Label>
                    <Input
                      value={formData.vatManagement.rateRuleGroup || ''}
                      onChange={(e) => updateVatManagement({ rateRuleGroup: e.target.value })}
                      placeholder="e.g., building_work, solar, renovation_category"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="vat-article47-classification">Article 47 classification</Label>
                      <select
                        id="vat-article47-classification"
                        className="border rounded-md px-3 py-2 bg-white text-sm w-full"
                        value={formData.vatManagement.article47Classification || 'immovable'}
                        onChange={(e) => {
                          const article47Classification = e.target.value as VatManagement['article47Classification']
                          updateVatManagement({
                            article47Classification,
                            ...(article47Classification === 'movable' ? { exemptFromBelgianReverseCharge: false } : {}),
                          })
                        }}
                      >
                        <option value="immovable">Immovable</option>
                        <option value="movable">Movable</option>
                        <option value="project_dependent">Project dependent</option>
                      </select>
                      <p className="text-xs text-muted-foreground">
                        Place of supply and Belgian B2B reverse charge follow this classification. Project dependent adds an Article 47 question for the professional.
                      </p>
                    </div>
                    {formData.vatManagement.article47Classification !== 'movable' && (
                    <div className="flex items-center space-x-2 pt-6">
                      <Switch
                        checked={!!formData.vatManagement.exemptFromBelgianReverseCharge}
                        onCheckedChange={(checked) => updateVatManagement({ exemptFromBelgianReverseCharge: Boolean(checked) })}
                      />
                      <Label className="text-sm">Immovable but exempt from Belgian reverse charge</Label>
                    </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Reduced VAT questions (customer)</Label>
                      <Button type="button" size="sm" variant="outline" onClick={addVatQuestion}>
                        <Plus className="h-4 w-4 mr-1" /> Add Question
                      </Button>
                    </div>
                    {(formData.vatManagement.reducedVatQuestions || []).map((question, index) => (
                      <div key={question.clientKey || question.fieldName || `vat-question-${index}`} className="p-3 border rounded-lg bg-gray-50 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_150px_100px_40px] gap-2">
                          <Input
                            value={question.question}
                            onChange={(e) => updateVatQuestion(index, { question: e.target.value })}
                            placeholder="Question shown in booking wizard"
                            className="bg-white"
                          />
                          <Input
                            value={question.fieldName}
                            onChange={(e) => updateVatQuestion(index, { fieldName: e.target.value })}
                            placeholder="field_name"
                            className="bg-white"
                          />
                          <select
                            id={`customer-vat-answer-type-${index}`}
                            aria-label={`Customer VAT answer type for question ${index + 1}`}
                            className="border rounded-md px-3 py-2 bg-white text-sm"
                            value={question.answerType}
                            onChange={(e) => updateVatQuestion(index, { answerType: e.target.value as VatQuestion['answerType'] })}
                          >
                            <option value="yes_no">Yes/No</option>
                            <option value="number">Number</option>
                            <option value="checkboxes">Checkboxes</option>
                          </select>
                          <Input
                            value={question.unit || ''}
                            onChange={(e) => updateVatQuestion(index, { unit: e.target.value })}
                            placeholder="Unit"
                            disabled={question.answerType !== 'number'}
                            className="bg-white"
                          />
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeVatQuestion(index)}>
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                        {question.answerType === 'checkboxes' && (
                          <VatOptionsEditor
                            options={question.options || []}
                            onChange={(options) => updateVatQuestion(index, { options })}
                          />
                        )}
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={question.isRequired !== false}
                            onCheckedChange={(checked) => updateVatQuestion(index, { isRequired: checked })}
                          />
                          <Label className="text-xs">Required question</Label>
                        </div>
                      </div>
                    ))}
                    {(!formData.vatManagement.reducedVatQuestions || formData.vatManagement.reducedVatQuestions.length === 0) && (
                      <p className="text-sm text-muted-foreground">No customer VAT questions added yet</p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Professional VAT questions (project wizard)</Label>
                      <Button type="button" size="sm" variant="outline" onClick={addProfessionalVatQuestion}>
                        <Plus className="h-4 w-4 mr-1" /> Add Question
                      </Button>
                    </div>
                    {(formData.vatManagement.professionalVatQuestions || []).map((question, index) => (
                      <div key={question.clientKey || question.fieldName || `pvat-question-${index}`} className="p-3 border rounded-lg bg-gray-50 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_150px_100px_40px] gap-2">
                          <Input
                            value={question.question}
                            onChange={(e) => updateProfessionalVatQuestion(index, { question: e.target.value })}
                            placeholder="Question shown in project creation wizard"
                            className="bg-white"
                          />
                          <Input
                            value={question.fieldName}
                            onChange={(e) => updateProfessionalVatQuestion(index, { fieldName: e.target.value })}
                            placeholder="field_name"
                            className="bg-white"
                          />
                          <select
                            id={`professional-vat-answer-type-${index}`}
                            aria-label={`Professional VAT answer type for question ${index + 1}`}
                            className="border rounded-md px-3 py-2 bg-white text-sm"
                            value={question.answerType}
                            onChange={(e) => updateProfessionalVatQuestion(index, { answerType: e.target.value as VatQuestion['answerType'] })}
                          >
                            <option value="yes_no">Yes/No</option>
                            <option value="number">Number</option>
                            <option value="checkboxes">Checkboxes</option>
                          </select>
                          <Input
                            value={question.unit || ''}
                            onChange={(e) => updateProfessionalVatQuestion(index, { unit: e.target.value })}
                            placeholder="Unit"
                            disabled={question.answerType !== 'number'}
                            className="bg-white"
                          />
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeProfessionalVatQuestion(index)}>
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                        {question.answerType === 'checkboxes' && (
                          <VatOptionsEditor
                            options={question.options || []}
                            onChange={(options) => updateProfessionalVatQuestion(index, { options })}
                          />
                        )}
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={question.isRequired !== false}
                            onCheckedChange={(checked) => updateProfessionalVatQuestion(index, { isRequired: checked })}
                          />
                          <Label className="text-xs">Required question</Label>
                        </div>
                      </div>
                    ))}
                    {(!formData.vatManagement.professionalVatQuestions || formData.vatManagement.professionalVatQuestions.length === 0) && (
                      <p className="text-sm text-muted-foreground">No professional VAT questions yet. Project-dependent services get the Article 47 question automatically.</p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Logic determination</Label>
                      <Button type="button" size="sm" variant="outline" onClick={addVatLogicRule}>
                        <Plus className="h-4 w-4 mr-1" /> Add Rule
                      </Button>
                    </div>
                    {(formData.vatManagement.logicRules || []).map((rule, ruleIndex) => (
                      <div key={rule.clientKey || `${rule.country}-${rule.priority}-${ruleIndex}`} className="p-3 border rounded-lg bg-gray-50 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-[100px_120px_120px_150px_90px_40px] gap-2">
                          <Input value={rule.country} onChange={(e) => updateVatLogicRule(ruleIndex, { country: e.target.value.toUpperCase() })} placeholder="BE" className="bg-white" list="vat-country-options" />
                          <Input type="text" inputMode="decimal" value={rule.standardRate} onChange={(e) => updateVatLogicRule(ruleIndex, { standardRate: parseFlexibleNumber(e.target.value) || 0 })} placeholder="Standard %" className="bg-white" />
                          <Input type="text" inputMode="decimal" value={rule.reducedRate} onChange={(e) => updateVatLogicRule(ruleIndex, { reducedRate: parseFlexibleNumber(e.target.value) || 0 })} placeholder="Reduced %" className="bg-white" />
                          <select className="border rounded-md px-3 py-2 bg-white text-sm" value={rule.action} onChange={(e) => updateVatLogicRule(ruleIndex, { action: e.target.value as VatLogicRule['action'] })}>
                            <option value="reduced_rate">Reduced rate</option>
                            <option value="rfq">RFQ</option>
                          </select>
                          <Input type="number" value={rule.priority} onChange={(e) => updateVatLogicRule(ruleIndex, { priority: parseInt(e.target.value, 10) || 0 })} placeholder="Priority" className="bg-white" />
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeVatLogicRule(ruleIndex)}>
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>

                        <Input
                          value={rule.customText || ''}
                          onChange={(e) => updateVatLogicRule(ruleIndex, { customText: e.target.value })}
                          placeholder="Custom text shown when this logic is met"
                          className="bg-white"
                        />

                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={rule.isActive !== false}
                            onCheckedChange={(checked) => updateVatLogicRule(ruleIndex, { isActive: checked })}
                          />
                          <Label className="text-xs">Rule active</Label>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">IF conditions</span>
                            <Button type="button" size="sm" variant="outline" onClick={() => addVatCondition(ruleIndex)}>
                              <Plus className="h-4 w-4 mr-1" /> Add Condition
                            </Button>
                          </div>
                          {rule.conditions.map((condition, conditionIndex) => (
                            <div key={condition.clientKey || `${condition.fieldName}-${condition.operator}-${conditionIndex}`} className="grid grid-cols-1 md:grid-cols-[80px_1fr_180px_1fr_40px] gap-2">
                              <select
                                className="border rounded-md px-2 py-2 bg-white text-sm"
                                value={condition.connector || 'AND'}
                                onChange={(e) => updateVatCondition(ruleIndex, conditionIndex, { connector: e.target.value as 'AND' | 'OR' })}
                                disabled={conditionIndex === 0}
                              >
                                <option value="AND">AND</option>
                                <option value="OR">OR</option>
                              </select>
                              <select
                                className="border rounded-md px-3 py-2 bg-white text-sm"
                                value={condition.fieldName}
                                onChange={(e) => updateVatCondition(ruleIndex, conditionIndex, { fieldName: e.target.value })}
                              >
                                <option value="">Select field</option>
                                {formData.vatManagement?.reducedVatQuestions.map(q => (
                                  <option key={q.fieldName} value={q.fieldName}>{q.fieldName} (customer)</option>
                                ))}
                                {(formData.vatManagement?.professionalVatQuestions || []).map(q => (
                                  <option key={`p-${q.fieldName}`} value={q.fieldName}>{q.fieldName} (professional)</option>
                                ))}
                                {formData.vatManagement?.article47Classification === 'project_dependent' &&
                                  !(formData.vatManagement?.professionalVatQuestions || []).some((q) => q.fieldName === ARTICLE_47_FIELD_NAME) && (
                                  <option value={ARTICLE_47_FIELD_NAME}>{ARTICLE_47_FIELD_NAME} (Article 47)</option>
                                )}
                              </select>
                              <select
                                className="border rounded-md px-3 py-2 bg-white text-sm"
                                value={condition.operator}
                                onChange={(e) => updateVatCondition(ruleIndex, conditionIndex, { operator: e.target.value as VatLogicCondition['operator'] })}
                              >
                                <option value="equals">equals</option>
                                <option value="not_equals">not equals</option>
                                <option value="greater_than">greater than</option>
                                <option value="greater_than_or_equal">greater/equal</option>
                                <option value="less_than">less than</option>
                                <option value="less_than_or_equal">less/equal</option>
                                <option value="includes">includes</option>
                              </select>
                              <Input value={String(condition.value)} onChange={(e) => updateVatCondition(ruleIndex, conditionIndex, { value: e.target.value })} placeholder="Value" className="bg-white" />
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeVatCondition(ruleIndex, conditionIndex)}>
                                <X className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {(!formData.vatManagement.logicRules || formData.vatManagement.logicRules.length === 0) && (
                      <p className="text-sm text-muted-foreground">No VAT logic rules added yet</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Included Items */}
            <div className="space-y-4 p-4 rounded-lg border-2 border-transparent bg-white relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-green-200 before:to-blue-200 before:-z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Included Items</h3>
                <Button onClick={addIncludedItem} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {formData.includedItems.map((item, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-2 bg-gray-50">
                    <div className="flex gap-2">
                      <Input
                        value={item.name}
                        onChange={(e) => updateIncludedItem(index, 'name', e.target.value)}
                        placeholder="Item name"
                        className="flex-1 bg-white"
                      />
                      <Button
                        onClick={() => removeIncludedItem(index)}
                        variant="ghost"
                        size="sm"
                        className="hover:bg-red-50"
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                    <Input
                      value={item.description || ''}
                      onChange={(e) => updateIncludedItem(index, 'description', e.target.value)}
                      placeholder="Description (optional)"
                      className="bg-white"
                    />
                  </div>
                ))}
                {formData.includedItems.length === 0 && (
                  <p className="text-sm text-muted-foreground">No included items added yet</p>
                )}
              </div>
            </div>

            {/* Professional Input Fields (Service Parameters) */}
            <div className="space-y-4 p-4 rounded-lg border-2 border-transparent bg-white relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-purple-200 before:to-pink-200 before:-z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Service Parameters</h3>
                <Button type="button" variant="outline" size="sm" onClick={addProfessionalInputField}>
                  <Plus className="h-4 w-4 mr-1" /> Add Parameter
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Define fields that professionals must fill in during project creation (e.g., m² area, kW power, building type).
              </p>

              <div className="space-y-4">
                {formData.professionalInputFields.map((field, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-500">Parameter {index + 1}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeProfessionalInputField(index)}
                        className="h-8 px-2 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Field Name *</Label>
                        <Input
                          value={field.fieldName}
                          onChange={(e) => updateProfessionalInputField(index, 'fieldName', e.target.value)}
                          placeholder="e.g., range m2 living area"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Display Label *</Label>
                        <Input
                          value={field.label}
                          onChange={(e) => updateProfessionalInputField(index, 'label', e.target.value)}
                          placeholder="e.g., Living Area"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Field Type *</Label>
                        <select
                          className="w-full border rounded-md px-3 py-2 bg-white text-sm"
                          value={field.fieldType}
                          onChange={(e) => updateProfessionalInputField(index, 'fieldType', e.target.value)}
                        >
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="range">Range (min-max)</option>
                          <option value="dropdown">Dropdown</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Unit</Label>
                        <Input
                          value={field.unit || ''}
                          onChange={(e) => updateProfessionalInputField(index, 'unit', e.target.value)}
                          placeholder="e.g., m², kW, m³"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Placeholder</Label>
                        <Input
                          value={field.placeholder || ''}
                          onChange={(e) => updateProfessionalInputField(index, 'placeholder', e.target.value)}
                          placeholder="e.g., Enter area..."
                        />
                      </div>
                    </div>

                    {(field.fieldType === 'number' || field.fieldType === 'range') && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Min Value</Label>
                          <Input
                            type="number"
                            value={field.min ?? ''}
                            onChange={(e) => updateProfessionalInputField(index, 'min', e.target.value ? Number(e.target.value) : undefined)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Max Value</Label>
                          <Input
                            type="number"
                            value={field.max ?? ''}
                            onChange={(e) => updateProfessionalInputField(index, 'max', e.target.value ? Number(e.target.value) : undefined)}
                          />
                        </div>
                      </div>
                    )}

                    {field.fieldType === 'dropdown' && (
                      <div className="space-y-1">
                        <Label className="text-xs">Options (comma-separated)</Label>
                        <Input
                          value={optionDrafts[`field:${index}`] ?? (field.options || []).join(', ')}
                          onChange={(e) =>
                            setOptionDrafts((drafts) => ({ ...drafts, [`field:${index}`]: e.target.value }))
                          }
                          onBlur={() => {
                            const draft = optionDrafts[`field:${index}`]
                            if (draft === undefined) return
                            updateProfessionalInputField(index, 'options', parseCommaSeparatedOptions(draft))
                            setOptionDrafts((drafts) => {
                              const next = { ...drafts }
                              delete next[`field:${index}`]
                              return next
                            })
                          }}
                          placeholder="e.g., Option A, Option B, Option C"
                        />
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={field.isRequired}
                        onCheckedChange={(v) => updateProfessionalInputField(index, 'isRequired', Boolean(v))}
                      />
                      <Label className="text-xs cursor-pointer">Required field</Label>
                    </div>
                  </div>
                ))}

                {formData.professionalInputFields.length === 0 && (
                  <p className="text-sm text-muted-foreground">No service parameters added yet</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false)
                  setFormData(EMPTY_FORM)
                  setOptionDrafts({})
                  setEditingId(null)
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!formData.category || !formData.service || formData.pricingOptions.length === 0 || saving}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingId ? 'Update Service' : 'Create Service'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        console.log('🔄 Delete dialog onOpenChange called with:', open)
        setDeleteDialogOpen(open)
      }}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Service Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this service configuration? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setDeleteId(null)
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete Service
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
