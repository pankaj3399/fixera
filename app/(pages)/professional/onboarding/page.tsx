'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Upload, Shield, Building, Calendar as CalendarIcon, Users, CheckCircle2, ChevronLeft, ChevronRight, ArrowRight, Check } from 'lucide-react'
import AddressAutocomplete, { PlaceData } from '@/components/professional/project-wizard/AddressAutocomplete'
import EmployeeManagement from '@/components/TeamManagement'
import { EU_COUNTRIES } from '@/lib/countries'
import { getAuthToken } from '@/lib/utils'
import { formatVATNumber, getVATCountryName, isEUVatNumber, validateVATFormat, validateVATWithAPI, updateUserVAT, submitForVerification } from '@/lib/vatValidation'

const STEPS = [
  { id: 1, title: 'ID Upload', icon: Shield, required: true, gradient: 'from-violet-200 via-purple-200 to-fuchsia-200' },
  { id: 2, title: 'Business Info', icon: Building, required: false, gradient: 'from-blue-200 via-cyan-200 to-teal-200' },
  { id: 3, title: 'Company Hours', icon: CalendarIcon, required: true, gradient: 'from-emerald-200 via-green-200 to-lime-200' },
  { id: 4, title: 'Personal Hours', icon: CalendarIcon, required: false, gradient: 'from-amber-200 via-yellow-200 to-orange-200' },
  { id: 5, title: 'Employees', icon: Users, required: false, gradient: 'from-rose-200 via-pink-200 to-fuchsia-200' },
  { id: 6, title: 'Agreements', icon: CheckCircle2, required: true, gradient: 'from-indigo-200 via-blue-200 to-violet-200' },
]

const DEFAULT_COMPANY_AVAILABILITY = {
  monday: { available: true, startTime: '09:00', endTime: '17:00' },
  tuesday: { available: true, startTime: '09:00', endTime: '17:00' },
  wednesday: { available: true, startTime: '09:00', endTime: '17:00' },
  thursday: { available: true, startTime: '09:00', endTime: '17:00' },
  friday: { available: true, startTime: '09:00', endTime: '17:00' },
  saturday: { available: false, startTime: '09:00', endTime: '17:00' },
  sunday: { available: false, startTime: '09:00', endTime: '17:00' },
}

const AGREEMENTS = [
  'I confirm the information I provide is accurate and up to date.',
  'I understand Fixera will verify my profile before approval.',
  'I will keep my availability and business details updated.',
  'I agree to follow Fixera platform rules and professional standards.',
]

// Gradient border wrapper component
function GradientCard({ gradient, children, className = '' }: { gradient: string, children: React.ReactNode, className?: string }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-r ${gradient} p-[2px] shadow-lg shadow-black/5 ${className}`}>
      <div className="rounded-[14px] bg-white h-full">
        {children}
      </div>
    </div>
  )
}

export default function ProfessionalOnboardingPage() {
  const { user, loading, isAuthenticated, checkAuth } = useAuth()
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)

  const [idProofFile, setIdProofFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [idInfoSaving, setIdInfoSaving] = useState(false)
  const [idCountryOfIssue, setIdCountryOfIssue] = useState('')
  const [idExpirationDate, setIdExpirationDate] = useState('')

  const [businessInfo, setBusinessInfo] = useState({
    companyName: '',
    address: '',
    city: '',
    country: '',
    postalCode: ''
  })
  const [vatNumber, setVatNumber] = useState('')
  const [vatValidating, setVatValidating] = useState(false)
  const [vatValidation, setVatValidation] = useState<{
    valid?: boolean
    error?: string
    companyName?: string
    parsedAddress?: {
      streetAddress?: string
      city?: string
      postalCode?: string
      country?: string
    }
  }>({})
  const [businessSaving, setBusinessSaving] = useState(false)
  const [isAddressValid, setIsAddressValid] = useState(false)

  const [companyAvailability, setCompanyAvailability] = useState<typeof DEFAULT_COMPANY_AVAILABILITY>(DEFAULT_COMPANY_AVAILABILITY)
  const [companySaving, setCompanySaving] = useState(false)

  const [agreements, setAgreements] = useState<boolean[]>(AGREEMENTS.map(() => false))
  const [submitting, setSubmitting] = useState(false)
  const [submitErrors, setSubmitErrors] = useState<string[]>([])

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login')
    }
  }, [loading, isAuthenticated, router])

  useEffect(() => {
    if (!loading && user?.role && user.role !== 'professional') {
      router.push('/dashboard')
    }
  }, [loading, user?.role, router])

  useEffect(() => {
    if (!loading && user?.role === 'professional' && (user.professionalOnboardingCompletedAt || user.professionalStatus !== 'draft')) {
      router.push('/dashboard')
    }
  }, [loading, user, router])

  useEffect(() => {
    if (!user) return
    if (user.idCountryOfIssue) setIdCountryOfIssue(user.idCountryOfIssue)
    if (user.idExpirationDate) setIdExpirationDate(user.idExpirationDate.split('T')[0])

    if (user.businessInfo) {
      setBusinessInfo(prev => ({
        ...prev,
        companyName: user.businessInfo?.companyName || '',
        address: user.businessInfo?.address || '',
        city: user.businessInfo?.city || '',
        country: user.businessInfo?.country || '',
        postalCode: user.businessInfo?.postalCode || '',
      }))
    }
    if (user.vatNumber) setVatNumber(user.vatNumber)

    if (user.companyAvailability) {
      setCompanyAvailability(prev => {
        const next = { ...prev }
        Object.entries(user.companyAvailability || {}).forEach(([day, schedule]) => {
          if (!schedule) return
          const key = day as keyof typeof next
          next[key] = {
            available: schedule.available,
            startTime: schedule.startTime || prev[key].startTime,
            endTime: schedule.endTime || prev[key].endTime
          }
        })
        return next
      })
    }
  }, [user])

  const headersWithAuth = () => {
    const token = getAuthToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }

  const handleAddressChange = (fullAddress: string, placeData?: PlaceData) => {
    setBusinessInfo(prev => ({ ...prev, address: fullAddress }))
    if (placeData?.address_components) {
      const components = placeData.address_components
      const cityComponent = components.find(
        (component) =>
          component.types.includes('locality') ||
          component.types.includes('administrative_area_level_2')
      )
      const countryComponent = components.find((component) =>
        component.types.includes('country')
      )
      const postalComponent = components.find((component) =>
        component.types.includes('postal_code')
      )

      setBusinessInfo(prev => ({
        ...prev,
        city: cityComponent?.long_name || prev.city,
        country: countryComponent?.long_name || prev.country,
        postalCode: postalComponent?.long_name || prev.postalCode,
      }))
    }
  }

  const validateVatNumber = async () => {
    if (!vatNumber.trim()) {
      setVatValidation({})
      return
    }

    const formatted = formatVATNumber(vatNumber)
    const formatValidation = validateVATFormat(formatted)
    if (!formatValidation.valid) {
      setVatValidation({ valid: false, error: formatValidation.error })
      return
    }

    if (!isEUVatNumber(formatted)) {
      setVatValidation({ valid: false, error: 'Only EU VAT numbers can be validated with VIES' })
      return
    }

    setVatValidating(true)
    try {
      const result = await validateVATWithAPI(formatted)
      setVatValidation({
        valid: result.valid,
        error: result.error,
        companyName: result.companyName,
        parsedAddress: result.parsedAddress,
      })

      if (result.valid && result.parsedAddress) {
        setBusinessInfo(prev => ({
          ...prev,
          companyName: prev.companyName || result.companyName || prev.companyName,
          address: prev.address || result.parsedAddress?.streetAddress || prev.address,
          city: prev.city || result.parsedAddress?.city || prev.city,
          postalCode: prev.postalCode || result.parsedAddress?.postalCode || prev.postalCode,
          country: prev.country || result.parsedAddress?.country || prev.country,
        }))
      }
    } catch {
      setVatValidation({ valid: false, error: 'Failed to validate VAT number' })
    } finally {
      setVatValidating(false)
    }
  }

  const handleIdProofUpload = async () => {
    if (!idProofFile) return false
    const formData = new FormData()
    formData.append('idProof', idProofFile)

    setUploading(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/id-proof`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: formData
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        toast.error(result.msg || 'Failed to upload ID proof')
        return false
      }
      toast.success('ID proof uploaded')
      setIdProofFile(null)
      await checkAuth()
      return true
    } catch {
      toast.error('Failed to upload ID proof')
      return false
    } finally {
      setUploading(false)
    }
  }

  const hasIdInfoChanges = () => {
    const existingCountry = user?.idCountryOfIssue || ''
    const existingDate = user?.idExpirationDate ? user.idExpirationDate.split('T')[0] : ''
    return idCountryOfIssue !== existingCountry || idExpirationDate !== existingDate
  }

  const saveIdInfo = async () => {
    if (!idCountryOfIssue.trim()) {
      toast.error('Country of issue is required')
      return false
    }
    if (!idExpirationDate) {
      toast.error('Expiration date is required')
      return false
    }

    setIdInfoSaving(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/id-info`, {
        method: 'PUT',
        headers: headersWithAuth(),
        credentials: 'include',
        body: JSON.stringify({
          idCountryOfIssue,
          idExpirationDate
        })
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        toast.error(result.msg || 'Failed to save ID info')
        return false
      }
      toast.success('ID details saved')
      await checkAuth()
      return true
    } catch {
      toast.error('Failed to save ID info')
      return false
    } finally {
      setIdInfoSaving(false)
    }
  }

  const handleStep1Continue = async () => {
    if (!user?.idProofUrl && !idProofFile) {
      toast.error('Please upload your ID proof')
      return
    }
    if (!idCountryOfIssue.trim() || !idExpirationDate) {
      toast.error('Please provide ID country of issue and expiration date')
      return
    }

    let idUploadOk = true
    if (idProofFile) {
      idUploadOk = await handleIdProofUpload()
    }

    let idInfoOk = true
    if (hasIdInfoChanges()) {
      idInfoOk = await saveIdInfo()
    }

    if (idUploadOk && idInfoOk) {
      setCurrentStep(2)
    }
  }

  const handleStep2Continue = async () => {
    if (!businessInfo.companyName.trim()) {
      toast.error('Company name is required')
      return
    }
    if (!vatNumber.trim()) {
      toast.error('VAT number is required')
      return
    }
    const vatFormat = validateVATFormat(formatVATNumber(vatNumber))
    if (!vatFormat.valid) {
      toast.error(vatFormat.error || 'Invalid VAT number')
      return
    }
    if (!businessInfo.address.trim() || !businessInfo.city.trim() || !businessInfo.country.trim() || !businessInfo.postalCode.trim()) {
      toast.error('Company address is required')
      return
    }
    if (!isAddressValid) {
      toast.error('Please select a valid address from the suggestions')
      return
    }

    setBusinessSaving(true)
    try {
      const vatResult = await updateUserVAT(vatNumber)
      if (!vatResult.success) {
        toast.error(vatResult.error || 'Failed to save VAT number')
        return
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/professional-profile`, {
        method: 'PUT',
        headers: headersWithAuth(),
        credentials: 'include',
        body: JSON.stringify({
          businessInfo: {
            companyName: businessInfo.companyName.trim(),
            address: businessInfo.address.trim(),
            city: businessInfo.city.trim(),
            country: businessInfo.country.trim(),
            postalCode: businessInfo.postalCode.trim(),
          }
        })
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        toast.error(result.msg || 'Failed to save business info')
        return
      }
      toast.success('Business info saved')
      await checkAuth()
      setCurrentStep(3)
    } catch {
      toast.error('Failed to save business info')
    } finally {
      setBusinessSaving(false)
    }
  }

  const handleStep3Continue = async () => {
    const hasAvailableDay = Object.values(companyAvailability).some((day) => day.available)
    if (!hasAvailableDay) {
      toast.error('Select at least one available day')
      return
    }

    setCompanySaving(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/professional-profile`, {
        method: 'PUT',
        headers: headersWithAuth(),
        credentials: 'include',
        body: JSON.stringify({
          companyAvailability
        })
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        toast.error(result.msg || 'Failed to save company availability')
        return
      }
      toast.success('Company availability saved')
      await checkAuth()
      setCurrentStep(4)
    } catch {
      toast.error('Failed to save company availability')
    } finally {
      setCompanySaving(false)
    }
  }

  const handleSubmit = async () => {
    const allChecked = agreements.every(Boolean)
    if (!allChecked) {
      toast.error('Please accept all agreements to continue')
      return
    }
    setSubmitting(true)
    setSubmitErrors([])
    try {
      const result = await submitForVerification()
      if (result.success) {
        toast.success('Profile submitted for verification')
        await checkAuth()
        router.push('/dashboard?verification=pending')
      } else {
        if (result.missingRequirements && result.missingRequirements.length > 0) {
          setSubmitErrors(result.missingRequirements)
          const step = missingRequirementStep(result.missingRequirements)
          if (step) {
            toast.error('Please complete required steps before submitting')
            setCurrentStep(step)
          } else {
            toast.error(result.error || 'Failed to submit for verification')
          }
        } else {
          toast.error(result.error || 'Failed to submit for verification')
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const missingRequirementStep = (requirements: string[]) => {
    if (requirements.some((req) => req.toLowerCase().includes('id'))) return 1
    if (requirements.some((req) => req.toLowerCase().includes('vat') || req.toLowerCase().includes('company'))) return 2
    if (requirements.some((req) => req.toLowerCase().includes('availability'))) return 3
    return null
  }

  const progress = useMemo(() => (currentStep / STEPS.length) * 100, [currentStep])
  const activeStep = STEPS.find(s => s.id === currentStep)!

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="rounded-2xl bg-gradient-to-r from-violet-200 via-blue-200 to-cyan-200 p-[2px]">
          <div className="rounded-[14px] bg-white/80 backdrop-blur px-8 py-6 flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-gray-600 font-medium">Loading your profile...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50 p-4 pb-16">
      <div className="max-w-4xl mx-auto pt-10 space-y-8">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-blue-100 to-purple-100 text-sm font-medium text-blue-700">
            Welcome, {user.name?.split(' ')[0]}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
            Professional Onboarding
          </h1>
          <p className="text-gray-500 max-w-lg mx-auto">
            Complete these steps to submit your profile for approval.
          </p>
        </div>

        {/* Progress bar */}
        <div className="px-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-600">Step {currentStep} of {STEPS.length}</span>
            <span className="text-sm font-medium text-blue-600">{Math.round(progress)}% complete</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-fuchsia-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step indicators */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {STEPS.map((step) => {
            const isCompleted = step.id < currentStep
            const isCurrent = step.id === currentStep
            const StepIcon = step.icon
            return (
              <button
                key={step.id}
                onClick={() => {
                  if (step.id < currentStep) setCurrentStep(step.id)
                }}
                disabled={step.id > currentStep}
                className={`
                  relative rounded-xl p-[2px] transition-all duration-300
                  ${isCurrent
                    ? `bg-gradient-to-br ${step.gradient} shadow-md scale-[1.02]`
                    : isCompleted
                      ? 'bg-gradient-to-br from-green-200 to-emerald-200 cursor-pointer hover:shadow-md hover:scale-[1.02]'
                      : 'bg-gray-200'
                  }
                `}
              >
                <div className={`
                  rounded-[10px] px-2 py-3 text-center h-full flex flex-col items-center gap-1.5
                  ${isCurrent ? 'bg-white' : isCompleted ? 'bg-white' : 'bg-gray-50'}
                `}>
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center
                    ${isCurrent
                      ? `bg-gradient-to-br ${step.gradient}`
                      : isCompleted
                        ? 'bg-green-100'
                        : 'bg-gray-100'
                    }
                  `}>
                    {isCompleted ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <StepIcon className={`h-4 w-4 ${isCurrent ? 'text-gray-700' : 'text-gray-400'}`} />
                    )}
                  </div>
                  <span className={`text-[11px] font-medium leading-tight ${isCurrent ? 'text-gray-900' : isCompleted ? 'text-green-700' : 'text-gray-400'}`}>
                    {step.title}
                  </span>
                  {step.required && (
                    <span className={`text-[9px] font-medium ${isCurrent ? 'text-red-500' : isCompleted ? 'text-green-500' : 'text-gray-300'}`}>
                      {isCompleted ? 'Done' : 'Required'}
                    </span>
                  )}
                  {!step.required && (
                    <span className={`text-[9px] ${isCompleted ? 'text-green-500 font-medium' : 'text-gray-300'}`}>
                      {isCompleted ? 'Done' : 'Optional'}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Step 1: ID Upload */}
        {currentStep === 1 && (
          <GradientCard gradient={activeStep.gradient}>
            <div className="p-6 sm:p-8 space-y-6">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${activeStep.gradient} flex items-center justify-center`}>
                    <Shield className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">ID Upload</h2>
                    <p className="text-sm text-gray-500">Upload your ID proof and provide document details.</p>
                  </div>
                </div>
              </div>

              {user.idProofUrl && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 text-sm text-green-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ID proof already uploaded.
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="idProof" className="text-sm font-medium text-gray-700">Upload ID Proof</Label>
                <div className="rounded-xl border-2 border-dashed border-gray-200 hover:border-purple-300 transition-colors p-4">
                  <Input
                    id="idProof"
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={(e) => setIdProofFile(e.target.files?.[0] || null)}
                    className="border-0 p-0 shadow-none"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Country of Issue</Label>
                  <Select value={idCountryOfIssue} onValueChange={setIdCountryOfIssue}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {EU_COUNTRIES.map((country) => (
                        <SelectItem key={country.code} value={country.name}>
                          {country.flag} {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Expiration Date</Label>
                  <Input
                    type="date"
                    value={idExpirationDate}
                    onChange={(e) => setIdExpirationDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end pt-2">
                <Button
                  onClick={handleStep1Continue}
                  disabled={uploading || idInfoSaving}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 px-6"
                >
                  {(uploading || idInfoSaving) ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...
                    </>
                  ) : (
                    <>
                      Save & Continue <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </GradientCard>
        )}

        {/* Step 2: Business Info */}
        {currentStep === 2 && (
          <GradientCard gradient={activeStep.gradient}>
            <div className="p-6 sm:p-8 space-y-6">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${activeStep.gradient} flex items-center justify-center`}>
                    <Building className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Business Info</h2>
                    <p className="text-sm text-gray-500">Provide company details and VAT information.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Company Name</Label>
                <Input
                  value={businessInfo.companyName}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, companyName: e.target.value }))}
                  className="rounded-xl"
                  placeholder="Your company name"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  VAT Number *
                  {vatNumber && vatValidation.valid && (
                    <span className="ml-2 text-xs text-green-600 font-normal">{getVATCountryName(vatNumber)}</span>
                  )}
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={vatNumber}
                    onChange={(e) => {
                      setVatNumber(e.target.value.toUpperCase())
                      setVatValidation({})
                    }}
                    onBlur={validateVatNumber}
                    placeholder="e.g., BE0123456789"
                    required
                    className="rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={validateVatNumber}
                    disabled={!vatNumber || vatValidating}
                    className="rounded-xl shrink-0"
                  >
                    {vatValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validate'}
                  </Button>
                </div>
                {vatValidation.valid !== undefined && (
                  <div className={`flex items-center gap-2 text-xs p-2.5 rounded-xl ${vatValidation.valid ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {vatValidation.valid ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> VAT number validated</>
                    ) : (
                      <>{vatValidation.error}</>
                    )}
                  </div>
                )}
              </div>

              <AddressAutocomplete
                value={businessInfo.address}
                onChange={handleAddressChange}
                onValidation={setIsAddressValid}
                useCompanyAddress={false}
                label="Street Address"
                required
              />

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">City</Label>
                  <Input
                    value={businessInfo.city}
                    onChange={(e) => setBusinessInfo(prev => ({ ...prev, city: e.target.value }))}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Postal Code</Label>
                  <Input
                    value={businessInfo.postalCode}
                    onChange={(e) => setBusinessInfo(prev => ({ ...prev, postalCode: e.target.value }))}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Country</Label>
                <Input
                  value={businessInfo.country}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, country: e.target.value }))}
                  className="rounded-xl"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Button variant="outline" onClick={() => setCurrentStep(1)} className="rounded-xl gap-1">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setCurrentStep(3)} className="rounded-xl text-gray-500">
                    Skip for now
                  </Button>
                  <Button
                    onClick={handleStep2Continue}
                    disabled={businessSaving}
                    className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 px-6"
                  >
                    {businessSaving ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
                    ) : (
                      <>Save & Continue <ArrowRight className="h-4 w-4 ml-2" /></>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </GradientCard>
        )}

        {/* Step 3: Company Availability */}
        {currentStep === 3 && (
          <GradientCard gradient={activeStep.gradient}>
            <div className="p-6 sm:p-8 space-y-6">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${activeStep.gradient} flex items-center justify-center`}>
                    <CalendarIcon className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Company Availability</h2>
                    <p className="text-sm text-gray-500">Set your company working hours. At least one day is required.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {Object.entries(companyAvailability).map(([day, schedule]) => (
                  <div
                    key={day}
                    className={`flex items-center gap-4 p-3.5 rounded-xl border transition-colors ${
                      schedule.available ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-gray-50/50'
                    }`}
                  >
                    <div className="w-24 text-sm font-semibold capitalize text-gray-700">{day}</div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={schedule.available}
                        onCheckedChange={(checked) => {
                          setCompanyAvailability(prev => ({
                            ...prev,
                            [day]: { ...prev[day as keyof typeof prev], available: Boolean(checked) }
                          }))
                        }}
                      />
                      <span className="text-sm text-gray-600">Available</span>
                    </div>
                    {schedule.available && (
                      <div className="flex items-center gap-2 ml-auto">
                        <Input
                          type="time"
                          value={schedule.startTime}
                          onChange={(e) => {
                            setCompanyAvailability(prev => ({
                              ...prev,
                              [day]: { ...prev[day as keyof typeof prev], startTime: e.target.value }
                            }))
                          }}
                          className="w-28 rounded-xl"
                        />
                        <span className="text-sm text-gray-400">to</span>
                        <Input
                          type="time"
                          value={schedule.endTime}
                          onChange={(e) => {
                            setCompanyAvailability(prev => ({
                              ...prev,
                              [day]: { ...prev[day as keyof typeof prev], endTime: e.target.value }
                            }))
                          }}
                          className="w-28 rounded-xl"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button variant="outline" onClick={() => setCurrentStep(2)} className="rounded-xl gap-1">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={handleStep3Continue}
                  disabled={companySaving}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-6"
                >
                  {companySaving ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
                  ) : (
                    <>Save & Continue <ArrowRight className="h-4 w-4 ml-2" /></>
                  )}
                </Button>
              </div>
            </div>
          </GradientCard>
        )}

        {/* Step 4: Personal Availability */}
        {currentStep === 4 && (
          <GradientCard gradient={activeStep.gradient}>
            <div className="p-6 sm:p-8 space-y-6">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${activeStep.gradient} flex items-center justify-center`}>
                    <CalendarIcon className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Personal Availability</h2>
                    <p className="text-sm text-gray-500">Optional for now. You can update this later in your profile.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/50 p-6 text-center">
                <CalendarIcon className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">
                  Set personal availability and blocked dates after onboarding if needed.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button variant="outline" onClick={() => setCurrentStep(3)} className="rounded-xl gap-1">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={() => setCurrentStep(5)}
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 px-6"
                >
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </GradientCard>
        )}

        {/* Step 5: Employees */}
        {currentStep === 5 && (
          <GradientCard gradient={activeStep.gradient}>
            <div className="p-6 sm:p-8 space-y-6">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${activeStep.gradient} flex items-center justify-center`}>
                    <Users className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Employees</h2>
                    <p className="text-sm text-gray-500">Optional. Invite employees now or skip.</p>
                  </div>
                </div>
              </div>

              <EmployeeManagement />

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button variant="outline" onClick={() => setCurrentStep(4)} className="rounded-xl gap-1">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={() => setCurrentStep(6)}
                  className="rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 px-6"
                >
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </GradientCard>
        )}

        {/* Step 6: Agreements */}
        {currentStep === 6 && (
          <GradientCard gradient={activeStep.gradient}>
            <div className="p-6 sm:p-8 space-y-6">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${activeStep.gradient} flex items-center justify-center`}>
                    <CheckCircle2 className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Agreements</h2>
                    <p className="text-sm text-gray-500">Review and accept all agreements to submit your profile.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {AGREEMENTS.map((text, index) => (
                  <label
                    key={text}
                    className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                      agreements[index]
                        ? 'border-blue-200 bg-blue-50/50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <Checkbox
                      checked={agreements[index]}
                      onCheckedChange={(checked) => {
                        setAgreements(prev => prev.map((val, idx) => idx === index ? Boolean(checked) : val))
                      }}
                      className="mt-0.5"
                    />
                    <span className="text-sm text-gray-700 leading-relaxed">{text}</span>
                  </label>
                ))}
              </div>

              {submitErrors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <p className="font-semibold mb-2">Missing requirements:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {submitErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button variant="outline" onClick={() => setCurrentStep(5)} className="rounded-xl gap-1">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 px-8"
                  >
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting...</>
                    ) : (
                      <>Submit for Verification <ChevronRight className="h-4 w-4 ml-2" /></>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </GradientCard>
        )}

      </div>
    </div>
  )
}
