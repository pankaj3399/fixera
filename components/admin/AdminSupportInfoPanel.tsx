"use client"

import { useEffect, useState } from "react"
import { Award, Mail, Phone, Star, UserRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { authFetch } from "@/lib/utils"
import { getLevelColor } from "@/lib/professionalLevel"

interface ParticipantUser {
  _id: string
  name: string | null
  email: string | null
  phone: string | null
  username: string | null
  role: string
}

interface ParticipantKpis {
  level: string | null
  reviewCount: number
  avgRating: number | null
  projectCount: number
  bookingCount: number
  completedCount: number
  quotedCount: number
  disputeCount: number
  grossEur: number
  refundPercent: number | null
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL

const formatMoney = (value: number) =>
  value.toLocaleString("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

const formatPct = (value: number | null) => (value == null ? "—" : `${value}%`)

function KpiRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900 tabular-nums">{value}</span>
    </div>
  )
}

export default function AdminSupportInfoPanel({ conversationId }: { conversationId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<ParticipantUser | null>(null)
  const [kpis, setKpis] = useState<ParticipantKpis | null>(null)

  useEffect(() => {
    if (!conversationId) {
      setUser(null)
      setKpis(null)
      setError(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    let cancelled = false
    setLoading(true)
    setError(null)

    const load = async () => {
      try {
        const res = await authFetch(
          `${BACKEND}/api/admin/conversations/${conversationId}/participant`,
          { signal: controller.signal },
        )
        const json = await res.json()
        if (cancelled || controller.signal.aborted) return
        if (!res.ok || !json?.success) {
          throw new Error(json?.msg || "Failed to load participant")
        }
        setUser(json.data?.user ?? null)
        setKpis(json.data?.kpis ?? null)
      } catch (err) {
        if (cancelled || controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
          return
        }
        setUser(null)
        setKpis(null)
        setError("Could not load participant info")
      } finally {
        if (!cancelled && !controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [conversationId])

  return (
    <Card className="h-[70vh] overflow-hidden">
      <CardContent className="p-0 h-full overflow-y-auto">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-700">Professional info</h2>
        </div>
        {!conversationId ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">Select a chat to see details.</p>
        ) : loading ? (
          <div className="space-y-3 p-4">
            <div className="h-5 w-32 rounded bg-gray-200/80 motion-safe:animate-pulse" />
            <div className="h-4 w-48 rounded bg-gray-200/80 motion-safe:animate-pulse" />
            <div className="h-4 w-40 rounded bg-gray-200/80 motion-safe:animate-pulse" />
            <div className="mt-6 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-4 w-full rounded bg-gray-200/80 motion-safe:animate-pulse" />
              ))}
            </div>
          </div>
        ) : error ? (
          <p className="px-4 py-8 text-center text-sm text-red-600">{error}</p>
        ) : !user || !kpis ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No participant info.</p>
        ) : (
          <div className="p-4 space-y-5">
            <div>
              <p className="text-base font-semibold text-gray-900">{user.name || user.username || "User"}</p>
              {user.role === "professional" && kpis.level && (
                <Badge className={`mt-2 text-[10px] ${getLevelColor(kpis.level)}`}>
                  <Award className="mr-1 h-3 w-3" />
                  {kpis.level}
                </Badge>
              )}
              {user.role !== "professional" && (
                <Badge variant="secondary" className="mt-2 text-[10px] capitalize">{user.role}</Badge>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2 text-gray-700">
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="break-all">{user.email || "—"}</span>
              </div>
              <div className="flex items-start gap-2 text-gray-700">
                <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span>{user.phone || "—"}</span>
              </div>
              <div className="flex items-start gap-2 text-gray-700">
                <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span>{user.username || "—"}</span>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">KPIs</h3>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Avg rating</span>
                <span className="flex items-center gap-1 font-medium text-gray-900">
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  {kpis.avgRating != null ? kpis.avgRating.toFixed(1) : "—"}
                </span>
              </div>
              <KpiRow label="Reviews" value={kpis.reviewCount} />
              <KpiRow label="Projects" value={kpis.projectCount} />
              <KpiRow label="Bookings" value={kpis.bookingCount} />
              <KpiRow label="Completed" value={kpis.completedCount} />
              <KpiRow label="Quoted" value={kpis.quotedCount} />
              <KpiRow label="Disputes" value={kpis.disputeCount} />
              <KpiRow label="Gross €" value={formatMoney(kpis.grossEur)} />
              <KpiRow label="Refund %" value={formatPct(kpis.refundPercent)} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
