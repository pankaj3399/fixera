'use client'

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { CalendarDays, RefreshCw, Search } from "lucide-react"
import { toast } from "sonner"

interface BookingRow {
  _id: string
  bookingNumber?: string
  status?: string
  scheduledStartDate?: string
  createdAt?: string
  payment?: { totalWithVat?: number; amount?: number; currency?: string; status?: string }
  customer?: { _id: string; name?: string; email?: string }
  professional?: { _id: string; name?: string; email?: string; username?: string }
  project?: { _id: string; title?: string; category?: string; service?: string }
}

const STATUS_OPTIONS = [
  'all',
  'rfq',
  'rfq_accepted',
  'draft_quote',
  'quoted',
  'quote_accepted',
  'quote_rejected',
  'payment_pending',
  'booked',
  'rescheduling_requested',
  'in_progress',
  'professional_completed',
  'completed',
  'cancelled',
  'dispute',
  'refunded',
] as const

type StatusFilter = (typeof STATUS_OPTIONS)[number]

const statusBadgeVariant = (status?: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'completed') return 'default'
  if (status === 'dispute' || status === 'cancelled' || status === 'refunded' || status === 'quote_rejected') return 'destructive'
  if (status === 'in_progress' || status === 'booked' || status === 'professional_completed') return 'secondary'
  return 'outline'
}

export default function AdminBookingsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [items, setItems] = useState<BookingRow[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20
  const latestFetchIdRef = useRef(0)

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  const fetchBookings = useCallback(async () => {
    const fetchId = latestFetchIdRef.current + 1
    latestFetchIdRef.current = fetchId
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (query.trim()) params.set('q', query.trim())
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/bookings?${params}`)
      const json = await res.json()
      if (latestFetchIdRef.current !== fetchId) return
      if (json.success) {
        setItems(json.data.items)
        setTotal(json.data.total)
      } else {
        toast.error(json.msg || 'Failed to load bookings')
      }
    } catch {
      if (latestFetchIdRef.current !== fetchId) return
      toast.error('Failed to load bookings')
    } finally {
      if (latestFetchIdRef.current === fetchId) {
        setIsLoading(false)
      }
    }
  }, [page, statusFilter, query])

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchBookings()
    }
  }, [user, fetchBookings])

  const submitSearch = () => {
    setPage(1)
    setQuery(searchInput)
  }

  if (loading || !user || user.role !== 'admin') return null
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
      <div className="max-w-6xl mx-auto pt-20 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <CalendarDays className="h-6 w-6" />
              Booking Management
            </h1>
            <p className="text-sm text-gray-500 mt-1">Browse every booking, filter by status, and open any booking to force-status or chat.</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchBookings}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Select value={statusFilter} onValueChange={(value: StatusFilter) => { setStatusFilter(value); setPage(1) }}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s === 'all' ? 'All statuses' : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-1 gap-2">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitSearch() }}
              placeholder="Search booking number, customer or professional name/email"
            />
            <Button variant="outline" onClick={submitSearch}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CalendarDays className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No bookings found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const currency = item.payment?.currency || 'EUR'
              const amount = item.payment?.totalWithVat ?? item.payment?.amount
              return (
                <Card
                  key={item._id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => router.push(`/admin/bookings/${item._id}`)}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{item.bookingNumber || item._id}</span>
                          <Badge variant={statusBadgeVariant(item.status)} className="text-xs">{item.status || 'unknown'}</Badge>
                          {item.payment?.status && (
                            <Badge variant="outline" className="text-xs">payment: {item.payment.status}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-600">
                          Customer: {item.customer?.name || item.customer?.email || '—'}
                          {' | '}
                          Professional: {item.professional?.username || item.professional?.name || item.professional?.email || '—'}
                        </p>
                        {item.project?.title && (
                          <p className="text-xs text-gray-500">Project: {item.project.title}</p>
                        )}
                        {typeof amount === 'number' && (
                          <p className="text-xs text-gray-600">Amount: {currency} {amount.toFixed(2)}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                        <p className="text-xs text-gray-400">
                          {item.scheduledStartDate
                            ? `Scheduled ${new Date(item.scheduledStartDate).toLocaleDateString()}`
                            : item.createdAt
                              ? `Created ${new Date(item.createdAt).toLocaleDateString()}`
                              : ''}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={(e) => { e.stopPropagation(); router.push(`/admin/bookings/${item._id}`) }}
                        >
                          View Booking
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <span className="text-sm text-gray-500 self-center">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
