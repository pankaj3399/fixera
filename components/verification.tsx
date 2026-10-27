"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Mail, Phone, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import axios from "axios"
import {
  restartOtpResend,
  tickOtpResend,
  formatOtpCooldown,
  type OtpResendState,
} from "@/lib/auth/signupOtpCooldown"

interface VerificationComponentProps {
  email: string
  phone: string
  onVerificationSuccess: () => void
}

export default function VerificationComponent({ email, phone, onVerificationSuccess }: VerificationComponentProps) {
  const t = useTranslations("auth")
  const [emailOtp, setEmailOtp] = useState("")
  const [phoneOtp, setPhoneOtp] = useState("")
  const [emailVerified, setEmailVerified] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // Resend cooldown (120s, UX only — OTP validity is server-side). Both
  // channels share the DualVerificationComponent cooldown semantics.
  const [emailResend, setEmailResend] = useState<OtpResendState>({ disabled: false, remainingSeconds: 0 })
  const [phoneResend, setPhoneResend] = useState<OtpResendState>({ disabled: false, remainingSeconds: 0 })

  useEffect(() => {
    const timer = setInterval(() => {
      setEmailResend((prev) => tickOtpResend(prev))
      setPhoneResend((prev) => tickOtpResend(prev))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const handleEmailVerification = async () => {
    if (emailOtp.length !== 6) {
      toast.error(t("validation.otpInvalid"))
      return
    }

    setIsLoading(true)
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/verify-email`, {
        email,
        otp: emailOtp,
      })

      if (response.status === 200) {
        setEmailVerified(true)
        toast.success(t("verification.emailVerified"))
      }
    } catch {
      toast.error(t("verification.emailInvalid"))
    }
    setIsLoading(false)
  }

  const handlePhoneVerification = async () => {
    if (phoneOtp.length !== 6) {
      toast.error(t("validation.otpInvalid"))
      return
    }

    setIsLoading(true)
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/verify-phone`, {
        phone,
        otp: phoneOtp,
      })

      if (response.status === 200) {
        setPhoneVerified(true)
        toast.success(t("verification.phoneVerified"))
      }
    } catch {
      toast.error(t("verification.phoneInvalid"))
    }
    setIsLoading(false)
  }

  const handleContinue = () => {
    if (emailVerified && phoneVerified) {
      onVerificationSuccess()
    } else {
      toast.error(t("verification.bothRequired"))
    }
  }

  const resendEmailOtp = async () => {
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/resend-email-otp`, { email })
      setEmailResend(restartOtpResend())
      toast.success(t("verification.emailResent"))
    } catch {
      toast.error(t("verification.emailResendFailed"))
    }
  }

  const resendPhoneOtp = async () => {
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/resend-phone-otp`, { phone })
      setPhoneResend(restartOtpResend())
      toast.success(t("verification.phoneResent"))
    } catch {
      toast.error(t("verification.phoneResendFailed"))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">{t("verification.title")}</CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-400">
            {t("verification.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Verification */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">{t("verification.emailSection")}</span>
              {emailVerified && <CheckCircle className="h-4 w-4 text-green-600" />}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t("verification.emailCodeSentTo", { email })}</p>
            <div className="flex flex-col items-center gap-3">
              <InputOTP maxLength={6} value={emailOtp} onChange={setEmailOtp} disabled={emailVerified}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
              {!emailVerified && (
                <div className="flex gap-2">
                  <Button onClick={handleEmailVerification} disabled={isLoading || emailOtp.length !== 6} size="sm">
                    {t("verification.verifyEmail")}
                  </Button>
                  <Button variant="outline" onClick={resendEmailOtp} size="sm" disabled={emailResend.disabled}>
                    {emailResend.disabled
                      ? t("verification.resendIn", { time: formatOtpCooldown(emailResend.remainingSeconds) })
                      : t("verification.resend")}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Phone Verification */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">{t("verification.phoneSection")}</span>
              {phoneVerified && <CheckCircle className="h-4 w-4 text-green-600" />}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t("verification.phoneCodeSentTo", { phone })}</p>
            <div className="flex flex-col items-center gap-3">
              <InputOTP maxLength={6} value={phoneOtp} onChange={setPhoneOtp} disabled={phoneVerified}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
              {!phoneVerified && (
                <div className="flex gap-2">
                  <Button onClick={handlePhoneVerification} disabled={isLoading || phoneOtp.length !== 6} size="sm">
                    {t("verification.verifyPhone")}
                  </Button>
                  <Button variant="outline" onClick={resendPhoneOtp} size="sm" disabled={phoneResend.disabled}>
                    {phoneResend.disabled
                      ? t("verification.resendIn", { time: formatOtpCooldown(phoneResend.remainingSeconds) })
                      : t("verification.resend")}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Continue Button */}
          <Button
            onClick={handleContinue}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            disabled={!emailVerified || !phoneVerified}
          >
            {t("verification.continueToDashboard")}
          </Button>

          <div className="text-center">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {t("verification.help")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
