"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Mail, Phone, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import axios from "axios"
import {
  formatOtpCooldown,
  otpResendDeadline,
  otpResendStateAt,
} from "@/lib/auth/signupOtpCooldown"

interface VerificationComponentProps {
  email: string
  phone: string
  onVerificationSuccess: () => void
  /**
   * When the initial codes were actually sent (epoch ms), if known. The first
   * resend then waits out the cooldown from that send. Unknown (omitted) keeps
   * resend available: no send time is ever assumed from a mount or re-render.
   */
  emailCodeSentAt?: number | null
  phoneCodeSentAt?: number | null
}

/** Cooldown deadline for a recorded send time; null when the time is unknown. */
const deadlineFromSentAt = (sentAt: number | null | undefined): number | null =>
  typeof sentAt === "number" && Number.isFinite(sentAt) ? otpResendDeadline(sentAt) : null

export default function VerificationComponent({
  email,
  phone,
  onVerificationSuccess,
  emailCodeSentAt,
  phoneCodeSentAt,
}: VerificationComponentProps) {
  const t = useTranslations("auth")
  const [emailOtp, setEmailOtp] = useState("")
  const [phoneOtp, setPhoneOtp] = useState("")
  const [emailVerified, setEmailVerified] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // Resend cooldown (120s, UX only — OTP validity is server-side). Both
  // channels share the DualVerificationComponent cooldown semantics. The
  // remaining time derives from a wall-clock deadline, so throttled timers
  // in a hidden tab never extend the wait.
  const [emailResendDeadline, setEmailResendDeadline] = useState<number | null>(() => deadlineFromSentAt(emailCodeSentAt))
  const [phoneResendDeadline, setPhoneResendDeadline] = useState<number | null>(() => deadlineFromSentAt(phoneCodeSentAt))
  const [now, setNow] = useState(() => Date.now())
  // A send time reported after mount moves the deadline forward, never back.
  useEffect(() => {
    const deadline = deadlineFromSentAt(emailCodeSentAt)
    if (deadline == null) return
    setEmailResendDeadline((prev) => (prev != null && prev >= deadline ? prev : deadline))
  }, [emailCodeSentAt])
  useEffect(() => {
    const deadline = deadlineFromSentAt(phoneCodeSentAt)
    if (deadline == null) return
    setPhoneResendDeadline((prev) => (prev != null && prev >= deadline ? prev : deadline))
  }, [phoneCodeSentAt])
  // In-flight resend guard: the cooldown starts only once the request
  // succeeds, so a double click must not send a second OTP/SMS meanwhile.
  // The ref blocks re-entry before React re-renders; the state disables the button.
  const resendInFlight = useRef({ email: false, phone: false })
  const [emailResending, setEmailResending] = useState(false)
  const [phoneResending, setPhoneResending] = useState(false)
  const emailResend = otpResendStateAt(emailResendDeadline, now)
  const phoneResend = otpResendStateAt(phoneResendDeadline, now)

  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = setInterval(tick, 1000)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
    }
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
    if (resendInFlight.current.email) return
    resendInFlight.current.email = true
    setEmailResending(true)
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/resend-email-otp`, { email })
      setEmailResendDeadline(otpResendDeadline())
      setNow(Date.now())
      toast.success(t("verification.emailResent"))
    } catch {
      toast.error(t("verification.emailResendFailed"))
    } finally {
      resendInFlight.current.email = false
      setEmailResending(false)
    }
  }

  const resendPhoneOtp = async () => {
    if (resendInFlight.current.phone) return
    resendInFlight.current.phone = true
    setPhoneResending(true)
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/resend-phone-otp`, { phone })
      setPhoneResendDeadline(otpResendDeadline())
      setNow(Date.now())
      toast.success(t("verification.phoneResent"))
    } catch {
      toast.error(t("verification.phoneResendFailed"))
    } finally {
      resendInFlight.current.phone = false
      setPhoneResending(false)
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
                  <Button variant="outline" onClick={resendEmailOtp} size="sm" disabled={emailResend.disabled || emailResending}>
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
                  <Button variant="outline" onClick={resendPhoneOtp} size="sm" disabled={phoneResend.disabled || phoneResending}>
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
