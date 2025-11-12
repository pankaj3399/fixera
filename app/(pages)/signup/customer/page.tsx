'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ArrowLeft, User, Mail, Phone, Lock, Building2, FileText, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import DualVerificationComponent from '@/components/DualVerificationComponent'
import {
  validateVATFormat,
  validateVATWithAPI,
  formatVATNumber,
  isEUVatNumber,
  getVATCountryName
} from '@/lib/vatValidation'
import AddressAutocomplete, { PlaceData } from '@/components/professional/project-wizard/AddressAutocomplete'

interface FormData {
  name: string
  email: string
  phone: string
  password: string
  confirmPassword: string
  customerType: 'individual' | 'business'
  // Business fields
  vatNumber: string
  companyName: string
  // Location fields
  address: string
  city: string
  country: string
  postalCode: string
  // Coordinates (auto-populated from geocoding)
  latitude?: number
  longitude?: number
}

interface VatValidationState {
  valid?: boolean
  error?: string
  companyName?: string
  companyAddress?: string
  parsedAddress?: {
    streetAddress?: string
    city?: string
    postalCode?: string
    country?: string
  }
}

export default function CustomerSignupPage() {
  const [currentStep, setCurrentStep] = useState<'form' | 'verification'>('form')
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    customerType: 'individual',
    vatNumber: '',
    companyName: '',
    address: '',
    city: '',
    country: '',
    postalCode: '',
  })
  const [loading, setLoading] = useState(false)
  const [vatValidating, setVatValidating] = useState(false)
  const [vatValidation, setVatValidation] = useState<VatValidationState>({})
  const [addressValidating, setAddressValidating] = useState(false)
  const [isAddressValid, setIsAddressValid] = useState(false)
  const { signup } = useAuth()
  const router = useRouter()

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Handle address selection from autocomplete
  const handleAddressChange = (fullAddress: string, placeData?: PlaceData) => {
    handleInputChange('address', fullAddress)

    // If we have place data from autocomplete dropdown, use it directly
    if (placeData?.coordinates && placeData?.address_components) {
      console.log('?o. Using place data from autocomplete - no API call needed')

      const components = placeData.address_components
      const cityComponent = components.find((component) =>
        component.types.includes('locality') || component.types.includes('administrative_area_level_2')
      )
      const countryComponent = components.find((component) =>
        component.types.includes('country')
      )
      const postalComponent = components.find((component) =>
        component.types.includes('postal_code')
      )

      const city = cityComponent?.long_name || ''
      const country = countryComponent?.long_name || ''
      const postalCode = postalComponent?.long_name || ''

      const coordinates = placeData.coordinates

      setFormData(prev => ({
        ...prev,
        city: city || prev.city,
        country: country || prev.country,
        postalCode: postalCode || prev.postalCode,
        latitude: coordinates.lat,
        longitude: coordinates.lng
      }))
    }
  }

  // Auto-populate business info from VAT validation
  useEffect(() => {
    if (vatValidation.valid && vatValidation.companyName && formData.customerType === 'business') {
      // Auto-fill company name if empty
      if (!formData.companyName && vatValidation.companyName) {
        handleInputChange('companyName', vatValidation.companyName)
      }

      // Auto-fill address fields from parsed address
      if (vatValidation.parsedAddress) {
        const parsed = vatValidation.parsedAddress
        if (parsed.streetAddress && !formData.address) {
          handleInputChange('address', parsed.streetAddress)
        }
        if (parsed.city && !formData.city) {
          handleInputChange('city', parsed.city)
        }
        if (parsed.postalCode && !formData.postalCode) {
          handleInputChange('postalCode', parsed.postalCode)
        }
        if (parsed.country && !formData.country) {
          handleInputChange('country', parsed.country)
        }
      }
    }
  }, [vatValidation])

  const validateVatNumber = async () => {
    if (!formData.vatNumber.trim()) {
      setVatValidation({})
      return
    }

    const formatted = formatVATNumber(formData.vatNumber)

    // Client-side format validation
    const formatValidation = validateVATFormat(formatted)
    if (!formatValidation.valid) {
      setVatValidation({
        valid: false,
        error: formatValidation.error
      })
      return
    }

    // If it's not an EU VAT number, just validate format
    if (!isEUVatNumber(formatted)) {
      setVatValidation({
        valid: false,
        error: 'Only EU VAT numbers can be validated with VIES'
      })
      return
    }

    setVatValidating(true)
    try {
      const result = await validateVATWithAPI(formatted)
      setVatValidation({
        valid: result.valid,
        error: result.error,
        companyName: result.companyName,
        companyAddress: result.companyAddress,
        parsedAddress: result.parsedAddress,
      })

      if (result.valid) {
        toast.success(`VAT validated: ${result.companyName || 'Valid'}`)
      } else {
        // Don't show error toast - just update the state
        // VAT validation is optional, so errors shouldn't block the user
      }
    } catch {
      setVatValidation({
        valid: false,
        error: 'Failed to validate VAT number. You can still continue without validation.'
      })
      // Don't show error toast - VAT is optional
    } finally {
      setVatValidating(false)
    }
  }

  // Geocode address to get coordinates
  const geocodeAddress = async (fullAddress: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/validate-address`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ address: fullAddress }),
        }
      )

      const data = await response.json()

      if (data.success && data.isValid && data.coordinates) {
        return {
          lat: data.coordinates.lat,
          lng: data.coordinates.lng
        }
      }
      return null
    } catch (error) {
      console.error('Geocoding error:', error)
      return null
    }
  }

  const validateForm = async (): Promise<boolean> => {
    // Basic validations
    if (!formData.name.trim()) {
      toast.error('Please enter your full name')
      return false
    }

    if (!formData.email.trim() || !/\S+@\S+\.\S+/.test(formData.email)) {
      toast.error('Please enter a valid email address')
      return false
    }

    if (!formData.phone.trim() || formData.phone.length < 10) {
      toast.error('Please enter a valid phone number')
      return false
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters long')
      return false
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return false
    }

    // Location validations
    if (!formData.address.trim()) {
      toast.error('Please enter your address')
      return false
    }

    if (!isAddressValid) {
      toast.error('Please select a valid address from the suggestions or wait for validation')
      return false
    }

    if (!formData.city.trim()) {
      toast.error('Please enter your city')
      return false
    }

    if (!formData.country.trim()) {
      toast.error('Please enter your country')
      return false
    }

    if (!formData.postalCode.trim()) {
      toast.error('Please enter your postal code')
      return false
    }

    // Business-specific validations
    if (formData.customerType === 'business') {
      if (!formData.companyName.trim()) {
        toast.error('Please enter your company name')
        return false
      }

      // VAT is completely optional - no validation required
      // Users can proceed with or without VAT validation
    }

    // Check if we already have coordinates (from autocomplete selection)
    // If not, geocode the address
    if (!formData.latitude || !formData.longitude) {
      setAddressValidating(true)
      const fullAddress = `${formData.address}, ${formData.city}, ${formData.postalCode}, ${formData.country}`
      const coordinates = await geocodeAddress(fullAddress)
      setAddressValidating(false)

      if (!coordinates) {
        toast.error('Unable to validate your address. Please check and try again.')
        return false
      }

      // Store coordinates in formData
      setFormData(prev => ({
        ...prev,
        latitude: coordinates.lat,
        longitude: coordinates.lng
      }))
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!(await validateForm())) return

    setLoading(true)
    try {
      const submitData = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        password: formData.password,
        role: 'customer' as const,
        // Customer-specific fields
        customerType: formData.customerType,
        address: formData.address.trim(),
        city: formData.city.trim(),
        country: formData.country.trim(),
        postalCode: formData.postalCode.trim(),
        latitude: formData.latitude,
        longitude: formData.longitude,
        // Business fields (only if business type)
        ...(formData.customerType === 'business' && {
          companyName: formData.companyName.trim(),
          vatNumber: formData.vatNumber ? formatVATNumber(formData.vatNumber) : undefined,
          isVatValidated: vatValidation.valid || false,
        }),
      }

      const success = await signup(submitData)

      if (success) {
        toast.success('Account created successfully!')
        setCurrentStep('verification')
      }
    } catch (error) {
      console.error('Registration error:', error)
      toast.error('Failed to create account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerificationSuccess = () => {
    toast.success('Account verified successfully! Welcome to Fixera!')
    router.push('/dashboard?welcome=true')
  }

  if (currentStep === 'verification') {
    return (
      <DualVerificationComponent
        email={formData.email}
        phone={formData.phone}
        onVerificationSuccess={handleVerificationSuccess}
        onBack={() => setCurrentStep('form')}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-2xl">
        <Link href="/">
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-6 left-6 flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-6">
            <div className="flex items-center justify-center mb-4">
              <div className="p-3 bg-blue-100 rounded-full">
                <User className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">Create Customer Account</CardTitle>
            <CardDescription className="text-gray-600">
              Join Fixera to find trusted property professionals
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Customer Type Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Account Type</Label>
                <RadioGroup
                  value={formData.customerType}
                  onValueChange={(value: 'individual' | 'business') => {
                    handleInputChange('customerType', value)
                    // Reset business fields when switching to individual
                    if (value === 'individual') {
                      setFormData(prev => ({
                        ...prev,
                        vatNumber: '',
                        companyName: '',
                      }))
                      setVatValidation({})
                    }
                  }}
                  className="grid grid-cols-2 gap-4"
                >
                  <div>
                    <RadioGroupItem value="individual" id="individual" className="peer sr-only" />
                    <Label
                      htmlFor="individual"
                      className="flex flex-col items-center justify-between rounded-lg border-2 border-gray-200 bg-white p-4 hover:bg-gray-50 peer-data-[state=checked]:border-blue-600 peer-data-[state=checked]:bg-blue-50 cursor-pointer transition-all"
                    >
                      <User className="mb-2 h-6 w-6 text-gray-600" />
                      <span className="font-semibold">Individual</span>
                      <span className="text-xs text-gray-500 text-center mt-1">Personal account</span>
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="business" id="business" className="peer sr-only" />
                    <Label
                      htmlFor="business"
                      className="flex flex-col items-center justify-between rounded-lg border-2 border-gray-200 bg-white p-4 hover:bg-gray-50 peer-data-[state=checked]:border-blue-600 peer-data-[state=checked]:bg-blue-50 cursor-pointer transition-all"
                    >
                      <Building2 className="mb-2 h-6 w-6 text-gray-600" />
                      <span className="font-semibold">Business</span>
                      <span className="text-xs text-gray-500 text-center mt-1">Company account</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Basic Information */}
              <div className="space-y-4 pt-2">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Basic Information</h3>

                {/* Full Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Enter your full name"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="Enter your phone number"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Create a password"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Confirm your password"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Business Information (only for business type) */}
              {formData.customerType === 'business' && (
                <div className="space-y-4 pt-2 border-t">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Business Information</h3>

                  {/* Company Name */}
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name *</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="companyName"
                        type="text"
                        placeholder="Enter company name"
                        value={formData.companyName}
                        onChange={(e) => handleInputChange('companyName', e.target.value)}
                        className="pl-10"
                        required={formData.customerType === 'business'}
                      />
                    </div>
                  </div>

                  {/* VAT Number */}
                  <div className="space-y-2">
                    <Label htmlFor="vatNumber">
                      VAT Number (Optional)
                      {formData.vatNumber && vatValidation.valid && (
                        <span className="ml-2 text-xs text-green-600">
                          {getVATCountryName(formData.vatNumber)}
                        </span>
                      )}
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <FileText className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="vatNumber"
                          type="text"
                          placeholder="e.g., BE0123456789"
                          value={formData.vatNumber}
                          onChange={(e) => {
                            handleInputChange('vatNumber', e.target.value)
                            setVatValidation({}) // Reset validation
                          }}
                          onBlur={validateVatNumber}
                          className="pl-10"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={validateVatNumber}
                        disabled={!formData.vatNumber || vatValidating}
                        className="shrink-0"
                      >
                        {vatValidating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Validate'
                        )}
                      </Button>
                    </div>

                    {/* VAT Validation Status */}
                    {vatValidation.valid !== undefined && (
                      <div className={`flex items-start gap-2 text-sm p-3 rounded-lg ${
                        vatValidation.valid
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {vatValidation.valid ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                              <p className="font-medium">VAT Number Validated</p>
                              {vatValidation.companyName && (
                                <p className="text-xs mt-1">{vatValidation.companyName}</p>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                              <p className="font-medium">Validation Failed</p>
                              {vatValidation.error && (
                                <p className="text-xs mt-1">{vatValidation.error}</p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-gray-500">
                      VAT number is optional but recommended for invoicing purposes. Only EU VAT numbers can be validated.
                    </p>
                  </div>
                </div>
              )}

              {/* Location Information */}
              <div className="space-y-4 pt-2 border-t">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Location</h3>

                {/* Address with Autocomplete */}
                <AddressAutocomplete
                  value={formData.address}
                  onChange={handleAddressChange}
                  onValidation={setIsAddressValid}
                  useCompanyAddress={false}
                  label="Street Address"
                  required={true}
                />

                {/* City and Postal Code */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      type="text"
                      placeholder="City"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Postal Code *</Label>
                    <Input
                      id="postalCode"
                      type="text"
                      placeholder="Postal code"
                      value={formData.postalCode}
                      onChange={(e) => handleInputChange('postalCode', e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Country */}
                <div className="space-y-2">
                  <Label htmlFor="country">Country *</Label>
                  <Input
                    id="country"
                    type="text"
                    placeholder="Enter your country"
                    value={formData.country}
                    onChange={(e) => handleInputChange('country', e.target.value)}
                    required
                  />
                </div>

                <div className="flex items-start gap-2 text-xs text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <p>
                    We use your location to match you with nearby professionals and projects. Your exact address is never shared publicly.
                  </p>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading || addressValidating}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : addressValidating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating Address...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-600">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-500">
                Sign in here
              </Link>
            </div>

            <div className="mt-4 text-center text-sm text-gray-600">
              Want to offer services?{' '}
              <Link href="/register" className="font-semibold text-blue-600 hover:text-blue-500">
                Register as Professional
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
