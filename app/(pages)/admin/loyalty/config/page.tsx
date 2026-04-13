'use client'

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Award, Settings, Plus, Trash2, Save } from "lucide-react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { getAuthToken } from "@/lib/utils"

interface LoyaltyTier {
  name: string;
  minSpendingAmount: number;
  discountPercentage: number;
  maxDiscountAmount: number | null;
  benefits: string[];
  color?: string;
}

interface LoyaltyConfig {
  globalSettings: {
    isEnabled: boolean;
  };
  tiers: LoyaltyTier[];
}

interface PointsConfig {
  isEnabled: boolean;
  conversionRate: number;
  expiryMonths: number;
  minRedemptionPoints: number;
  professionalEarningPerBooking: number;
  customerEarningPerBooking: number;
}

type LoyaltyConfigResponse = Partial<LoyaltyConfig> & {
  globalSettings?: Partial<LoyaltyConfig['globalSettings']> & {
    enabled?: boolean;
  };
};

const normalizeLoyaltyConfig = (
  config: LoyaltyConfigResponse | null | undefined,
  fallback: LoyaltyConfig
): LoyaltyConfig => {
  const globalSettings = config?.globalSettings;
  const normalizedGlobalSettings = globalSettings
    ? Object.fromEntries(
        Object.entries(globalSettings).filter(([key]) => key !== 'enabled')
      ) as Partial<LoyaltyConfig['globalSettings']>
    : {};

  return {
    ...fallback,
    ...config,
    globalSettings: {
      ...fallback.globalSettings,
      ...normalizedGlobalSettings,
      isEnabled:
        globalSettings?.isEnabled ??
        globalSettings?.enabled ??
        fallback.globalSettings?.isEnabled,
    },
    tiers: Array.isArray(config?.tiers) ? config.tiers : fallback.tiers,
  };
};

export default function LoyaltyConfigPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  
  const [config, setConfig] = useState<LoyaltyConfig>({
    globalSettings: {
      isEnabled: true,
    },
    tiers: [
      {
        name: 'Bronze',
        minSpendingAmount: 0,
        discountPercentage: 0,
        maxDiscountAmount: null,
        benefits: ['Standard customer support'],
        color: '#CD7F32'
      },
      {
        name: 'Silver',
        minSpendingAmount: 500,
        discountPercentage: 2,
        maxDiscountAmount: 25,
        benefits: ['Priority support', '2% booking discount'],
        color: '#C0C0C0'
      },
      {
        name: 'Gold',
        minSpendingAmount: 1500,
        discountPercentage: 5,
        maxDiscountAmount: 75,
        benefits: ['VIP support', '5% booking discount', 'Free cancellation'],
        color: '#FFD700'
      },
      {
        name: 'Platinum',
        minSpendingAmount: 5000,
        discountPercentage: 10,
        maxDiscountAmount: 150,
        benefits: ['Dedicated account manager', '10% booking discount', 'Free cancellation', 'Priority booking'],
        color: '#E5E4E2'
      }
    ]
  })
  const [pointsConfig, setPointsConfig] = useState<PointsConfig | null>(null)
  const [pointsConfigLoaded, setPointsConfigLoaded] = useState(false)
  const [loyaltyConfigLoaded, setLoyaltyConfigLoaded] = useState(false)
  
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!loading && (!isAuthenticated || user?.role !== 'admin')) {
      router.push('/login')
    }
  }, [isAuthenticated, loading, user, router])

  useEffect(() => {
    if (user?.role === 'admin') {
      void fetchConfig()
    }
  }, [user])

  const fetchConfig = async () => {
    setIsLoading(true)
    setLoyaltyConfigLoaded(false)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const [loyaltyResponse, pointsResponse] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/loyalty/config`, {
          credentials: 'include',
          headers,
        }),
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/points/config`, {
          credentials: 'include',
          headers,
        }),
      ])

      if (loyaltyResponse.ok) {
        const data = await loyaltyResponse.json()
        const cfg = data?.data?.config

        if (cfg !== undefined) {
          setConfig((prev) => normalizeLoyaltyConfig(cfg, prev))
          setLoyaltyConfigLoaded(true)
        } else {
          console.error('Malformed loyalty config response:', data)
          toast.error('Loyalty configuration response was malformed. Save remains disabled until the real config loads.')
          setLoyaltyConfigLoaded(false)
        }
      } else {
        setLoyaltyConfigLoaded(false)
      }

      if (pointsResponse.ok) {
        const data = await pointsResponse.json()
        setPointsConfig(data.data.config)
        setPointsConfigLoaded(true)
      } else {
        setPointsConfig(null)
        setPointsConfigLoaded(false)
      }
    } catch (error) {
      console.error('Failed to fetch loyalty config:', error)
      setLoyaltyConfigLoaded(false)
      setPointsConfig(null)
      setPointsConfigLoaded(false)
    } finally {
      setIsLoading(false)
    }
  }

  const saveConfig = async () => {
    if (!loyaltyConfigLoaded) {
      toast.error('Loyalty configuration could not be loaded, so save is disabled to avoid overwriting it with defaults.')
      return
    }

    const invalidPercentageTier = config.tiers.find(
      (tier) =>
        !Number.isFinite(tier.discountPercentage) ||
        tier.discountPercentage < 0 ||
        tier.discountPercentage > 50
    )
    if (invalidPercentageTier) {
      toast.error(`Discount percentage must be between 0 and 50 for tier ${invalidPercentageTier.name || 'Unknown'}`)
      return
    }

    const invalidCapTier = config.tiers.find(
      (tier) =>
        tier.maxDiscountAmount != null &&
        (!Number.isFinite(tier.maxDiscountAmount) || tier.maxDiscountAmount < 0)
    )
    if (invalidCapTier) {
      toast.error(`Max discount cap must be a non-negative number for tier ${invalidCapTier.name || 'Unknown'}`)
      return
    }

    setIsSaving(true)
    try {
      const token = getAuthToken()
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }

      const loyaltyPromise = fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/loyalty/config`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(config),
      })

      const requests: Promise<Response>[] = [loyaltyPromise]
      if (pointsConfigLoaded && pointsConfig != null) {
        requests.push(
          fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/points/config`, {
            method: 'PUT',
            headers,
            credentials: 'include',
            body: JSON.stringify(pointsConfig),
          })
        )
      }

      const responses = await Promise.all(requests)
      const saveSucceeded = responses.every((response) => response.ok)

      if (saveSucceeded) {
        toast.success('Configuration saved successfully!')
      } else {
        toast.error('Failed to save configuration')
      }
    } catch (error) {
      console.error('Failed to save config:', error)
      toast.error('Failed to save configuration')
    } finally {
      setIsSaving(false)
    }
  }

  const canSaveConfig = loyaltyConfigLoaded && !isLoading && !isSaving

  const addTier = () => {
    setConfig(prev => ({
      ...prev,
      tiers: [...prev.tiers, {
        name: '',
        minSpendingAmount: 0,
        discountPercentage: 0,
        maxDiscountAmount: null,
        benefits: [''],
        color: '#6B7280'
      }]
    }))
  }

  const removeTier = (index: number) => {
    setConfig(prev => ({
      ...prev,
      tiers: prev.tiers.filter((_, i) => i !== index)
    }))
  }

  const updateTier = (index: number, field: keyof LoyaltyTier, value: string | number | null) => {
    setConfig(prev => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) =>
        i === index ? { ...tier, [field]: field === 'maxDiscountAmount' && value === '' ? null : value } : tier
      )
    }))
  }

  const addBenefit = (tierIndex: number) => {
    setConfig(prev => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) => 
        i === tierIndex ? { ...tier, benefits: [...tier.benefits, ''] } : tier
      )
    }))
  }

  const removeBenefit = (tierIndex: number, benefitIndex: number) => {
    setConfig(prev => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) => 
        i === tierIndex ? { 
          ...tier, 
          benefits: tier.benefits.filter((_, bi) => bi !== benefitIndex) 
        } : tier
      )
    }))
  }

  const updateBenefit = (tierIndex: number, benefitIndex: number, value: string) => {
    setConfig(prev => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) => 
        i === tierIndex ? { 
          ...tier, 
          benefits: tier.benefits.map((benefit, bi) => 
            bi === benefitIndex ? value : benefit
          )
        } : tier
      )
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-6xl mx-auto pt-20">
          <div className="mb-8 flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-80" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-10 w-36 rounded-lg" />
              <Skeleton className="h-10 w-44 rounded-lg" />
            </div>
          </div>
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-72" />
              <div className="grid md:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
                <Skeleton className="h-6 w-32" />
                <div className="grid md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map(j => (
                    <div key={j} className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-10 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {[1, 2].map(j => <Skeleton key={j} className="h-10 w-full rounded-lg" />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || user?.role !== 'admin') {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto pt-20">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
              <Award className="h-8 w-8 text-purple-500" />
              Loyalty System Configuration
            </h1>
            <p className="text-gray-600">Configure tiers, benefits, and global settings</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => router.push('/dashboard')} variant="outline">
              Back to Dashboard
            </Button>
            <Button onClick={() => router.push('/admin/professional-levels/config')} variant="outline">
              Professional Levels
            </Button>
            <Button onClick={saveConfig} disabled={!canSaveConfig}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-72" />
              <div className="grid md:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
                <Skeleton className="h-6 w-32" />
                <div className="grid md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map(j => (
                    <div key={j} className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-10 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Global Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-gray-500" />
                  Global Settings
                </CardTitle>
                <CardDescription>Configure system-wide loyalty settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>
                    <input
                      type="checkbox"
                      checked={config.globalSettings.isEnabled}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        globalSettings: { ...prev.globalSettings, isEnabled: e.target.checked }
                      }))}
                      className="mr-2"
                    />
                    System Enabled
                  </Label>
                  <p className="text-xs text-gray-500">Loyalty tiers drive automatic discounts based on total spending.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-gray-500" />
                  Points Settings
                </CardTitle>
                <CardDescription>Control reward value, redemption, and how many points customers and professionals earn per completed booking.</CardDescription>
              </CardHeader>
              <CardContent>
                {pointsConfig == null ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Points configuration could not be loaded, so point settings will not be changed on save.
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-2">
                      <Label>
                        <input
                          type="checkbox"
                          checked={pointsConfig.isEnabled}
                          onChange={(e) => setPointsConfig((prev) => prev ? { ...prev, isEnabled: e.target.checked } : prev)}
                          className="mr-2"
                        />
                        Points Enabled
                      </Label>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="conversionRate">Point Conversion Rate (EUR)</Label>
                      <Input
                        id="conversionRate"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={pointsConfig.conversionRate}
                        onChange={(e) => setPointsConfig((prev) => prev ? { ...prev, conversionRate: Number(e.target.value) || 0 } : prev)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expiryMonths">Expiry Months</Label>
                      <Input
                        id="expiryMonths"
                        type="number"
                        min="1"
                        value={pointsConfig.expiryMonths}
                        onChange={(e) => setPointsConfig((prev) => prev ? { ...prev, expiryMonths: Number(e.target.value) || 1 } : prev)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="minRedemptionPoints">Minimum Redemption Points</Label>
                      <Input
                        id="minRedemptionPoints"
                        type="number"
                        min="1"
                        value={pointsConfig.minRedemptionPoints}
                        onChange={(e) => setPointsConfig((prev) => prev ? { ...prev, minRedemptionPoints: Number(e.target.value) || 1 } : prev)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="professionalEarningPerBooking">Professional Reward Points Per Booking</Label>
                      <Input
                        id="professionalEarningPerBooking"
                        type="number"
                        min="0"
                        value={pointsConfig.professionalEarningPerBooking}
                        onChange={(e) => setPointsConfig((prev) => prev ? { ...prev, professionalEarningPerBooking: Number(e.target.value) || 0 } : prev)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerEarningPerBooking">Customer Reward Points Per Booking</Label>
                      <Input
                        id="customerEarningPerBooking"
                        type="number"
                        min="0"
                        value={pointsConfig.customerEarningPerBooking}
                        onChange={(e) => setPointsConfig((prev) => prev ? { ...prev, customerEarningPerBooking: Number(e.target.value) || 0 } : prev)}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Loyalty Tiers */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Loyalty Tiers</h2>
              <Button onClick={addTier} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Tier
              </Button>
            </div>

            {config.tiers.map((tier, tierIndex) => (
              <Card key={tierIndex}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: tier.color || '#6B7280' }}
                      />
                      Tier {tierIndex + 1}
                    </CardTitle>
                    {config.tiers.length > 1 && (
                      <Button
                        onClick={() => removeTier(tierIndex)}
                        variant="destructive"
                        size="sm"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`tier-name-${tierIndex}`}>Tier Name</Label>
                      <Input
                        id={`tier-name-${tierIndex}`}
                        value={tier.name}
                        onChange={(e) => updateTier(tierIndex, 'name', e.target.value)}
                        placeholder="e.g., Bronze"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`tier-spending-${tierIndex}`}>Min Spending Amount (&euro;)</Label>
                      <Input
                        id={`tier-spending-${tierIndex}`}
                        type="number"
                        value={tier.minSpendingAmount}
                        onChange={(e) => updateTier(tierIndex, 'minSpendingAmount', parseInt(e.target.value))}
                      />
                    </div>
                  </div>

                  {/* Discount Settings */}
                  <div className="grid md:grid-cols-3 gap-4 pt-2 border-t border-dashed border-gray-200">
                    <div className="space-y-2">
                      <Label htmlFor={`tier-discount-${tierIndex}`}>Auto-Discount (%)</Label>
                      <Input
                        id={`tier-discount-${tierIndex}`}
                        type="number"
                        value={tier.discountPercentage ?? 0}
                        onChange={(e) => updateTier(tierIndex, 'discountPercentage', parseFloat(e.target.value) || 0)}
                        min="0"
                        max="50"
                        step="0.5"
                        placeholder="0"
                      />
                      <p className="text-xs text-gray-500">Automatic discount applied to bookings for this tier</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`tier-max-discount-${tierIndex}`}>Max Discount Cap (EUR)</Label>
                      <Input
                        id={`tier-max-discount-${tierIndex}`}
                        type="number"
                        value={
                          typeof tier.maxDiscountAmount === 'number' &&
                          Number.isFinite(tier.maxDiscountAmount)
                            ? tier.maxDiscountAmount
                            : ''
                        }
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          if (raw === '') {
                            updateTier(tierIndex, 'maxDiscountAmount', null)
                            return
                          }
                          const parsed = parseFloat(raw)
                          updateTier(
                            tierIndex,
                            'maxDiscountAmount',
                            Number.isFinite(parsed) ? parsed : null
                          )
                        }}
                        min="0"
                        step="1"
                        placeholder="No cap"
                      />
                      <p className="text-xs text-gray-500">Maximum discount amount per booking (leave empty for no cap)</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`tier-color-${tierIndex}`}>Tier Color</Label>
                      <Input
                        id={`tier-color-${tierIndex}`}
                        type="color"
                        value={tier.color || '#6B7280'}
                        onChange={(e) => updateTier(tierIndex, 'color', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Benefits</Label>
                      <Button
                        onClick={() => addBenefit(tierIndex)}
                        variant="outline"
                        size="sm"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Benefit
                      </Button>
                    </div>
                    
                    <div className="space-y-2">
                      {tier.benefits.map((benefit, benefitIndex) => (
                        <div key={benefitIndex} className="flex gap-2">
                          <Input
                            value={benefit}
                            onChange={(e) => updateBenefit(tierIndex, benefitIndex, e.target.value)}
                            placeholder="Enter benefit description"
                            className="flex-1"
                          />
                          {tier.benefits.length > 1 && (
                            <Button
                              onClick={() => removeBenefit(tierIndex, benefitIndex)}
                              variant="destructive"
                              size="sm"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Save Button */}
            <div className="flex justify-end pt-6">
              <Button onClick={saveConfig} disabled={!canSaveConfig} size="lg">
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving Configuration...' : 'Save Configuration'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

