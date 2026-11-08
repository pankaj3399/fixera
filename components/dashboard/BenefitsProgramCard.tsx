'use client'

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Award, Gift, Loader2, TrendingUp } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import { getAuthToken } from "@/lib/utils"
import TierBadge from "@/components/dashboard/TierBadge"

type CustomerBenefitsResponse = {
  loyaltyStatus?: {
    level?: string
    nextLevel?: string | null
    amountToNextTier?: number | null
    progress?: number | null
  }
  points?: {
    balance?: number
    euroValue?: number
    expiryDate?: string
  }
  userStats?: {
    totalSpent?: number
    tierInfo?: {
      color?: string | null
    }
  }
  benefits?: string[]
}

type ProfessionalBenefitsResponse = {
  level?: {
    currentLevel?: string
    color?: string | null
    nextLevel?: {
      name?: string
      progress?: number
      missingCriteria?: string[]
    }
  }
  points?: {
    balance?: number
    euroValue?: number
    expiryDate?: string
  }
}

interface BenefitsProgramCardProps {
  customerData?: CustomerBenefitsResponse | null
  professionalData?: ProfessionalBenefitsResponse | null
}

export default function BenefitsProgramCard({
  customerData: customerDataProp,
  professionalData: professionalDataProp,
}: BenefitsProgramCardProps) {
  const { user } = useAuth()
  const t = useTranslations("dashboardWidgets")
  const { formatMoney } = useCurrency()
  const { intl } = useFormatLocale()
  const hasExternalData = customerDataProp !== undefined || professionalDataProp !== undefined
  const [loading, setLoading] = useState(!hasExternalData)
  const [customerData, setCustomerData] = useState<CustomerBenefitsResponse | null>(customerDataProp ?? null)
  const [professionalData, setProfessionalData] = useState<ProfessionalBenefitsResponse | null>(professionalDataProp ?? null)

  useEffect(() => {
    if (!hasExternalData) return
    setCustomerData(customerDataProp ?? null)
    setProfessionalData(professionalDataProp ?? null)
    setLoading(false)
  }, [customerDataProp, hasExternalData, professionalDataProp])

  useEffect(() => {
    if (hasExternalData) return
    const controller = new AbortController()
    const load = async () => {
      const role = user?.role
      setCustomerData(null)
      setProfessionalData(null)
      if (!user || (user.role !== "customer" && user.role !== "professional")) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const token = getAuthToken()
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const endpoint =
          user.role === "customer"
            ? "/api/user/loyalty/status"
            : "/api/user/professional-level"
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${endpoint}`, {
          credentials: "include",
          headers,
          signal: controller.signal,
        })
        const payload = await response.json()
        if (controller.signal.aborted || user.role !== role || !response.ok || !payload.success) return
        if (role === "customer") {
          setCustomerData(payload.data || null)
        } else {
          setProfessionalData(payload.data || null)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        console.error("Failed to load benefits program data:", error)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [hasExternalData, user])

  if (!user || (user.role !== "customer" && user.role !== "professional")) return null

  const isCustomer = user.role === "customer"
  const currentLevel = isCustomer
    ? customerData?.loyaltyStatus?.level || user.loyaltyLevel || "Bronze"
    : professionalData?.level?.currentLevel || user.professionalLevel || "New"
  // Task 14b: the tag uses the colour from the level/tier configuration.
  const currentLevelColor = isCustomer
    ? customerData?.userStats?.tierInfo?.color || null
    : professionalData?.level?.color || null
  const nextLevel = isCustomer
    ? customerData?.loyaltyStatus?.nextLevel
    : professionalData?.level?.nextLevel?.name
  const progress = isCustomer
    ? customerData?.loyaltyStatus?.progress ?? 0
    : professionalData?.level?.nextLevel?.progress ?? 0
  const pointsBalance = isCustomer
    ? customerData?.points?.balance ?? user.points ?? 0
    : professionalData?.points?.balance ?? user.points ?? 0
  const pointsExpiry = isCustomer
    ? customerData?.points?.expiryDate ?? user.pointsExpiry
    : professionalData?.points?.expiryDate ?? user.pointsExpiry
  const perks = isCustomer
    ? customerData?.benefits || []
    : professionalData?.level?.nextLevel?.missingCriteria || []

  return (
    <Card className="bg-white/85 backdrop-blur border border-indigo-100 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-indigo-600" />
          {t("benefitsProgram.title")} <TierBadge level={currentLevel} color={currentLevelColor} />
        </CardTitle>
        <CardDescription>
          {isCustomer ? t("benefitsProgram.descriptionCustomer") : t("benefitsProgram.descriptionProfessional")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("benefitsProgram.loading")}
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{t("benefitsProgram.currentLevel")}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currentLevel}</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{t("benefitsProgram.points")}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{pointsBalance}</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{isCustomer ? t("benefitsProgram.totalSpent") : t("benefitsProgram.nextLevel")}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {isCustomer ? formatMoney(customerData?.userStats?.totalSpent ?? user.totalSpent ?? 0) : nextLevel || t("benefitsProgram.topLevel")}
                </p>
              </div>
            </div>

            {nextLevel && (
              <div className="rounded-lg border bg-indigo-50 p-3">
                <div className="flex items-center justify-between text-sm text-indigo-900">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    {t("benefitsProgram.nextLevelValue", { level: nextLevel })}
                  </span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="mt-3" />
                {isCustomer && customerData?.loyaltyStatus?.amountToNextTier != null && (
                  <p className="mt-2 text-xs text-indigo-800">
                    {t("benefitsProgram.spendMore", {
                      amount: formatMoney(customerData.loyaltyStatus.amountToNextTier),
                      level: nextLevel,
                    })}
                  </p>
                )}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-lg border bg-white p-3">
                <p className="text-xs font-medium text-slate-700">{t("benefitsProgram.referral")}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {isCustomer ? t("benefitsProgram.referralCustomer") : t("benefitsProgram.referralProfessional")}
                </p>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <p className="text-xs font-medium text-slate-700">{t("benefitsProgram.pointsExpiry")}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {pointsExpiry ? new Date(pointsExpiry).toLocaleDateString(intl) : t("benefitsProgram.noExpiry")}
                </p>
              </div>
            </div>

            {perks.length > 0 && (
              <div className="rounded-lg border bg-white p-3">
                <p className="mb-2 text-xs font-medium text-slate-700 flex items-center gap-2">
                  <Award className="h-4 w-4 text-indigo-600" />
                  {isCustomer ? t("benefitsProgram.benefits") : t("benefitsProgram.nextLevelRequirements")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {perks.slice(0, 6).map((item) => (
                    <Badge key={item} variant="secondary" className="max-w-full whitespace-normal text-left">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
