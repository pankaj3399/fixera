'use client'

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Gift, Loader2, Sparkles, TrendingUp } from "lucide-react"
import { getAuthToken } from "@/lib/utils"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import BenefitsProgramCard from "@/components/dashboard/BenefitsProgramCard"
import ReferralCard from "@/components/dashboard/ReferralCard"
import BacklinkCard from "@/components/dashboard/BacklinkCard"

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
    totalBookings?: number
    tierInfo?: {
      discountPercentage?: number
      maxDiscountAmount?: number | null
    }
  }
  benefits?: string[]
}

type ProfessionalBenefitsResponse = {
  level?: {
    currentLevel?: string
    effectiveBookings?: number
    nextLevel?: {
      name?: string
      progress?: number
      missingCriteria?: string[]
    }
    perks?: {
      badge?: string
      commissionReduction?: number
      searchRankingBoost?: number
    }
  }
  points?: {
    balance?: number
    euroValue?: number
    expiryDate?: string
  }
}

type SavingsSummaryResponse = {
  groups?: Array<{
    currency?: string;
    byType?: { recurring?: number; loyalty?: number; discountCode?: number; points?: number };
    referral?: number | null;
    totalRecorded?: number;
    bookingCount?: number;
    coverage?: 'complete' | 'partial';
    excludedUncertain?: number;
    unrecorded?: number;
  }>;
  complete?: boolean;
  settledBookingCount?: number;
  unrecordedBookingCount?: number;
  excludedUncertainCount?: number;
  referral?: null;
  referralStatus?: string;
  totalLabel?: string;
}

type ReferralData = {  referralCode?: string
  points?: number
  pointsExpiry?: string | null
  totalReferrals?: number
  completedReferrals?: number
  pendingReferrals?: number
  totalPointsEarned?: number
  programEnabled?: boolean
  referrerRewardAmount?: number
  referredCustomerDiscountType?: string
  referredCustomerDiscountValue?: number
  referredCustomerDiscountMaxAmount?: number
  referrals?: Array<{
    _id: string
    referredUser: { name: string; email: string; createdAt: string } | null
    status: string
    rewardAmount: number
    createdAt: string
    expiresAt: string
  }>
  conversionRate?: number
}

function benefitsAuthHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function benefitsEndpointForRole(role: "customer" | "professional"): string {
  return role === "customer" ? "/api/user/loyalty/status" : "/api/user/professional-level"
}

export default function BenefitsPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const t = useTranslations("dashboard")
  const { intl } = useFormatLocale()
  const { formatMoney } = useCurrency()
  const [pageLoading, setPageLoading] = useState(true)
  const [customerData, setCustomerData] = useState<CustomerBenefitsResponse | null>(null)
  const [professionalData, setProfessionalData] = useState<ProfessionalBenefitsResponse | null>(null)
  const [referralData, setReferralData] = useState<ReferralData | null>(null)
  const [savingsData, setSavingsData] = useState<SavingsSummaryResponse | null>(null)

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login?redirect=/dashboard/benefits")
    }
  }, [isAuthenticated, loading, router])

  const refreshBenefitsSummary = useCallback(async () => {
    if (!user || (user.role !== "customer" && user.role !== "professional")) return

    const headers = benefitsAuthHeaders()
    const benefitsEndpoint = benefitsEndpointForRole(user.role)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${benefitsEndpoint}`, {
        credentials: "include",
        headers,
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) return

      if (user.role === "customer") {
        setCustomerData(payload.data ?? null)
        setProfessionalData(null)
      } else {
        setProfessionalData(payload.data ?? null)
        setCustomerData(null)
      }
    } catch (error) {
      console.error("Failed to refresh benefits summary:", error)
    }
  }, [user])

  useEffect(() => {
    if (!user || (user.role !== "customer" && user.role !== "professional")) {
      setPageLoading(false)
      return
    }

    const controller = new AbortController()

    const load = async () => {
      setPageLoading(true)
      const headers = benefitsAuthHeaders()
      const benefitsEndpoint = benefitsEndpointForRole(user.role as "customer" | "professional")

      const readJsonSafely = async (response: Response) => {
        try {
          return await response.json()
        } catch (error) {
          console.error("Failed to parse benefits page response:", error)
          return null
        }
      }

      const [benefitsResult, referralResult] = await Promise.allSettled([
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${benefitsEndpoint}`, {
          credentials: "include",
          headers,
          signal: controller.signal,
        }),
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/referral/stats`, {
          credentials: "include",
          headers,
          signal: controller.signal,
        }),
      ])

      if (user.role === "customer") {
        try {
          const savingsResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/savings/summary`, {
            credentials: "include",
            headers,
            signal: controller.signal,
          })
          const savingsPayload = await readJsonSafely(savingsResponse)
          if (!controller.signal.aborted && savingsResponse.ok && savingsPayload?.success) {
            setSavingsData(savingsPayload.data ?? null)
          }
        } catch (error) {
          if ((error as Error)?.name !== 'AbortError') console.error("Failed to fetch savings data:", error)
        }
      }

      if (controller.signal.aborted) return

      if (benefitsResult.status === "fulfilled") {
        const benefitsPayload = await readJsonSafely(benefitsResult.value)
        if (!controller.signal.aborted && benefitsResult.value.ok && benefitsPayload?.success) {
          if (user.role === "customer") {
            setCustomerData(benefitsPayload.data ?? null)
            setProfessionalData(null)
          } else {
            setProfessionalData(benefitsPayload.data ?? null)
            setCustomerData(null)
          }
        }
      } else {
        console.error("Failed to fetch benefits data:", benefitsResult.reason)
      }

      if (referralResult.status === "fulfilled") {
        const referralPayload = await readJsonSafely(referralResult.value)
        if (!controller.signal.aborted && referralResult.value.ok && referralPayload?.success) {
          setReferralData(referralPayload.data ?? null)
        }
      } else {
        console.error("Failed to fetch referral data:", referralResult.reason)
      }

      if (!controller.signal.aborted) {
        setPageLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [user])

  const isCustomer = user?.role === "customer"
  const currentLevel = isCustomer
    ? customerData?.loyaltyStatus?.level || user?.loyaltyLevel || "Bronze"
    : professionalData?.level?.currentLevel || user?.professionalLevel || "New"
  const nextLevel = isCustomer
    ? customerData?.loyaltyStatus?.nextLevel || null
    : professionalData?.level?.nextLevel?.name || null
  const progress = isCustomer
    ? customerData?.loyaltyStatus?.progress ?? 0
    : professionalData?.level?.nextLevel?.progress ?? 0
  const points = isCustomer
    ? customerData?.points?.balance ?? user?.points ?? 0
    : professionalData?.points?.balance ?? user?.points ?? 0
  const rewardValue = isCustomer
    ? customerData?.points?.euroValue ?? 0
    : professionalData?.points?.euroValue ?? 0
  const benefitHighlights = useMemo(() => {
    if (isCustomer) {
      return customerData?.benefits || []
    }

    const perks = professionalData?.level?.perks
    if (!perks) return []

    const items: string[] = []
    if (perks.badge) items.push(t("benefits.highlights.badge", { badge: perks.badge }))
    items.push(t("benefits.highlights.commissionReduction", { value: t("common.percent", { value: perks.commissionReduction ?? 0 }) }))
    items.push(t("benefits.highlights.searchBoost", { value: perks.searchRankingBoost ?? 1 }))
    return items
  }, [customerData?.benefits, isCustomer, professionalData?.level?.perks, t])

  if (loading || pageLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-white p-4">
        <div className="mx-auto max-w-6xl space-y-6 pt-20">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <Card key={item}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-8 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("benefits.loading")}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!user || (user.role !== "customer" && user.role !== "professional")) {
    return null
  }

  const customerDiscount = customerData?.userStats?.tierInfo?.discountPercentage ?? 0
  const customerDiscountCap = customerData?.userStats?.tierInfo?.maxDiscountAmount
  const professionalCommissionReduction = professionalData?.level?.perks?.commissionReduction ?? 0
  const professionalSearchBoost = professionalData?.level?.perks?.searchRankingBoost ?? 1

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-white p-4">
      <div className="mx-auto max-w-6xl space-y-6 pt-20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900">
              <Gift className="h-8 w-8 text-indigo-600" />
              {t("benefits.title")}
              <Badge variant="outline">{currentLevel}</Badge>
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {isCustomer ? t("benefits.subtitleCustomer") : t("benefits.subtitleProfessional")}
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            {t("benefits.backToDashboard")}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">{t("benefits.currentLevel")}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{currentLevel}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">{t("benefits.points")}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{new Intl.NumberFormat(intl).format(points)}</p>
              <p className="mt-1 text-xs text-slate-500">{t("benefits.rewardValue", { amount: formatMoney(rewardValue) })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">{t("benefits.referralReward")}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(referralData?.referrerRewardAmount ?? 0)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {isCustomer ? t("benefits.referralRewardHintCustomer") : t("benefits.referralRewardHintProfessional")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {isCustomer ? t("benefits.discounts") : t("benefits.currentPerk")}
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {t("common.percent", { value: isCustomer ? customerDiscount : professionalCommissionReduction })}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {isCustomer
                  ? (customerDiscountCap != null
                      ? t("benefits.cap", { amount: formatMoney(customerDiscountCap) })
                      : t("benefits.capNotSet"))
                  : t("benefits.searchBoost", { value: professionalSearchBoost })}
              </p>
            </CardContent>
          </Card>
        </div>

        {isCustomer && (
          <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-emerald-600" />
                {t("benefits.savings.title")}
                <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                  {t("benefits.savings.recordedSavings")}
                </Badge>
              </CardTitle>
              <CardDescription>{t("benefits.savings.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!savingsData || savingsData.settledBookingCount === 0 ? (
                <p className="text-sm text-slate-600">{t("benefits.savings.noSavingsYet")}</p>
              ) : (
                <>
                  {(savingsData.groups ?? []).map((group) => (
                    <div key={group.currency ?? 'UNKNOWN'} className="rounded-lg border bg-white p-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-medium text-slate-500">
                          {t("benefits.savings.bookingsCount", { count: group.bookingCount ?? 0 })}
                        </p>
                        <p className="text-2xl font-bold text-emerald-700">
                          {formatMoney(group.totalRecorded ?? 0, group.currency)}
                        </p>
                      </div>
                      <div className="mt-3 space-y-2 text-sm">
                        {(
                          [
                            ['recurring', group.byType?.recurring ?? 0],
                            ['loyalty', group.byType?.loyalty ?? 0],
                            ['discountCode', group.byType?.discountCode ?? 0],
                            ['points', group.byType?.points ?? 0],
                          ] as const
                        ).map(([key, amount]) => (
                          <div key={key} className="flex items-center justify-between gap-3">
                            <span className="text-slate-600">{t(`benefits.savings.${key}`)}</span>
                            <span className="font-medium text-slate-900">{formatMoney(amount, group.currency)}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-3 border-t pt-2">
                          <span className="text-slate-600">{t("benefits.savings.referral")}</span>
                          <Badge variant="secondary">{t("benefits.savings.referralUnknown")}</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(savingsData.unrecordedBookingCount ?? 0) > 0 && (
                    <p className="text-xs text-amber-700">
                      {t("benefits.savings.unknownCoverage", { count: savingsData.unrecordedBookingCount ?? 0 })}
                    </p>
                  )}
                  {(savingsData.excludedUncertainCount ?? 0) > 0 && (
                    <p className="text-xs text-amber-700">
                      {t("benefits.savings.excludedUncertain", { count: savingsData.excludedUncertainCount ?? 0 })}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-indigo-100 bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-600" />
              {t("benefits.progressTitle", { level: nextLevel || t("benefits.topLevel") })}
            </CardTitle>
            <CardDescription>
              {nextLevel
                ? t("benefits.progressDescription", { progress, level: nextLevel })
                : t("benefits.topLevelReached")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progress} />
            {isCustomer && customerData?.loyaltyStatus?.amountToNextTier != null && nextLevel && (
              <p className="text-sm text-slate-600">
                {t("benefits.spendMore", { amount: formatMoney(customerData.loyaltyStatus.amountToNextTier), level: nextLevel })}
              </p>
            )}
            {!isCustomer && professionalData?.level?.nextLevel?.missingCriteria?.length ? (
              <div className="flex flex-wrap gap-2">
                {professionalData.level.nextLevel.missingCriteria.slice(0, 5).map((item) => (
                  <Badge key={item} variant="secondary">
                    {item}
                  </Badge>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <BenefitsProgramCard
            customerData={customerData}
            professionalData={professionalData}
          />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                {t("benefits.snapshot.title")}
              </CardTitle>
              <CardDescription>
                {isCustomer ? t("benefits.snapshot.descriptionCustomer") : t("benefits.snapshot.descriptionProfessional")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("benefits.snapshot.benefits")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {benefitHighlights.length > 0 ? benefitHighlights.map((item) => (
                    <Badge key={item} variant="outline" className="whitespace-normal text-left">
                      {item}
                    </Badge>
                  )) : (
                    <p className="text-sm text-slate-500">{t("benefits.snapshot.noBenefits")}</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("benefits.snapshot.referralPerformance")}</p>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">{t("common.total")}</p>
                    <p className="font-semibold text-slate-900">{new Intl.NumberFormat(intl).format(referralData?.totalReferrals ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">{t("common.pending")}</p>
                    <p className="font-semibold text-slate-900">{new Intl.NumberFormat(intl).format(referralData?.pendingReferrals ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">{t("common.completed")}</p>
                    <p className="font-semibold text-slate-900">{new Intl.NumberFormat(intl).format(referralData?.completedReferrals ?? 0)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <ReferralCard referralData={referralData} />
        <BacklinkCard onPointsBalanceChange={refreshBenefitsSummary} />
      </div>
    </div>
  )
}
