"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { ClipboardList, FileText, Gauge, History, Wallet } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { buildDetailHref, detailTabFromHash, resolveTabFromUrl, resolveDetailTab, type DetailTab } from "@/lib/bookingDetails"
import type { BookingDetailsDto, DetailViewerRole, RawBookingRecord } from "@/types/bookingDetails"
import { OverviewPanel } from "./OverviewPanel"
import { BookingPanel } from "./BookingDataPanel"
import { QuotationPanel } from "./QuotationPanel"
import { PaymentsPanel } from "./PaymentsPanel"
import { ActivityPanel } from "./ActivityPanel"
import { useDetailT } from "./DetailPrimitives"

interface BookingDetailsTabsProps {
  booking: RawBookingRecord
  details: BookingDetailsDto | null
  viewerRole: DetailViewerRole | null
  defaultTab?: DetailTab
  className?: string
}

const TAB_ICONS: Record<DetailTab, typeof Gauge> = {
  overview: Gauge,
  booking: ClipboardList,
  quotation: FileText,
  payments: Wallet,
  activity: History,
}

export function BookingDetailsTabs({
  booking,
  details,
  viewerRole,
  defaultTab,
  className,
}: BookingDetailsTabsProps) {
  const t = useTranslations("bookings")
  const dt = useDetailT()
  const router = useRouter()
  const pathname = usePathname() || `/bookings/${booking._id}`
  const searchParams = useSearchParams()
  const search = searchParams?.toString() || ""

  const initialTab = resolveDetailTab(searchParams?.get("tab") || defaultTab || "overview")
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab)

  // Resolve from the complete URL, not only a present hash. Removing the hash
  // with Back (or a hashchange to no hash) must restore `?tab=`/the default,
  // otherwise the URL and the visible tab disagree.
  useEffect(() => {
    if (typeof window === "undefined") return
    const applyUrl = () => {
      const next = resolveTabFromUrl(window.location.search, window.location.hash, defaultTab)
      setActiveTab((current) => (current === next ? current : next))
    }
    applyUrl()
    window.addEventListener("hashchange", applyUrl)
    window.addEventListener("popstate", applyUrl)
    return () => {
      window.removeEventListener("hashchange", applyUrl)
      window.removeEventListener("popstate", applyUrl)
    }
  }, [defaultTab])

  // Back/forward and direct `?tab=` navigation. An explicit hash wins when the
  // URL contains both (e.g. `?tab=payments#quotation-v1`).
  useEffect(() => {
    const hashTab = typeof window !== "undefined" ? detailTabFromHash(window.location.hash) : null
    if (hashTab) {
      setActiveTab(hashTab)
      return
    }
    const next = resolveTabFromUrl(
      typeof window !== "undefined" ? window.location.search : searchParams?.toString() || "",
      typeof window !== "undefined" ? window.location.hash : null,
      defaultTab
    )
    setActiveTab((current) => (current === next ? current : next))
  }, [searchParams, defaultTab])

  const selectTab = useCallback(
    (tab: DetailTab, hashOverride?: string | null) => {
      setActiveTab(tab)
      if (typeof window === "undefined") return
      const currentHash = window.location.hash
      const keepHash =
        hashOverride ??
        (tab === "quotation" && currentHash.startsWith("#quotation") ? currentHash : null)
      // Read the live query string instead of a possibly stale render value;
      // a popstate can change it before React re-renders this callback.
      const href = buildDetailHref(pathname, window.location.search, tab, keepHash)
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
      // Push (not replace) so browser back/forward walks real tab states while
      // every existing query action flag stays in the URL.
      if (current !== href) router.push(href, { scroll: false })
      if (tab === "overview") window.scrollTo({ top: 0, behavior: "smooth" })
    },
    [pathname, router]
  )

  const labels: Record<DetailTab, string> = {
    overview: dt("tabs.overview", "Overview"),
    booking: dt("tabs.booking", "Booking"),
    quotation: dt("tabs.quotation", "Quotation"),
    payments: dt("tabs.payments", "Payments"),
    activity: dt("tabs.activity", "Activity"),
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => selectTab(resolveDetailTab(value))}
      className={cn("space-y-4", className)}
    >
      {!details ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {dt(
            "detailsUnavailable",
            "The normalized detail record was not returned. Only stored booking fields are shown; missing historical values are not reconstructed."
          )}
        </div>
      ) : null}
      <div className="overflow-x-auto pb-1">
        <TabsList
          aria-label={t("details.tabsLabel")}
          className="h-auto w-max min-w-full justify-start gap-1 bg-white/80 p-1 shadow-sm backdrop-blur"
        >
          {(Object.keys(labels) as DetailTab[]).map((tab) => {
            const Icon = TAB_ICONS[tab]
            return (
              <TabsTrigger
                key={tab}
                value={tab}
                className="min-h-11 flex-none gap-1.5 rounded-md px-3 py-2 text-xs sm:text-sm"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {labels[tab]}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </div>

      <TabsContent value="overview" className="mt-0 focus-visible:outline-none">
        <OverviewPanel
          booking={booking}
          details={details}
          viewerRole={viewerRole}
          pathname={pathname}
          search={search}
          onSelectTab={(tab, hash) => selectTab(tab, hash)}
        />
      </TabsContent>
      <TabsContent value="booking" className="mt-0 focus-visible:outline-none">
        <BookingPanel booking={booking} details={details} />
      </TabsContent>
      <TabsContent value="quotation" className="mt-0 focus-visible:outline-none">
        <QuotationPanel
          booking={booking}
          details={details}
          pathname={pathname}
          search={search}
        />
      </TabsContent>
      <TabsContent value="payments" className="mt-0 focus-visible:outline-none">
        <PaymentsPanel booking={booking} details={details} viewerRole={viewerRole} />
      </TabsContent>
      <TabsContent value="activity" className="mt-0 focus-visible:outline-none">
        <ActivityPanel
          booking={booking}
          details={details}
          viewerRole={viewerRole}
          pathname={pathname}
          search={search}
        />
      </TabsContent>
    </Tabs>
  )
}
