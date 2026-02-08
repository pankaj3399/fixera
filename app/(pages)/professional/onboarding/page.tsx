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
import { Loader2, Upload, Shield, Building, Calendar as CalendarIcon, Users, CheckCircle2 } from 'lucide-react'
import AddressAutocomplete, { PlaceData } from '@/components/professional/project-wizard/AddressAutocomplete'
import EmployeeManagement from '@/components/TeamManagement'
import { EU_COUNTRIES } from '@/lib/countries'
import { getAuthToken } from '@/lib/utils'
import { formatVATNumber, getVATCountryName, isEUVatNumber, validateVATFormat, validateVATWithAPI, updateUserVAT, submitForVerification } from '@/lib/vatValidation'

const STEPS = [
  { id: 1, title: 'ID Upload', required: true },
  { id: 2, title: 'Business Info', required: false },
  { id: 3, title: 'Company Availability', required: true },
  { id: 4, title: 'Personal Availability', required: false },
  { id: 5, title: 'Employees', required: false },
  { id: 6, title: 'Agreements', required: true },
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

  const [companyAvailability, setCompanyAvailability] = useState(DEFAULT_COMPANY_AVAILABILITY)
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
      setCompanyAvailability(prev => ({
        ...prev,
        ...user.companyAvailability
      }))
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

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4">
      <div className="max-w-5xl mx-auto pt-12 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Professional Onboarding</h1>
          <p className="text-gray-600">Complete these steps to submit your profile for approval.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progress</CardTitle>
            <CardDescription>Step {currentStep} of {STEPS.length}</CardDescription>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((step) => (
              <div
                key={step.id}
                className={`rounded-lg border p-3 ${currentStep === step.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{step.title}</span>
                  {step.required && <span className="text-xs text-red-500">Required</span>}
                </div>
                <div className="text-xs text-gray-500 mt-1">Step {step.id}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" /> ID Upload
              </CardTitle>
              <CardDescription>Upload your ID proof and provide document details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {user.idProofUrl && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
                  ID proof already uploaded.
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="idProof">Upload ID Proof</Label>
                <Input
                  id="idProof"
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={(e) => setIdProofFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Country of Issue</Label>
                  <Select value={idCountryOfIssue} onValueChange={setIdCountryOfIssue}>
                    <SelectTrigger>
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
                  <Label>Expiration Date</Label>
                  <Input
                    type="date"
                    value={idExpirationDate}
                    onChange={(e) => setIdExpirationDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button onClick={handleStep1Continue} disabled={uploading || idInfoSaving}>
                  {(uploading || idInfoSaving) ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" /> Save & Continue
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" /> Business Info
              </CardTitle>
              <CardDescription>Provide company details and VAT information. You can skip for now.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input
                  value={businessInfo.companyName}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, companyName: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  VAT Number *
                  {vatNumber && vatValidation.valid && (
                    <span className="ml-2 text-xs text-green-600">{getVATCountryName(vatNumber)}</span>
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
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={validateVatNumber}
                    disabled={!vatNumber || vatValidating}
                  >
                    {vatValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validate'}
                  </Button>
                </div>
                {vatValidation.valid !== undefined && (
                  <div className={`text-xs ${vatValidation.valid ? 'text-green-700' : 'text-red-700'}`}>
                    {vatValidation.valid ? 'VAT number validated' : vatValidation.error}
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
                  <Label>City</Label>
                  <Input
                    value={businessInfo.city}
                    onChange={(e) => setBusinessInfo(prev => ({ ...prev, city: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Postal Code</Label>
                  <Input
                    value={businessInfo.postalCode}
                    onChange={(e) => setBusinessInfo(prev => ({ ...prev, postalCode: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Country</Label>
                <Input
                  value={businessInfo.country}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, country: e.target.value }))}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>Back</Button>
                <Button variant="outline" onClick={() => setCurrentStep(3)}>
                  Skip for now
                </Button>
                <Button onClick={handleStep2Continue} disabled={businessSaving}>
                  {businessSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...
                    </>
                  ) : (
                    'Save & Continue'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" /> Company Availability
              </CardTitle>
              <CardDescription>Set your company working hours. At least one day is required.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(companyAvailability).map(([day, schedule]) => (
                <div key={day} className="flex items-center gap-4 p-3 border rounded-lg">
                  <div className="w-20 text-sm font-medium capitalize">{day}</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={schedule.available}
                      onChange={(e) => {
                        setCompanyAvailability(prev => ({
                          ...prev,
                          [day]: { ...prev[day as keyof typeof prev], available: e.target.checked }
                        }))
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">Available</span>
                  </div>
                  {schedule.available && (
                    <>
                      <Input
                        type="time"
                        value={schedule.startTime}
                        onChange={(e) => {
                          setCompanyAvailability(prev => ({
                            ...prev,
                            [day]: { ...prev[day as keyof typeof prev], startTime: e.target.value }
                          }))
                        }}
                        className="w-28"
                      />
                      <span className="text-sm">to</span>
                      <Input
                        type="time"
                        value={schedule.endTime}
                        onChange={(e) => {
                          setCompanyAvailability(prev => ({
                            ...prev,
                            [day]: { ...prev[day as keyof typeof prev], endTime: e.target.value }
                          }))
                        }}
                        className="w-28"
                      />
                    </>
                  )}
                </div>
              ))}

              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" onClick={() => setCurrentStep(2)}>Back</Button>
                <Button onClick={handleStep3Continue} disabled={companySaving}>
                  {companySaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...
                    </>
                  ) : (
                    'Save & Continue'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" /> Personal Availability
              </CardTitle>
              <CardDescription>Optional for now. You can update this later in your profile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Set personal availability and blocked dates after onboarding if needed.
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" onClick={() => setCurrentStep(3)}>Back</Button>
                <Button onClick={() => setCurrentStep(5)}>Continue</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 5 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" /> Employees
              </CardTitle>
              <CardDescription>Optional. Invite employees now or skip.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <EmployeeManagement />
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" onClick={() => setCurrentStep(4)}>Back</Button>
                <Button onClick={() => setCurrentStep(6)}>Continue</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 6 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" /> Agreements
              </CardTitle>
              <CardDescription>Review and accept all agreements to submit your profile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {AGREEMENTS.map((text, index) => (
                  <div key={text} className="flex items-start gap-3">
                    <Checkbox
                      checked={agreements[index]}
                      onCheckedChange={(checked) => {
                        setAgreements(prev => prev.map((val, idx) => idx === index ? Boolean(checked) : val))
                      }}
                    />
                    <span className="text-sm text-gray-700">{text}</span>
                  </div>
                ))}
              </div>

              {submitErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <p className="font-medium mb-2">Missing requirements:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {submitErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" onClick={() => setCurrentStep(5)}>Back</Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting...
                    </>
                  ) : (
                    'Submit for Verification'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
