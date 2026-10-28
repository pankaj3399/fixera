'use client'

import { useCallback, useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, RefreshCw, Scale, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"

interface DisputeRecord {
  _id: string
  bookingNumber?: string
  status: string
  customer?: { _id: string; name?: string } | null
  professional?: { _id: string; name?: string } | null
  project?: { _id: string; title?: string } | null
  payment?: { totalWithVat?: number; currency?: string } | null
  scheduledStartDate?: string
  dispute?: {
    raisedBy: string
    reason: string
    description: string
    raisedAt: string
    resolvedAt?: string
    resolution?: string
    adminAdjustedAmount?: number
    slaDeadline?: string
  }
}

const formatDate = (value: string | undefined, intl: string) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString(intl)
}

export default function DashboardDisputesPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations("dashboard")
  const { intl } = useFormatLocale()

  const [items, setItems] = useState<DisputeRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!loading && !user) {
      const redirect = pathname || '/dashboard/disputes'
      router.push(`/login?redirect=${encodeURIComponent(redirect)}`)
    }
  }, [user, loading, router, pathname])

  const fetchDisputes = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/disputes/mine`)
      if (!res.ok) {
        toast.error(t("disputes.loadFailedStatus", { status: res.status }))
        return
      }
      const json = await res.json()
      if (json.success) {
        setItems(json.data?.items || [])
      } else {
        toast.error(t("disputes.loadFailed"))
      }
    } catch {
      toast.error(t("disputes.loadFailed"))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (user) fetchDisputes()
  }, [user, fetchDisputes])

  if (loading || !user) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
      <div className="max-w-4xl mx-auto pt-20 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Scale className="h-6 w-6" />
              {t("disputes.title")}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{t("disputes.subtitle")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDisputes}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("common.refresh")}
          </Button>
        </div>

        {(() => {
          const filteredItems = items.filter(i => i.dispute)
          if (isLoading) {
            return (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
              </div>
            )
          }
          if (filteredItems.length === 0) {
            return (
              <Card>
                <CardContent className="py-12 text-center">
                  <ShieldCheck className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">{t("disputes.empty")}</p>
                </CardContent>
              </Card>
            )
          }
          return (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const dispute = item.dispute!
              const isResolved = !!dispute.resolvedAt
              const slaBreached =
                !isResolved && !!dispute.slaDeadline && new Date(dispute.slaDeadline) < new Date()
              return (
                <Card key={item._id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{item.bookingNumber || item._id}</span>
                          <Badge variant={isResolved ? 'default' : 'destructive'} className="text-xs">
                            {isResolved ? t("disputes.statusResolved") : t("disputes.statusOpen")}
                          </Badge>
                          {slaBreached && (
                            <Badge variant="destructive" className="text-xs bg-red-700">
                              {t("disputes.slaBreached")}
                            </Badge>
                          )}
                        </div>
                        {item.project?.title && (
                          <p className="text-xs text-gray-400">{item.project.title}</p>
                        )}
                        <p className="text-xs text-red-600 font-medium mt-1">
                          <AlertTriangle className="h-3 w-3 inline mr-1" />
                          {dispute.reason}
                        </p>
                        {dispute.description && (
                          <p className="text-xs text-gray-600">{dispute.description}</p>
                        )}
                        {isResolved && dispute.resolution && (
                          <p className="text-xs text-green-700 font-medium">
                            {t("disputes.resolution", { value: dispute.resolution })}
                          </p>
                        )}
                        <p className="text-xs text-gray-400">
                          {t("disputes.raised", { date: formatDate(dispute.raisedAt, intl) })}
                          {dispute.resolvedAt ? ` · ${t("disputes.resolvedOn", { date: formatDate(dispute.resolvedAt, intl) })}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 items-end shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => router.push(`/bookings/${item._id}`)}
                        >
                          {t("disputes.viewBooking")}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          )
        })()}
      </div>
    </div>
  )
}
