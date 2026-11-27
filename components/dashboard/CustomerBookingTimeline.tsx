'use client'

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import BookingTimelineBoard from "@/components/dashboard/BookingTimelineBoard"
import { getAuthToken } from "@/lib/utils"
import { customerTimelineStatuses } from "@/lib/dashboardBookingHelpers"

type TimelineBooking = Parameters<typeof BookingTimelineBoard>[0]["bookings"][number]

interface Props {
  statusFilter: string
  serviceFilter: string
  search: string
  address: string
  /** Called after a customer action on the timeline succeeds, so the dashboard's other views refresh too. */
  onBookingsChanged?: () => void
}

/**
 * FT2-13: the customer's booking timeline. It disappeared when the customer
 * dashboard moved to server-paginated tables (the board used to read the
 * page-local active bookings, which no longer exist); it now loads every
 * active booking for the current filters itself, like the professional
 * board, and is shown in its own "Timeline" view.
 */
export default function CustomerBookingTimeline({ statusFilter, serviceFilter, search, address, onBookingsChanged }: Props) {
  const t = useTranslations("dashboardWidgets")
  const [bookings, setBookings] = useState<TimelineBooking[]>([])
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const latestRequest = useRef(0)
  // The board keeps the callback it had when an action started; reloading
  // through these refs uses the filters current when the action completes.
  const latestLoad = useRef<() => Promise<void>>(() => Promise.resolve())
  const latestOnBookingsChanged = useRef(onBookingsChanged)

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current
    const statuses = customerTimelineStatuses(statusFilter)
    if (statuses.length === 0) {
      setBookings([])
      setState("ready")
      return
    }
    setState("loading")
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const all: TimelineBooking[] = []
      let page = 1
      let totalPages = 1
      do {
        const params = new URLSearchParams({ page: String(page), limit: "50", status: statuses.join(",") })
        if (serviceFilter !== "all") params.append("service", serviceFilter)
        if (search.trim()) params.append("search", search.trim())
        if (address.trim().length >= 2) params.append("addressFilter", address.trim())
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/my-bookings?${params}`, { credentials: "include", headers })
        const data = await response.json()
        if (requestId !== latestRequest.current) return
        // A failed page is a failed timeline: partial rows are not shown as complete.
        if (!response.ok || !data.success) throw new Error("Timeline request failed")
        all.push(...(Array.isArray(data.bookings) ? data.bookings : []))
        const pages = Number(data.pagination?.totalPages)
        totalPages = Number.isFinite(pages) ? Math.max(1, Math.floor(pages)) : 1
        page++
      } while (page <= totalPages)
      if (requestId !== latestRequest.current) return
      setBookings(all)
      setState("ready")
    } catch {
      if (requestId !== latestRequest.current) return
      setBookings([])
      setState("error")
    }
  }, [statusFilter, serviceFilter, search, address])

  useEffect(() => {
    latestLoad.current = load
  }, [load])

  useEffect(() => {
    latestOnBookingsChanged.current = onBookingsChanged
  }, [onBookingsChanged])

  useEffect(() => {
    void load()
    return () => { latestRequest.current++ }
  }, [load])

  const handleBookingUpdated = useCallback(async () => {
    latestOnBookingsChanged.current?.()
    await latestLoad.current()
  }, [])

  if (state === "loading") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">{t("common.loading")}</CardContent>
      </Card>
    )
  }
  if (state === "error") {
    return (
      <Card className="border border-rose-100 bg-rose-50">
        <CardContent role="alert" className="flex flex-col gap-3 py-4 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{t("customerDashboard.loadFailed")}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>{t("common.retry")}</Button>
        </CardContent>
      </Card>
    )
  }
  return (
    <BookingTimelineBoard
      bookings={bookings}
      viewerRole="customer"
      onBookingUpdated={handleBookingUpdated}
      emptyLabel={t("customerDashboard.timelineEmpty")}
    />
  )
}
