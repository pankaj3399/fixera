'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { isValidPhoneNumber } from 'libphonenumber-js'
import { Mail, Phone, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PhoneCountryCodeSelect } from '@/components/PhoneCountryCodeSelect'
import { useErrorMessage } from '@/lib/i18n/useErrorMessage'
import { splitSignupPhone, updateSignupContact, type SignupContactUpdate } from '@/lib/auth/signupContact'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface SignupContactEditorProps {
  email: string
  phone: string
  emailVerified: boolean
  phoneVerified: boolean
  onSaved: (update: SignupContactUpdate) => void
  onCancel: () => void
}

/**
 * "Back" from the signup OTP step (FT2-6C): change the email and/or phone
 * the codes go to. The account already exists, so this updates it instead of
 * resubmitting the signup form. A verified channel is shown read-only.
 */
export default function SignupContactEditor({ email, phone, emailVerified, phoneVerified, onSaved, onCancel }: SignupContactEditorProps) {
  const t = useTranslations('auth')
  const getErrorText = useErrorMessage()
  const initialPhone = splitSignupPhone(phone)
  const [nextEmail, setNextEmail] = useState(email)
  const [countryCode, setCountryCode] = useState(initialPhone.countryCode)
  const [national, setNational] = useState(initialPhone.national)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedEmail = nextEmail.trim().toLowerCase()
    const fullPhone = countryCode + national.replace(/\s+/g, '')
    if (!emailVerified && !EMAIL_RE.test(trimmedEmail)) {
      toast.error(t('dualVerification.changeContact.invalidEmail'))
      return
    }
    if (!phoneVerified && !isValidPhoneNumber(fullPhone)) {
      toast.error(t('dualVerification.changeContact.invalidPhone'))
      return
    }
    setSaving(true)
    try {
      const update = await updateSignupContact({
        ...(emailVerified ? {} : { email: trimmedEmail }),
        ...(phoneVerified ? {} : { phone: fullPhone }),
      })
      toast.success(
        update.emailChanged || update.phoneChanged
          ? t('dualVerification.changeContact.savedToast')
          : t('dualVerification.changeContact.unchangedToast'),
      )
      onSaved(update)
    } catch (error) {
      toast.error(getErrorText(error, t('dualVerification.changeContact.failed')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mx-auto max-w-lg shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">{t('dualVerification.changeContact.title')}</CardTitle>
        <CardDescription>{t('dualVerification.changeContact.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signup-contact-email">{t('dualVerification.changeContact.emailLabel')}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="signup-contact-email"
                type="email"
                value={nextEmail}
                onChange={(e) => setNextEmail(e.target.value)}
                className="pl-10"
                disabled={emailVerified || saving}
                required
              />
            </div>
            {emailVerified && <p className="text-xs text-gray-500">{t('dualVerification.changeContact.alreadyVerified')}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-contact-phone">{t('dualVerification.changeContact.phoneLabel')}</Label>
            <div className="flex gap-2">
              <PhoneCountryCodeSelect value={countryCode} onValueChange={setCountryCode} disabled={phoneVerified || saving} />
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="signup-contact-phone"
                  type="tel"
                  value={national}
                  onChange={(e) => setNational(e.target.value)}
                  className="pl-10"
                  disabled={phoneVerified || saving}
                  required
                />
              </div>
            </div>
            {phoneVerified && <p className="text-xs text-gray-500">{t('dualVerification.changeContact.alreadyVerified')}</p>}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              {t('dualVerification.changeContact.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? t('dualVerification.changeContact.saving') : t('dualVerification.changeContact.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
