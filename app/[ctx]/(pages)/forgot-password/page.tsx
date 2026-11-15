"use client"

import type React from "react"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useErrorMessage } from "@/lib/i18n/useErrorMessage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, ArrowLeft, Mail } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

export default function ForgotPasswordPage() {
  const t = useTranslations("auth")
  const getErrorText = useErrorMessage()
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setEmailSent(true)
        toast.success(t('forgotPassword.sentToast'))
      } else {
        toast.error(getErrorText(data, t('forgotPassword.failed')))
      }
    } catch (error) {
      console.error('Forgot password error:', error)
      toast.error(getErrorText(error, t('forgotPassword.genericError')))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">{t("forgotPassword.title")}</CardTitle>
          <CardDescription className="text-center">
            {emailSent
              ? t("forgotPassword.descriptionSent")
              : t("forgotPassword.description")
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!emailSent ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("shared.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("shared.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full"
                />
              </div>

              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("forgotPassword.sending")}
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    {t("forgotPassword.sendResetLink")}
                  </>
                )}
              </Button>

              <div className="text-center mt-4">
                <Link
                  href="/login"
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {t("forgotPassword.backToLogin")}
                </Link>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start">
                  <Mail className="h-5 w-5 text-green-600 mt-0.5 mr-3" />
                  <div>
                    <h3 className="text-sm font-medium text-green-800">{t("forgotPassword.emailSentTitle")}</h3>
                    <p className="mt-2 text-sm text-green-700">
                      {t.rich("forgotPassword.emailSentBody", {
                        email,
                        strong: (chunks) => <strong>{chunks}</strong>,
                      })}
                    </p>
                    <p className="mt-2 text-sm text-green-700">
                      {t("forgotPassword.emailSentExpiry")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-center space-y-2">
                <p className="text-sm text-gray-600">
                  {t("forgotPassword.notReceived")}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEmailSent(false)
                    setEmail("")
                  }}
                  className="w-full"
                >
                  {t("forgotPassword.tryDifferentEmail")}
                </Button>
              </div>

              <div className="text-center mt-4">
                <Link
                  href="/login"
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {t("forgotPassword.backToLogin")}
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
