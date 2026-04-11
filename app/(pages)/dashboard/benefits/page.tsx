'use client'

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Gift, Link2, Loader2, Sparkles, TrendingUp } from "lucide-react"
import { getAuthToken } from "@/lib/utils"
import BenefitsProgramCard from "@/components/dashboard/BenefitsProgramCard"
import ReferralCard from "@/components/dashboard/ReferralCard"

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

type ReferralData = {
  referralCode?: string
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

export default function BenefitsPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const [pageLoading, setPageLoading] = useState(true)
  const [customerData, setCustomerData] = useState<CustomerBenefitsResponse | null>(null)
  const [professionalData, setProfessionalData] = useState<ProfessionalBenefitsResponse | null>(null)
  const [referralData, setReferralData] = useState<ReferralData | null>(null)

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login?redirect=/dashboard/benefits")
    }
  }, [isAuthenticated, loading, router])

  useEffect(() => {
    if (!user || (user.role !== "customer" && user.role !== "professional")) {
      setPageLoading(false)
      return
    }

    const controller = new AbortController()

    const load = async () => {
      setPageLoading(true)
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const benefitsEndpoint =
        user.role === "customer"
          ? "/api/user/loyalty/status"
          : "/api/user/professional-level"

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
    if (perks.badge) items.push(`Badge: ${perks.badge}`)
    items.push(`Commission reduction: ${perks.commissionReduction ?? 0}%`)
    items.push(`Search ranking boost: x${perks.searchRankingBoost ?? 1}`)
    return items
  }, [customerData?.benefits, isCustomer, professionalData?.level?.perks])

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
              Loading benefits program...
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
              Benefits Program
              <Badge variant="outline">{currentLevel}</Badge>
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {isCustomer
                ? "Track your level, points, rewards, discounts, and referral value in one place."
                : "Track your trust level, points, referral rewards, and level-up benefits in one place."}
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">Current level</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{currentLevel}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">Points</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{points}</p>
              <p className="mt-1 text-xs text-slate-500">Reward value EUR {rewardValue.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">Referral reward</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{referralData?.referrerRewardAmount ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">
                {isCustomer ? "Use value on future bookings" : "Boost trust and level progress faster"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {isCustomer ? "Discounts" : "Current perk"}
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {isCustomer ? `${customerDiscount}%` : `${professionalCommissionReduction}%`}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {isCustomer
                  ? `Cap ${customerDiscountCap != null ? `EUR ${customerDiscountCap}` : "not set"}`
                  : `Search boost x${professionalSearchBoost}`}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-indigo-100 bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-600" />
              Progress to {nextLevel || "your top level"}
            </CardTitle>
            <CardDescription>
              {nextLevel
                ? `You're ${progress}% of the way to ${nextLevel}.`
                : "You're already at the top configured level."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progress} />
            {isCustomer && customerData?.loyaltyStatus?.amountToNextTier != null && nextLevel && (
              <p className="text-sm text-slate-600">
                Spend EUR {customerData.loyaltyStatus.amountToNextTier.toLocaleString()} more to unlock {nextLevel}.
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
                Rewards Snapshot
              </CardTitle>
              <CardDescription>
                {isCustomer
                  ? "Current spending rewards and referral value."
                  : "Current trust perks and level-up accelerators."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Benefits</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {benefitHighlights.length > 0 ? benefitHighlights.map((item) => (
                    <Badge key={item} variant="outline" className="whitespace-normal text-left">
                      {item}
                    </Badge>
                  )) : (
                    <p className="text-sm text-slate-500">No extra benefits configured yet.</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Referral performance</p>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">Total</p>
                    <p className="font-semibold text-slate-900">{referralData?.totalReferrals ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Pending</p>
                    <p className="font-semibold text-slate-900">{referralData?.pendingReferrals ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Completed</p>
                    <p className="font-semibold text-slate-900">{referralData?.completedReferrals ?? 0}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <Link2 className="h-4 w-4" />
                  Backlinks
                </p>
                <p className="mt-3 text-sm text-slate-600">
                  Backlink rewards are reserved here and can be surfaced once backend tracking is enabled.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <ReferralCard referralData={referralData} />
      </div>
    </div>
  )
}
