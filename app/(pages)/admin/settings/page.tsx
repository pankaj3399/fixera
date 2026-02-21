'use client'

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { ArrowLeft, Settings, Save, Loader2, Euro } from "lucide-react"
import { toast } from "sonner"

export default function AdminSettingsPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [commissionPercent, setCommissionPercent] = useState<number>(0)
  const [lastModified, setLastModified] = useState<string | null>(null)
  const [version, setVersion] = useState<number>(0)

  useEffect(() => {
    if (!loading && (!isAuthenticated || user?.role !== 'admin')) {
      router.push('/login')
    }
  }, [isAuthenticated, loading, user, router])

  const fetchSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/platform-settings`, {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setCommissionPercent(data.data.commissionPercent)
        setLastModified(data.data.lastModified)
        setVersion(data.data.version)
      } else {
        toast.error('Failed to load platform settings')
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
      toast.error('Failed to load platform settings')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin') {
      fetchSettings()
    }
  }, [isAuthenticated, user, fetchSettings])

  const handleSave = async () => {
    if (commissionPercent < 0 || commissionPercent > 100) {
      toast.error('Commission must be between 0% and 100%')
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/platform-settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commissionPercent })
      })

      if (response.ok) {
        const data = await response.json()
        setCommissionPercent(data.data.commissionPercent)
        setLastModified(data.data.lastModified)
        setVersion(data.data.version)
        toast.success('Platform settings updated successfully')
      } else {
        const errorData = await response.json().catch(() => null)
        toast.error(errorData?.msg || 'Failed to update settings')
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast.error('Failed to update settings')
    } finally {
      setIsSaving(false)
    }
  }

  if (loading || !isAuthenticated || user?.role !== 'admin') {
    return null
  }

  // Live preview calculations
  const exampleAmount = 100
  const commissionAmount = (exampleAmount * commissionPercent / 100)
  const professionalAmount = exampleAmount - commissionAmount

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/admin')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Platform Settings
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage platform-wide configuration
            </p>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Loading settings...</span>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Euro className="h-5 w-5" />
                Commission
              </CardTitle>
              <CardDescription>
                Platform commission percentage deducted from each payment before transferring to the professional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Commission Input */}
              <div className="space-y-2">
                <Label htmlFor="commission">Commission Percentage</Label>
                <div className="flex items-center gap-2 max-w-xs">
                  <Input
                    id="commission"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={commissionPercent}
                    onChange={(e) => setCommissionPercent(Number(e.target.value))}
                    className="text-lg"
                  />
                  <span className="text-lg font-medium text-gray-500">%</span>
                </div>
              </div>

              {/* Live Preview */}
              <div className="bg-gray-100 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">Preview</p>
                <p className="text-sm text-gray-600">
                  On a <span className="font-semibold">&euro;{exampleAmount.toFixed(2)}</span> payment:
                </p>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-gray-500">Platform commission:</span>{' '}
                    <span className="font-semibold text-blue-600">&euro;{commissionAmount.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Professional receives:</span>{' '}
                    <span className="font-semibold text-green-600">&euro;{professionalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Metadata */}
              {lastModified && (
                <p className="text-xs text-gray-400">
                  Last updated: {new Date(lastModified).toLocaleString()} &middot; Version {version}
                </p>
              )}

              {/* Save Button */}
              <div className="pt-2">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
