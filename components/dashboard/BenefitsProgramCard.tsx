'use client'

import { useEffect, useState } from "react"
import { Award, Gift, Loader2, TrendingUp } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useAuth } from "@/contexts/AuthContext"
import { getAuthToken } from "@/lib/utils"

type CustomerBenefitsResponse = {
  loyaltyStatus?: {
    level?: string
    nextLevel?: string
    amountToNextTier?: number
    progress?: number
  }
  points?: {
    balance?: number
    euroValue?: number
    expiryDate?: string
  }
  userStats?: {
    totalSpent?: number
  }
  benefits?: string[]
}

type ProfessionalBenefitsResponse = {
  level?: {
    currentLevel?: string
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

export default function BenefitsProgramCard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [customerData, setCustomerData] = useState<CustomerBenefitsResponse | null>(null)
  const [professionalData, setProfessionalData] = useState<ProfessionalBenefitsResponse | null>(null)

  useEffect(() => {
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
  }, [user])

  if (!user || (user.role !== "customer" && user.role !== "professional")) return null

  const isCustomer = user.role === "customer"
  const currentLevel = isCustomer
    ? customerData?.loyaltyStatus?.level || user.loyaltyLevel || "Bronze"
    : professionalData?.level?.currentLevel || user.professionalLevel || "New"
  const nextLevel = isCustomer
    ? customerData?.loyaltyStatus?.nextLevel
    : professionalData?.level?.nextLevel?.name
  const progress = isCustomer
    ? customerData?.loyaltyStatus?.progress || 0
    : professionalData?.level?.nextLevel?.progress || 0
  const pointsBalance = isCustomer
    ? customerData?.points?.balance || user.points || 0
    : professionalData?.points?.balance || user.points || 0
  const pointsExpiry = isCustomer
    ? customerData?.points?.expiryDate || user.pointsExpiry
    : professionalData?.points?.expiryDate || user.pointsExpiry
  const perks = isCustomer
    ? customerData?.benefits || []
    : professionalData?.level?.nextLevel?.missingCriteria || []

  return (
    <Card className="bg-white/85 backdrop-blur border border-indigo-100 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-indigo-600" />
          Benefits Program <Badge variant="outline">{currentLevel}</Badge>
        </CardTitle>
        <CardDescription>
          {isCustomer ? "Discounts, points, referrals, and next-tier progress." : "Points, referrals, trust level, and next-level progress."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading benefits...
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Current level</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currentLevel}</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Points</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{pointsBalance}</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{isCustomer ? "Total spent" : "Next level"}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {isCustomer ? `EUR ${(customerData?.userStats?.totalSpent || user.totalSpent || 0).toLocaleString()}` : nextLevel || "Top level"}
                </p>
              </div>
            </div>

            {nextLevel && (
              <div className="rounded-lg border bg-indigo-50 p-3">
                <div className="flex items-center justify-between text-sm text-indigo-900">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Next: {nextLevel}
                  </span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="mt-3" />
                {isCustomer && customerData?.loyaltyStatus?.amountToNextTier != null && (
                  <p className="mt-2 text-xs text-indigo-800">
                    Spend EUR {customerData.loyaltyStatus.amountToNextTier.toLocaleString()} more to unlock {nextLevel}.
                  </p>
                )}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-lg border bg-white p-3">
                <p className="text-xs font-medium text-slate-700">Referral</p>
                <p className="mt-1 text-xs text-slate-600">
                  {isCustomer ? "Share your code to earn points and help friends unlock their first-booking benefit." : "Share your code to earn points and grow trust faster."}
                </p>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <p className="text-xs font-medium text-slate-700">Points expiry</p>
                <p className="mt-1 text-xs text-slate-600">
                  {pointsExpiry ? new Date(pointsExpiry).toLocaleDateString() : "No expiry set"}
                </p>
              </div>
            </div>

            {perks.length > 0 && (
              <div className="rounded-lg border bg-white p-3">
                <p className="mb-2 text-xs font-medium text-slate-700 flex items-center gap-2">
                  <Award className="h-4 w-4 text-indigo-600" />
                  {isCustomer ? "Benefits" : "Next level requirements"}
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
