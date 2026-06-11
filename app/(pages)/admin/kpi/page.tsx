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
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Mail, Download, RefreshCw, TrendingUp, Users, Calendar, AlertTriangle, Shield, RotateCcw, Clock, Eye, Star, Heart, Activity, Columns3, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const MAX_KPI_COLUMNS = 10
const KPI_COLUMNS_STORAGE_KEY = 'fixera-kpi-columns-v1'

type Preset = 'month' | 'quarter' | 'year' | 'last30' | 'custom'
type SortDir = 'asc' | 'desc'
type TabKey = 'city' | 'service' | 'subproject' | 'professional' | 'customer'

const TAB_KEYS: TabKey[] = ['city', 'service', 'subproject', 'professional', 'customer']

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

interface KpiColumn { key: string; label: string; numeric?: boolean; format?: (v: unknown) => string }

const sortRows = (rows: Row[], sortKey: string, sortDir: SortDir): Row[] => {
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
}

interface SortableTableProps {
  columns: KpiColumn[]
  sortedRows: Row[]
  loading: boolean
  emptyLabel?: string
  sortKey: string
  sortDir: SortDir
  onToggleSort: (key: string) => void
  rowKeyOf: (row: Row) => string
  selectedRowKey?: string | null
  onRowSelect?: (key: string) => void
}

const SortableTable = ({ columns, sortedRows, loading, emptyLabel = 'No data in this range', sortKey, sortDir, onToggleSort, rowKeyOf, selectedRowKey, onRowSelect }: SortableTableProps) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2 select-none cursor-pointer hover:bg-gray-100 ${c.numeric ? 'text-right' : 'text-left'}`}
                onClick={() => onToggleSort(c.key)}
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
            const key = rowKeyOf(row) || String(idx)
            const selected = selectedRowKey != null && key === selectedRowKey
            return (
            <tr
              key={key}
              onClick={() => onRowSelect?.(key)}
              className={`cursor-pointer ${selected ? 'bg-blue-100' : 'hover:bg-blue-50/40'}`}
            >
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

const TAB_LABEL_KEY: Record<TabKey, string> = {
  city: 'city',
  service: 'serviceType',
  subproject: 'subprojectName',
  professional: 'name',
  customer: 'name',
}

const TAB_ROWKEY_FIELDS: Record<TabKey, string[]> = {
  city: ['city'],
  service: ['serviceType'],
  subproject: ['projectTitle', 'subprojectName'],
  professional: ['professionalId', 'email', 'name'],
  customer: ['customerId', 'email', 'name'],
}

const makeRowKey = (tab: TabKey, row: Row) => TAB_ROWKEY_FIELDS[tab].map((f) => String(row[f] ?? '')).join('|')

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
  const [sortByTab, setSortByTab] = useState<Record<TabKey, { key: string; dir: SortDir }>>({
    city: { key: 'platformRevenue', dir: 'desc' },
    service: { key: 'platformRevenue', dir: 'desc' },
    subproject: { key: 'platformRevenue', dir: 'desc' },
    professional: { key: 'platformRevenue', dir: 'desc' },
    customer: { key: 'platformRevenue', dir: 'desc' },
  })
  const [selectedByTab, setSelectedByTab] = useState<Record<TabKey, string | null>>({
    city: null, service: null, subproject: null, professional: null, customer: null,
  })
  const [visibleColsByTab, setVisibleColsByTab] = useState<Record<TabKey, string[]>>({
    city: [], service: [], subproject: [], professional: [], customer: [],
  })
  const columnsHydrated = useRef(false)
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

  const activeSorted = useMemo(
    () => sortRows(tabRowsMap[activeTab], sortByTab[activeTab].key, sortByTab[activeTab].dir),
    [activeTab, sortByTab, tabRowsMap]
  )

  const columnsByTab: Record<TabKey, KpiColumn[]> = useMemo(() => {
    const emailFormat = showEmails ? undefined : maskEmail
    return {
      city: [
        { key: 'city', label: 'City' },
        { key: 'signUps', label: 'Sign-ups', numeric: true },
        { key: 'views', label: 'Views', numeric: true },
        { key: 'totalBookings', label: 'Bookings', numeric: true },
        { key: 'completedBookings', label: 'Completed', numeric: true },
        { key: 'bookedValue', label: 'Booked €', numeric: true, format: fmtMoney },
        { key: 'grossRevenue', label: 'Gross €', numeric: true, format: fmtMoney },
        { key: 'platformRevenue', label: 'Platform €', numeric: true, format: fmtMoney },
        { key: 'refundAmount', label: 'Refund €', numeric: true, format: fmtMoney },
        { key: 'totalRfqs', label: 'RFQs', numeric: true },
        { key: 'quotedCount', label: 'Quotes', numeric: true },
        { key: 'quotationConversionRate', label: 'Convert %', numeric: true, format: fmtPct },
        { key: 'quoteResponseRate', label: 'Quote resp %', numeric: true, format: fmtPct },
        { key: 'avgTtfqHours', label: 'Avg TTFQ (h)', numeric: true },
        { key: 'bookingRate', label: 'Book rate %', numeric: true, format: fmtPct },
        { key: 'disputeRate', label: 'Dispute %', numeric: true, format: fmtPct },
        { key: 'noShowRate', label: 'No-show %', numeric: true, format: fmtPct },
        { key: 'warrantyClaimRate', label: 'Warranty %', numeric: true, format: fmtPct },
        { key: 'avgWarrantyResponseHours', label: 'Avg warranty (h)', numeric: true },
        { key: 'refundRate', label: 'Refund %', numeric: true, format: fmtPct },
        { key: 'reviewCount', label: 'Reviews', numeric: true },
        { key: 'avgReviewScore', label: 'Avg review', numeric: true },
        { key: 'favoritesCount', label: 'Favorites', numeric: true },
        { key: 'reschedulingRate', label: 'Reschedule %', numeric: true, format: fmtPct },
        { key: 'startOverdueRate', label: 'Start overdue %', numeric: true, format: fmtPct },
        { key: 'avgStartOverdueDays', label: 'Avg start overdue (d)', numeric: true },
        { key: 'completionOverdueRate', label: 'Compl overdue %', numeric: true, format: fmtPct },
        { key: 'avgCompletionOverdueDays', label: 'Avg compl overdue (d)', numeric: true },
      ],
      service: [
        { key: 'serviceType', label: 'Service' },
        { key: 'totalRfqs', label: 'RFQs', numeric: true },
        { key: 'quotedCount', label: 'Quotes', numeric: true },
        { key: 'bookingsCount', label: 'Bookings', numeric: true },
        { key: 'completedCount', label: 'Completed', numeric: true },
        { key: 'grossRevenue', label: 'Gross €', numeric: true, format: fmtMoney },
        { key: 'platformRevenue', label: 'Platform €', numeric: true, format: fmtMoney },
        { key: 'refundAmount', label: 'Refund €', numeric: true, format: fmtMoney },
        { key: 'quotationConversionRate', label: 'Convert %', numeric: true, format: fmtPct },
        { key: 'quoteResponseRate', label: 'Quote resp %', numeric: true, format: fmtPct },
        { key: 'avgTtfqHours', label: 'Avg TTFQ (h)', numeric: true },
        { key: 'disputeRate', label: 'Dispute %', numeric: true, format: fmtPct },
        { key: 'noShowRate', label: 'No-show %', numeric: true, format: fmtPct },
        { key: 'warrantyClaimRate', label: 'Warranty %', numeric: true, format: fmtPct },
        { key: 'avgWarrantyResponseHours', label: 'Avg warranty (h)', numeric: true },
        { key: 'refundRate', label: 'Refund %', numeric: true, format: fmtPct },
        { key: 'reviewCount', label: 'Reviews', numeric: true },
        { key: 'avgReviewScore', label: 'Avg review', numeric: true },
        { key: 'favoritesCount', label: 'Favorites', numeric: true },
        { key: 'reschedulingRate', label: 'Reschedule %', numeric: true, format: fmtPct },
        { key: 'reschedulingCount', label: 'Reschedules', numeric: true },
        { key: 'startOverdueRate', label: 'Start overdue %', numeric: true, format: fmtPct },
        { key: 'avgStartOverdueDays', label: 'Avg start overdue (d)', numeric: true },
        { key: 'completionOverdueRate', label: 'Compl overdue %', numeric: true, format: fmtPct },
        { key: 'avgCompletionOverdueDays', label: 'Avg compl overdue (d)', numeric: true },
      ],
      subproject: [
        { key: 'projectTitle', label: 'Project' },
        { key: 'subprojectName', label: 'Subproject' },
        { key: 'totalRfqs', label: 'RFQs', numeric: true },
        { key: 'quotedCount', label: 'Quotes', numeric: true },
        { key: 'bookingsCount', label: 'Bookings', numeric: true },
        { key: 'completedCount', label: 'Completed', numeric: true },
        { key: 'grossRevenue', label: 'Gross €', numeric: true, format: fmtMoney },
        { key: 'platformRevenue', label: 'Platform €', numeric: true, format: fmtMoney },
        { key: 'refundAmount', label: 'Refund €', numeric: true, format: fmtMoney },
        { key: 'price', label: 'Price', numeric: true, format: fmtMoney },
        { key: 'quotationConversionRate', label: 'Convert %', numeric: true, format: fmtPct },
        { key: 'quoteResponseRate', label: 'Quote resp %', numeric: true, format: fmtPct },
        { key: 'avgTtfqHours', label: 'Avg TTFQ (h)', numeric: true },
        { key: 'disputeCount', label: 'Disputes', numeric: true },
        { key: 'disputeRate', label: 'Dispute %', numeric: true, format: fmtPct },
        { key: 'noShowRate', label: 'No-show %', numeric: true, format: fmtPct },
        { key: 'warrantyClaimRate', label: 'Warranty %', numeric: true, format: fmtPct },
        { key: 'avgWarrantyResponseHours', label: 'Avg warranty (h)', numeric: true },
        { key: 'refundCount', label: 'Refunds', numeric: true },
        { key: 'refundRate', label: 'Refund %', numeric: true, format: fmtPct },
        { key: 'reviewCount', label: 'Reviews', numeric: true },
        { key: 'avgReviewScore', label: 'Avg review', numeric: true },
        { key: 'reschedulingCount', label: 'Reschedules', numeric: true },
        { key: 'reschedulingRate', label: 'Reschedule %', numeric: true, format: fmtPct },
        { key: 'startOverdueRate', label: 'Start overdue %', numeric: true, format: fmtPct },
        { key: 'avgStartOverdueDays', label: 'Avg start overdue (d)', numeric: true },
        { key: 'completionOverdueRate', label: 'Compl overdue %', numeric: true, format: fmtPct },
        { key: 'avgCompletionOverdueDays', label: 'Avg compl overdue (d)', numeric: true },
      ],
      professional: [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email', format: emailFormat },
        { key: 'city', label: 'City' },
        { key: 'professionalLevel', label: 'Level' },
        { key: 'createdProjects', label: 'Projects', numeric: true },
        { key: 'rfqsReceived', label: 'RFQs', numeric: true },
        { key: 'quotedCount', label: 'Quoted', numeric: true },
        { key: 'bookingsCount', label: 'Bookings', numeric: true },
        { key: 'completedCount', label: 'Completed', numeric: true },
        { key: 'grossRevenue', label: 'Gross €', numeric: true, format: fmtMoney },
        { key: 'platformRevenue', label: 'Platform €', numeric: true, format: fmtMoney },
        { key: 'refundAmount', label: 'Refund €', numeric: true, format: fmtMoney },
        { key: 'quotationConversionRate', label: 'Convert %', numeric: true, format: fmtPct },
        { key: 'quoteResponseRate', label: 'Quote resp %', numeric: true, format: fmtPct },
        { key: 'avgTtfqHours', label: 'Avg TTFQ (h)', numeric: true },
        { key: 'disputeCount', label: 'Disputes', numeric: true },
        { key: 'disputeRate', label: 'Dispute %', numeric: true, format: fmtPct },
        { key: 'noShowRate', label: 'No-show %', numeric: true, format: fmtPct },
        { key: 'warrantyClaimRate', label: 'Warranty %', numeric: true, format: fmtPct },
        { key: 'avgWarrantyResponseHours', label: 'Avg warranty (h)', numeric: true },
        { key: 'refundCount', label: 'Refunds', numeric: true },
        { key: 'refundRate', label: 'Refund %', numeric: true, format: fmtPct },
        { key: 'reviewCount', label: 'Reviews', numeric: true },
        { key: 'avgReviewScore', label: 'Avg review', numeric: true },
        { key: 'favoritesCount', label: 'Favorites', numeric: true },
        { key: 'reschedulingCount', label: 'Reschedules', numeric: true },
        { key: 'reschedulingRate', label: 'Reschedule %', numeric: true, format: fmtPct },
        { key: 'startOverdueRate', label: 'Start overdue %', numeric: true, format: fmtPct },
        { key: 'avgStartOverdueDays', label: 'Avg start overdue (d)', numeric: true },
        { key: 'completionOverdueRate', label: 'Compl overdue %', numeric: true, format: fmtPct },
        { key: 'avgCompletionOverdueDays', label: 'Avg compl overdue (d)', numeric: true },
      ],
      customer: [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email', format: emailFormat },
        { key: 'city', label: 'City' },
        { key: 'loyaltyLevel', label: 'Loyalty' },
        { key: 'rfqsCreated', label: 'RFQs', numeric: true },
        { key: 'quotedCount', label: 'Quoted', numeric: true },
        { key: 'bookingsCount', label: 'Bookings', numeric: true },
        { key: 'completedCount', label: 'Completed', numeric: true },
        { key: 'grossSpend', label: 'Gross spend €', numeric: true, format: fmtMoney },
        { key: 'platformRevenue', label: 'Platform €', numeric: true, format: fmtMoney },
        { key: 'refundAmount', label: 'Refund €', numeric: true, format: fmtMoney },
        { key: 'avgPaymentTimeHours', label: 'Avg pay (h)', numeric: true },
        { key: 'quotationConversionRate', label: 'Convert %', numeric: true, format: fmtPct },
        { key: 'quoteResponseRate', label: 'Quote resp %', numeric: true, format: fmtPct },
        { key: 'avgTtfqHours', label: 'Avg TTFQ (h)', numeric: true },
        { key: 'disputeCount', label: 'Disputes', numeric: true },
        { key: 'disputeRate', label: 'Dispute %', numeric: true, format: fmtPct },
        { key: 'noShowRate', label: 'No-show %', numeric: true, format: fmtPct },
        { key: 'warrantyClaimRate', label: 'Warranty %', numeric: true, format: fmtPct },
        { key: 'avgWarrantyResponseHours', label: 'Avg warranty (h)', numeric: true },
        { key: 'refundCount', label: 'Refunds', numeric: true },
        { key: 'refundRate', label: 'Refund %', numeric: true, format: fmtPct },
        { key: 'reviewCount', label: 'Reviews', numeric: true },
        { key: 'avgReviewScore', label: 'Avg review', numeric: true },
        { key: 'reschedulingCount', label: 'Reschedules', numeric: true },
        { key: 'reschedulingRate', label: 'Reschedule %', numeric: true, format: fmtPct },
        { key: 'startOverdueRate', label: 'Start overdue %', numeric: true, format: fmtPct },
        { key: 'avgStartOverdueDays', label: 'Avg start overdue (d)', numeric: true },
        { key: 'completionOverdueRate', label: 'Compl overdue %', numeric: true, format: fmtPct },
        { key: 'avgCompletionOverdueDays', label: 'Avg compl overdue (d)', numeric: true },
      ],
    }
  }, [showEmails])

  useEffect(() => {
    if (columnsHydrated.current) return
    columnsHydrated.current = true
    let stored: Partial<Record<TabKey, string[]>> = {}
    try {
      const raw = localStorage.getItem(KPI_COLUMNS_STORAGE_KEY)
      if (raw) stored = JSON.parse(raw)
    } catch { /* ignore corrupt storage */ }
    const next = {} as Record<TabKey, string[]>
    TAB_KEYS.forEach((tab) => {
      const all = columnsByTab[tab].map((c) => c.key)
      const identity = all[0]
      const saved = Array.isArray(stored[tab]) ? stored[tab]!.filter((k) => all.includes(k)) : null
      const chosen = saved && saved.length > 0 ? saved : all.slice(0, MAX_KPI_COLUMNS)
      const withIdentity = [identity, ...chosen.filter((k) => k !== identity)].slice(0, MAX_KPI_COLUMNS)
      next[tab] = all.filter((k) => withIdentity.includes(k))
    })
    setVisibleColsByTab(next)
  }, [columnsByTab])

  useEffect(() => {
    if (!columnsHydrated.current) return
    try {
      localStorage.setItem(KPI_COLUMNS_STORAGE_KEY, JSON.stringify(visibleColsByTab))
    } catch { /* ignore quota errors */ }
  }, [visibleColsByTab])

  useEffect(() => {
    setSortByTab((prev) => {
      let changed = false
      const next = { ...prev }
      TAB_KEYS.forEach((tab) => {
        const vis = visibleColsByTab[tab]
        if (!vis || vis.length === 0) return
        if (!vis.includes(prev[tab].key)) {
          const fallback = vis.includes('platformRevenue') ? 'platformRevenue' : vis[vis.length - 1]
          next[tab] = { key: fallback, dir: 'desc' }
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [visibleColsByTab])

  const getVisibleColumns = useCallback((tab: TabKey): KpiColumn[] => {
    const all = columnsByTab[tab]
    const keys = visibleColsByTab[tab]
    if (!keys || keys.length === 0) return all.slice(0, MAX_KPI_COLUMNS)
    return all.filter((c) => keys.includes(c.key))
  }, [columnsByTab, visibleColsByTab])

  const toggleColumn = useCallback((tab: TabKey, key: string) => {
    setVisibleColsByTab((prev) => {
      const all = columnsByTab[tab].map((c) => c.key)
      const identity = all[0]
      if (key === identity) return prev
      const current = (prev[tab] && prev[tab].length > 0 ? prev[tab] : all.slice(0, MAX_KPI_COLUMNS))
      let nextKeys: string[]
      if (current.includes(key)) {
        nextKeys = current.filter((k) => k !== key)
      } else {
        if (current.length >= MAX_KPI_COLUMNS) return prev
        nextKeys = [...current, key]
      }
      return { ...prev, [tab]: all.filter((k) => nextKeys.includes(k)) }
    })
  }, [columnsByTab])

  const activeChartData = useMemo(() => {
    const columns = columnsByTab[activeTab]
    const sort = sortByTab[activeTab]
    const sortColumn = columns.find((c) => c.key === sort.key)
    const chartKey = sortColumn?.numeric ? sort.key : 'platformRevenue'
    const labelKey = TAB_LABEL_KEY[activeTab]
    return activeSorted.slice(0, 12).map((r) => ({
      name: String(r[labelKey] ?? '—'),
      value: Number(r[chartKey]) || 0,
      rowKey: makeRowKey(activeTab, r),
    }))
  }, [activeSorted, activeTab, sortByTab, columnsByTab])

  const toggleSortForTab = useCallback((tab: TabKey, key: string) => {
    setSortByTab((prev) => {
      const cur = prev[tab]
      const next = cur.key === key
        ? { key, dir: (cur.dir === 'asc' ? 'desc' : 'asc') as SortDir }
        : { key, dir: 'desc' as SortDir }
      return { ...prev, [tab]: next }
    })
  }, [])

  if (authLoading) return null
  if (!user || user.role !== 'admin') return null

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

          {(['city', 'service', 'subproject', 'professional', 'customer'] as TabKey[]).map((tab) => {
            const allCols: KpiColumn[] = columnsByTab[tab]
            const columns: KpiColumn[] = getVisibleColumns(tab)
            const identityKey = allCols[0]?.key
            const isActive = tab === activeTab
            const sort = sortByTab[tab]
            const sorted = isActive ? activeSorted : []
            const selectedKey = selectedByTab[tab]
            const sortColumn = allCols.find((c) => c.key === sort.key)
            const chartKey = sortColumn?.numeric ? sort.key : 'platformRevenue'
            const chartColumn = allCols.find((c) => c.key === chartKey)
            const chartLabel = chartColumn?.label || 'Platform €'
            const chartFmt = chartColumn?.format
            const chartData = isActive ? activeChartData : []
            return (
            <TabsContent value={tab} key={tab}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base capitalize">{tab === 'city' ? 'By Region (City)' : `By ${tab.charAt(0).toUpperCase() + tab.slice(1)}`}</CardTitle>
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Columns3 className="h-4 w-4 mr-2" />Columns ({columns.length})
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-auto">
                        <DropdownMenuLabel>Columns (max {MAX_KPI_COLUMNS})</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {allCols.map((c) => {
                          const checked = columns.some((vc) => vc.key === c.key)
                          const isIdentity = c.key === identityKey
                          return (
                            <DropdownMenuCheckboxItem
                              key={c.key}
                              checked={checked}
                              disabled={isIdentity || (!checked && columns.length >= MAX_KPI_COLUMNS)}
                              onCheckedChange={() => toggleColumn(tab, c.key)}
                              onSelect={(e) => e.preventDefault()}
                            >
                              {c.label}
                            </DropdownMenuCheckboxItem>
                          )
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                      <BarChart data={chartData} margin={{ bottom: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                        <YAxis />
                        <Tooltip formatter={(v: number | string) => (chartFmt ? chartFmt(v) : v)} />
                        <Bar
                          dataKey="value"
                          name={chartLabel}
                          isAnimationActive={false}
                          cursor="pointer"
                          onClick={(_data: unknown, index: number) => {
                            const rowKey = chartData[index]?.rowKey
                            if (rowKey) setSelectedByTab((p) => ({ ...p, [tab]: p[tab] === rowKey ? null : rowKey }))
                          }}
                        >
                          {chartData.map((d) => (
                            <Cell
                              key={d.rowKey}
                              fill={selectedKey && d.rowKey === selectedKey ? '#1d4ed8' : '#93c5fd'}
                              cursor="pointer"
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-gray-500">
                    Showing <span className="font-medium">{chartLabel}</span> across the top {Math.min(12, chartData.length)} rows. Click a column header to change the metric, or a row/bar to highlight it.
                  </p>
                  <SortableTable
                    columns={columns}
                    sortedRows={sorted}
                    loading={loading}
                    sortKey={sort.key}
                    sortDir={sort.dir}
                    onToggleSort={(k) => toggleSortForTab(tab, k)}
                    rowKeyOf={(r) => makeRowKey(tab, r)}
                    selectedRowKey={selectedKey}
                    onRowSelect={(k) => setSelectedByTab((p) => ({ ...p, [tab]: p[tab] === k ? null : k }))}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            )
          })}
        </Tabs>
      </div>
    </div>
  )
}
