"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Mail, Phone, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import axios from "axios"

interface VerificationComponentProps {
  email: string
  phone: string
  onVerificationSuccess: () => void
}

export default function VerificationComponent({ email, phone, onVerificationSuccess }: VerificationComponentProps) {
  const [emailOtp, setEmailOtp] = useState("")
  const [phoneOtp, setPhoneOtp] = useState("")
  const [emailVerified, setEmailVerified] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleEmailVerification = async () => {
    if (emailOtp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP")
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
        toast.success("Email verified successfully!")
      }
    } catch {
      toast.error("Invalid email OTP. Please try again.")
    }
    setIsLoading(false)
  }

  const handlePhoneVerification = async () => {
    if (phoneOtp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP")
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
        toast.success("Phone verified successfully!")
      }
    } catch {
      toast.error("Invalid phone OTP. Please try again.")
    }
    setIsLoading(false)
  }

  const handleContinue = () => {
    if (emailVerified && phoneVerified) {
      onVerificationSuccess()
    } else {
      toast.error("Please verify both email and phone to continue")
    }
  }

  const resendEmailOtp = async () => {
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/resend-email-otp`, { email })
      toast.success("Email OTP resent successfully!")
    } catch {
      toast.error("Failed to resend email OTP")
    }
  }

  const resendPhoneOtp = async () => {
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/resend-phone-otp`, { phone })
      toast.success("Phone OTP resent successfully!")
    } catch {
      toast.error("Failed to resend phone OTP")
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">Verify Your Account</CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-400">
            We&apos;ve sent verification codes to your email and phone
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Verification */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">Email Verification</span>
              {emailVerified && <CheckCircle className="h-4 w-4 text-green-600" />}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">Enter the 6-digit code sent to {email}</p>
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
                    Verify Email
                  </Button>
                  <Button variant="outline" onClick={resendEmailOtp} size="sm">
                    Resend
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Phone Verification */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">Phone Verification</span>
              {phoneVerified && <CheckCircle className="h-4 w-4 text-green-600" />}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">Enter the 6-digit code sent to {phone}</p>
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
                    Verify Phone
                  </Button>
                  <Button variant="outline" onClick={resendPhoneOtp} size="sm">
                    Resend
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
            Continue to Dashboard
          </Button>

          <div className="text-center">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Didn&apos;t receive the codes? Check your spam folder or try resending.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
