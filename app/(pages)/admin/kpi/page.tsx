'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { authFetch } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Mail, Download, RefreshCw, TrendingUp, Users, Calendar, AlertTriangle, Shield, RotateCcw, Clock, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || ''

type Preset = 'month' | 'quarter' | 'year' | 'last30' | 'custom'

interface Summary {
  signUps: number
  totalBookings: number
  completedBookings: number
  grossRevenue: number
  platformRevenue: number
  disputeRate: number
  warrantyClaimRate: number
  refundRate: number
  avgTimeToFirstQuoteHours: number | null
  quotedBookingsCount: number
}

interface RegionRow {
  city: string
  signUps: number
  views: number
  totalBookings: number
  completedBookings: number
  bookedValue: number
  platformRevenue: number
  quotationConversionRate: number
  disputeRate: number
  warrantyClaimRate: number
  refundRate: number
}

interface ServiceViewRow {
  serviceId: string
  views: number
}

interface ServiceBookingRow {
  serviceType: string
  totalRfqs: number
  quotedCount: number
  bookingsCount: number
  quotationConversionRate: number
  avgTtfqHours: number | null
}

interface ResponseRow {
  professionalId: string
  name?: string
  email?: string
  city?: string
  avgHours: number
  minHours: number
  maxHours: number
  quotesSent: number
}

const toISODateInput = (d: Date) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const isRangeValid = (fromStr: string, toStr: string): boolean => {
  if (!fromStr || !toStr) return false
  const f = new Date(fromStr)
  const t = new Date(toStr)
  if (isNaN(f.getTime()) || isNaN(t.getTime())) return false
  return f.getTime() <= t.getTime()
}

const computePreset = (preset: Preset): { from: string; to: string } => {
  const now = new Date()
  const to = toISODateInput(now)
  if (preset === 'last30') {
    const from = new Date(now)
    from.setDate(from.getDate() - 30)
    return { from: toISODateInput(from), to }
  }
  if (preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    const from = new Date(now.getFullYear(), q * 3, 1)
    return { from: toISODateInput(from), to }
  }
  if (preset === 'year') {
    const from = new Date(now.getFullYear(), 0, 1)
    return { from: toISODateInput(from), to }
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: toISODateInput(from), to }
}

const ScalarCard = ({ icon: Icon, label, value, suffix, loading }: { icon: LucideIcon; label: string; value: string | number | null; suffix?: string; loading: boolean }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="rounded-full bg-blue-50 p-2 text-blue-600">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
        {loading ? (
          <Skeleton className="h-6 w-20 mt-1" />
        ) : (
          <div className="text-xl font-semibold text-gray-900">
            {value == null ? 'n/a' : value}
            {suffix && value != null ? <span className="text-sm text-gray-500 ml-1">{suffix}</span> : null}
          </div>
        )}
      </div>
    </CardContent>
  </Card>
)

export default function AdminKpiDashboard() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const initial = useMemo(() => computePreset('month'), [])
  const [preset, setPreset] = useState<Preset>('month')
  const [from, setFrom] = useState<string>(initial.from)
  const [to, setTo] = useState<string>(initial.to)
  const [appliedFrom, setAppliedFrom] = useState<string>(initial.from)
  const [appliedTo, setAppliedTo] = useState<string>(initial.to)

  const [summary, setSummary] = useState<Summary | null>(null)
  const [regions, setRegions] = useState<RegionRow[]>([])
  const [serviceViews, setServiceViews] = useState<ServiceViewRow[]>([])
  const [serviceBookings, setServiceBookings] = useState<ServiceBookingRow[]>([])
  const [responses, setResponses] = useState<ResponseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingReport, setSendingReport] = useState(false)
  const requestIdRef = useRef(0)

  const editingRangeValid = isRangeValid(from, to)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push('/auth/signin')
      return
    }
    if (user.role !== 'admin') {
      router.push('/')
    }
  }, [authLoading, user, router])

  const applyPreset = (p: Preset) => {
    setPreset(p)
    if (p !== 'custom') {
      const r = computePreset(p)
      setFrom(r.from)
      setTo(r.to)
      setAppliedFrom(r.from)
      setAppliedTo(r.to)
    }
  }

  const applyCustom = () => {
    if (!isRangeValid(from, to)) {
      toast.error('"From" date must be on or before "To" date')
      return
    }
    setAppliedFrom(from)
    setAppliedTo(to)
  }

  const appliedRange = useMemo(
    () => `from=${encodeURIComponent(appliedFrom)}&to=${encodeURIComponent(appliedTo)}`,
    [appliedFrom, appliedTo]
  )

  const load = useCallback(async (rangeQs: string, fromStr: string, toStr: string) => {
    if (!isRangeValid(fromStr, toStr)) {
      toast.error('"From" date must be on or before "To" date')
      return
    }
    const requestId = ++requestIdRef.current
    setLoading(true)
    try {
      const [sumRes, regRes, svcRes, respRes] = await Promise.all([
        authFetch(`${BACKEND}/api/admin/kpi/summary?${rangeQs}`),
        authFetch(`${BACKEND}/api/admin/kpi/by-region?${rangeQs}`),
        authFetch(`${BACKEND}/api/admin/kpi/by-service?${rangeQs}`),
        authFetch(`${BACKEND}/api/admin/kpi/professional-response?${rangeQs}`),
      ])
      if (requestId !== requestIdRef.current) return
      if (!sumRes.ok || !regRes.ok || !svcRes.ok || !respRes.ok) {
        toast.error('Failed to load KPI data')
        return
      }
      const [sumJson, regJson, svcJson, respJson] = await Promise.all([sumRes.json(), regRes.json(), svcRes.json(), respRes.json()])
      if (requestId !== requestIdRef.current) return
      setSummary(sumJson.data || null)
      setRegions(regJson.data?.rows || [])
      setServiceViews(svcJson.data?.serviceViews || [])
      setServiceBookings(svcJson.data?.serviceBookings || [])
      setResponses(respJson.data?.rows || [])
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      console.error(err)
      toast.error('Failed to load KPI data')
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user || user.role !== 'admin') return
    load(appliedRange, appliedFrom, appliedTo)
  }, [user, load, appliedRange, appliedFrom, appliedTo])

  const downloadCsv = (section: 'region' | 'service' | 'service-views' | 'response') => {
    if (!isRangeValid(appliedFrom, appliedTo)) {
      toast.error('"From" date must be on or before "To" date')
      return
    }
    const url = `${BACKEND}/api/admin/kpi/export?section=${section}&${appliedRange}`
    const newWindow = window.open(url, '_blank', 'noopener,noreferrer')
    if (newWindow) newWindow.opener = null
  }

  const emailPdf = async () => {
    if (!isRangeValid(appliedFrom, appliedTo)) {
      toast.error('"From" date must be on or before "To" date')
      return
    }
    setSendingReport(true)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/kpi/email-report?${appliedRange}`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (res.status === 202 || res.ok) {
        toast.success(json?.data?.message || 'Report is being prepared and will be emailed to you.')
      } else {
        toast.error(json?.error?.message || 'Failed to queue report')
      }
    } catch {
      toast.error('Failed to queue report')
    } finally {
      setSendingReport(false)
    }
  }

  if (authLoading) return null
  if (!user || user.role !== 'admin') return null

  const regionBarData = regions.slice(0, 10).map((r) => ({ name: r.city, bookedValue: r.bookedValue, platformRevenue: r.platformRevenue }))
  const serviceViewBarData = serviceViews.slice(0, 10).map((s) => ({ name: s.serviceId, views: s.views }))
  const serviceBookingBarData = serviceBookings.slice(0, 10).map((s) => ({ name: s.serviceType, bookings: s.bookingsCount, rfqs: s.totalRfqs }))

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Monthly KPI Dashboard</h1>
            <p className="text-sm text-gray-500">Platform health by city, service, and response times.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => load(appliedRange, appliedFrom, appliedTo)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={emailPdf} disabled={sendingReport || !isRangeValid(appliedFrom, appliedTo)}>
              <Mail className="h-4 w-4 mr-2" />
              {sendingReport ? 'Queuing…' : 'Email me the full PDF report'}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Date range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex gap-2 flex-wrap">
                {(['month', 'quarter', 'year', 'last30'] as Preset[]).map((p) => (
                  <Button
                    key={p}
                    variant={preset === p ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => applyPreset(p)}
                  >
                    {p === 'month' ? 'This month' : p === 'quarter' ? 'This quarter' : p === 'year' ? 'This year' : 'Last 30 days'}
                  </Button>
                ))}
                <Button variant={preset === 'custom' ? 'default' : 'outline'} size="sm" onClick={() => setPreset('custom')}>Custom</Button>
              </div>
              <div className="flex items-end gap-2">
                <div>
                  <Label htmlFor="kpi-from" className="text-xs">From</Label>
                  <Input
                    id="kpi-from"
                    type="date"
                    value={from}
                    onChange={(e) => { setPreset('custom'); setFrom(e.target.value) }}
                    className="w-40"
                  />
                </div>
                <div>
                  <Label htmlFor="kpi-to" className="text-xs">To</Label>
                  <Input
                    id="kpi-to"
                    type="date"
                    value={to}
                    onChange={(e) => { setPreset('custom'); setTo(e.target.value) }}
                    className="w-40"
                  />
                </div>
                <Button onClick={applyCustom} disabled={loading || !editingRangeValid}>Apply</Button>
              </div>
            </div>
            {!editingRangeValid && (
              <p className="mt-2 text-xs text-red-600">&quot;From&quot; date must be on or before &quot;To&quot; date.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <ScalarCard icon={Users} label="Sign-ups" value={summary?.signUps ?? null} loading={loading} />
          <ScalarCard icon={Calendar} label="Bookings" value={summary?.totalBookings ?? null} loading={loading} />
          <ScalarCard icon={TrendingUp} label="Gross revenue" value={summary?.grossRevenue?.toFixed(2) ?? null} suffix="EUR" loading={loading} />
          <ScalarCard icon={TrendingUp} label="Platform revenue" value={summary?.platformRevenue?.toFixed(2) ?? null} suffix="EUR" loading={loading} />
          <ScalarCard icon={Clock} label="Avg time to first quote" value={summary?.avgTimeToFirstQuoteHours ?? null} suffix="h" loading={loading} />
          <ScalarCard icon={AlertTriangle} label="Dispute rate" value={summary?.disputeRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={Shield} label="Warranty claim rate" value={summary?.warrantyClaimRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={RotateCcw} label="Refund rate" value={summary?.refundRate ?? null} suffix="%" loading={loading} />
        </div>

        <Tabs defaultValue="region" className="w-full">
          <TabsList>
            <TabsTrigger value="region">By Region (City)</TabsTrigger>
            <TabsTrigger value="service">By Service</TabsTrigger>
            <TabsTrigger value="response">Professional Response Times</TabsTrigger>
          </TabsList>

          <TabsContent value="region">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Top 10 cities by booked value</CardTitle>
                <Button variant="outline" size="sm" onClick={() => downloadCsv('region')}>
                  <Download className="h-4 w-4 mr-2" />Download CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={regionBarData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="bookedValue" fill="#3b82f6" name="Booked value (EUR)" />
                      <Bar dataKey="platformRevenue" fill="#10b981" name="Platform revenue (EUR)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">City</th>
                        <th className="px-3 py-2 text-right">Sign-ups</th>
                        <th className="px-3 py-2 text-right">Views</th>
                        <th className="px-3 py-2 text-right">Bookings</th>
                        <th className="px-3 py-2 text-right">Booked €</th>
                        <th className="px-3 py-2 text-right">Platform €</th>
                        <th className="px-3 py-2 text-right">Convert %</th>
                        <th className="px-3 py-2 text-right">Dispute %</th>
                        <th className="px-3 py-2 text-right">Warranty %</th>
                        <th className="px-3 py-2 text-right">Refund %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {regions.length === 0 && !loading && (
                        <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-400">No data in this range</td></tr>
                      )}
                      {regions.map((r) => (
                        <tr key={r.city}>
                          <td className="px-3 py-2 capitalize">{r.city}</td>
                          <td className="px-3 py-2 text-right">{r.signUps}</td>
                          <td className="px-3 py-2 text-right">{r.views}</td>
                          <td className="px-3 py-2 text-right">{r.totalBookings}</td>
                          <td className="px-3 py-2 text-right">{r.bookedValue.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{r.platformRevenue.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{r.quotationConversionRate}</td>
                          <td className="px-3 py-2 text-right">{r.disputeRate}</td>
                          <td className="px-3 py-2 text-right">{r.warrantyClaimRate}</td>
                          <td className="px-3 py-2 text-right">{r.refundRate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="service">
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Most-viewed service pages</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => downloadCsv('service-views')}>
                    <Download className="h-4 w-4 mr-2" />Download CSV
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={serviceViewBarData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="views" fill="#6366f1" name="Views" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto mt-4">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left">Service slug</th>
                          <th className="px-3 py-2 text-right">Views</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {serviceViews.length === 0 && !loading && (
                          <tr><td colSpan={2} className="px-3 py-6 text-center text-gray-400">No data in this range</td></tr>
                        )}
                        {serviceViews.map((s) => (
                          <tr key={s.serviceId}>
                            <td className="px-3 py-2">{s.serviceId}</td>
                            <td className="px-3 py-2 text-right">{s.views}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Top booked service types (from RFQs)</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => downloadCsv('service')}>
                    <Download className="h-4 w-4 mr-2" />Download CSV
                  </Button>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-gray-500 mb-3">
                    Service types come from free-text RFQ entries and aren&apos;t mergeable with service-page slugs.
                  </p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={serviceBookingBarData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="rfqs" fill="#a78bfa" name="RFQs" />
                        <Bar dataKey="bookings" fill="#f59e0b" name="Bookings" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto mt-4">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left">Service type</th>
                          <th className="px-3 py-2 text-right">RFQs</th>
                          <th className="px-3 py-2 text-right">Quotes</th>
                          <th className="px-3 py-2 text-right">Bookings</th>
                          <th className="px-3 py-2 text-right">Quote conv. %</th>
                          <th className="px-3 py-2 text-right">Avg TTFQ (h)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {serviceBookings.length === 0 && !loading && (
                          <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No data in this range</td></tr>
                        )}
                        {serviceBookings.map((s) => (
                          <tr key={s.serviceType}>
                            <td className="px-3 py-2 capitalize">{s.serviceType}</td>
                            <td className="px-3 py-2 text-right">{s.totalRfqs}</td>
                            <td className="px-3 py-2 text-right">{s.quotedCount}</td>
                            <td className="px-3 py-2 text-right">{s.bookingsCount}</td>
                            <td className="px-3 py-2 text-right">{s.quotationConversionRate}</td>
                            <td className="px-3 py-2 text-right">{s.avgTtfqHours ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="response">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Fastest professional responders (avg hours to first quote)</CardTitle>
                <Button variant="outline" size="sm" onClick={() => downloadCsv('response')}>
                  <Download className="h-4 w-4 mr-2" />Download CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={responses.slice(0, 10).map((r) => ({ name: r.name || r.email || '—', avgHours: r.avgHours }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="avgHours" fill="#0ea5e9" name="Avg hours">
                        {responses.slice(0, 10).map((_, idx) => (
                          <Cell key={idx} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Professional</th>
                        <th className="px-3 py-2 text-left">Email</th>
                        <th className="px-3 py-2 text-left">City</th>
                        <th className="px-3 py-2 text-right">Quotes sent</th>
                        <th className="px-3 py-2 text-right">Avg hours</th>
                        <th className="px-3 py-2 text-right">Min hours</th>
                        <th className="px-3 py-2 text-right">Max hours</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {responses.length === 0 && !loading && (
                        <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No data in this range</td></tr>
                      )}
                      {responses.map((r) => (
                        <tr key={r.professionalId || r.email}>
                          <td className="px-3 py-2">{r.name || '—'}</td>
                          <td className="px-3 py-2">{r.email || '—'}</td>
                          <td className="px-3 py-2">{r.city || '—'}</td>
                          <td className="px-3 py-2 text-right">{r.quotesSent}</td>
                          <td className="px-3 py-2 text-right">{r.avgHours}</td>
                          <td className="px-3 py-2 text-right">{r.minHours}</td>
                          <td className="px-3 py-2 text-right">{r.maxHours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
