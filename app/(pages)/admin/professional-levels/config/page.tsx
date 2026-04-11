'use client'

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Award, Loader2, Save, Settings, TrendingUp } from "lucide-react"
import { toast } from "sonner"
import { getAuthToken } from "@/lib/utils"

interface ProfessionalLevel {
  name: string
  order: number
  criteria: {
    minCompletedBookings: number
    minDaysActive: number
    minAvgRating: number
    minOnTimePercentage: number
    minResponseRate: number
  }
  perks: {
    badge: string
    commissionReduction: number
    searchRankingBoost: number
  }
  pointsBoostRatio: number
  isActive: boolean
  color: string
  icon: string
}

interface ProfessionalLevelConfig {
  levels: ProfessionalLevel[]
}

export default function ProfessionalLevelConfigPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const [config, setConfig] = useState<ProfessionalLevelConfig>({ levels: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRecalculating, setIsRecalculating] = useState(false)
  const clamp = (value: number, min: number, max?: number) => {
    const lowerBounded = Math.max(min, Number.isFinite(value) ? value : min)
    return typeof max === "number" ? Math.min(lowerBounded, max) : lowerBounded
  }

  useEffect(() => {
    if (!loading && (!isAuthenticated || user?.role !== "admin")) {
      router.push("/login")
    }
  }, [isAuthenticated, loading, router, user])

  useEffect(() => {
    if (user?.role === "admin") {
      void fetchConfig()
    }
  }, [user])

  const authHeaders = (withJson = false) => {
    const token = getAuthToken()
    return {
      ...(withJson ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }

  const fetchConfig = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/professional-levels/config`, {
        credentials: "include",
        headers: authHeaders(),
      })
      const payload = await response.json()
      if (response.ok && payload?.success) {
        setConfig(payload.data.config)
      } else {
        toast.error(payload?.msg || "Failed to load professional level configuration")
      }
    } catch (error) {
      console.error("Failed to load professional level configuration:", error)
      toast.error("Failed to load professional level configuration")
    } finally {
      setIsLoading(false)
    }
  }

  const updateLevel = (index: number, nextLevel: ProfessionalLevel) => {
    const sanitizedLevel: ProfessionalLevel = {
      ...nextLevel,
      criteria: {
        minCompletedBookings: clamp(nextLevel.criteria.minCompletedBookings, 0),
        minDaysActive: clamp(nextLevel.criteria.minDaysActive, 0),
        minAvgRating: clamp(nextLevel.criteria.minAvgRating, 0, 5),
        minOnTimePercentage: clamp(nextLevel.criteria.minOnTimePercentage, 0, 100),
        minResponseRate: clamp(nextLevel.criteria.minResponseRate, 0, 100),
      },
      perks: {
        ...nextLevel.perks,
        commissionReduction: clamp(nextLevel.perks.commissionReduction, 0, 100),
        searchRankingBoost: clamp(nextLevel.perks.searchRankingBoost, 1),
      },
      pointsBoostRatio: clamp(nextLevel.pointsBoostRatio, 1),
    }

    setConfig((prev) => ({
      ...prev,
      levels: prev.levels.map((level, levelIndex) => levelIndex === index ? sanitizedLevel : level),
    }))
  }

  const saveConfig = async () => {
    if (isSaving || isRecalculating) return
    setIsSaving(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/professional-levels/config`, {
        method: "PUT",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify(config),
      })
      const payload = await response.json()
      if (response.ok && payload?.success) {
        setConfig(payload.data.config)
        toast.success("Professional levels saved")
      } else {
        toast.error(payload?.msg || "Failed to save professional levels")
      }
    } catch (error) {
      console.error("Failed to save professional levels:", error)
      toast.error("Failed to save professional levels")
    } finally {
      setIsSaving(false)
    }
  }

  const recalculateLevels = async () => {
    if (isSaving || isRecalculating) return
    setIsRecalculating(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/professional-levels/recalculate`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
      })
      const payload = await response.json()
      if (response.ok && payload?.success) {
        toast.success(`Recalculated ${payload.data.updated} professionals`)
      } else {
        toast.error(payload?.msg || "Failed to recalculate professional levels")
      }
    } catch (error) {
      console.error("Failed to recalculate professional levels:", error)
      toast.error("Failed to recalculate professional levels")
    } finally {
      setIsRecalculating(false)
    }
  }

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="mx-auto max-w-6xl space-y-6 pt-20">
          <div className="space-y-2">
            <Skeleton className="h-8 w-80" />
            <Skeleton className="h-4 w-64" />
          </div>
          {[1, 2, 3].map((item) => (
            <Card key={item}>
              <CardContent className="space-y-4 p-6">
                <Skeleton className="h-6 w-48" />
                <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {[1, 2, 3, 4].map((field) => (
                    <div key={field} className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="mx-auto max-w-6xl space-y-6 pt-20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
              <Award className="h-8 w-8 text-indigo-600" />
              Professional Level Configuration
            </h1>
            <p className="mt-1 text-gray-600">Configure the rules, perks, and point boost logic for every professional level.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.push("/admin/loyalty/config")}>
              Back
            </Button>
            <Button variant="outline" onClick={recalculateLevels} disabled={isSaving || isRecalculating}>
              {isRecalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
              Recalculate Levels
            </Button>
            <Button onClick={saveConfig} disabled={isSaving || isRecalculating}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </div>

        {config.levels.map((level, index) => (
          <Card key={level.name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <span className="inline-flex h-4 w-4 rounded-full" style={{ backgroundColor: level.color }} />
                {level.name}
                <Badge variant={level.isActive ? "default" : "secondary"}>{level.isActive ? "Active" : "Inactive"}</Badge>
              </CardTitle>
              <CardDescription>Edit thresholds, perks, and points-to-booking conversion for this level.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label>Completed Bookings</Label>
                  <Input
                    type="number"
                    min="0"
                    value={level.criteria.minCompletedBookings}
                    onChange={(e) => updateLevel(index, {
                      ...level,
                      criteria: { ...level.criteria, minCompletedBookings: Number(e.target.value) || 0 },
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Days Active</Label>
                  <Input
                    type="number"
                    min="0"
                    value={level.criteria.minDaysActive}
                    onChange={(e) => updateLevel(index, {
                      ...level,
                      criteria: { ...level.criteria, minDaysActive: Number(e.target.value) || 0 },
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Average Rating</Label>
                  <Input
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={level.criteria.minAvgRating}
                    onChange={(e) => updateLevel(index, {
                      ...level,
                      criteria: { ...level.criteria, minAvgRating: Number(e.target.value) || 0 },
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>On-Time Percentage</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={level.criteria.minOnTimePercentage}
                    onChange={(e) => updateLevel(index, {
                      ...level,
                      criteria: { ...level.criteria, minOnTimePercentage: Number(e.target.value) || 0 },
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Response Rate</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={level.criteria.minResponseRate}
                    onChange={(e) => updateLevel(index, {
                      ...level,
                      criteria: { ...level.criteria, minResponseRate: Number(e.target.value) || 0 },
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Badge</Label>
                  <Input
                    value={level.perks.badge}
                    onChange={(e) => updateLevel(index, {
                      ...level,
                      perks: { ...level.perks, badge: e.target.value },
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Commission Reduction (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={level.perks.commissionReduction}
                    onChange={(e) => updateLevel(index, {
                      ...level,
                      perks: { ...level.perks, commissionReduction: Number(e.target.value) || 0 },
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Search Ranking Boost</Label>
                  <Input
                    type="number"
                    min="1"
                    step="0.1"
                    value={level.perks.searchRankingBoost}
                    onChange={(e) => updateLevel(index, {
                      ...level,
                      perks: { ...level.perks, searchRankingBoost: Number(e.target.value) || 1 },
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Points Boost Ratio</Label>
                  <Input
                    type="number"
                    min="1"
                    value={level.pointsBoostRatio}
                    onChange={(e) => updateLevel(index, { ...level, pointsBoostRatio: Number(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <Input
                    value={level.color}
                    onChange={(e) => updateLevel(index, { ...level, color: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Icon</Label>
                  <Input
                    value={level.icon}
                    onChange={(e) => updateLevel(index, { ...level, icon: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    <input
                      type="checkbox"
                      checked={level.isActive}
                      onChange={(e) => updateLevel(index, { ...level, isActive: e.target.checked })}
                      className="mr-2"
                    />
                    Level Active
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-gray-500" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-600">
            <p>Points boost ratio controls how many points equal one additional booking credit toward progression.</p>
            <p>Saving this page updates the level rules used for automatic progression and the admin override experience.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
