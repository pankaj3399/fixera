'use client'

import { createProjectMediaQueue } from '@/lib/projectMediaQueue'
import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { Upload, X, MapPin, FileText, Star, Users } from "lucide-react"
import { toast } from 'sonner'
import { useLocale } from 'next-intl'
import AddressAutocomplete, { type PlaceData } from "./AddressAutocomplete"
import CertificationManager from "./CertificationManager"
import { useAuth } from "@/contexts/AuthContext"
import {
  collectStep1ComponentErrors,
  getStep1DataSignature,
  type Step1ServiceConfig,
  type Step1ValidationContext,
} from "@/lib/projectWizardValidation"
import { buildProjectTitleSuggestion, normalizeProjectKeywords } from '@/lib/projectWizardContent'
import { generateProjectCopy, ProjectCopyApiError } from '@/lib/projectCopyApi'

interface IServiceSelection {
  category: string
  service: string
  areaOfWork?: string
}

interface ProjectData {
  _id?: string
  id?: string
  category?: string
  service?: string
  areaOfWork?: string
  timeMode?: 'hours' | 'days' | 'mixed'
  categories?: string[]
  services?: IServiceSelection[]
  distance?: {
    address: string
    useCompanyAddress: boolean
    maxKmRange?: number
    noBorders: boolean
    location?: {
      type: 'Point'
      coordinates: [number, number]
    }
  }
  resources?: string[]
  intakeMeeting?: {
    enabled: boolean
    resources: string[]
  }
    renovationPlanning?: {
    fixeraManaged?: boolean
    resources: string[]
  }
  projectType?: string[]
  description?: string
  priceModel?: string
  selectedPricingOption?: { name: string; pricingType: 'fixed_price' | 'price_per_unit'; unit?: string }
  keywords?: string[]
  title?: string
  media?: {
    images: string[]
    videos: string[]
  }
  serviceConfigurationId?: string
  vatProfessionalAnswers?: Array<{ fieldName: string; value: unknown }>
  certifications?: Array<{
    name: string
    fileUrl: string
    uploadedAt: Date
    isRequired: boolean
  }>
  minResources?: number
  minOverlapPercentage?: number
  preparationDuration?: {
    value: number
    unit: 'hours' | 'days'
  }
  executionDuration?: {
    value: number
    unit: 'hours' | 'days'
  }
  bufferDuration?: {
    value: number
    unit: 'hours' | 'days'
  }
}

interface TeamMember {
  _id: string
  name: string
  email?: string
  hasEmail: boolean
  isActive?: boolean
}

interface Step1Props {
  data: ProjectData
  onChange: (data: ProjectData) => void
  onValidate: (isValid: boolean, context: Step1ValidationContext) => void
}

export interface Step1Ref {
  showValidationErrors: () => void
}

const DEFAULT_MIN_OVERLAP = 90

const Step1BasicInfo = forwardRef<Step1Ref, Step1Props>(({ data, onChange, onValidate }, ref) => {
  const t = useTranslations('projectWizard')
  const locale = useLocale() as 'en' | 'nl' | 'fr'
  const [formData, setFormData] = useState<ProjectData>(data)
  const [keywordInput, setKeywordInput] = useState('')
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([])
  const [selectedTitleIndex, setSelectedTitleIndex] = useState(0)
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false)
  const titleRequest = {
    kind: 'title' as const,
    locale,
    projectId: formData._id || formData.id || data._id || data.id,
    context: {
      category: formData.category,
      service: formData.service?.trim() || '',
      areaOfWork: formData.areaOfWork,
      description: formData.description || '',
      keywords: formData.keywords,
      selectedPricingOption: formData.selectedPricingOption,
    },
  }
  const titleSignature = JSON.stringify(titleRequest)
  const currentTitleSignatureRef = useRef(titleSignature)
  currentTitleSignatureRef.current = titleSignature
  const suggestedTitleSignatureRef = useRef<string | null>(null)
  useEffect(() => { setSuggestedTitles([]); suggestedTitleSignatureRef.current = null }, [titleSignature])
  const [addressValid, setAddressValid] = useState(false)
  const { user } = useAuth()
  const [serviceConfig, setServiceConfig] = useState<Step1ServiceConfig | null>(null)
  const [serviceConfigLoaded, setServiceConfigLoaded] = useState(false)
  const [pricingModels, setPricingModels] = useState<string[]>([])

  // Derived flags
  const isRenovationCategory = (formData.category || '').toLowerCase() === 'renovation'
  const selectedResourceCount = formData.resources?.length ?? 0
  const companyAddress = [
    user?.businessInfo?.address,
    user?.businessInfo?.postalCode,
    user?.businessInfo?.city,
    user?.businessInfo?.country,
  ]
    .filter(Boolean)
    .join(', ')

  // Backend data
  const [categories, setCategories] = useState<string[]>([])
  const [services, setServices] = useState<string[]>([])
  const [areasOfWork, setAreasOfWork] = useState<string[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [loadingServices, setLoadingServices] = useState(false)
  const [loadingAreas, setLoadingAreas] = useState(false)
  const [loadingTeamMembers, setLoadingTeamMembers] = useState(false)

  // Ensure defaults for resource fields
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      minResources: prev.minResources || 1,
      minOverlapPercentage: prev.minOverlapPercentage ?? DEFAULT_MIN_OVERLAP,
    }))
  }, [])


  // Fetch categories and team members on mount
  useEffect(() => {
    fetchCategories()
    fetchTeamMembers()
  }, [])

  // Fetch services when category changes
  useEffect(() => {
    if (formData.category) {
      fetchServices(formData.category)
    } else {
      setServices([])
      setAreasOfWork([])
    }
  }, [formData.category])

  // Fetch areas of work when service changes
  useEffect(() => {
    if (formData.category && formData.service) {
      fetchAreasOfWork(formData.category, formData.service)
    } else {
      setAreasOfWork([])
    }
  }, [formData.service])

  // Monotonic ID that invalidates in-flight configuration lookups whenever the
  // service selection changes, so a superseded response can never win.
  const serviceConfigRequestIdRef = useRef(0)

  // Fetch serviceConfigurationId when the service selection changes
  useEffect(() => {
    if (formData.category && formData.service) {
      fetchServiceConfigurationId(formData.category, formData.service, formData.areaOfWork)
    } else {
      // Invalidate any in-flight lookup when the selection becomes incomplete.
      serviceConfigRequestIdRef.current += 1
    }
  }, [formData.category, formData.service, formData.areaOfWork])


  const fetchCategories = async () => {
    setLoadingCategories(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/categories`, {
        credentials: 'include'
      })
      if (response.ok) {
        const result = await response.json()
        setCategories(result.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error)
      toast.error(t('step1.toast.categoriesFailed'))
    } finally {
      setLoadingCategories(false)
    }
  }

  const fetchServices = async (category: string) => {
    setLoadingServices(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/services/${encodeURIComponent(category)}`, {
        credentials: 'include'
      })
      if (response.ok) {
        const result = await response.json()
        setServices(result.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch services:', error)
      toast.error(t('step1.toast.servicesFailed'))
    } finally {
      setLoadingServices(false)
    }
  }

  const fetchAreasOfWork = async (category: string, service: string) => {
    setLoadingAreas(true)
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/areas-of-work?category=${encodeURIComponent(category)}&service=${encodeURIComponent(service)}`,
        { credentials: 'include' }
      )
      if (response.ok) {
        const result = await response.json()
        setAreasOfWork(result.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch areas of work:', error)
    } finally {
      setLoadingAreas(false)
    }
  }

  const fetchServiceConfigurationId = async (category: string, service: string, areaOfWork?: string) => {
    const requestId = ++serviceConfigRequestIdRef.current
    setServiceConfigLoaded(false)
    setServiceConfig(null)
    // Never let pricing models from a previous configuration leak into the
    // current selection while a lookup is in flight.
    setPricingModels([])
    try {
      const params = new URLSearchParams({ category, service })
      if (areaOfWork) params.append('areaOfWork', areaOfWork)

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/service-configuration?${params}`,
        { credentials: 'include' }
      )
      if (!response.ok) return
      const result = await response.json()
      // Re-check after parsing: the selection may have changed while the
      // response body was downloading, so a superseded response must never
      // update state or satisfy the submit gate.
      if (requestId !== serviceConfigRequestIdRef.current) return

      // An empty object means the request completed and this service has no
      // optional configuration. A null value means loading failed or is
      // still in progress and must not satisfy the submit gate.
      const loadedConfig: Step1ServiceConfig = result.data || {}
      setServiceConfig(loadedConfig)
      setServiceConfigLoaded(true)
      const nextPricingModels = Array.isArray(loadedConfig.pricingModels)
        ? loadedConfig.pricingModels
        : []
      setPricingModels(nextPricingModels)

      // Always synchronize the configuration ID, including clearing it when
      // the response carries no configuration, and decide the resets against
      // the current state inside the updater: the closure value can be stale
      // by the time the response arrives.
      const nextConfigId: string | undefined = loadedConfig._id || undefined
      setFormData(prev => {
        const configChanged = prev.serviceConfigurationId !== nextConfigId
        // Keep the selected price model only when the new configuration
        // still offers it; otherwise a stale value would submit even though
        // the select shows no matching option.
        const priceModelCompatible = Boolean(
          !prev.priceModel || nextPricingModels.includes(prev.priceModel)
        )
        return {
          ...prev,
          serviceConfigurationId: nextConfigId,
          ...(configChanged ? { vatProfessionalAnswers: [] } : {}),
          ...(configChanged && !priceModelCompatible
            ? { priceModel: '', selectedPricingOption: undefined }
            : {}),
        }
      })
    } catch (error) {
      console.error('Failed to fetch service configuration ID:', error)
    }
  }

  const fetchTeamMembers = async () => {
    setLoadingTeamMembers(true)
    try {
      // Fetch employees and current user (professional) and merge
      const [empRes, meRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/list`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/me`, { credentials: 'include' })
      ])

      let members: TeamMember[] = []

      if (empRes.ok) {
        const result = await empRes.json()
        type EmployeeApi = {
          _id: string
          name: string
          email?: string
          hasEmail?: boolean
          isActive?: boolean
        }
        const employees: EmployeeApi[] = result?.data?.employees || []
        members = employees.map((m: EmployeeApi) => ({
          _id: m._id,
          name: m.name,
          email: m.email,
          hasEmail: typeof m.hasEmail === 'boolean' ? m.hasEmail : !!m.email,
          isActive: typeof m.isActive === 'boolean' ? m.isActive : true,
        }))
      }

      if (meRes.ok) {
        const me = await meRes.json()
        const user = me?.user
        if (user && user._id) {
          const selfMember: TeamMember = {
            _id: user._id,
            name: user.name,
            email: user.email,
            hasEmail: !!user.email,
            isActive: true,
          }
          // Put professional first and de-duplicate
          members = [selfMember, ...members.filter(m => m._id !== selfMember._id)]
        }
      }

      setTeamMembers(members)
    } catch (error) {
      console.error('Failed to fetch team members:', error)
    } finally {
      setLoadingTeamMembers(false)
    }
  }

  useEffect(() => {
    onChange(formData)
    validateForm()
  }, [formData, serviceConfig, serviceConfigLoaded, addressValid])

  // Keep selectedPricingOption in sync with priceModel & serviceConfig
  // (covers initial load, edit restore, and category/service changes)
  useEffect(() => {
    if (!serviceConfig?.pricingOptions || !formData.priceModel) return
    const matched = serviceConfig.pricingOptions.find(o => o.name === formData.priceModel)
    // Only update if it actually differs to avoid infinite loops
    if (matched !== formData.selectedPricingOption) {
      updateFormData({ selectedPricingOption: matched || undefined })
    }
  }, [formData.priceModel, serviceConfig?.pricingOptions])

  // Price model is left blank so the professional is obliged to choose

  useEffect(() => {
    const currentMin = formData.minResources ?? 1

    if (selectedResourceCount === 0) {
      if (formData.minResources !== undefined) {
        setFormData(prev => ({ ...prev, minResources: undefined }))
      }
      return
    }

    const clampedMinimum = Math.min(selectedResourceCount, Math.max(1, currentMin))
    if (clampedMinimum !== currentMin) {
      setFormData(prev => ({ ...prev, minResources: clampedMinimum }))
    }
  }, [formData.minResources, formData.resources, selectedResourceCount])

  const validateForm = () => {
    const errors = collectStep1ComponentErrors(formData, serviceConfig, addressValid, t)
    onValidate(errors.length === 0, {
      dataSignature: getStep1DataSignature(formData),
      addressValid,
      serviceConfig,
      serviceConfigLoaded,
    })
  }

  const showValidationErrors = () => {
    const errors = collectStep1ComponentErrors(formData, serviceConfig, addressValid, t)

    if (errors.length > 0) {
      toast.error(errors.join('. '));
    } else if (!serviceConfigLoaded) {
      toast.error(t('step1.toast.configLoading'))
    }
  }

  useImperativeHandle(ref, () => ({
    showValidationErrors
  }))

  const updateFormData = (updates: Partial<ProjectData>) => {
    setFormData(prev => ({ ...prev, ...updates }))
  }

  const professionalVatQuestions = serviceConfig?.vatManagement?.enabled
    ? serviceConfig.vatManagement.professionalVatQuestions || []
    : []

  const getProfessionalVatAnswer = (fieldName: string) =>
    formData.vatProfessionalAnswers?.find((answer) => answer.fieldName === fieldName)?.value

  const updateProfessionalVatAnswer = (fieldName: string, value: unknown) => {
    const answers = [...(formData.vatProfessionalAnswers || [])]
    const index = answers.findIndex((answer) => answer.fieldName === fieldName)
    const next = { fieldName, value }
    if (index >= 0) answers[index] = next
    else answers.push(next)
    updateFormData({ vatProfessionalAnswers: answers })
  }

  const updateDistance = (updates: Partial<{
    address: string
    useCompanyAddress: boolean
    maxKmRange?: number
    noBorders: boolean
    location?: { type: 'Point'; coordinates: [number, number] }
  }>) => {
    setFormData(prev => ({
      ...prev,
      distance: {
        address: prev.distance?.address || '',
        useCompanyAddress: prev.distance?.useCompanyAddress || false,
        maxKmRange: prev.distance?.maxKmRange,
        noBorders: prev.distance?.noBorders || false,
        location: prev.distance?.location,
        ...updates
      }
    }))
  }

  const mediaRef = useRef(formData.media || { images: [], videos: [] })
  mediaRef.current = formData.media || { images: [], videos: [] }
  const updateMedia = (updates: Partial<{ images: string[]; videos: string[] }> | ((media: { images: string[]; videos: string[] }) => Partial<{ images: string[]; videos: string[] }>)) => {
    const media = { images: mediaRef.current.images || [], videos: mediaRef.current.videos || [] }
    const next = { ...media, ...(typeof updates === 'function' ? updates(media) : updates) }
    mediaRef.current = next
    setFormData(prev => ({ ...prev, media: next }))
  }
  const readMediaFile = (file: File) => new Promise<string | null>(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = reader.onabort = () => { toast.error(t('step1.toast.mediaReadFailed')); resolve(null) }
    try { reader.readAsDataURL(file) } catch { toast.error(t('step1.toast.mediaReadFailed')); resolve(null) }
  })
  const imageQueueRef = useRef<ReturnType<typeof createProjectMediaQueue<File>> | null>(null)
  if (!imageQueueRef.current) imageQueueRef.current = createProjectMediaQueue(4, () => mediaRef.current.images?.length || 0, readMediaFile, values => updateMedia(media => ({ images: [...media.images, ...values] })))
  const videoQueueRef = useRef<ReturnType<typeof createProjectMediaQueue<File>> | null>(null)
  if (!videoQueueRef.current) videoQueueRef.current = createProjectMediaQueue(1, () => mediaRef.current.videos?.length || 0, readMediaFile, values => updateMedia(media => ({ videos: [...media.videos, ...values] })))

  const addKeyword = () => {
    const existing = formData.keywords || []
    const keywords = normalizeProjectKeywords(existing, keywordInput)
    if (keywords.length !== existing.length) updateFormData({ keywords })
    setKeywordInput('')
  }

  const removeKeyword = (keyword: string) => {
    updateFormData({
      keywords: formData.keywords?.filter(k => k !== keyword) || []
    })
  }


  const generateTitle = async () => {
    const service = formData.service?.trim()
    if (!service || !formData.description?.trim()) return
    const requestSignature = titleSignature
    setIsGeneratingTitle(true)
    setSuggestedTitles([])
    try {
      const result = await generateProjectCopy<{ titles: string[] }>(titleRequest)
      if (currentTitleSignatureRef.current !== requestSignature) return
      suggestedTitleSignatureRef.current = requestSignature
      setSuggestedTitles(result.titles)
      setSelectedTitleIndex(0)
    } catch (error) {
      if (currentTitleSignatureRef.current !== requestSignature) return
      if (error instanceof ProjectCopyApiError && error.code === 'AI_NOT_CONFIGURED') {
        suggestedTitleSignatureRef.current = requestSignature
        setSuggestedTitles([buildProjectTitleSuggestion({
          service,
          area: formData.areaOfWork,
          packageName: formData.selectedPricingOption?.name,
          keyword: formData.keywords?.[0],
          description: formData.description,
        })])
        setSelectedTitleIndex(0)
        toast.info(t('step1.projectTitle.localFallback'))
      } else {
        toast.error(t('step1.projectTitle.generateFailed'))
      }
    } finally {
      setIsGeneratingTitle(false)
    }
  }

  const useGeneratedTitle = () => {
    if (suggestedTitleSignatureRef.current !== currentTitleSignatureRef.current) {
      setSuggestedTitles([])
      return
    }
    updateFormData({ title: suggestedTitles[selectedTitleIndex] })
    setSuggestedTitles([])
  }

  const toggleTeamMember = (memberId: string) => {
    const currentResources = formData.resources || []
    if (currentResources.includes(memberId)) {
      updateFormData({ resources: currentResources.filter(id => id !== memberId) })
    } else {
      updateFormData({ resources: [...currentResources, memberId] })
    }
  }

  const toggleIntakeMember = (memberId: string) => {
    const current = formData.intakeMeeting?.resources || []
    const updatedResources = current.includes(memberId)
      ? current.filter(id => id !== memberId)
      : [...current, memberId]
    updateFormData({ intakeMeeting: { enabled: formData.intakeMeeting?.enabled ?? true, resources: updatedResources } })
  }

  const togglePlanningMember = (memberId: string) => {
    const current = formData.renovationPlanning?.resources || []
    const updatedResources = current.includes(memberId)
      ? current.filter(id => id !== memberId)
      : [...current, memberId]
    updateFormData({ renovationPlanning: { fixeraManaged: formData.renovationPlanning?.fixeraManaged ?? false, resources: updatedResources } })
  }

  const handleImageUpload = (files: FileList | File[] | null) => {
    if (!files) return

    const maxFiles = 4
    const maxSize = 5 * 1024 * 1024 // 5MB

    const validFiles = Array.from(files).filter(file => {
      if (file.size > maxSize) {
        toast.error(t('step1.toast.imageTooLarge', { file: file.name }))
        return false
      }

      if (!file.type.startsWith('image/')) {
        toast.error(t('step1.toast.notAnImage', { file: file.name }))
        return false
      }

      return true
    })
    imageQueueRef.current!(validFiles).then(accepted => {
      if (!accepted) toast.error(t('step1.toast.tooManyImages', { max: maxFiles, current: mediaRef.current.images?.length || 0, remaining: Math.max(0, maxFiles - (mediaRef.current.images?.length || 0)) }))
    })
  }

  const handleVideoUpload = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return

    const maxSize = 50 * 1024 * 1024 // 50MB
    const currentVideos = formData.media?.videos || []

    if (currentVideos.length >= 1) {
      toast.error(t('step1.toast.oneVideoOnly'))
      return
    }

    const file = files[0]
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo']

    if (!validTypes.includes(file.type)) {
      toast.error(t('step1.toast.videoFormat'))
      return
    }

    if (file.size > maxSize) {
      toast.error(t('step1.toast.videoTooLarge'))
      return
    }

    videoQueueRef.current!([file]).then(accepted => {
      if (!accepted) toast.error(t('step1.toast.oneVideoOnly'))
    })
  }

  return (
    <div className="space-y-6">
      {/* Service Selection - Single Service */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Star className="w-5 h-5" />
            <span>{t('step1.service.title')}</span>
          </CardTitle>
          <CardDescription>
            {t('step1.service.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className='space-y-2'>
              <Label htmlFor="category">{t('step1.service.categoryLabel')}</Label>
              <Select
                value={formData.category || ''}
                onValueChange={(value) => {
                  updateFormData({
                    category: value,
                    service: '',
                    areaOfWork: '',
                    priceModel: value.toLowerCase() === 'renovation' ? 'rfq' : '',
                    categories: [value],
                    services: []
                  })
                }}
                disabled={loadingCategories}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingCategories ? t('common.loading') : t('step1.service.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.filter(category => category && category.trim()).map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label htmlFor="service">{t('step1.service.serviceLabel')}</Label>
              <Select
                value={formData.service || ''}
                onValueChange={(value) => {
                  updateFormData({
                    service: value,
                    areaOfWork: '',
                    services: formData.category ? [{
                      category: formData.category,
                      service: value,
                      areaOfWork: ''
                    }] : []
                  })
                }}
                disabled={!formData.category || loadingServices}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingServices ? t('common.loading') : t('step1.service.selectService')} />
                </SelectTrigger>
                <SelectContent>
                  {services.filter(service => service && service.trim()).map(service => (
                    <SelectItem key={service} value={service}>
                      {service}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Only show Area of Work dropdown if areas are available */}
            {areasOfWork.length > 0 && (
              <div className='space-y-2'>
                <Label htmlFor="areaOfWork">
                  {serviceConfig?.areaOfWorkRequired ? t('step1.service.areaRequiredLabel') : t('step1.service.areaOptionalLabel')}
                </Label>
                <Select
                  value={formData.areaOfWork || ''}
                  onValueChange={(value) => {
                    updateFormData({
                      areaOfWork: value,
                      services: formData.category && formData.service ? [{
                        category: formData.category,
                        service: formData.service,
                        areaOfWork: value
                      }] : []
                    })
                  }}
                  disabled={!formData.service || loadingAreas}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingAreas ? t('common.loading') : t('step1.service.selectArea')} />
                  </SelectTrigger>
                  <SelectContent>
                    {areasOfWork.filter(area => area && area.trim()).map(area => (
                      <SelectItem key={area} value={area}>
                        {area}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Display selected service */}
          {formData.category && formData.service && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <Badge className="bg-green-500">{t('step1.service.selected')}</Badge>
                <div>
                  <div className="font-medium">{formData.service}</div>
                  <div className="text-sm text-gray-600">
                    <span className="font-semibold">{t('step1.service.categoryInline')}</span> {formData.category}
                    {formData.areaOfWork && (
                      <span className="ml-3">
                        <span className="font-semibold">{t('step1.service.areaInline')}</span> {formData.areaOfWork}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Distance & Location */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MapPin className="w-5 h-5" />
            <span>{t('step1.area.title')}</span>
          </CardTitle>
          <CardDescription>
            {t('step1.area.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2 mb-4">
            <Checkbox
              id="useCompanyAddress"
              checked={formData.distance?.useCompanyAddress || false}
              onCheckedChange={(checked) => updateDistance({ useCompanyAddress: checked as boolean })}
            />
            <Label htmlFor="useCompanyAddress" className="cursor-pointer">
              {t('step1.area.useCompanyAddress')}
            </Label>
          </div>

          <AddressAutocomplete
            value={formData.distance?.address || ''}
            onChange={(address, place?: PlaceData) => {
              if (place?.coordinates) {
                updateDistance({
                  address,
                  location: {
                    type: 'Point',
                    coordinates: [place.coordinates.lng, place.coordinates.lat],
                  },
                })
              } else {
                updateDistance({ address, location: undefined })
              }
            }}
            onValidation={setAddressValid}
            useCompanyAddress={formData.distance?.useCompanyAddress || false}
            companyAddress={companyAddress}
            label={t('address.defaultLabel')}
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className='space-y-2'>
              <Label htmlFor="maxKmRange">{t('step1.area.maxRangeLabel')}</Label>
              <Input
                id="maxKmRange"
                type="number"
                min="1"
                max="200"
                value={formData.distance?.maxKmRange ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const parsed = parseInt(val, 10);
                  updateDistance({
                    maxKmRange: val === '' || Number.isNaN(parsed) ? undefined : parsed
                  });
                }}
                placeholder="50"
              />
            </div>

            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="noBorders"
                checked={formData.distance?.noBorders || false}
                onCheckedChange={(checked) => updateDistance({ noBorders: checked as boolean })}
              />
              <Label htmlFor="noBorders">{t('step1.area.noBorders')}</Label>

            </div>
          </div>
        </CardContent>
      </Card>

      {/* Certification Manager - Always visible but optional */}
      <CertificationManager
        certifications={formData.certifications || []}
        onChange={(certs) => updateFormData({ certifications: certs })}
        required={!!(serviceConfig?.requiredCertifications && serviceConfig.requiredCertifications.length > 0) || !!serviceConfig?.certificationRequired}
        requiredTypes={serviceConfig?.requiredCertifications || []}
        projectId={formData._id}
      />

      {professionalVatQuestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('step1.vat.title')}</CardTitle>
            <CardDescription>
              {t('step1.vat.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {professionalVatQuestions.map((question) => {
              const value = getProfessionalVatAnswer(question.fieldName)
              return (
                <div key={question.fieldName} className="space-y-2">
                  <Label htmlFor={`pvat-${question.fieldName}`}>
                    {question.question}
                    {question.isRequired !== false && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  {question.answerType === 'number' && (
                    <div className="flex gap-2">
                      <Input
                        id={`pvat-${question.fieldName}`}
                        type="text"
                        inputMode="decimal"
                        value={typeof value === 'number' || typeof value === 'string' ? value : ''}
                        onChange={(e) => updateProfessionalVatAnswer(question.fieldName, e.target.value)}
                      />
                      {question.unit && (
                        <span className="flex items-center rounded-md border bg-gray-50 px-3 text-sm text-gray-600">
                          {question.unit}
                        </span>
                      )}
                    </div>
                  )}
                  {question.answerType === 'yes_no' && (
                    <RadioGroup
                      value={value === true ? 'yes' : value === false ? 'no' : ''}
                      onValueChange={(next) => updateProfessionalVatAnswer(question.fieldName, next === 'yes')}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id={`pvat-${question.fieldName}-yes`} />
                        <Label htmlFor={`pvat-${question.fieldName}-yes`} className="font-normal">{t('common.yes')}</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id={`pvat-${question.fieldName}-no`} />
                        <Label htmlFor={`pvat-${question.fieldName}-no`} className="font-normal">{t('common.no')}</Label>
                      </div>
                    </RadioGroup>
                  )}
                  {question.answerType === 'checkboxes' && (
                    <div className="space-y-2">
                      {(question.options || []).map((option) => {
                        const selected = Array.isArray(value) && value.includes(option)
                        return (
                          <label key={option} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => {
                                const current = Array.isArray(value) ? value : []
                                updateProfessionalVatAnswer(
                                  question.fieldName,
                                  checked ? [...current, option] : current.filter((entry) => entry !== option)
                                )
                              }}
                            />
                            {option}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Execution Resources - Shown for all services except Renovation */}
      {formData.category?.toLowerCase() !== 'renovation' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <span>{t('step1.execution.title')}</span>
            </CardTitle>
            <CardDescription>
              {t('step1.execution.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTeamMembers ? (
              <p className="text-gray-500">{t('step1.execution.loading')}</p>
            ) : teamMembers.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">{t('step1.execution.emptyTitle')}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {t('step1.execution.emptyDescription')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-3">
                  {t('step1.execution.selectedCount', { count: formData.resources?.length || 0 })}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {teamMembers.map((member) => (
                    <div
                      key={member._id}
                      className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-all ${formData.resources?.includes(member._id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                        }`}
                      onClick={() => toggleTeamMember(member._id)}
                    >
                      <Checkbox
                        checked={formData.resources?.includes(member._id) || false}
                        onCheckedChange={() => toggleTeamMember(member._id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{member.name}</p>
                        {member.hasEmail && member.email && (
                          <p className="text-sm text-gray-500">{member.email}</p>
                        )}
                        {!member.hasEmail && (
                          <Badge variant="secondary" className="text-xs mt-1">{t('step1.execution.managedByCompany')}</Badge>
                        )}
                        {formData.category && (
                          <div className="mt-1">
                            <Badge variant="outline" className="text-[10px]">{t('step1.execution.categoryBadge', { category: formData.category })}</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Renovation-specific: Intake Meeting & Renovation Planning */}
      {formData.category?.toLowerCase() === 'renovation' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="w-5 h-5" />
                <span>{t('step1.intake.title')}</span>
              </CardTitle>
              <CardDescription>
                {t('step1.intake.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-1">
                  {t('step1.intake.assignedCount', { count: formData.intakeMeeting?.resources?.length || 0 })}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {teamMembers.map((member) => (
                    <div
                      key={member._id}
                      className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-all ${(formData.intakeMeeting?.resources || []).includes(member._id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                        }`}
                      onClick={() => toggleIntakeMember(member._id)}
                    >
                      <Checkbox
                        checked={(formData.intakeMeeting?.resources || []).includes(member._id)}
                        onCheckedChange={() => toggleIntakeMember(member._id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{member.name}</p>
                        {member.hasEmail && member.email && (
                          <p className="text-sm text-gray-500">{member.email}</p>
                        )}
                        {!member.hasEmail && (
                          <Badge variant="secondary" className="text-xs mt-1">{t('step1.execution.managedByCompany')}</Badge>
                        )}
                        {formData.category && (
                          <div className="mt-1">
                            <Badge variant="outline" className="text-[10px]">{t('step1.execution.categoryBadge', { category: formData.category })}</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="w-5 h-5" />
                <span>{t('step1.planning.title')}</span>
              </CardTitle>
              <CardDescription>
                {t('step1.planning.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="planningManaged"
                  checked={formData.renovationPlanning?.fixeraManaged ?? false}
                  onCheckedChange={(checked) => updateFormData({ renovationPlanning: { fixeraManaged: checked as boolean, resources: formData.renovationPlanning?.resources || [] } })}
                />
                <Label htmlFor="planningManaged" className="cursor-pointer">{t('step1.planning.managed')}</Label>
              </div>

              {(formData.renovationPlanning?.fixeraManaged) && (
                <div className="space-y-6">
                  {/* Planning Team Selection */}
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900">{t('step1.planning.teamTitle')}</h4>
                    <p className="text-sm text-gray-600 mb-1">
                      {t('step1.planning.assignedCount', { count: formData.renovationPlanning?.resources.length || 0 })}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {teamMembers.map((member) => (
                        <div
                          key={member._id}
                          className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-all ${(formData.renovationPlanning?.resources || []).includes(member._id)
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                            }`}
                          onClick={() => togglePlanningMember(member._id)}
                        >
                          <Checkbox
                            checked={(formData.renovationPlanning?.resources || []).includes(member._id)}
                            onCheckedChange={() => togglePlanningMember(member._id)}
                          />
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{member.name}</p>
                            {member.hasEmail && member.email && (
                              <p className="text-sm text-gray-500">{member.email}</p>
                            )}
                            {!member.hasEmail && (
                              <Badge variant="secondary" className="text-xs mt-1">{t('step1.execution.managedByCompany')}</Badge>
                            )}
                            {formData.category && (
                              <div className="mt-1">
                                <Badge variant="outline" className="text-[10px]">{t('step1.execution.categoryBadge', { category: formData.category })}</Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Execution Team Selection for Renovation with Planning */}
                  <div className="space-y-3 border-t pt-4">
                    <h4 className="font-medium text-gray-900">{t('step1.planning.executionTeam')}</h4>
                    <p className="text-sm text-gray-600 mb-1">
                      {t('step1.planning.executionAssignedCount', { count: formData.resources?.length || 0 })}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {teamMembers.map((member) => (
                        <div
                          key={member._id}
                          className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-all ${formData.resources?.includes(member._id)
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-200 hover:border-gray-300'
                            }`}
                          onClick={() => toggleTeamMember(member._id)}
                        >
                          <Checkbox
                            checked={formData.resources?.includes(member._id) || false}
                            onCheckedChange={() => toggleTeamMember(member._id)}
                          />
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{member.name}</p>
                            {member.hasEmail && member.email && (
                              <p className="text-sm text-gray-500">{member.email}</p>
                            )}
                            {!member.hasEmail && (
                              <Badge variant="secondary" className="text-xs mt-1">{t('step1.execution.managedByCompany')}</Badge>
                            )}
                            {formData.category && (
                              <div className="mt-1">
                                <Badge variant="outline" className="text-[10px]">{t('step1.execution.categoryBadge', { category: formData.category })}</Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Resource Planning - Shown AFTER team member selection */}
      <Card>
        <CardHeader>
          <CardTitle>{t('step1.resources.title')}</CardTitle>
          <CardDescription>
            {t('step1.resources.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('step1.resources.minLabel')}</Label>
              <Input
                type="number"
                min={selectedResourceCount === 0 ? 0 : 1}
                max={selectedResourceCount === 0 ? undefined : selectedResourceCount}
                value={selectedResourceCount === 0 ? 0 : (formData.minResources ?? 1)}
                disabled={selectedResourceCount === 0}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  if (Number.isNaN(value) || selectedResourceCount === 0) return
                  const clamped = Math.min(selectedResourceCount, Math.max(1, value))
                  updateFormData({
                    minResources: clamped
                  })
                }}
              />
              <p className="text-xs text-gray-500">
                {selectedResourceCount === 0
                  ? t('step1.resources.selectMembersHint')
                  : t('step1.resources.cannotExceed', { count: selectedResourceCount })}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t('step1.resources.overlapLabel')}</Label>
              <Input
                type="number"
                min={10}
                max={100}
                value={formData.minOverlapPercentage ?? DEFAULT_MIN_OVERLAP}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  const clamped = Math.min(100, Math.max(10, isNaN(value) ? DEFAULT_MIN_OVERLAP : value))
                  updateFormData({ minOverlapPercentage: clamped })
                }}
                disabled={(formData.minResources ?? 1) <= 1}
              />
              <p className="text-xs text-gray-500">
                {(formData.minResources ?? 1) <= 1
                  ? t('step1.resources.overlapUnavailable')
                  : t('step1.resources.overlapHint')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Description & Pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="w-5 h-5" />
            <span>{t('step1.details.title')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className='space-y-2'>
            <Label htmlFor="description">{t('step1.details.descriptionLabel')}</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => updateFormData({ description: e.target.value })}
              placeholder={t('step1.details.descriptionPlaceholder')}
              className="min-h-[120px]"
              maxLength={1300}
            />
            <p className="text-sm text-gray-500 mt-1">
              {t('step1.details.descriptionCounter', { count: formData.description?.length || 0 })}
            </p>
          </div>

          {!isRenovationCategory && (
            <div className='space-y-2'>
              <Label htmlFor="priceModel">{t('step1.details.priceModelLabel')}</Label>
              <Select
                value={formData.priceModel || ''}
                onValueChange={(value) => {
                  // Find the matching structured pricing option
                  const pricingOption = serviceConfig?.pricingOptions?.find(o => o.name === value)
                  updateFormData({
                    priceModel: value,
                    selectedPricingOption: pricingOption || undefined
                  })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('step1.details.priceModelPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {pricingModels.length > 0 ? (
                    pricingModels.filter(model => model && model.trim()).map(model => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none-available" disabled>
                      {t('step1.details.noPricingModels')}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Keywords */}
      <Card>
        <CardHeader>
          <CardTitle>{t('step1.keywords.title')}</CardTitle>
          <CardDescription>
            {t('step1.keywords.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder={t('step1.keywords.placeholder')}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
            />
            <Button type="button" onClick={addKeyword} variant="outline">{t('common.add')}</Button>
          </div>

          {formData.keywords && formData.keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.keywords.map(keyword => (
                <Badge key={keyword} variant="secondary" className="flex items-center space-x-1">
                  <span>{keyword}</span>
                  <button type="button" aria-label={t('step1.keywords.remove', { keyword })} onClick={() => removeKeyword(keyword)} className="rounded-full p-1 hover:text-red-500"><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Title Generation */}
      <Card>
        <CardHeader>
          <CardTitle>{t('step1.projectTitle.cardTitle')}</CardTitle>
          <CardDescription>
            {t('step1.projectTitle.cardDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Button onClick={generateTitle} variant="outline" disabled={!formData.service || !formData.description || isGeneratingTitle}>
              {isGeneratingTitle ? t('step1.projectTitle.generating') : t('step1.projectTitle.generate')}
            </Button>
            {suggestedTitles.length > 0 && (
              <Button onClick={useGeneratedTitle} variant="outline">
                {t('step1.projectTitle.useGenerated')}
              </Button>
            )}
          </div>

          {suggestedTitles.length > 0 && (
            <div className="space-y-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900">{t('step1.projectTitle.suggested')}</p>
              {suggestedTitles.map((title, index) => (
                <button key={`${title}-${index}`} type="button" aria-pressed={selectedTitleIndex === index} onClick={() => setSelectedTitleIndex(index)} className={`block w-full rounded border p-2 text-left text-blue-800 ${selectedTitleIndex === index ? 'border-blue-600 bg-white' : 'border-transparent'}`}>
                  {title}
                </button>
              ))}
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor="title">{t('step1.projectTitle.label')}</Label>
            <Input
              id="title"
              value={formData.title || ''}
              onChange={(e) => updateFormData({ title: e.target.value })}
              placeholder={t('step1.projectTitle.placeholder')}
              minLength={30}
              maxLength={90}
            />
            <p className="text-sm text-gray-500 mt-1">
              {t('step1.projectTitle.counter', { count: formData.title?.length || 0 })}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Media Upload - Images */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="w-5 h-5" />
            <span>{t('step1.images.title')}</span>
          </CardTitle>
          <CardDescription>
            {t('step1.images.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleImageUpload(Array.from(e.dataTransfer.files)) }}>
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">{t('step1.images.dropzone')}</p>
            <p className="text-sm text-gray-500 mt-2">{t('step1.images.hint')}</p>
            <p className="text-xs text-gray-500 mt-1">{t('step1.images.guide')}</p>
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              id="image-upload"
              onChange={(e) => handleImageUpload(e.target.files)}
            />
            <Button
              variant="outline"
              className="mt-4"
              type="button" onClick={() => document.getElementById('image-upload')?.click()}
            >
              {t('step1.images.choose')}
            </Button>
          </div>

          {formData.media?.images && formData.media.images.length > 0 && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {formData.media.images.map((image, index) => (
                <div key={index} className="relative">
                  <img src={image} alt={t('step1.images.alt', { index: index + 1 })} className="w-full h-24 object-cover rounded" />
                  {index === 0 && <span className="absolute bottom-1 left-1 rounded bg-white px-2 py-1 text-xs">{t('step1.images.mainImage')}</span>}
                  <div className="absolute top-1 left-1 flex gap-1">
                    {index > 0 && <Button type="button" size="sm" variant="secondary" onClick={() => { const images = [...(formData.media?.images || [])]; [images[index - 1], images[index]] = [images[index], images[index - 1]]; updateMedia({ images }) }} aria-label={t('step1.images.moveEarlier', { index: index + 1 })}>←</Button>}
                    {index < (formData.media?.images.length || 0) - 1 && <Button type="button" size="sm" variant="secondary" onClick={() => { const images = [...(formData.media?.images || [])]; [images[index], images[index + 1]] = [images[index + 1], images[index]]; updateMedia({ images }) }} aria-label={t('step1.images.moveLater', { index: index + 1 })}>→</Button>}
                    {index > 0 && <Button type="button" size="sm" variant="secondary" onClick={() => { const images = [...(formData.media?.images || [])]; images.unshift(...images.splice(index, 1)); updateMedia({ images }) }}>{t('step1.images.setMain')}</Button>}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1 w-6 h-6 p-0"
                    type="button" onClick={() => {
                      const newImages = formData.media?.images?.filter((_, i) => i !== index) || []
                      updateMedia({ images: newImages })
                    }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Media Upload - Videos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="w-5 h-5" />
            <span>{t('step1.video.title')}</span>
          </CardTitle>
          <CardDescription>
            {t('step1.video.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleVideoUpload(Array.from(e.dataTransfer.files)) }}>
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">{t('step1.video.dropzone')}</p>
            <p className="text-sm text-gray-500 mt-2">{t('step1.video.hint')}</p>
            <p className="text-xs text-gray-500 mt-1">{t('step1.video.guide')}</p>
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/x-msvideo"
              className="hidden"
              id="video-upload"
              onChange={(e) => handleVideoUpload(e.target.files)}
            />
            <Button
              variant="outline"
              className="mt-4"
              type="button" onClick={() => document.getElementById('video-upload')?.click()}
              disabled={formData.media?.videos && formData.media.videos.length >= 1}
            >
              {t('step1.video.choose')}
            </Button>
          </div>

          {formData.media?.videos && formData.media.videos.length > 0 && (
            <div className="mt-4">
              {formData.media.videos.map((video, index) => (
                <div key={index} className="relative">
                  <video src={video} controls className="w-full max-h-64 rounded" />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1"
                    type="button" onClick={() => {
                      updateMedia({ videos: [] })
                    }}
                  >
                    <X className="w-4 h-4 mr-1" />
                    {t('step1.video.remove')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
})

Step1BasicInfo.displayName = 'Step1BasicInfo'

export default Step1BasicInfo
