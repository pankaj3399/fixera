'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { useFormatLocale } from '@/lib/i18n/useFormatLocale'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Shield, Building, Calendar as CalendarIcon, Users, CheckCircle2, ChevronLeft, ChevronRight, ArrowRight, Check, CreditCard } from 'lucide-react'
import { Skeleton } from "@/components/ui/skeleton"
import AddressAutocomplete, { PlaceData } from '@/components/professional/project-wizard/AddressAutocomplete'
import EmployeeManagement from '@/components/TeamManagement'
import DualVerificationComponent from '@/components/DualVerificationComponent'
import { EU_COUNTRIES } from '@/lib/countries'
import { getAuthToken, buildUsernameSuggestionParams } from '@/lib/utils'
import { formatVATNumber, getVATCountryName, isEUVatNumber, validateVATFormat, validateVATWithAPI, updateProfessionalBusinessProfile, submitForVerification, COUNTRY_NAMES } from '@/lib/vatValidation'
import { CompanyAvailability, DayAvailability, DEFAULT_COMPANY_AVAILABILITY } from '@/lib/defaults/companyAvailability'
import { ONBOARDING_STEPS } from '@/lib/constants/onboardingSteps'
import Link from 'next/link'
import { publicListPolicyLinks, PolicyLink } from '@/lib/cms'

const STEPS = [
  { id: ONBOARDING_STEPS.ID_UPLOAD, titleKey: 'onboarding.steps.idUpload', icon: Shield, required: true, gradient: 'from-violet-200 via-purple-200 to-fuchsia-200' },
  { id: ONBOARDING_STEPS.BUSINESS_INFO, titleKey: 'onboarding.steps.businessInfo', icon: Building, required: false, gradient: 'from-blue-200 via-cyan-200 to-teal-200' },
  { id: ONBOARDING_STEPS.STRIPE, titleKey: 'onboarding.steps.stripe', icon: CreditCard, required: true, gradient: 'from-sky-200 via-cyan-200 to-blue-200' },
  { id: ONBOARDING_STEPS.COMPANY_HOURS, titleKey: 'onboarding.steps.companyHours', icon: CalendarIcon, required: true, gradient: 'from-emerald-200 via-green-200 to-lime-200' },
  { id: ONBOARDING_STEPS.PERSONAL_HOURS, titleKey: 'onboarding.steps.personalHours', icon: CalendarIcon, required: false, gradient: 'from-amber-200 via-yellow-200 to-orange-200' },
  { id: ONBOARDING_STEPS.EMPLOYEES, titleKey: 'onboarding.steps.employees', icon: Users, required: false, gradient: 'from-rose-200 via-pink-200 to-fuchsia-200' },
  { id: ONBOARDING_STEPS.RULES, titleKey: 'onboarding.steps.rules', icon: CheckCircle2, required: true, gradient: 'from-indigo-200 via-blue-200 to-violet-200' },
] as const

const PLATFORM_RULES = [
  'onboarding.rules.items.accurate',
  'onboarding.rules.items.gdpr',
  'onboarding.rules.items.professional',
  'onboarding.rules.items.communication',
  'onboarding.rules.items.inform',
] as const

const MISBEHAVIOR_ITEMS = [
  'onboarding.rules.misbehavior.misleading',
  'onboarding.rules.misbehavior.offPlatform',
  'onboarding.rules.misbehavior.noShow',
  'onboarding.rules.misbehavior.dataMisuse',
] as const

const CONSEQUENCES = [
  'onboarding.rules.consequences.suspension',
  'onboarding.rules.consequences.ban',
  'onboarding.rules.consequences.payment',
  'onboarding.rules.consequences.ranking',
] as const

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

type DayKey = (typeof DAYS)[number]

const isDayKey = (value: string): value is DayKey => (DAYS as readonly string[]).includes(value)

type MissingRequirementDetail = {
  code?: string
  type?: string
  message?: string
}

type MissingRequirementInput = string | MissingRequirementDetail

type StripeAccountStatus = {
  hasAccount?: boolean
  onboardingCompleted?: boolean
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  detailsSubmitted?: boolean
  accountStatus?: string
}

type ServiceCategoryGroup = {
  name: string
  slug: string
  services: Array<{
    name: string
    slug: string
  }>
}

type AgreementsState = {
  rulesAccepted: boolean
  termsAccepted: boolean
  selfBillingAccepted: boolean
}

type MissingRequirementResolution = {
  step: number
  messages: string[]
  originalRequirements: MissingRequirementInput[]
}

const REQUIREMENT_CODE_TO_STEP: Record<string, number> = {
  ID_PROOF_MISSING: 1,
  ID_COUNTRY_OF_ISSUE_MISSING: 1,
  ID_EXPIRATION_DATE_MISSING: 1,
  ID_EXPIRATION_DATE_INVALID: 1,
  VAT_NUMBER_MISSING: 2,
  USERNAME_MISSING: 2,
  COMPANY_NAME_MISSING: 2,
  COMPANY_ADDRESS_MISSING: 2,
  STRIPE_ONBOARDING_MISSING: 3,
  COMPANY_AVAILABILITY_MISSING: 4,
  AGREEMENTS_MISSING: 7,
}

const normalizeRequirementText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const mapRequirementToStepByKeywords = (normalizedText: string): number | null => {
  const step1Keywords = ['id', 'identity', 'document', 'proof', 'expiration', 'expiry', 'country of issue', 'passport', 'license']
  const step2Keywords = ['vat', 'tax', 'tax id', 'company', 'business', 'address', 'postal', 'username', 'display']
  const step3Keywords = ['stripe', 'payment', 'payout', 'charges']
  const step4Keywords = ['availability', 'schedule', 'working hour', 'working hours', 'company hour', 'company hours']
  const step7Keywords = ['agreement', 'rules', 'terms', 'self billing']

  if (step1Keywords.some((keyword) => normalizedText.includes(keyword))) return 1
  if (step2Keywords.some((keyword) => normalizedText.includes(keyword))) return 2
  if (step3Keywords.some((keyword) => normalizedText.includes(keyword))) return 3
  if (step4Keywords.some((keyword) => normalizedText.includes(keyword))) return 4
  if (step7Keywords.some((keyword) => normalizedText.includes(keyword))) return 7

  return null
}

const resolveMissingRequirements = (
  requirements: MissingRequirementInput[],
  fallbackMessage: string
): MissingRequirementResolution => {
  if (!requirements || requirements.length === 0) {
    return { step: 1, messages: [], originalRequirements: [] }
  }

  let mappedStep: number | null = null
  const messages = requirements.map((requirement) => {
    if (typeof requirement === 'string') {
      if (!mappedStep) {
        mappedStep = mapRequirementToStepByKeywords(normalizeRequirementText(requirement))
      }
      return requirement
    }

    const normalizedCode = (requirement.code || requirement.type || '').toUpperCase()
    if (!mappedStep && normalizedCode && REQUIREMENT_CODE_TO_STEP[normalizedCode]) {
      mappedStep = REQUIREMENT_CODE_TO_STEP[normalizedCode]
    }

    if (!mappedStep && requirement.message) {
      mappedStep = mapRequirementToStepByKeywords(normalizeRequirementText(requirement.message))
    }

    return requirement.message || requirement.code || requirement.type || fallbackMessage
  })

  if (!mappedStep) {
    for (const msg of messages) {
      const mapped = mapRequirementToStepByKeywords(normalizeRequirementText(msg))
      if (mapped) {
        mappedStep = mapped
        break
      }
    }
  }

  return {
    step: mappedStep || 1,
    messages,
    originalRequirements: requirements
  }
}

const VAT_ERROR_KEYS = {
  required: 'onboarding.vatFormat.required',
  tooShort: 'onboarding.vatFormat.tooShort',
  tooLong: 'onboarding.vatFormat.tooLong',
  countryPrefix: 'onboarding.vatFormat.countryPrefix',
  invalidCharacters: 'onboarding.vatFormat.invalidCharacters',
  invalidCountry: 'onboarding.vatFormat.invalidCountry',
  validationFailed: 'onboarding.vatFormat.validationFailed',
  network: 'onboarding.vatFormat.network',
} as const

const toCountryCode = (value?: string) => {
  if (!value) return 'BE'
  const trimmed = value.trim()
  const byCode = EU_COUNTRIES.find((country) => country.code.toLowerCase() === trimmed.toLowerCase())
  if (byCode) return byCode.code
  const byName = EU_COUNTRIES.find((country) => country.name.toLowerCase() === trimmed.toLowerCase())
  return byName?.code || 'BE'
}

const timeToMinutes = (value: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null
  }
  return (hours * 60) + minutes
}

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

function StripeIntegrationStep({
  gradient,
  stripeStatus,
  stripeLoading,
  stripeError,
  refreshStripeStatus,
  setCurrentStep,
  openStripeSetup,
}: {
  gradient: string
  stripeStatus: StripeAccountStatus | null
  stripeLoading: boolean
  stripeError: string
  refreshStripeStatus: () => void
  setCurrentStep: (step: number) => void
  openStripeSetup: () => void
}) {
  const t = useTranslations('proArea')
  const stripeReady = Boolean(stripeStatus?.hasAccount && stripeStatus?.onboardingCompleted)

  return (
    <GradientCard gradient={gradient}>
      <div className="p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
              <CreditCard className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('onboarding.stripe.title')}</h2>
              <p className="text-sm text-gray-500">{t('onboarding.stripe.subtitle')}</p>
            </div>
          </div>
        </div>
        {stripeLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('onboarding.stripe.checking')}
          </div>
        ) : (
          <>
            <div className={`rounded-xl border p-4 ${
              stripeReady ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              {stripeReady
                ? t('onboarding.stripe.completed')
                : stripeStatus?.hasAccount
                  ? t('onboarding.stripe.incomplete')
                  : t('onboarding.stripe.none')}
            </div>

            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground mb-1">{t('onboarding.stripe.account')}</p>
                <p className="font-medium">{stripeStatus?.hasAccount ? t('onboarding.stripe.created') : t('onboarding.stripe.missing')}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground mb-1">{t('onboarding.stripe.onboarding')}</p>
                <p className="font-medium">{stripeStatus?.onboardingCompleted ? t('onboarding.stripe.complete') : t('onboarding.stripe.incompleteState')}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground mb-1">{t('onboarding.stripe.charges')}</p>
                <p className="font-medium">{stripeStatus?.chargesEnabled ? t('onboarding.stripe.enabled') : t('onboarding.stripe.pending')}</p>
              </div>
            </div>

            {stripeError && (
              <p className="text-sm text-red-600">{stripeError}</p>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button variant="outline" onClick={() => setCurrentStep(2)} className="rounded-xl gap-1">
            <ChevronLeft className="h-4 w-4" /> {t('common.back')}
          </Button>
          <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshStripeStatus} disabled={stripeLoading} className="rounded-xl">
            {t('onboarding.stripe.refresh')}
          </Button>
          <Button variant="outline" onClick={openStripeSetup} className="rounded-xl">
            {t('onboarding.stripe.openSetup')}
          </Button>
          <Button
            onClick={() => {
              if (stripeReady) {
                setCurrentStep(4)
              } else {
                openStripeSetup()
              }
            }}
            className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 px-6"
          >
            {stripeReady ? (
              <>{t('common.continue')} <ArrowRight className="h-4 w-4 ml-2" /></>
            ) : (
              <>{t('onboarding.stripe.goToStripe')} <ArrowRight className="h-4 w-4 ml-2" /></>
            )}
          </Button>
          </div>
        </div>
      </div>
    </GradientCard>
  )
}

function IdVerificationStep({
  gradient,
  userHasIdProof,
  idCountryOfIssue,
  setIdCountryOfIssue,
  idExpirationDate,
  setIdExpirationDate,
  setIdProofFile,
  handleIdStepContinue,
  uploading,
  idInfoSaving,
}: {
  gradient: string
  userHasIdProof: boolean
  idCountryOfIssue: string
  setIdCountryOfIssue: (value: string) => void
  idExpirationDate: string
  setIdExpirationDate: (value: string) => void
  setIdProofFile: (file: File | null) => void
  handleIdStepContinue: () => void
  uploading: boolean
  idInfoSaving: boolean
}) {
  const t = useTranslations('proArea')
  const { intl } = useFormatLocale()
  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([intl], { type: 'region' })
    } catch {
      return null
    }
  }, [intl])
  return (
    <GradientCard gradient={gradient}>
      <div className="p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
              <Shield className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('onboarding.steps.idUpload')}</h2>
              <p className="text-sm text-gray-500">{t('onboarding.idUpload.subtitle')}</p>
            </div>
          </div>
        </div>

        {userHasIdProof && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {t('onboarding.idUpload.alreadyUploaded')}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="idProof" className="text-sm font-medium text-gray-700">{t('onboarding.idUpload.uploadLabel')}</Label>
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
            <Label className="text-sm font-medium text-gray-700">{t('onboarding.idUpload.countryOfIssue')}</Label>
            <Select value={idCountryOfIssue} onValueChange={setIdCountryOfIssue}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder={t('onboarding.idUpload.selectCountry')} />
              </SelectTrigger>
              <SelectContent>
                {EU_COUNTRIES.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.flag} {regionNames?.of(country.code) ?? country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">{t('onboarding.idUpload.expirationDate')}</Label>
            <Input
              type="date"
              value={idExpirationDate}
              onChange={(e) => setIdExpirationDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
<Button
            onClick={handleIdStepContinue}
            disabled={uploading || idInfoSaving}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 px-6"
          >
            {(uploading || idInfoSaving) ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('common.saving')}
              </>
            ) : (
              <>
                {t('common.saveAndContinue')} <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </GradientCard>
  )
}

function BusinessDetailsStep({
  gradient,
  businessInfo,
  setBusinessInfo,
  vatNumber,
  setVatNumber,
  vatValidation,
  vatValidating,
  validateVatNumber,
  handleAddressChange,
  setIsAddressValid,
  serviceCatalog,
  serviceCatalogLoading,
  selectedServices,
  setSelectedServices,
  setCurrentStep,
  handleBusinessStepContinue,
  businessSaving,
}: {
  gradient: string
  businessInfo: { companyName: string; address: string; city: string; country: string; postalCode: string; username: string }
  setBusinessInfo: React.Dispatch<React.SetStateAction<{ companyName: string; address: string; city: string; country: string; postalCode: string; username: string }>>
  vatNumber: string
  setVatNumber: (value: string) => void
  vatValidation: { valid?: boolean; error?: string }
  vatValidating: boolean
  validateVatNumber: () => void
  handleAddressChange: (fullAddress: string, placeData?: PlaceData) => void
  setIsAddressValid: (value: boolean) => void
  serviceCatalog: ServiceCategoryGroup[]
  serviceCatalogLoading: boolean
  selectedServices: string[]
  setSelectedServices: React.Dispatch<React.SetStateAction<string[]>>
  setCurrentStep: (step: number) => void
  handleBusinessStepContinue: () => void
  businessSaving: boolean
}) {
  const t = useTranslations('proArea')
  const { intl } = useFormatLocale()
  const companyNameConflict = t('onboarding.business.usernameCompanyConflict')
  const [usernameCheck, setUsernameCheck] = useState<{ available?: boolean; reason?: string; checking?: boolean }>({})
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const usernameAbortRef = useRef<AbortController | null>(null)

  const checkUsername = (value: string) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setBusinessInfo(prev => ({ ...prev, username: normalized }))
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current)
    if (usernameAbortRef.current) usernameAbortRef.current.abort()
    if (!normalized || normalized.length < 3) {
      setUsernameCheck({})
      return
    }
    const normalizedCompany = businessInfo.companyName?.toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (normalizedCompany && normalized === normalizedCompany) {
      setUsernameCheck({ available: false, reason: companyNameConflict })
      return
    }
    setUsernameCheck({ checking: true })
    usernameTimerRef.current = setTimeout(async () => {
      const controller = new AbortController()
      usernameAbortRef.current = controller
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/check-username/${encodeURIComponent(normalized)}`, {
          credentials: 'include',
          signal: controller.signal,
        })
        const data = await res.json()
        setUsernameCheck({ available: data.available, reason: data.reason })
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        setUsernameCheck({ reason: t('onboarding.business.checkFailed') })
      }
    }, 500)
  }

  const generateSuggestions = async () => {
    setSuggestionsLoading(true)
    try {
      const qs = buildUsernameSuggestionParams(businessInfo)
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/generate-username${qs}`, {
        credentials: 'include',
      })
      const data = await res.json()
      if (data.suggestions?.length) {
        setUsernameSuggestions(data.suggestions)
        setBusinessInfo(prev => ({ ...prev, username: data.suggestions[0] }))
        setUsernameCheck({ available: true })
      }
    } catch {
      toast.error(t('onboarding.business.suggestionsFailed'))
    } finally {
      setSuggestionsLoading(false)
    }
  }
  return (
    <GradientCard gradient={gradient}>
      <div className="p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
              <Building className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('onboarding.business.title')}</h2>
              <p className="text-sm text-gray-500">{t('onboarding.business.subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">{t('onboarding.business.companyName')}</Label>
          <Input
            value={businessInfo.companyName}
            onChange={(e) => {
              const newCompany = e.target.value
              setBusinessInfo(prev => ({ ...prev, companyName: newCompany }))
              const normalizedCompany = newCompany.toLowerCase().replace(/[^a-z0-9-]/g, '')
              const normalizedUsername = businessInfo.username?.toLowerCase().replace(/[^a-z0-9-]/g, '')
              if (normalizedCompany && normalizedUsername && normalizedCompany === normalizedUsername) {
                setUsernameCheck({ available: false, reason: companyNameConflict })
              } else if (usernameCheck.reason === companyNameConflict) {
                if (normalizedUsername && normalizedUsername.length >= 3) {
                  checkUsername(businessInfo.username)
                } else {
                  setUsernameCheck({})
                }
              }
            }}
            className="rounded-xl"
            placeholder={t('onboarding.business.companyNamePlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">
            {t('onboarding.business.displayUsername')} *
          </Label>
          <p className="text-xs text-gray-500">{t('onboarding.business.usernameHint')}</p>
          <div className="flex gap-2">
            <Input
              value={businessInfo.username}
              onChange={(e) => checkUsername(e.target.value)}
              className="rounded-xl"
              placeholder={t('onboarding.business.usernamePlaceholder')}
              maxLength={30}
            />
            <Button
              type="button"
              variant="outline"
              onClick={generateSuggestions}
              disabled={suggestionsLoading || !businessInfo.companyName}
              className="rounded-xl shrink-0 text-xs"
            >
              {suggestionsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('onboarding.business.suggest')}
            </Button>
          </div>
          {businessInfo.username && businessInfo.username.length >= 3 && (
            <div className={`flex items-center gap-2 text-xs p-2 rounded-xl ${
              usernameCheck.checking ? 'bg-gray-50 text-gray-600 border border-gray-200' :
              usernameCheck.available ? 'bg-green-50 text-green-700 border border-green-200' :
              usernameCheck.available === false ? 'bg-red-50 text-red-700 border border-red-200' : ''
            }`}>
              {usernameCheck.checking ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> {t('onboarding.business.checking')}</>
              ) : usernameCheck.available ? (
                <><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {t('onboarding.business.usernameAvailable')}</>
              ) : usernameCheck.available === false ? (
                <>{usernameCheck.reason}</>
              ) : null}
            </div>
          )}
          <p className="text-xs text-gray-400">{t('onboarding.business.usernameRules')}</p>
          {usernameSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {usernameSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setBusinessInfo(prev => ({ ...prev, username: s }))
                    const normalizedCompany = businessInfo.companyName?.toLowerCase().replace(/[^a-z0-9-]/g, '')
                    if (normalizedCompany && s === normalizedCompany) {
                      setUsernameCheck({ available: false, reason: companyNameConflict })
                    } else {
                      setUsernameCheck({ available: true })
                    }
                  }}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    businessInfo.username === s
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">
            {t('onboarding.business.vatNumber')} *
            {vatNumber && vatValidation.valid && (
              <span className="ml-2 text-xs text-green-600 font-normal">{getVATCountryName(vatNumber, intl)}</span>
            )}
          </Label>
          <div className="flex gap-2">
            <Input
              value={vatNumber}
              onChange={(e) => {
                setVatNumber(e.target.value.toUpperCase())
              }}
              onBlur={validateVatNumber}
              placeholder={t('onboarding.business.vatPlaceholder')}
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
              {vatValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : t('onboarding.business.validate')}
            </Button>
          </div>
          {vatValidation.valid !== undefined && (
            <div className={`flex items-center gap-2 text-xs p-2.5 rounded-xl ${vatValidation.valid ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {vatValidation.valid ? (
                <><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {t('onboarding.business.vatValidated')}</>
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
          label={t('onboarding.business.streetAddress')}
          required
        />

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">{t('onboarding.business.city')}</Label>
            <Input
              value={businessInfo.city}
              onChange={(e) => setBusinessInfo(prev => ({ ...prev, city: e.target.value }))}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">{t('onboarding.business.postalCode')}</Label>
            <Input
              value={businessInfo.postalCode}
              onChange={(e) => setBusinessInfo(prev => ({ ...prev, postalCode: e.target.value }))}
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">{t('onboarding.business.country')}</Label>
          <Input
            value={businessInfo.country}
            onChange={(e) => setBusinessInfo(prev => ({ ...prev, country: e.target.value }))}
            className="rounded-xl"
          />
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium text-gray-700">{t('onboarding.business.services')}</Label>
            <p className="text-xs text-gray-500">{t('onboarding.business.servicesHint')}</p>
          </div>

          {serviceCatalogLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('onboarding.business.loadingServices')}
            </div>
          ) : (
            <div className="space-y-4">
              {serviceCatalog.map((category) => (
                <div key={category.slug} className="rounded-xl border border-gray-200 p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900">{category.name}</h3>
                  <div className="flex flex-wrap gap-2">
                    {category.services.map((service) => {
                      const active = selectedServices.includes(service.name)
                      return (
                        <button
                          key={service.slug}
                          type="button"
                          onClick={() => {
                            setSelectedServices((prev) =>
                              active ? prev.filter((entry) => entry !== service.name) : [...prev, service.name]
                            )
                          }}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                            active
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {service.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button variant="outline" onClick={() => setCurrentStep(1)} className="rounded-xl gap-1">
            <ChevronLeft className="h-4 w-4" /> {t('common.back')}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setCurrentStep(3)} className="rounded-xl text-gray-500">
              {t('common.skipForNow')}
            </Button>
            <Button
              onClick={handleBusinessStepContinue}
              disabled={businessSaving}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 px-6"
            >
              {businessSaving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('common.saving')}</>
              ) : (
                <>{t('common.saveAndContinue')} <ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          </div>
        </div>
      </div>
    </GradientCard>
  )
}

function CompanyAvailabilityStep({
  gradient,
  companyAvailability,
  setCompanyAvailability,
  companyAvailabilityErrors,
  setCompanyAvailabilityErrors,
  setCurrentStep,
  handleCompanyHoursContinue,
  companySaving,
}: {
  gradient: string
  companyAvailability: CompanyAvailability
  setCompanyAvailability: React.Dispatch<React.SetStateAction<CompanyAvailability>>
  companyAvailabilityErrors: Partial<Record<keyof CompanyAvailability, string>>
  setCompanyAvailabilityErrors: React.Dispatch<React.SetStateAction<Partial<Record<keyof CompanyAvailability, string>>>>
  setCurrentStep: (step: number) => void
  handleCompanyHoursContinue: () => void
  companySaving: boolean
}) {
  const t = useTranslations('proArea')
  return (
    <GradientCard gradient={gradient}>
      <div className="p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
              <CalendarIcon className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('onboarding.availability.companyTitle')}</h2>
              <p className="text-sm text-gray-500">{t('onboarding.availability.companySubtitle')}</p>
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
              <div className="w-24 text-sm font-semibold capitalize text-gray-700">{isDayKey(day) ? t(`days.${day}`) : day}</div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={schedule.available}
                  onCheckedChange={(checked) => {
                    setCompanyAvailability(prev => ({
                      ...prev,
                      [day]: { ...prev[day as keyof typeof prev], available: Boolean(checked) }
                    }))
                    setCompanyAvailabilityErrors((prev) => {
                      const next = { ...prev }
                      delete next[day as keyof CompanyAvailability]
                      return next
                    })
                  }}
                />
                <span className="text-sm text-gray-600">{t('common.available')}</span>
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
                      setCompanyAvailabilityErrors((prev) => {
                        const next = { ...prev }
                        delete next[day as keyof CompanyAvailability]
                        return next
                      })
                    }}
                    className="w-28 rounded-xl"
                  />
                  <span className="text-sm text-gray-400">{t('onboarding.availability.to')}</span>
                  <Input
                    type="time"
                    value={schedule.endTime}
                    onChange={(e) => {
                      setCompanyAvailability(prev => ({
                        ...prev,
                        [day]: { ...prev[day as keyof typeof prev], endTime: e.target.value }
                      }))
                      setCompanyAvailabilityErrors((prev) => {
                        const next = { ...prev }
                        delete next[day as keyof CompanyAvailability]
                        return next
                      })
                    }}
                    className="w-28 rounded-xl"
                  />
                </div>
              )}
              {companyAvailabilityErrors[day as keyof CompanyAvailability] && (
                <div className="w-full mt-2 text-xs text-red-600">
                  {companyAvailabilityErrors[day as keyof CompanyAvailability]}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button variant="outline" onClick={() => setCurrentStep(3)} className="rounded-xl gap-1">
            <ChevronLeft className="h-4 w-4" /> {t('common.back')}
          </Button>
          <Button
            onClick={handleCompanyHoursContinue}
            disabled={companySaving}
            className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-6"
          >
            {companySaving ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('common.saving')}</>
            ) : (
              <>{t('common.saveAndContinue')} <ArrowRight className="h-4 w-4 ml-2" /></>
            )}
          </Button>
        </div>
      </div>
    </GradientCard>
  )
}

function PersonalAvailabilityStep({
  gradient,
  personalAvailability,
  setPersonalAvailability,
  personalAvailabilityErrors,
  setPersonalAvailabilityErrors,
  setCurrentStep,
  handlePersonalHoursContinue,
  personalSaving,
}: {
  gradient: string
  personalAvailability: CompanyAvailability
  setPersonalAvailability: React.Dispatch<React.SetStateAction<CompanyAvailability>>
  personalAvailabilityErrors: Partial<Record<keyof CompanyAvailability, string>>
  setPersonalAvailabilityErrors: React.Dispatch<React.SetStateAction<Partial<Record<keyof CompanyAvailability, string>>>>
  setCurrentStep: (step: number) => void
  handlePersonalHoursContinue: () => void
  personalSaving: boolean
}) {
  const t = useTranslations('proArea')
  return (
    <GradientCard gradient={gradient}>
      <div className="p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
              <CalendarIcon className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('onboarding.availability.personalTitle')}</h2>
              <p className="text-sm text-gray-500">{t('onboarding.availability.personalSubtitle')}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {Object.entries(personalAvailability).map(([day, schedule]) => (
            <div
              key={day}
              className={`flex items-center gap-4 p-3.5 rounded-xl border transition-colors ${
                schedule.available ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-gray-50/50'
              }`}
            >
              <div className="w-24 text-sm font-semibold capitalize text-gray-700">{isDayKey(day) ? t(`days.${day}`) : day}</div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={schedule.available}
                  onCheckedChange={(checked) => {
                    setPersonalAvailability((prev) => ({
                      ...prev,
                      [day]: { ...prev[day as keyof typeof prev], available: Boolean(checked) }
                    }))
                    setPersonalAvailabilityErrors((prev) => {
                      const next = { ...prev }
                      delete next[day as keyof CompanyAvailability]
                      return next
                    })
                  }}
                />
                <span className="text-sm text-gray-600">{t('common.available')}</span>
              </div>
              {schedule.available && (
                <div className="flex items-center gap-2 ml-auto">
                  <Input
                    type="time"
                    value={schedule.startTime}
                    onChange={(e) => {
                      setPersonalAvailability((prev) => ({
                        ...prev,
                        [day]: { ...prev[day as keyof typeof prev], startTime: e.target.value }
                      }))
                      setPersonalAvailabilityErrors((prev) => {
                        const next = { ...prev }
                        delete next[day as keyof CompanyAvailability]
                        return next
                      })
                    }}
                    className="w-28 rounded-xl"
                  />
                  <span className="text-sm text-gray-400">{t('onboarding.availability.to')}</span>
                  <Input
                    type="time"
                    value={schedule.endTime}
                    onChange={(e) => {
                      setPersonalAvailability((prev) => ({
                        ...prev,
                        [day]: { ...prev[day as keyof typeof prev], endTime: e.target.value }
                      }))
                      setPersonalAvailabilityErrors((prev) => {
                        const next = { ...prev }
                        delete next[day as keyof CompanyAvailability]
                        return next
                      })
                    }}
                    className="w-28 rounded-xl"
                  />
                </div>
              )}
              {personalAvailabilityErrors[day as keyof CompanyAvailability] && (
                <div className="w-full mt-2 text-xs text-red-600">
                  {personalAvailabilityErrors[day as keyof CompanyAvailability]}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button variant="outline" onClick={() => setCurrentStep(4)} className="rounded-xl gap-1">
            <ChevronLeft className="h-4 w-4" /> {t('common.back')}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setCurrentStep(6)} className="rounded-xl text-gray-500">
              {t('common.skipForNow')}
            </Button>
            <Button
              onClick={handlePersonalHoursContinue}
              disabled={personalSaving}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 px-6"
            >
              {personalSaving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('common.saving')}</>
              ) : (
                <>{t('common.saveAndContinue')} <ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          </div>
        </div>
      </div>
    </GradientCard>
  )
}

function EmployeesStep({ gradient, setCurrentStep }: { gradient: string; setCurrentStep: (step: number) => void }) {
  const t = useTranslations('proArea')
  return (
    <GradientCard gradient={gradient}>
      <div className="p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
              <Users className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('onboarding.employees.title')}</h2>
              <p className="text-sm text-gray-500">{t('onboarding.employees.subtitle')}</p>
            </div>
          </div>
        </div>

        <EmployeeManagement />

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button variant="outline" onClick={() => setCurrentStep(5)} className="rounded-xl gap-1">
            <ChevronLeft className="h-4 w-4" /> {t('common.back')}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setCurrentStep(7)} className="rounded-xl text-gray-500">
              {t('common.skipForNow')}
            </Button>
            <Button
              onClick={() => setCurrentStep(7)}
              className="rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 px-6"
            >
              {t('common.continue')} <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </GradientCard>
  )
}

function AgreementLabel({ policySlug, policies, children }: { policySlug: string; policies: PolicyLink[]; children: React.ReactNode }) {
  const t = useTranslations('proArea')
  const match = policies.find((p) => p.slug === policySlug)
  if (!match) return <>{children}</>
  return (
    <>
      {children}{' '}
      <Link
        href={match.path}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
      >
        {t('onboarding.rules.read')}
      </Link>
    </>
  )
}

function AgreementsStep({
  gradient,
  agreements,
  setAgreements,
  submitErrors,
  setCurrentStep,
  handleSubmit,
  submitting,
}: {
  gradient: string
  agreements: AgreementsState
  setAgreements: React.Dispatch<React.SetStateAction<AgreementsState>>
  submitErrors: string[]
  setCurrentStep: (step: number) => void
  handleSubmit: () => void
  submitting: boolean
}) {
  const t = useTranslations('proArea')
  const [policies, setPolicies] = useState<PolicyLink[]>([])
  useEffect(() => {
    publicListPolicyLinks().then(setPolicies).catch(() => setPolicies([]))
  }, [])

  return (
    <GradientCard gradient={gradient}>
      <div className="p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
              <CheckCircle2 className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('onboarding.rules.title')}</h2>
              <p className="text-sm text-gray-500">{t('onboarding.rules.subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border border-gray-200 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t('onboarding.rules.platformRulesTitle')}</h3>
            <div className="space-y-2 text-sm text-gray-700">
              {PLATFORM_RULES.map((item) => (
                <p key={item}>• {t(item)}</p>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-amber-900">{t('onboarding.rules.misbehaviorTitle')}</h3>
            <div className="space-y-2 text-sm text-amber-900">
              {MISBEHAVIOR_ITEMS.map((item) => (
                <p key={item}>• {t(item)}</p>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t('onboarding.rules.consequencesTitle')}</h3>
            <div className="space-y-2 text-sm text-gray-700">
              {CONSEQUENCES.map((item) => (
                <p key={item}>• {t(item)}</p>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-3">
          <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
            agreements.rulesAccepted ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 bg-white hover:border-gray-300'
          }`}>
            <Checkbox
              checked={agreements.rulesAccepted}
              onCheckedChange={(checked) => setAgreements((prev) => ({ ...prev, rulesAccepted: Boolean(checked) }))}
              className="mt-0.5"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              <AgreementLabel policySlug="platform-rules" policies={policies}>
                {t('onboarding.rules.agreeRules')}
              </AgreementLabel>
            </span>
          </label>

          <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
            agreements.termsAccepted ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 bg-white hover:border-gray-300'
          }`}>
            <Checkbox
              checked={agreements.termsAccepted}
              onCheckedChange={(checked) => setAgreements((prev) => ({ ...prev, termsAccepted: Boolean(checked) }))}
              className="mt-0.5"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              <AgreementLabel policySlug="terms-of-service" policies={policies}>
                {t('onboarding.rules.agreeTerms')}
              </AgreementLabel>
            </span>
          </label>

          <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
            agreements.selfBillingAccepted ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 bg-white hover:border-gray-300'
          }`}>
            <Checkbox
              checked={agreements.selfBillingAccepted}
              onCheckedChange={(checked) => setAgreements((prev) => ({ ...prev, selfBillingAccepted: Boolean(checked) }))}
              className="mt-0.5"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              <AgreementLabel policySlug="self-billing-agreement" policies={policies}>
                {t('onboarding.rules.agreeSelfBilling')}
              </AgreementLabel>
            </span>
          </label>
        </div>

        {submitErrors.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold mb-2">{t('onboarding.rules.missingRequirements')}</p>
            <ul className="list-disc pl-5 space-y-1">
              {submitErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button variant="outline" onClick={() => setCurrentStep(6)} className="rounded-xl gap-1">
            <ChevronLeft className="h-4 w-4" /> {t('common.back')}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 px-8"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('onboarding.rules.submitting')}</>
              ) : (
                <>{t('onboarding.rules.submit')} <ChevronRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          </div>
        </div>
      </div>
    </GradientCard>
  )
}

function useIdVerificationState() {
  const [idProofFile, setIdProofFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [idInfoSaving, setIdInfoSaving] = useState(false)
  const [idCountryOfIssue, setIdCountryOfIssue] = useState('')
  const [idExpirationDate, setIdExpirationDate] = useState('')

  return {
    idProofFile,
    setIdProofFile,
    uploading,
    setUploading,
    idInfoSaving,
    setIdInfoSaving,
    idCountryOfIssue,
    setIdCountryOfIssue,
    idExpirationDate,
    setIdExpirationDate,
  }
}

function useBusinessFormState() {
  const [businessInfo, setBusinessInfo] = useState({
    companyName: '',
    address: '',
    city: '',
    country: '',
    postalCode: '',
    username: ''
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

  return {
    businessInfo,
    setBusinessInfo,
    vatNumber,
    setVatNumber,
    vatValidating,
    setVatValidating,
    vatValidation,
    setVatValidation,
    businessSaving,
    setBusinessSaving,
    isAddressValid,
    setIsAddressValid,
  }
}

function useCompanyAvailabilityState() {
  const [companyAvailability, setCompanyAvailability] = useState<CompanyAvailability>(DEFAULT_COMPANY_AVAILABILITY)
  const [companySaving, setCompanySaving] = useState(false)
  const [companyAvailabilityErrors, setCompanyAvailabilityErrors] = useState<Partial<Record<keyof CompanyAvailability, string>>>({})

  return {
    companyAvailability,
    setCompanyAvailability,
    companySaving,
    setCompanySaving,
    companyAvailabilityErrors,
    setCompanyAvailabilityErrors,
  }
}

function useSubmissionState() {
  const [agreements, setAgreements] = useState<AgreementsState>({
    rulesAccepted: false,
    termsAccepted: false,
    selfBillingAccepted: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitErrors, setSubmitErrors] = useState<string[]>([])

  return {
    agreements,
    setAgreements,
    submitting,
    setSubmitting,
    submitErrors,
    setSubmitErrors,
  }
}

export default function ProfessionalOnboardingPage() {
  return (
    <Suspense>
      <ProfessionalOnboardingContent />
    </Suspense>
  )
}

function ProfessionalOnboardingContent() {
  const t = useTranslations('proArea')
  const vatErrorMessage = (result: { errorCode?: string; error?: string; countryCode?: string }) => {
    const key = result.errorCode
      ? VAT_ERROR_KEYS[result.errorCode as keyof typeof VAT_ERROR_KEYS]
      : undefined
    return key ? t(key, { country: result.countryCode ?? '' }) : result.error
  }
  const { user, loading, isAuthenticated, checkAuth } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentStep, setCurrentStep] = useState(1)
  const [stripeStatus, setStripeStatus] = useState<StripeAccountStatus | null>(null)
  const [stripeLoading, setStripeLoading] = useState(false)
  const [stripeError, setStripeError] = useState('')
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCategoryGroup[]>([])
  const [serviceCatalogLoading, setServiceCatalogLoading] = useState(false)
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [personalAvailability, setPersonalAvailability] = useState<CompanyAvailability>(DEFAULT_COMPANY_AVAILABILITY)
  const [personalAvailabilityErrors, setPersonalAvailabilityErrors] = useState<Partial<Record<keyof CompanyAvailability, string>>>({})
  const [personalSaving, setPersonalSaving] = useState(false)

  const {
    idProofFile,
    setIdProofFile,
    uploading,
    setUploading,
    idInfoSaving,
    setIdInfoSaving,
    idCountryOfIssue,
    setIdCountryOfIssue,
    idExpirationDate,
    setIdExpirationDate,
  } = useIdVerificationState()

  const {
    businessInfo,
    setBusinessInfo,
    vatNumber,
    setVatNumber,
    vatValidating,
    setVatValidating,
    vatValidation,
    setVatValidation,
    businessSaving,
    setBusinessSaving,
    isAddressValid,
    setIsAddressValid,
  } = useBusinessFormState()

  const {
    companyAvailability,
    setCompanyAvailability,
    companySaving,
    setCompanySaving,
    companyAvailabilityErrors,
    setCompanyAvailabilityErrors,
  } = useCompanyAvailabilityState()

  const {
    agreements,
    setAgreements,
    submitting,
    setSubmitting,
    submitErrors,
    setSubmitErrors,
  } = useSubmissionState()

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login')
    }
  }, [loading, isAuthenticated, router])

  useEffect(() => {
    const stepParam = searchParams.get('step')
    if (!stepParam) return
    const parsed = Number.parseInt(stepParam, 10)
    if (Number.isNaN(parsed)) return
    if (parsed >= 1 && parsed <= STEPS.length) {
      setCurrentStep(parsed)
    }
  }, [searchParams])

  useEffect(() => {
    if (!loading && user?.role && user.role !== 'professional') {
      router.push('/dashboard')
    }
  }, [loading, user?.role, router])

  useEffect(() => {
    if (
      !loading &&
      user?.role === 'professional' &&
      (user.professionalOnboardingCompletedAt || (user.professionalStatus !== undefined && user.professionalStatus !== 'draft'))
    ) {
      router.push('/dashboard')
    }
  }, [loading, user, router])

  useEffect(() => {
    if (!user) return
    if (user.idCountryOfIssue) {
      const rawCountry = user.idCountryOfIssue
      const normalizedCountryCode = rawCountry.length === 2
        ? rawCountry.toUpperCase()
        : (EU_COUNTRIES.find((country) => country.name.toLowerCase() === rawCountry.toLowerCase())?.code || '')
      setIdCountryOfIssue(normalizedCountryCode || user.idCountryOfIssue)
    }
    if (user.idExpirationDate) setIdExpirationDate(user.idExpirationDate.split('T')[0])

    if (user.businessInfo || user.username) {
      setBusinessInfo(prev => ({
        ...prev,
        companyName: user.businessInfo?.companyName || '',
        address: user.businessInfo?.address || '',
        city: user.businessInfo?.city || '',
        country: user.businessInfo?.country || '',
        postalCode: user.businessInfo?.postalCode || '',
        username: user.username || '',
      }))
    }
    if (user.vatNumber) setVatNumber(user.vatNumber)
    if (user.serviceCategories) setSelectedServices(user.serviceCategories)
    if (user.onboardingAgreements) {
      setAgreements({
        rulesAccepted: Boolean(user.onboardingAgreements.rulesAccepted),
        termsAccepted: Boolean(user.onboardingAgreements.termsAccepted),
        selfBillingAccepted: Boolean(user.onboardingAgreements.selfBillingAccepted),
      })
    }

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

    if (user.availability) {
      setPersonalAvailability(prev => {
        const next = { ...prev }
        Object.entries(user.availability || {}).forEach(([day, schedule]) => {
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
  }, [
    user,
    setAgreements,
    setBusinessInfo,
    setCompanyAvailability,
    setIdCountryOfIssue,
    setIdExpirationDate,
    setVatNumber,
  ])

  const headersWithAuth = () => {
    const token = getAuthToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }

  const refreshStripeStatus = useCallback(async () => {
    setStripeLoading(true)
    setStripeError('')
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/stripe/connect/account-status`, {
        credentials: 'include',
        headers: headersWithAuth(),
      })

      if (response.status === 404) {
        setStripeStatus({ hasAccount: false })
        return
      }

      const data = await response.json()
      if (!response.ok || !data.success) {
        setStripeError(data.error?.message || t('onboarding.stripe.loadFailed'))
        return
      }

      setStripeStatus({
        ...data.data,
        hasAccount: true,
      })
    } catch {
      setStripeError(t('onboarding.stripe.loadFailed'))
    } finally {
      setStripeLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (user?.role === 'professional') {
      void refreshStripeStatus()
    }
  }, [user?.role, refreshStripeStatus])

  useEffect(() => {
    const controller = new AbortController()
    const countryCode = toCountryCode(businessInfo.country || user?.businessInfo?.country)

    const loadServices = async () => {
      setServiceCatalogLoading(true)
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/service-categories/active?country=${encodeURIComponent(countryCode)}`,
          {
            credentials: 'include',
            signal: controller.signal,
          }
        )
        const data = await response.json()
        if (response.ok && Array.isArray(data)) {
          setServiceCatalog(data)
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
      } finally {
        setServiceCatalogLoading(false)
      }
    }

    void loadServices()
    return () => controller.abort()
  }, [businessInfo.country, user?.businessInfo?.country])

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
      setVatValidation({ valid: false, error: vatErrorMessage(formatValidation) })
      return
    }

    if (!isEUVatNumber(formatted)) {
      setVatValidation({ valid: false, error: t('onboarding.vat.onlyEu') })
      return
    }

    setVatValidating(true)
    try {
      const result = await validateVATWithAPI(formatted)
      setVatValidation({
        valid: result.valid,
        error: vatErrorMessage(result),
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
          country: prev.country || (result.parsedAddress?.country ? (COUNTRY_NAMES[result.parsedAddress.country] || result.parsedAddress.country) : prev.country),
        }))
      }
    } catch {
      setVatValidation({ valid: false, error: t('onboarding.vat.failed') })
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
        toast.error(result.msg || t('onboarding.toasts.idProofUploadFailed'))
        return false
      }
      toast.success(t('onboarding.toasts.idProofUploaded'))
      setIdProofFile(null)
      await checkAuth()
      return true
    } catch {
      toast.error(t('onboarding.toasts.idProofUploadFailed'))
      return false
    } finally {
      setUploading(false)
    }
  }

  const hasIdInfoChanges = () => {
    const rawCountry = user?.idCountryOfIssue || ''
    const existingCountry = rawCountry.length === 2
      ? rawCountry.toUpperCase()
      : (EU_COUNTRIES.find((country) => country.name.toLowerCase() === rawCountry.toLowerCase())?.code || rawCountry)
    const existingDate = user?.idExpirationDate ? user.idExpirationDate.split('T')[0] : ''
    return idCountryOfIssue !== existingCountry || idExpirationDate !== existingDate
  }

  const saveIdInfo = async () => {
    if (!idCountryOfIssue.trim()) {
      toast.error(t('onboarding.toasts.countryRequired'))
      return false
    }
    if (!idExpirationDate) {
      toast.error(t('onboarding.toasts.expirationRequired'))
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
        toast.error(result.msg || t('onboarding.toasts.idSaveFailed'))
        return false
      }
      toast.success(t('onboarding.toasts.idSaved'))
      await checkAuth()
      return true
    } catch {
      toast.error(t('onboarding.toasts.idSaveFailed'))
      return false
    } finally {
      setIdInfoSaving(false)
    }
  }

  const handleIdStepContinue = async () => {
    if (!user?.idProofUrl && !idProofFile) {
      toast.error(t('onboarding.toasts.idProofRequired'))
      return
    }
    if (!idCountryOfIssue.trim() || !idExpirationDate) {
      toast.error(t('onboarding.toasts.idDetailsRequired'))
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

  const handleBusinessStepContinue = async () => {
    if (!businessInfo.companyName.trim()) {
      toast.error(t('onboarding.toasts.companyNameRequired'))
      return
    }
    if (!businessInfo.username.trim()) {
      toast.error(t('onboarding.toasts.usernameRequired'))
      return
    }
    if (businessInfo.username.length < 3 || businessInfo.username.length > 30) {
      toast.error(t('onboarding.toasts.usernameLength'))
      return
    }
    if (!vatNumber.trim()) {
      toast.error(t('onboarding.toasts.vatRequired'))
      return
    }
    const vatFormat = validateVATFormat(formatVATNumber(vatNumber))
    if (!vatFormat.valid) {
      toast.error(vatErrorMessage(vatFormat) || t('onboarding.toasts.invalidVat'))
      return
    }
    if (!businessInfo.address.trim() || !businessInfo.city.trim() || !businessInfo.country.trim() || !businessInfo.postalCode.trim()) {
      toast.error(t('onboarding.toasts.addressRequired'))
      return
    }
    if (!isAddressValid) {
      toast.error(t('onboarding.toasts.selectValidAddress'))
      return
    }

    setBusinessSaving(true)
    try {
      const result = await updateProfessionalBusinessProfile(vatNumber, {
        companyName: businessInfo.companyName,
        address: businessInfo.address,
        city: businessInfo.city,
        country: businessInfo.country,
        postalCode: businessInfo.postalCode,
        username: businessInfo.username,
        serviceCategories: selectedServices,
      })
      if (!result.success) {
        toast.error(result.errorCode ? t('onboarding.toasts.businessSaveFailed') : result.error)
        return
      }
      toast.success(t('onboarding.toasts.businessSaved'))
      await checkAuth()
      setCurrentStep(3)
    } catch {
      toast.error(t('onboarding.toasts.businessSaveFailed'))
    } finally {
      setBusinessSaving(false)
    }
  }

  const handleCompanyHoursContinue = async () => {
    const hasAvailableDay = Object.values(companyAvailability).some((day) => day.available)
    if (!hasAvailableDay) {
      toast.error(t('onboarding.toasts.availableDayRequired'))
      return
    }

    const availabilityErrors: Partial<Record<keyof CompanyAvailability, string>> = {}
    for (const [day, schedule] of Object.entries(companyAvailability) as Array<[keyof CompanyAvailability, DayAvailability]>) {
      if (!schedule.available) continue

      const startMinutes = timeToMinutes(schedule.startTime)
      const endMinutes = timeToMinutes(schedule.endTime)
      if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
        availabilityErrors[day] = t('onboarding.toasts.invalidTimeRange')
      }
    }

    if (Object.keys(availabilityErrors).length > 0) {
      setCompanyAvailabilityErrors(availabilityErrors)
      toast.error(t('onboarding.toasts.companyHoursInvalid'))
      return
    }

    setCompanyAvailabilityErrors({})
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
        toast.error(result.msg || t('onboarding.toasts.companyHoursSaveFailed'))
        return
      }
      toast.success(t('onboarding.toasts.companyHoursSaved'))
      await checkAuth()
      setCurrentStep(5)
    } catch {
      toast.error(t('onboarding.toasts.companyHoursSaveFailed'))
    } finally {
      setCompanySaving(false)
    }
  }

  const handlePersonalHoursContinue = async () => {
    const hasAvailableDay = Object.values(personalAvailability).some((day) => day.available)

    if (!hasAvailableDay) {
      setCurrentStep(6)
      return
    }

    const availabilityErrors: Partial<Record<keyof CompanyAvailability, string>> = {}
    for (const [day, schedule] of Object.entries(personalAvailability) as Array<[keyof CompanyAvailability, DayAvailability]>) {
      if (!schedule.available) continue

      const startMinutes = timeToMinutes(schedule.startTime)
      const endMinutes = timeToMinutes(schedule.endTime)
      if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
        availabilityErrors[day] = t('onboarding.toasts.invalidTimeRange')
      }
    }

    if (Object.keys(availabilityErrors).length > 0) {
      setPersonalAvailabilityErrors(availabilityErrors)
      toast.error(t('onboarding.toasts.personalHoursInvalid'))
      return
    }

    setPersonalAvailabilityErrors({})
    setPersonalSaving(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/professional-profile`, {
        method: 'PUT',
        headers: headersWithAuth(),
        credentials: 'include',
        body: JSON.stringify({
          availability: personalAvailability
        })
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        toast.error(result.msg || t('onboarding.toasts.personalHoursSaveFailed'))
        return
      }
      toast.success(t('onboarding.toasts.personalHoursSaved'))
      await checkAuth()
      setCurrentStep(6)
    } catch {
      toast.error(t('onboarding.toasts.personalHoursSaveFailed'))
    } finally {
      setPersonalSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (!agreements.rulesAccepted || !agreements.termsAccepted || !agreements.selfBillingAccepted) {
      toast.error(t('onboarding.toasts.acceptAgreements'))
      return
    }
    setSubmitting(true)
    setSubmitErrors([])
    try {
      const result = await submitForVerification({
        rulesAccepted: agreements.rulesAccepted,
        termsAccepted: agreements.termsAccepted,
        selfBillingAccepted: agreements.selfBillingAccepted,
      })
      if (result.success) {
        toast.success(t('onboarding.toasts.submitted'))
        await checkAuth()
        router.push('/dashboard?verification=pending')
      } else {
        const combinedRequirements: MissingRequirementInput[] = [
          ...(result.missingRequirementDetails || []),
          ...(result.missingRequirements || [])
        ]

        if (combinedRequirements.length > 0) {
          const resolution = resolveMissingRequirements(combinedRequirements, t('onboarding.missingRequirement'))
          setSubmitErrors(resolution.messages)
          toast.error(t('onboarding.toasts.completeSteps'))
          setCurrentStep(resolution.step)
        } else {
          toast.error(result.errorCode ? t('onboarding.toasts.submitFailed') : result.error)
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const progress = useMemo(() => (currentStep / STEPS.length) * 100, [currentStep])
  const activeStep = STEPS.find(s => s.id === currentStep)!
  const requiresVerification = Boolean(
    user?.role === 'professional' &&
    (!user.isEmailVerified || !user.isPhoneVerified)
  )

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50 p-4 pb-16">
        <div className="max-w-4xl mx-auto pt-10 space-y-8">
          {/* Header Skeleton */}
          <div className="text-center space-y-3">
            <Skeleton className="h-8 w-40 mx-auto rounded-full" />
            <Skeleton className="h-10 w-72 mx-auto" />
            <Skeleton className="h-4 w-80 mx-auto" />
          </div>
          {/* Progress Skeleton */}
          <div className="flex items-center gap-4 justify-center">
            {STEPS.map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-3 w-16 hidden sm:block" />
              </div>
            ))}
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          {/* Form Card Skeleton */}
          <div className="rounded-xl border border-gray-100 bg-white p-8 space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-4">
              <Skeleton className="h-10 w-28 rounded-lg" />
              <Skeleton className="h-10 w-28 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (requiresVerification) {
    return (
      <DualVerificationComponent
        email={user.email}
        phone={user.phone}
        onVerificationSuccess={() => {
          void checkAuth()
        }}
        onBack={() => router.push('/login')}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50 p-4 pb-16">
      <div className="max-w-4xl mx-auto pt-10 space-y-8">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-blue-100 to-purple-100 text-sm font-medium text-blue-700">
            {t('onboarding.header.welcome', { name: user.name?.split(' ')[0] || '' })}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
            {t('onboarding.header.title')}
          </h1>
          <p className="text-gray-500 max-w-lg mx-auto">
            {t('onboarding.header.subtitle')}
          </p>
        </div>

        {/* Progress bar */}
        <div className="px-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-600">{t('onboarding.header.stepOf', { current: currentStep, total: STEPS.length })}</span>
            <span className="text-sm font-medium text-blue-600">{t('onboarding.header.percentComplete', { percent: Math.round(progress) })}</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-fuchsia-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step indicators */}
        <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
          {STEPS.map((step) => {
            const isCompleted = step.id < currentStep
            const isCurrent = step.id === currentStep
            const StepIcon = step.icon
            return (
              <button
                type="button"
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
                    {t(step.titleKey)}
                  </span>
                  {step.required && (
                    <span className={`text-[9px] font-medium ${isCurrent ? 'text-red-500' : isCompleted ? 'text-green-500' : 'text-gray-300'}`}>
                      {isCompleted ? t('common.done') : t('common.required')}
                    </span>
                  )}
                  {!step.required && (
                    <span className={`text-[9px] ${isCompleted ? 'text-green-500 font-medium' : 'text-gray-300'}`}>
                      {isCompleted ? t('common.done') : t('common.optional')}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {currentStep === 1 && (
          <IdVerificationStep
            gradient={activeStep.gradient}
            userHasIdProof={Boolean(user.idProofUrl)}
            idCountryOfIssue={idCountryOfIssue}
            setIdCountryOfIssue={setIdCountryOfIssue}
            idExpirationDate={idExpirationDate}
            setIdExpirationDate={setIdExpirationDate}
            setIdProofFile={setIdProofFile}
            handleIdStepContinue={handleIdStepContinue}
            uploading={uploading}
            idInfoSaving={idInfoSaving}
          />
        )}

        {currentStep === 2 && (
          <BusinessDetailsStep
            gradient={activeStep.gradient}
            businessInfo={businessInfo}
            setBusinessInfo={setBusinessInfo}
            vatNumber={vatNumber}
            setVatNumber={(value) => {
              setVatNumber(value)
              setVatValidation({})
            }}
            vatValidation={vatValidation}
            vatValidating={vatValidating}
            validateVatNumber={validateVatNumber}
            handleAddressChange={handleAddressChange}
            setIsAddressValid={setIsAddressValid}
            serviceCatalog={serviceCatalog}
            serviceCatalogLoading={serviceCatalogLoading}
            selectedServices={selectedServices}
            setSelectedServices={setSelectedServices}
            setCurrentStep={setCurrentStep}
            handleBusinessStepContinue={handleBusinessStepContinue}
            businessSaving={businessSaving}
          />
        )}

        {currentStep === 3 && (
          <StripeIntegrationStep
            gradient={activeStep.gradient}
            stripeStatus={stripeStatus}
            stripeLoading={stripeLoading}
            stripeError={stripeError}
            refreshStripeStatus={refreshStripeStatus}
            openStripeSetup={() => router.push('/professional/stripe/setup?source=onboarding')}
            setCurrentStep={setCurrentStep}
          />
        )}

        {currentStep === 4 && (
          <CompanyAvailabilityStep
            gradient={activeStep.gradient}
            companyAvailability={companyAvailability}
            setCompanyAvailability={setCompanyAvailability}
            companyAvailabilityErrors={companyAvailabilityErrors}
            setCompanyAvailabilityErrors={setCompanyAvailabilityErrors}
            setCurrentStep={setCurrentStep}
            handleCompanyHoursContinue={handleCompanyHoursContinue}
            companySaving={companySaving}
          />
        )}

        {currentStep === 5 && (
          <PersonalAvailabilityStep
            gradient={activeStep.gradient}
            personalAvailability={personalAvailability}
            setPersonalAvailability={setPersonalAvailability}
            personalAvailabilityErrors={personalAvailabilityErrors}
            setPersonalAvailabilityErrors={setPersonalAvailabilityErrors}
            setCurrentStep={setCurrentStep}
            handlePersonalHoursContinue={handlePersonalHoursContinue}
            personalSaving={personalSaving}
          />
        )}

        {currentStep === 6 && (
          <EmployeesStep
            gradient={activeStep.gradient}
            setCurrentStep={setCurrentStep}
          />
        )}

        {currentStep === 7 && (
          <AgreementsStep
            gradient={activeStep.gradient}
            agreements={agreements}
            setAgreements={setAgreements}
            submitErrors={submitErrors}
            setCurrentStep={setCurrentStep}
            handleSubmit={handleSubmit}
            submitting={submitting}
          />
        )}

      </div>
    </div>
  )
}
