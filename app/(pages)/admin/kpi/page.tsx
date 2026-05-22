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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Mail, Download, RefreshCw, TrendingUp, Users, Calendar, AlertTriangle, Shield, RotateCcw, Clock, Eye, Star, Heart, Activity, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || ''

type Preset = 'month' | 'quarter' | 'year' | 'last30' | 'custom'
type SortDir = 'asc' | 'desc'
type TabKey = 'city' | 'service' | 'subproject' | 'professional' | 'customer'

interface Summary {
  signUps: number
  totalBookings: number
  completedBookings: number
  grossRevenue: number
  platformRevenue: number
  disputeRate: number | null
  warrantyClaimRate: number | null
  refundRate: number | null
  refundAmount: number
  avgTimeToFirstQuoteHours: number | null
  quotedBookingsCount: number
  views: number
  noShowRate: number | null
  rfqCount: number
  quotationResponseRate: number | null
  quotationConversionRate: number | null
  bookingRate: number | null
  reviewsCount: number
  avgReviewScore: number | null
  favoritesCount: number
  avgWarrantyResponseTimeHours: number | null
  reschedulingRate: number | null
  startOverdueRate: number | null
  avgStartOverdueDays: number | null
  completionOverdueRate: number | null
  avgCompletionOverdueDays: number | null
}

type Row = Record<string, number | string | null | undefined>

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
    from.setDate(from.getDate() - 29)
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
        <div className="text-xs text-gray-500 uppercase tracking-wide truncate">{label}</div>
        {loading ? (
          <Skeleton className="h-6 w-20 mt-1" />
        ) : (
          <div className="text-xl font-semibold text-gray-900">
            {value == null || value === '' ? '—' : value}
            {suffix && value != null && value !== '' ? <span className="text-sm text-gray-500 ml-1">{suffix}</span> : null}
          </div>
        )}
      </div>
    </CardContent>
  </Card>
)

interface SortableTableProps {
  columns: Array<{ key: string; label: string; numeric?: boolean; format?: (v: unknown) => string }>
  rows: Row[]
  loading: boolean
  emptyLabel?: string
  defaultSortKey: string
  defaultSortDir?: SortDir
}

const SortableTable = ({ columns, rows, loading, emptyLabel = 'No data in this range', defaultSortKey, defaultSortDir = 'desc' }: SortableTableProps) => {
  const [sortKey, setSortKey] = useState<string>(defaultSortKey)
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir)

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const aNull = av == null || av === ''
      const bNull = bv == null || bv === ''
      if (aNull && bNull) return 0
      if (aNull) return 1
      if (bNull) return -1
      const aNum = typeof av === 'number' ? av : Number(av)
      const bNum = typeof bv === 'number' ? bv : Number(bv)
      if (!isNaN(aNum) && !isNaN(bNum)) return sortDir === 'asc' ? aNum - bNum : bNum - aNum
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return copy
  }, [rows, sortKey, sortDir])

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2 select-none cursor-pointer hover:bg-gray-100 ${c.numeric ? 'text-right' : 'text-left'}`}
                onClick={() => toggleSort(c.key)}
              >
                {c.label}
                {sortKey === c.key && (
                  <span className="ml-1 text-gray-400">{sortDir === 'asc' ? '▲' : '▼'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sortedRows.length === 0 && !loading && (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-gray-400">{emptyLabel}</td></tr>
          )}
          {sortedRows.map((row, idx) => {
            const stableKey = columns.map((c) => String(row[c.key] ?? '')).join('|') || String(idx)
            return (
            <tr key={stableKey} className="hover:bg-blue-50/40">
              {columns.map((c) => {
                const v = row[c.key]
                const display = c.format ? c.format(v) : (v == null || v === '' ? '—' : String(v))
                return (
                  <td key={c.key} className={`px-3 py-2 ${c.numeric ? 'text-right' : ''}`}>{display}</td>
                )
              })}
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const fmtMoney = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(2)
}
const fmtPct = (v: unknown) => {
  if (v == null || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n}%`
}

const maskEmail = (v: unknown): string => {
  if (v == null || v === '') return '—'
  const s = String(v)
  const at = s.indexOf('@')
  if (at <= 0) return '***'
  const local = s.slice(0, at)
  const domain = s.slice(at + 1)
  const head = local.charAt(0)
  return `${head}***@${domain}`
}

const TAB_SECTION_MAP: Record<TabKey, string> = {
  city: 'region',
  service: 'service',
  subproject: 'subproject',
  professional: 'professional',
  customer: 'customer',
}

export default function AdminKpiDashboard() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const initial = useMemo(() => computePreset('month'), [])
  const [preset, setPreset] = useState<Preset>('month')
  const [from, setFrom] = useState<string>(initial.from)
  const [to, setTo] = useState<string>(initial.to)
  const [appliedFrom, setAppliedFrom] = useState<string>(initial.from)
  const [appliedTo, setAppliedTo] = useState<string>(initial.to)
  const [country, setCountry] = useState<string>('all')
  const [countries, setCountries] = useState<string[]>([])

  const [summary, setSummary] = useState<Summary | null>(null)
  const [regions, setRegions] = useState<Row[]>([])
  const [serviceBookings, setServiceBookings] = useState<Row[]>([])
  const [subprojects, setSubprojects] = useState<Row[]>([])
  const [professionals, setProfessionals] = useState<Row[]>([])
  const [customers, setCustomers] = useState<Row[]>([])
  const [activeTab, setActiveTab] = useState<TabKey>('city')
  const [loading, setLoading] = useState(true)
  const [sendingReport, setSendingReport] = useState(false)
  const [showEmails, setShowEmails] = useState(false)
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

  useEffect(() => {
    if (!user || user.role !== 'admin') return
    authFetch(`${BACKEND}/api/admin/kpi/countries`)
      .then((r) => (r.ok ? r.json() : { data: { countries: [] } }))
      .then((j) => setCountries(j?.data?.countries || []))
      .catch(() => setCountries([]))
  }, [user])

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
    () => `from=${encodeURIComponent(appliedFrom)}&to=${encodeURIComponent(appliedTo)}&country=${encodeURIComponent(country)}`,
    [appliedFrom, appliedTo, country]
  )

  const load = useCallback(async (rangeQs: string, fromStr: string, toStr: string) => {
    if (!isRangeValid(fromStr, toStr)) {
      toast.error('"From" date must be on or before "To" date')
      return
    }
    const requestId = ++requestIdRef.current
    setSummary(null)
    setRegions([])
    setServiceBookings([])
    setSubprojects([])
    setProfessionals([])
    setCustomers([])
    setLoading(true)
    try {
      const [sumRes, regRes, svcRes, subRes, proRes, custRes] = await Promise.all([
        authFetch(`${BACKEND}/api/admin/kpi/summary?${rangeQs}`),
        authFetch(`${BACKEND}/api/admin/kpi/by-region?${rangeQs}`),
        authFetch(`${BACKEND}/api/admin/kpi/by-service?${rangeQs}`),
        authFetch(`${BACKEND}/api/admin/kpi/by-subproject?${rangeQs}`),
        authFetch(`${BACKEND}/api/admin/kpi/by-professional?${rangeQs}`),
        authFetch(`${BACKEND}/api/admin/kpi/by-customer?${rangeQs}`),
      ])
      if (requestId !== requestIdRef.current) return
      if (!sumRes.ok) {
        toast.error('Failed to load KPI summary')
      }
      const [sumJson, regJson, svcJson, subJson, proJson, custJson] = await Promise.all([
        sumRes.ok ? sumRes.json() : Promise.resolve({ data: null }),
        regRes.ok ? regRes.json() : Promise.resolve({ data: { rows: [] } }),
        svcRes.ok ? svcRes.json() : Promise.resolve({ data: { serviceBookings: [] } }),
        subRes.ok ? subRes.json() : Promise.resolve({ data: { rows: [] } }),
        proRes.ok ? proRes.json() : Promise.resolve({ data: { rows: [] } }),
        custRes.ok ? custRes.json() : Promise.resolve({ data: { rows: [] } }),
      ])
      if (requestId !== requestIdRef.current) return
      setSummary(sumJson.data || null)
      setRegions(regJson.data?.rows || [])
      setServiceBookings(svcJson.data?.serviceBookings || [])
      setSubprojects(subJson.data?.rows || [])
      setProfessionals(proJson.data?.rows || [])
      setCustomers(custJson.data?.rows || [])
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

  const downloadExport = async (section: string, fmt: 'csv' | 'xlsx') => {
    if (!isRangeValid(appliedFrom, appliedTo)) {
      toast.error('"From" date must be on or before "To" date')
      return
    }
    try {
      const res = await authFetch(`${BACKEND}/api/admin/kpi/export?section=${section}&format=${fmt}&${appliedRange}`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(json?.error?.message || 'Failed to download')
        return
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `fixera-kpi-${section}-${appliedFrom}_to_${appliedTo}.${fmt === 'xlsx' ? 'xls' : 'csv'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch {
      toast.error('Failed to download')
    }
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

  const tabRowsMap: Record<TabKey, Row[]> = useMemo(() => ({
    city: regions,
    service: serviceBookings,
    subproject: subprojects,
    professional: professionals,
    customer: customers,
  }), [regions, serviceBookings, subprojects, professionals, customers])

  // Per-tab evolution line: synthesized cumulative bookings over the date range for the top row
  const evolution = useMemo(() => {
    const startDate = new Date(appliedFrom)
    const endDate = new Date(appliedTo)
    const out: Array<{ date: string; bookings: number }> = []
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return out
    const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
    const step = Math.max(1, Math.round(days / 12))
    const rows = tabRowsMap[activeTab]
    const total = rows.reduce((sum, r) => sum + (Number(r.bookingsCount) || 0), 0)
    for (let i = 0; i <= days; i += step) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      out.push({ date: toISODateInput(d), bookings: Math.round((total * i) / days) })
    }
    return out
  }, [appliedFrom, appliedTo, activeTab, tabRowsMap])

  if (authLoading) return null
  if (!user || user.role !== 'admin') return null

  const regionColumns = [
    { key: 'city', label: 'City' },
    { key: 'signUps', label: 'Sign-ups', numeric: true },
    { key: 'views', label: 'Views', numeric: true },
    { key: 'totalBookings', label: 'Bookings', numeric: true },
    { key: 'bookedValue', label: 'Booked €', numeric: true, format: fmtMoney },
    { key: 'platformRevenue', label: 'Platform €', numeric: true, format: fmtMoney },
    { key: 'quotationConversionRate', label: 'Convert %', numeric: true, format: fmtPct },
    { key: 'disputeRate', label: 'Dispute %', numeric: true, format: fmtPct },
    { key: 'warrantyClaimRate', label: 'Warranty %', numeric: true, format: fmtPct },
    { key: 'refundRate', label: 'Refund %', numeric: true, format: fmtPct },
  ]
  const serviceColumns = [
    { key: 'serviceType', label: 'Service type' },
    { key: 'totalRfqs', label: 'RFQs', numeric: true },
    { key: 'quotedCount', label: 'Quotes', numeric: true },
    { key: 'bookingsCount', label: 'Bookings', numeric: true },
    { key: 'completedCount', label: 'Completed', numeric: true },
    { key: 'grossRevenue', label: 'Gross €', numeric: true, format: fmtMoney },
    { key: 'quotationConversionRate', label: 'Convert %', numeric: true, format: fmtPct },
    { key: 'avgTtfqHours', label: 'Avg TTFQ (h)', numeric: true },
  ]
  const subprojectColumns = [
    { key: 'projectTitle', label: 'Project' },
    { key: 'subprojectName', label: 'Subproject' },
    { key: 'totalRfqs', label: 'RFQs', numeric: true },
    { key: 'bookingsCount', label: 'Bookings', numeric: true },
    { key: 'completedCount', label: 'Completed', numeric: true },
    { key: 'disputeCount', label: 'Disputes', numeric: true },
    { key: 'refundCount', label: 'Refunds', numeric: true },
    { key: 'reschedulingCount', label: 'Reschedules', numeric: true },
    { key: 'grossRevenue', label: 'Gross €', numeric: true, format: fmtMoney },
    { key: 'price', label: 'Price', numeric: true, format: fmtMoney },
  ]
  const emailFormat = showEmails ? undefined : maskEmail
  const professionalColumns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email', format: emailFormat },
    { key: 'city', label: 'City' },
    { key: 'professionalLevel', label: 'Level' },
    { key: 'createdProjects', label: 'Projects', numeric: true },
    { key: 'rfqsReceived', label: 'RFQs', numeric: true },
    { key: 'quotedCount', label: 'Quoted', numeric: true },
    { key: 'bookingsCount', label: 'Bookings', numeric: true },
    { key: 'completedCount', label: 'Completed', numeric: true },
    { key: 'disputeCount', label: 'Disputes', numeric: true },
    { key: 'avgTtfqHours', label: 'Avg TTFQ (h)', numeric: true },
    { key: 'avgReviewScore', label: 'Avg review', numeric: true },
    { key: 'grossRevenue', label: 'Gross €', numeric: true, format: fmtMoney },
  ]
  const customerColumns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email', format: emailFormat },
    { key: 'city', label: 'City' },
    { key: 'loyaltyLevel', label: 'Loyalty' },
    { key: 'rfqsCreated', label: 'RFQs', numeric: true },
    { key: 'bookingsCount', label: 'Bookings', numeric: true },
    { key: 'completedCount', label: 'Completed', numeric: true },
    { key: 'disputeCount', label: 'Disputes', numeric: true },
    { key: 'refundCount', label: 'Refunds', numeric: true },
    { key: 'reschedulingCount', label: 'Reschedules', numeric: true },
    { key: 'avgPaymentTimeHours', label: 'Avg pay (h)', numeric: true },
    { key: 'grossSpend', label: 'Gross spend €', numeric: true, format: fmtMoney },
  ]

  const regionBarData = regions.slice(0, 10).map((r) => ({ name: String(r.city ?? ''), bookedValue: Number(r.bookedValue) || 0, platformRevenue: Number(r.platformRevenue) || 0 }))

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">KPI Dashboard</h1>
            <p className="text-sm text-gray-500">Platform health by city, service, subproject, professional and customer.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowEmails((s) => !s)}>
              {showEmails ? 'Hide emails' : 'Reveal emails'}
            </Button>
            <Button variant="outline" onClick={() => load(appliedRange, appliedFrom, appliedTo)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={emailPdf} disabled={sendingReport || !isRangeValid(appliedFrom, appliedTo)}>
              <Mail className="h-4 w-4 mr-2" />
              {sendingReport ? 'Queuing…' : 'Email full PDF report'}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
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
              <div>
                <Label className="text-xs">Country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All countries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All countries</SelectItem>
                    {countries.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!editingRangeValid && (
              <p className="mt-2 text-xs text-red-600">&quot;From&quot; date must be on or before &quot;To&quot; date.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <ScalarCard icon={Users} label="Sign-ups" value={summary?.signUps ?? null} loading={loading} />
          <ScalarCard icon={Eye} label="Views" value={summary?.views ?? null} loading={loading} />
          <ScalarCard icon={Calendar} label="Bookings" value={summary?.totalBookings ?? null} loading={loading} />
          <ScalarCard icon={Activity} label="# RFQs" value={summary?.rfqCount ?? null} loading={loading} />
          <ScalarCard icon={TrendingUp} label="Gross revenue" value={summary?.grossRevenue?.toFixed(2) ?? null} suffix="EUR" loading={loading} />
          <ScalarCard icon={TrendingUp} label="Platform revenue" value={summary?.platformRevenue?.toFixed(2) ?? null} suffix="EUR" loading={loading} />
          <ScalarCard icon={RotateCcw} label="Refund amount" value={summary?.refundAmount?.toFixed(2) ?? null} suffix="EUR" loading={loading} />
          <ScalarCard icon={Clock} label="Avg time to first quote" value={summary?.avgTimeToFirstQuoteHours ?? null} suffix="h" loading={loading} />
          <ScalarCard icon={Clock} label="Quote response rate" value={summary?.quotationResponseRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={Clock} label="Quote conversion rate" value={summary?.quotationConversionRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={Clock} label="Booking rate (view→booking)" value={summary?.bookingRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={AlertTriangle} label="Dispute rate" value={summary?.disputeRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={AlertTriangle} label="No-show rate" value={summary?.noShowRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={Shield} label="Warranty claim rate" value={summary?.warrantyClaimRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={Shield} label="Avg warranty response" value={summary?.avgWarrantyResponseTimeHours ?? null} suffix="h" loading={loading} />
          <ScalarCard icon={RotateCcw} label="Refund rate" value={summary?.refundRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={Star} label="# Reviews" value={summary?.reviewsCount ?? null} loading={loading} />
          <ScalarCard icon={Star} label="Avg review score" value={summary?.avgReviewScore ?? null} loading={loading} />
          <ScalarCard icon={Heart} label="# Favorites" value={summary?.favoritesCount ?? null} loading={loading} />
          <ScalarCard icon={RefreshCw} label="Rescheduling rate" value={summary?.reschedulingRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={Clock} label="Start overdue rate" value={summary?.startOverdueRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={Clock} label="Avg start overdue" value={summary?.avgStartOverdueDays ?? null} suffix="d" loading={loading} />
          <ScalarCard icon={Clock} label="Completion overdue rate" value={summary?.completionOverdueRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={Clock} label="Avg completion overdue" value={summary?.avgCompletionOverdueDays ?? null} suffix="d" loading={loading} />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 gap-1">
            <TabsTrigger value="city">By City</TabsTrigger>
            <TabsTrigger value="service">By Service</TabsTrigger>
            <TabsTrigger value="subproject">By Subproject</TabsTrigger>
            <TabsTrigger value="professional">By Professional</TabsTrigger>
            <TabsTrigger value="customer">By Customer</TabsTrigger>
          </TabsList>

          {(['city', 'service', 'subproject', 'professional', 'customer'] as TabKey[]).map((tab) => (
            <TabsContent value={tab} key={tab}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base capitalize">{tab === 'city' ? 'By Region (City)' : `By ${tab.charAt(0).toUpperCase() + tab.slice(1)}`}</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => downloadExport(TAB_SECTION_MAP[tab], 'csv')}>
                      <Download className="h-4 w-4 mr-2" />CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadExport(TAB_SECTION_MAP[tab], 'xlsx')}>
                      <Download className="h-4 w-4 mr-2" />XLSX
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      {tab === 'city' ? (
                        <BarChart data={regionBarData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="bookedValue" fill="#3b82f6" name="Booked value (EUR)" />
                          <Bar dataKey="platformRevenue" fill="#10b981" name="Platform revenue (EUR)" />
                        </BarChart>
                      ) : (
                        <LineChart data={evolution}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="bookings" stroke="#3b82f6" name="Bookings (cumulative)" />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                  {tab !== 'city' && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      Note: this evolution line is a linear projection of period totals, not an actual time series. Use the totals in the table for accuracy.
                    </p>
                  )}
                  <SortableTable
                    columns={
                      tab === 'city' ? regionColumns
                      : tab === 'service' ? serviceColumns
                      : tab === 'subproject' ? subprojectColumns
                      : tab === 'professional' ? professionalColumns
                      : customerColumns
                    }
                    rows={tabRowsMap[tab]}
                    loading={loading}
                    defaultSortKey={
                      tab === 'city' ? 'bookedValue'
                      : tab === 'service' ? 'bookingsCount'
                      : tab === 'subproject' ? 'bookingsCount'
                      : tab === 'professional' ? 'grossRevenue'
                      : 'grossSpend'
                    }
                  />
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}
