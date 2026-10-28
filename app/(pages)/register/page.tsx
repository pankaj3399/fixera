'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, User, Mail, Phone, Lock, Briefcase, Gift, CheckCircle2, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/contexts/AuthContext'
import DualVerificationComponent from '@/components/DualVerificationComponent'
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
  const [currentStep, setCurrentStep] = useState<'form' | 'verification'>('form')
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
  const { signup } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

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

    if (formData.password.length < 6) {
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
        onBack={() => setCurrentStep('form')}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
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

        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-6">
            <div className="flex items-center justify-center mb-4">
              <div className="p-3 bg-purple-100 rounded-full">
                <Briefcase className="h-8 w-8 text-purple-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">{t('register.title')}</CardTitle>
            <CardDescription className="text-gray-600">
              {t('register.description')}
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
                    required
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone">{t('shared.phoneNumber')}</Label>
                <div className="flex gap-2">
                  <PhoneCountryCodeSelect
                    value={formData.countryCode}
                    onValueChange={(value) => handleInputChange('countryCode', value)}
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
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">{t('shared.password')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={t('shared.createPasswordPlaceholder')}
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
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
                    required
                  />
                </div>
              </div>

              {/* Referral Code */}
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
                </span>
              </label>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                {loading ? t('register.creatingAccount') : t('register.createAccount')}
              </Button>
            </form>

            <div className="text-center text-sm text-gray-600">
              {t('shared.alreadyHaveAccount')}{' '}
              <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-500">
                {t('shared.signInHere')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
