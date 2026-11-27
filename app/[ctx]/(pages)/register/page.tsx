'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, User, Mail, Phone, Lock, Briefcase, Gift, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/contexts/AuthContext'
import DualVerificationComponent from '@/components/DualVerificationComponent'
import {
  contactSaveMessageKey,
  contactSaveOutcome,
  fetchSignupDetails,
  freshResendDeadlines,
  resendDeadlinesAfterSave,
  splitSignupPhone,
  updateSignupDetails,
  type SignupDetails,
  type SignupResendDeadlines,
} from '@/lib/auth/signupContact'
import { otpResendDeadline } from '@/lib/auth/signupOtpCooldown'
import { useErrorMessage } from '@/lib/i18n/useErrorMessage'
import { PhoneCountryCodeSelect } from '@/components/PhoneCountryCodeSelect'
import { isValidPhoneNumber } from 'libphonenumber-js'

interface FormData {
  name: string
  email: string
  phone: string
  countryCode: string
  password: string
  confirmPassword: string
  referralCode: string
  marketingOptIn: boolean
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  )
}

function RegisterForm() {
  const t = useTranslations('auth')
  const getErrorText = useErrorMessage()
  const [currentStep, setCurrentStep] = useState<'form' | 'verification'>('form')
  // FT2-6C: the code step's per-channel resend cooldowns. Kept here so they
  // survive going back to the form; signup starts both, an edit restarts
  // only the changed channel's.
  const [resendDeadlines, setResendDeadlines] = useState<SignupResendDeadlines>({ email: null, phone: null })
  // Edit mode: the form updates the existing, not yet verified account
  // (loaded from the server) instead of creating one.
  const [editDetails, setEditDetails] = useState<SignupDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [verified, setVerified] = useState({ email: false, phone: false })
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    countryCode: '+32',
    password: '',
    confirmPassword: '',
    referralCode: '',
    marketingOptIn: false,
  })
  const [loading, setLoading] = useState(false)
  const [referralValid, setReferralValid] = useState<boolean | null>(null)
  const [referralReferrer, setReferralReferrer] = useState<string>('')
  const { signup, checkAuth } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const editMode = editDetails !== null

  // Back from the code step: the signup form again, prefilled with what the
  // server holds for this account. The password stays blank (= keep).
  const openEditForm = async () => {
    setLoadingDetails(true)
    try {
      const details = await fetchSignupDetails()
      const { countryCode, national } = splitSignupPhone(details.phone, formData.countryCode)
      setFormData((prev) => ({
        ...prev,
        name: details.name,
        email: details.email,
        countryCode,
        phone: national,
        password: '',
        confirmPassword: '',
        marketingOptIn: details.marketingOptIn,
      }))
      setVerified({ email: details.isEmailVerified, phone: details.isPhoneVerified })
      setEditDetails(details)
      setCurrentStep('form')
      return true
    } catch (error) {
      toast.error(getErrorText(error, t('signupEdit.loadFailed')))
      return false
    } finally {
      setLoadingDetails(false)
    }
  }

  // /register?edit=1: reached from the professional onboarding code step.
  const editRequested = searchParams.get('edit') === '1'
  useEffect(() => {
    if (editRequested) void openEditForm()
    // Runs once per request; openEditForm only reads stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequested])

  // Pre-fill referral code from URL query param
  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref) {
      setFormData(prev => ({ ...prev, referralCode: ref }))
    }
  }, [searchParams])

  // Validate referral code whenever it changes (debounced)
  useEffect(() => {
    const code = formData.referralCode.trim()
    if (!code) {
      setReferralValid(null)
      setReferralReferrer('')
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/referral/validate/${encodeURIComponent(code)}`, {
        signal: controller.signal,
      })
        .then(res => res.json())
        .then(data => {
          if (controller.signal.aborted) return
          if (data.success) {
            setReferralValid(true)
            setReferralReferrer(data.data?.referrerName || '')
          } else {
            setReferralValid(false)
            setReferralReferrer('')
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return
          }
          setReferralValid(false)
          setReferralReferrer('')
        })
    }, 500)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [formData.referralCode])

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast.error(t('validation.fullNameRequired'))
      return false
    }

    if (!formData.email.trim() || !/\S+@\S+\.\S+/.test(formData.email)) {
      toast.error(t('validation.emailInvalid'))
      return false
    }

    if (!formData.phone.trim() || !isValidPhoneNumber(formData.countryCode + formData.phone)) {
      toast.error(t('validation.phoneInvalid'))
      return false
    }

    // In edit mode a blank password keeps the current one.
    if ((!editMode || formData.password || formData.confirmPassword) && formData.password.length < 6) {
      toast.error(t('validation.passwordTooShort'))
      return false
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error(t('validation.passwordsDoNotMatch'))
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    if (editMode) {
      setLoading(true)
      try {
        const update = await updateSignupDetails({
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.countryCode + formData.phone.trim(),
          password: formData.password,
          marketingOptIn: formData.marketingOptIn,
        })
        const outcome = contactSaveOutcome(update)
        const message = t(`dualVerification.changeContact.${contactSaveMessageKey(outcome)}`)
        if (outcome === 'sent' || outcome === 'unchanged') toast.success(message)
        else toast.warning(message)
        setResendDeadlines((prev) => resendDeadlinesAfterSave(update, prev, otpResendDeadline))
        setVerified({ email: update.isEmailVerified, phone: update.isPhoneVerified })
        const { countryCode, national } = splitSignupPhone(update.phone, formData.countryCode)
        setFormData((prev) => ({ ...prev, email: update.email, countryCode, phone: national, password: '', confirmPassword: '' }))
        setEditDetails(null)
        setCurrentStep('verification')
        void checkAuth()
      } catch (error) {
        toast.error(getErrorText(error, t('dualVerification.changeContact.failed')))
      } finally {
        setLoading(false)
      }
      return
    }

    setLoading(true)
    try {
      const trimmedReferralCode = formData.referralCode.trim()
      const success = await signup({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.countryCode + formData.phone.trim(),
        password: formData.password,
        role: 'professional',
        ...(trimmedReferralCode && referralValid === true && {
          referralCode: trimmedReferralCode,
        }),
        marketingOptIn: formData.marketingOptIn,
      })

      if (success) {
        setResendDeadlines(freshResendDeadlines(otpResendDeadline))
        setVerified({ email: false, phone: false })
        setCurrentStep('verification')
      }
    } catch (error) {
      console.error('Registration error:', error)
    } finally {
      setLoading(false)
    }
  }
  const handleVerificationSuccess = () => {
    toast.success(t('register.verifiedToast'))
    router.push('/professional/onboarding?welcome=true')
  }

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  if (currentStep === 'verification') {
    return (
      <DualVerificationComponent
        email={formData.email}
        phone={formData.countryCode + formData.phone}
        onVerificationSuccess={handleVerificationSuccess}
        onBack={() => { if (!loadingDetails) void openEditForm() }}
        resendDeadlines={resendDeadlines}
        onResendDeadlinesChange={setResendDeadlines}
        initialVerified={verified}
      />
    )
  }

  if (editRequested && loadingDetails && !editMode) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-gray-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        {t('signupEdit.loading')}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {editMode ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setEditDetails(null); setCurrentStep('verification') }}
            className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('signupEdit.backToCodes')}
          </Button>
        ) : (
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-6 left-6 flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('shared.backToHome')}
            </Button>
          </Link>
        )}

        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-6">
            <div className="flex items-center justify-center mb-4">
              <div className="p-3 bg-purple-100 rounded-full">
                <Briefcase className="h-8 w-8 text-purple-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">{editMode ? t('signupEdit.title') : t('register.title')}</CardTitle>
            <CardDescription className="text-gray-600">
              {editMode ? t('signupEdit.description') : t('register.description')}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="name">{t('shared.fullName')}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="name"
                    type="text"
                    placeholder={t('shared.fullNamePlaceholder')}
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">{t('shared.emailAddress')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('shared.emailPlaceholder')}
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="pl-10"
                    disabled={editMode && verified.email}
                    required
                  />
                </div>
                {editMode && verified.email && (
                  <p className="text-xs text-gray-500">{t('signupEdit.verifiedLocked')}</p>
                )}
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone">{t('shared.phoneNumber')}</Label>
                <div className="flex gap-2">
                  <PhoneCountryCodeSelect
                    value={formData.countryCode}
                    onValueChange={(value) => handleInputChange('countryCode', value)}
                    disabled={editMode && verified.phone}
                  />
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder={t('shared.phonePlaceholder')}
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="pl-10"
                      disabled={editMode && verified.phone}
                      required
                    />
                  </div>
                </div>
                {editMode && verified.phone && (
                  <p className="text-xs text-gray-500">{t('signupEdit.verifiedLocked')}</p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">{t('shared.password')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={editMode ? t('signupEdit.passwordKeepPlaceholder') : t('shared.createPasswordPlaceholder')}
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className="pl-10"
                    required={!editMode}
                  />
                </div>
                {editMode && (
                  <p className="text-xs text-gray-500">{t('signupEdit.passwordOptionalHint')}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('shared.confirmPassword')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder={t('shared.confirmPasswordPlaceholder')}
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    className="pl-10"
                    required={!editMode}
                  />
                </div>
              </div>

              {/* Referral Code (applied when the account was created; not editable afterwards) */}
              {!editMode && (
              <div className="space-y-2">
                <Label htmlFor="referralCode">{t('shared.referralCode')}</Label>
                <div className="relative">
                  <Gift className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="referralCode"
                    type="text"
                    placeholder={t('shared.referralCodePlaceholder')}
                    value={formData.referralCode}
                    onChange={(e) => handleInputChange('referralCode', e.target.value.toUpperCase())}
                    className="pl-10"
                  />
                </div>
                {referralValid === true && referralReferrer && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {t('shared.referredBy', { name: referralReferrer })}
                  </p>
                )}
                {referralValid === false && formData.referralCode && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {t('shared.invalidReferral')}
                  </p>
                )}
              </div>
              )}

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700 font-medium">{t('register.welcomeTitle')}</p>
                <p className="text-xs text-blue-600 mt-1">
                  {t('register.welcomeBody')}
                </p>
              </div>

              {/* Marketing opt-in (explicit, unchecked by default) */}
              <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 p-3 cursor-pointer">
                <input
                  id="marketingOptIn"
                  type="checkbox"
                  checked={formData.marketingOptIn}
                  disabled={editMode && !editDetails?.marketingOptInEditable}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      marketingOptIn: e.target.checked,
                    }))
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-600 leading-relaxed">
                  {t('shared.marketingOptIn')}
                  {editMode && !editDetails?.marketingOptInEditable && (
                    <span className="mt-1 block text-gray-500">{t('signupEdit.marketingLocked')}</span>
                  )}
                </span>
              </label>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                {editMode
                  ? (loading ? t('signupEdit.saving') : t('signupEdit.save'))
                  : (loading ? t('register.creatingAccount') : t('register.createAccount'))}
              </Button>
            </form>

            {!editMode && (
            <div className="text-center text-sm text-gray-600">
              {t('shared.alreadyHaveAccount')}{' '}
              <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-500">
                {t('shared.signInHere')}
              </Link>
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
