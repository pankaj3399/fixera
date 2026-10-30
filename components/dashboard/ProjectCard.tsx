'use client'

import { ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "lucide-react"
import { cheapestPriceByModelUnit, recordedHoldDays, DASH } from "@/lib/dashboardOverview"

export interface ManageProjectCard {
  _id: string
  title: string
  description: string
  status: string
  category?: string | null
  service?: string | null
  areaOfWork?: string | null
  resources?: string[] | null
  teamMembers?: Array<{ id: string; name: string | null }> | null
  minResources?: number | null
  minOverlapPercentage?: number | null
  priceModel?: string | null
  subprojects?: Array<{
    name?: string
    pricing?: { type?: string; amount?: number | null; priceRange?: { min?: number } | null; unit?: string | null } | null
    basePrice?: number | null
    pricingModel?: string | null
  }> | null
  extraOptions?: Array<unknown> | null
  termsConditions?: Array<unknown> | null
  repeatBuyerDiscount?: { enabled?: boolean; percentage?: number | null } | null
  submittedAt?: string | null
  approvedAt?: string | null
  archivedAt?: string | null
  onHoldAt?: string | null
  updatedAt?: string
  autoSaveTimestamp?: string
}

interface Props {
  project: ManageProjectCard
  formatMoney: (amount: number, currency?: string | null) => string
  intl: string
  statusBadge: ReactNode
  actionMenu: ReactNode
  labels: {
    service: (value: string) => string
    areaOfWork: (value: string) => string
    team: (value: string) => string
    minMembers: (count: number, overlap: string) => string
    priceModel: (value: string) => string
    startingFrom: (model: string, unit: string | null, price: string) => string
    noRecordedPrice: string
    repeatDiscount: (percent: number) => string
    counts: (subprojects: number, options: number, conditions: number) => string
    publishDate: (date: string) => string
    onHoldDays: (days: number | string) => string
    submittedOn: (date: string) => string
    updatedOn: (date: string) => string
    archivedOn: (date: string) => string
    adminFeedback: string
  }
  adminFeedback?: string | null
}

const formatDate = (value: string | null | undefined, intl: string): string | null => {
  if (!value) return null
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return null
  return new Date(time).toLocaleDateString(intl)
}

/**
 * Project card with the minimum required metadata (group 15b). Every field
 * renders from the recorded project document; unfilled fields show a dash —
 * publish date uses the actual approval instant, never a fabricated one, and
 * on-hold shows the recorded status-change date rather than an invented span.
 */
export default function ProjectCard({ project, formatMoney, intl, statusBadge, actionMenu, labels, adminFeedback }: Props) {
  const subprojects = Array.isArray(project.subprojects) ? project.subprojects : []
  const prices = cheapestPriceByModelUnit(subprojects)
  const teamNames = (project.teamMembers || [])
    .map((member) => member?.name)
    .filter((name): name is string => typeof name === "string" && Boolean(name))
  const publishDate = formatDate(project.approvedAt, intl)
  const submittedDate = formatDate(project.submittedAt, intl)
  const archivedDate = formatDate(project.archivedAt, intl)
  const updatedDate = formatDate(project.autoSaveTimestamp || project.updatedAt, intl)
  const isOnHold = String(project.status).toLowerCase() === "on_hold"
  const holdDays = isOnHold ? recordedHoldDays(project.onHoldAt) : null
  const repeat = project.repeatBuyerDiscount

  return (
    <Card className="hover:shadow-md transition-shadow flex flex-col h-full w-full overflow-hidden">
      <CardHeader className="pb-3 px-3 md:px-6">
        <div className="flex items-start justify-between gap-2 md:gap-3 mb-2">
          <CardTitle className="text-sm md:text-lg leading-tight line-clamp-2 min-w-0 flex-1 break-all">{project.title}</CardTitle>
          <div className="flex items-center gap-2 flex-shrink-0">
            {statusBadge}
            {actionMenu}
          </div>
        </div>
        <CardDescription className="line-clamp-3 text-xs md:text-sm break-all">
          {project.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4 pt-0 px-3 md:px-6 flex-1 flex flex-col">
        <div className="text-xs md:text-sm text-gray-600 space-y-1">
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
            <span className="truncate text-xs">
              {publishDate || submittedDate || updatedDate || DASH}
            </span>
          </div>
          {project.service && <div className="truncate text-xs">{labels.service(project.service)}</div>}
          {project.areaOfWork && <div className="truncate text-xs">{labels.areaOfWork(project.areaOfWork)}</div>}
          <div className="truncate text-xs">
            {teamNames.length > 0 ? labels.team(teamNames.join(", ")) : labels.team(DASH)}
          </div>
          {typeof project.minResources === "number" && (
            <div className="truncate text-xs">
              {labels.minMembers(project.minResources, typeof project.minOverlapPercentage === "number" ? `${project.minOverlapPercentage}%` : DASH)}
            </div>
          )}
          {project.priceModel && <div className="truncate text-xs">{labels.priceModel(project.priceModel)}</div>}
          {prices.length > 0 ? (
            prices.map((bucket) => (
              <div key={`${bucket.model}-${bucket.unit || ""}`} className="truncate text-xs font-medium text-gray-800">
                {labels.startingFrom(bucket.model, bucket.unit, formatMoney(bucket.cheapest))}
              </div>
            ))
          ) : (
            <div className="truncate text-xs text-gray-400">{labels.noRecordedPrice}</div>
          )}
          {repeat?.enabled === true && typeof repeat.percentage === "number" && (
            <div className="truncate text-xs text-emerald-700">{labels.repeatDiscount(repeat.percentage)}</div>
          )}
          <div className="truncate text-xs">
            {labels.counts(subprojects.length, Array.isArray(project.extraOptions) ? project.extraOptions.length : 0, Array.isArray(project.termsConditions) ? project.termsConditions.length : 0)}
          </div>
          {publishDate && <div className="truncate text-xs">{labels.publishDate(publishDate)}</div>}
          {isOnHold && <div className="truncate text-xs">{labels.onHoldDays(holdDays ?? DASH)}</div>}
          {submittedDate && !publishDate && <div className="truncate text-xs">{labels.submittedOn(submittedDate)}</div>}
          {archivedDate && <div className="truncate text-xs">{labels.archivedOn(archivedDate)}</div>}
          {!publishDate && !submittedDate && updatedDate && <div className="truncate text-xs">{labels.updatedOn(updatedDate)}</div>}
        </div>

        {adminFeedback && (
          <div className="bg-red-50 border border-red-200 rounded-md p-2 md:p-3">
            <h4 className="font-medium text-red-800 mb-1 text-xs">{labels.adminFeedback}</h4>
            <p className="text-xs text-red-700 line-clamp-3 break-words">{adminFeedback}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
