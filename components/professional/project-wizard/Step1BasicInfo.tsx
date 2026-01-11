'use client'

import { useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Upload, X, MapPin, FileText, Star, Users } from "lucide-react"
import { toast } from 'sonner'
import AddressAutocomplete, { type PlaceData } from "./AddressAutocomplete"
import CertificationManager from "./CertificationManager"
import { useAuth } from "@/contexts/AuthContext"

interface IServiceSelection {
  category: string
  service: string
  areaOfWork?: string
}

interface ProjectData {
  _id?: string
  category?: string
  service?: string
  areaOfWork?: string
  timeMode?: 'hours' | 'days'
  categories?: string[]
  services?: IServiceSelection[]
  distance?: {
    address: string
    useCompanyAddress: boolean
    maxKmRange: number
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
    fixeraManaged: boolean
    resources: string[]
  }
  projectType?: string[]
  description?: string
  priceModel?: string
  keywords?: string[]
  title?: string
  media?: {
    images: string[]
    videos: string[]
  }
  serviceConfigurationId?: string
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
  onValidate: (isValid: boolean) => void
}

export interface Step1Ref {
  showValidationErrors: () => void
}

const Step1BasicInfo = forwardRef<Step1Ref, Step1Props>(({ data, onChange, onValidate }, ref) => {
  const [formData, setFormData] = useState<ProjectData>(data)
  const [keywordInput, setKeywordInput] = useState('')
  const [suggestedTitle, setSuggestedTitle] = useState('')
  const [addressValid, setAddressValid] = useState(false)
  const { user } = useAuth()
  const [serviceConfig, setServiceConfig] = useState<{
    pricingModel?: string;
    certificationRequired?: boolean;
    requiredCertifications?: string[];
    projectTypes?: string[];
    areaOfWorkRequired?: boolean;
  } | null>(null)
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
      minResources: prev.minResources || 1,
      minOverlapPercentage: prev.minOverlapPercentage ?? 90,
      ...prev
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

  // Fetch serviceConfigurationId when service or area changes
  useEffect(() => {
    if (formData.category && formData.service) {
      fetchServiceConfigurationId(formData.category, formData.service, formData.areaOfWork)
    }
  }, [formData.service, formData.areaOfWork])


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
      toast.error('Failed to load categories')
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
      toast.error('Failed to load services')
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
    try {
      const params = new URLSearchParams({ category, service })
      if (areaOfWork) params.append('areaOfWork', areaOfWork)

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/service-configuration?${params}`,
        { credentials: 'include' }
      )
      if (response.ok) {
        const result = await response.json()
        if (result.data) {
          // Store the full config
          setServiceConfig(result.data)

          // Extract pricing models
          if (result.data.pricingModels && Array.isArray(result.data.pricingModels)) {
            setPricingModels(result.data.pricingModels)
          }

          // Update form data with service configuration ID
          if (result.data._id) {
            updateFormData({ serviceConfigurationId: result.data._id })
          }
        }
      }
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
  }, [formData, serviceConfig])

  // Ensure a priceModel is auto-selected for non-renovation when pricing models load
  useEffect(() => {
    const isRenovation = (formData.category || '').toLowerCase() === 'renovation'
    if (!isRenovation && !formData.priceModel && pricingModels.length > 0) {
      updateFormData({ priceModel: pricingModels[0] })
    }
  }, [pricingModels])

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
    // Check if area of work is required and missing
    const isAreaOfWorkValid = !serviceConfig?.areaOfWorkRequired ||
      (serviceConfig?.areaOfWorkRequired && formData.areaOfWork)

    // Check certifications when required by service configuration
    const requiredTypes = serviceConfig?.requiredCertifications || []
    const hasRequiredTypes = requiredTypes.length === 0 || (
      Array.isArray(formData.certifications) &&
      requiredTypes.every(t => formData.certifications!.some(c => c.name === t && !!c.fileUrl))
    )
    // Backward compatibility: if only boolean is provided, keep previous behavior
    const isCertificationsValid = hasRequiredTypes && (
      requiredTypes.length > 0 || !serviceConfig?.certificationRequired || (
        Array.isArray(formData.certifications) && formData.certifications.length > 0 &&
        formData.certifications.every(c => !!c.fileUrl)
      )
    )

    // Resources requirement per service/category
    const isRenovation = (formData.category || '').toLowerCase() === 'renovation'
    const hasExecutionResources = Array.isArray(formData.resources) && formData.resources.length > 0
    const hasIntakeResources = Array.isArray(formData.intakeMeeting?.resources) && (formData.intakeMeeting?.resources.length || 0) > 0
    const isResourcesValid = isRenovation
      ? (hasIntakeResources && hasExecutionResources)
      : hasExecutionResources

    const isValid = !!(
      formData.category &&
      formData.service &&
      isAreaOfWorkValid &&
      isCertificationsValid &&
      isResourcesValid &&
      formData.description &&
      formData.description.length >= 100 &&
      formData.title &&
      formData.title.length >= 30 &&
      (isRenovationCategory || (!!formData.priceModel)) &&
      formData.distance?.address &&
      addressValid &&
      formData.distance?.maxKmRange
    )
    onValidate(isValid)
  }

  const showValidationErrors = () => {
    const errors: string[] = []

    if (!formData.category) errors.push('Category is required')
    if (!formData.service) errors.push('Service is required')
    // Title validation
    if (!formData.title) {
      errors.push('Title is required')
    } else if (formData.title.length < 30) {
      errors.push('Title must be at least 30 characters long')
    }

    // Check area of work requirement
    if (serviceConfig?.areaOfWorkRequired && !formData.areaOfWork) {
      errors.push('Area of Work is required for this service')
    }

    // Check certifications requirement
    const requiredTypes = serviceConfig?.requiredCertifications || []
    if (requiredTypes.length > 0) {
      const missing = requiredTypes.filter(t => !formData.certifications?.some(c => c.name === t && !!c.fileUrl))
      if (missing.length > 0) {
        errors.push(`Missing required certifications: ${missing.join(', ')}`)
      }
    } else if (serviceConfig?.certificationRequired) {
      const hasValidCert = Array.isArray(formData.certifications) && formData.certifications.length > 0 &&
        formData.certifications.every(c => !!c.fileUrl)
      if (!hasValidCert) {
        errors.push('At least one valid certification is required for this service')
      }
    }

    // Check resources per category
    const isRenovation = (formData.category || '').toLowerCase() === 'renovation'
    if (isRenovation) {
      const hasIntake = Array.isArray(formData.intakeMeeting?.resources) && (formData.intakeMeeting?.resources.length || 0) > 0
      if (!hasIntake) {
        errors.push('At least one intake meeting resource is required for Renovation')
      }
      const hasExecutionExec = Array.isArray(formData.resources) && (formData.resources.length || 0) > 0
      if (!hasExecutionExec) {
        errors.push('At least one execution resource is required for Renovation')
      }
    } else {
      const hasExec = Array.isArray(formData.resources) && (formData.resources.length || 0) > 0
      if (!hasExec) {
        errors.push('At least one team member must be assigned for execution')
      }
    }

    if (!formData.description) {
      errors.push('Description is required')
    } else if (formData.description.length < 100) {
      errors.push(`Description must be at least 100 characters (currently ${formData.description.length})`)
    }
    if (!isRenovationCategory && !formData.priceModel) errors.push('Price Model is required')
    if (!formData.distance?.address) errors.push('Service Address is required')
    if (!addressValid) errors.push('Please enter a valid address')
    if (!formData.distance?.maxKmRange) errors.push('Maximum Service Range is required')

    if (errors.length > 0) {
      errors.forEach(error => toast.error(error))
    }
  }

  useImperativeHandle(ref, () => ({
    showValidationErrors
  }))

  const updateFormData = (updates: Partial<ProjectData>) => {
    setFormData(prev => ({ ...prev, ...updates }))
  }

  const updateDistance = (updates: Partial<{
    address: string
    useCompanyAddress: boolean
    maxKmRange: number
    noBorders: boolean
    location?: { type: 'Point'; coordinates: [number, number] }
  }>) => {
    setFormData(prev => ({
      ...prev,
      distance: {
        address: prev.distance?.address || '',
        useCompanyAddress: prev.distance?.useCompanyAddress || false,
        maxKmRange: prev.distance?.maxKmRange || 50,
        noBorders: prev.distance?.noBorders || false,
        location: prev.distance?.location,
        ...updates
      }
    }))
  }

  const updateMedia = (updates: Partial<{ images: string[]; videos: string[] }>) => {
    setFormData(prev => ({
      ...prev,
      media: {
        images: prev.media?.images || [],
        videos: prev.media?.videos || [],
        ...updates
      }
    }))
  }

  const addKeyword = () => {
    if (keywordInput.trim() && !formData.keywords?.includes(keywordInput.trim())) {
      updateFormData({
        keywords: [...(formData.keywords || []), keywordInput.trim()]
      })
      setKeywordInput('')
    }
  }

  const removeKeyword = (keyword: string) => {
    updateFormData({
      keywords: formData.keywords?.filter(k => k !== keyword) || []
    })
  }


  const generateTitle = async () => {
    if (!formData.service || !formData.description) return

    try {
      const serviceTitle = formData.service.charAt(0).toUpperCase() + formData.service.slice(1)
      const keywords = formData.keywords?.join(', ') || ''

      const titleVariations = [
        `Expert ${serviceTitle} Services - ${formData.areaOfWork || 'Professional Solutions'}`,
        `Quality ${serviceTitle} - ${keywords ? keywords.split(',')[0] : 'Reliable'} & Professional`,
        `Professional ${serviceTitle} - Quality Work You Can Trust`,
        `${serviceTitle} Expert - ${formData.distance?.maxKmRange}km Range - Quality Guaranteed`
      ]

      let bestTitle = titleVariations[0]

      if (keywords) {
        bestTitle = titleVariations[1]
      }

      if (bestTitle.length > 90) {
        bestTitle = bestTitle.substring(0, 87) + '...'
      }

      if (bestTitle.length < 30) {
        bestTitle = `Professional ${serviceTitle} Services - Quality Work in ${formData.distance?.address || 'Your Area'}`
      }

      setSuggestedTitle(bestTitle)
    } catch (error) {
      console.error('Title generation error:', error)
      const serviceTitle = formData.service.charAt(0).toUpperCase() + formData.service.slice(1)
      setSuggestedTitle(`Professional ${serviceTitle} Services - Quality Work You Can Trust`)
    }
  }

  const useGeneratedTitle = () => {
    updateFormData({ title: suggestedTitle })
    setSuggestedTitle('')
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

  const handleImageUpload = (files: FileList | null) => {
    if (!files) return

    const maxFiles = 4
    const maxSize = 5 * 1024 * 1024 // 5MB
    const currentImages = formData.media?.images || []

    if (currentImages.length + files.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} images allowed. You currently have ${currentImages.length} images. You can select ${maxFiles - currentImages.length} more.`)
      return
    }

    const validFiles = Array.from(files).filter(file => {
      if (file.size > maxSize) {
        toast.error(`File ${file.name} is too large. Maximum size is 5MB`)
        return false
      }

      if (!file.type.startsWith('image/')) {
        toast.error(`File ${file.name} is not an image`)
        return false
      }

      return true
    })

    const newImages: string[] = []
    let processedCount = 0

    validFiles.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result) {
          newImages.push(e.target.result as string)
          processedCount++

          if (processedCount === validFiles.length) {
            updateMedia({ images: [...currentImages, ...newImages] })
          }
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const handleVideoUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return

    const maxSize = 50 * 1024 * 1024 // 50MB
    const currentVideos = formData.media?.videos || []

    if (currentVideos.length >= 1) {
      toast.error('Maximum 1 video allowed')
      return
    }

    const file = files[0]
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo']

    if (!validTypes.includes(file.type)) {
      toast.error('Only MP4, MOV, and AVI video formats are allowed')
      return
    }

    if (file.size > maxSize) {
      toast.error('Video file is too large. Maximum size is 50MB')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      if (e.target?.result) {
        updateMedia({ videos: [e.target.result as string] })
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-6">
      {/* Service Selection - Single Service */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Star className="w-5 h-5" />
            <span>Service Information</span>
          </CardTitle>
          <CardDescription>
            Select one service category you want to offer
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className='space-y-2'>
              <Label htmlFor="category">Category *</Label>
              <Select
                value={formData.category || ''}
                onValueChange={(value) => {
                  updateFormData({
                    category: value,
                    service: '',
                    areaOfWork: '',
                    priceModel: value.toLowerCase() === 'renovation' ? 'rfq' : (formData.priceModel || ''),
                    categories: [value],
                    services: []
                  })
                }}
                disabled={loadingCategories}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingCategories ? "Loading..." : "Select category"} />
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
              <Label htmlFor="service">Service *</Label>
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
                  <SelectValue placeholder={loadingServices ? "Loading..." : "Select service"} />
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
                  Area of Work {serviceConfig?.areaOfWorkRequired ? '*' : '(Optional)'}
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
                    <SelectValue placeholder={loadingAreas ? "Loading..." : "Select area"} />
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
                <Badge className="bg-green-500">Selected</Badge>
                <div>
                  <div className="font-medium">{formData.service}</div>
                  <div className="text-sm text-gray-600">
                    <span className="font-semibold">Category:</span> {formData.category}
                    {formData.areaOfWork && (
                      <span className="ml-3">
                        <span className="font-semibold">Area:</span> {formData.areaOfWork}
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
            <span>Service Area</span>
          </CardTitle>
          <CardDescription>
            Define where you provide this service
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
              Use company address
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
            label="Service Address"
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className='space-y-2'>
              <Label htmlFor="maxKmRange">Maximum Range (km) *</Label>
              <Input
                id="maxKmRange"
                type="number"
                min="1"
                max="200"
                value={formData.distance?.maxKmRange || ''}
                onChange={(e) => updateDistance({ maxKmRange: parseInt(e.target.value) })}
                placeholder="50"
              />
            </div>

            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="noBorders"
                checked={formData.distance?.noBorders || false}
                onCheckedChange={(checked) => updateDistance({ noBorders: checked as boolean })}
              />
              <Label htmlFor="noBorders">Don&apos;t cross country borders</Label>
              
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

      {/* Execution Resources - Shown for all services except Renovation */}
      {formData.category?.toLowerCase() !== 'renovation' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <span>Assign Execution Team Members</span>
            </CardTitle>
            <CardDescription>
              Select team members who will execute this project
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTeamMembers ? (
              <p className="text-gray-500">Loading team members...</p>
            ) : teamMembers.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">No team members available</p>
                <p className="text-sm text-gray-500 mt-1">
                  You haven&apos;t invited any team members yet. Go to Team Management to invite team members.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-3">
                  {formData.resources?.length || 0} team member(s) selected
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
                          <Badge variant="secondary" className="text-xs mt-1">Managed by Company</Badge>
                        )}
                        {formData.category && (
                          <div className="mt-1">
                            <Badge variant="outline" className="text-[10px]">Category: {formData.category}</Badge>
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
                <span>Intake Meeting</span>
              </CardTitle>
              <CardDescription>
                Select team members who will do the intake meeting
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-1">
                  {formData.intakeMeeting?.resources?.length || 0} team member(s) assigned to intake
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
                          <Badge variant="secondary" className="text-xs mt-1">Managed by Company</Badge>
                        )}
                        {formData.category && (
                          <div className="mt-1">
                            <Badge variant="outline" className="text-[10px]">Category: {formData.category}</Badge>
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
                <span>Renovation Planning</span>
              </CardTitle>
              <CardDescription>
                Choose if planning is Fixera-managed and assign team members
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="planningManaged"
                  checked={formData.renovationPlanning?.fixeraManaged || false}
                  onCheckedChange={(checked) => updateFormData({ renovationPlanning: { fixeraManaged: checked as boolean, resources: formData.renovationPlanning?.resources || [] } })}
                />
                <Label htmlFor="planningManaged" className="cursor-pointer">Fixera-managed planning</Label>
              </div>

              {formData.renovationPlanning?.fixeraManaged && (
                <div className="space-y-6">
                  {/* Planning Team Selection */}
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900">Planning Team (Optional)</h4>
                    <p className="text-sm text-gray-600 mb-1">
                      {(formData.renovationPlanning?.resources.length || 0)} team member(s) assigned to planning
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
                              <Badge variant="secondary" className="text-xs mt-1">Managed by Company</Badge>
                            )}
                            {formData.category && (
                              <div className="mt-1">
                                <Badge variant="outline" className="text-[10px]">Category: {formData.category}</Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Execution Team Selection for Renovation with Planning */}
                  <div className="space-y-3 border-t pt-4">
                    <h4 className="font-medium text-gray-900">Execution Team</h4>
                    <p className="text-sm text-gray-600 mb-1">
                      {formData.resources?.length || 0} team member(s) assigned to execution
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
                              <Badge variant="secondary" className="text-xs mt-1">Managed by Company</Badge>
                            )}
                            {formData.category && (
                              <div className="mt-1">
                                <Badge variant="outline" className="text-[10px]">Category: {formData.category}</Badge>
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
          <CardTitle>Resource Planning</CardTitle>
          <CardDescription>
            Configure resource requirements based on your selected team members
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Minimum Required Resources</Label>
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
                  ? 'Select execution team members to enable resource limits'
                  : `Cannot exceed ${selectedResourceCount} selected resource${selectedResourceCount === 1 ? '' : 's'}`}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Minimum Overlap Between Resources (%)</Label>
              <Input
                type="number"
                min={10}
                max={100}
                value={formData.minOverlapPercentage ?? 90}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  const clamped = Math.min(100, Math.max(10, isNaN(value) ? 90 : value))
                  updateFormData({ minOverlapPercentage: clamped })
                }}
                disabled={(formData.minResources ?? 1) <= 1}
              />
              <p className="text-xs text-gray-500">
                {(formData.minResources ?? 1) <= 1
                  ? 'Only available when required resources > 1'
                  : 'Percentage of time resources must work together'}
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
            <span>Project Details</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className='space-y-2'>
            <Label htmlFor="description">Detailed Description *</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => updateFormData({ description: e.target.value })}
              placeholder="Describe your service in detail..."
              className="min-h-[120px]"
              maxLength={1300}
            />
            <p className="text-sm text-gray-500 mt-1">
              {formData.description?.length || 0}/1300 characters (minimum 100)
            </p>
          </div>

          {!isRenovationCategory && (
            <div className='space-y-2'>
              <Label htmlFor="priceModel">Price Model *</Label>
              <Select
                value={formData.priceModel || ''}
                onValueChange={(value) => updateFormData({ priceModel: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select pricing model" />
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
                      No pricing models configured for this service
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
          <CardTitle>Keywords/Tags</CardTitle>
          <CardDescription>
            Add keywords to help customers find your service
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="Add keyword..."
              onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
            />
            <Button onClick={addKeyword} variant="outline">Add</Button>
          </div>

          {formData.keywords && formData.keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.keywords.map(keyword => (
                <Badge key={keyword} variant="secondary" className="flex items-center space-x-1">
                  <span>{keyword}</span>
                  <X
                    className="w-3 h-3 cursor-pointer hover:text-red-500"
                    onClick={() => removeKeyword(keyword)}
                  />
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Title Generation */}
      <Card>
        <CardHeader>
          <CardTitle>Project Title</CardTitle>
          <CardDescription>
            Generate or create a compelling title for your service (30-90 characters)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Button onClick={generateTitle} variant="outline" disabled={!formData.service || !formData.description}>
              Generate AI Title
            </Button>
            {suggestedTitle && (
              <Button onClick={useGeneratedTitle} variant="outline">
                Use Generated Title
              </Button>
            )}
          </div>

          {suggestedTitle && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900">Suggested Title:</p>
              <p className="text-blue-800">{suggestedTitle}</p>
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor="title">Project Title *</Label>
            <Input
              id="title"
              value={formData.title || ''}
              onChange={(e) => updateFormData({ title: e.target.value })}
              placeholder="Enter project title..."
              minLength={30}
              maxLength={90}
            />
            <p className="text-sm text-gray-500 mt-1">
              {formData.title?.length || 0}/90 characters (minimum 30)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Media Upload - Images */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="w-5 h-5" />
            <span>Project Images (Optional)</span>
          </CardTitle>
          <CardDescription>
            Upload up to 4 images to showcase your work (optional)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Click to upload or drag and drop images here</p>
            <p className="text-sm text-gray-500 mt-2">PNG, JPG, WebP up to 5MB each (max 4 images)</p>
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
              onClick={() => document.getElementById('image-upload')?.click()}
            >
              Choose Files
            </Button>
          </div>

          {formData.media?.images && formData.media.images.length > 0 && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {formData.media.images.map((image, index) => (
                <div key={index} className="relative">
                  <img src={image} alt={`Project ${index + 1}`} className="w-full h-24 object-cover rounded" />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1 w-6 h-6 p-0"
                    onClick={() => {
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
            <span>Project Video (Optional)</span>
          </CardTitle>
          <CardDescription>
            Upload 1 video to showcase your work (optional)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Click to upload or drag and drop video here</p>
            <p className="text-sm text-gray-500 mt-2">MP4, MOV, AVI up to 50MB (max 1 video)</p>
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
              onClick={() => document.getElementById('video-upload')?.click()}
              disabled={formData.media?.videos && formData.media.videos.length >= 1}
            >
              Choose Video
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
                    onClick={() => {
                      updateMedia({ videos: [] })
                    }}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Remove Video
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
 
