'use client'

import type { ReactElement, ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { AlertTriangle, ArrowRight, Play } from "lucide-react"
import Image from "next/image"

interface ModerationResult {
  passed: boolean
  reasons?: string[]
}

interface ChangeEntry {
  field: string
  category: "A" | "B" | "none"
  oldValue: unknown
  newValue: unknown
  moderationResult?: ModerationResult
}

interface ProjectDiffViewProps {
  changes: ChangeEntry[]
  reapprovalType: "full" | "moderation_failed" | "none" | null
}

const FIELD_LABELS: Record<string, string> = {
  category: "Category",
  service: "Service",
  areaOfWork: "Area of Work",
  certifications: "Certifications",
  services: "Services",
  categories: "Categories",
  serviceConfigurationId: "Service Configuration",
  title: "Project Title",
  description: "Description",
  media: "Media (Images/Video)",
  subprojects: "Subprojects",
  extraOptions: "Extra Options",
  termsConditions: "Terms & Conditions",
  faq: "FAQ",
  rfqQuestions: "RFQ Questions",
  postBookingQuestions: "Post-Booking Questions",
  customConfirmationMessage: "Custom Confirmation Message",
  distance: "Service Distance",
  resources: "Resources",
  intakeMeeting: "Intake Meeting",
  renovationPlanning: "Renovation Planning",
  priceModel: "Price Model",
  keywords: "Keywords",
  timeMode: "Time Mode",
  preparationDuration: "Preparation Duration",
  executionDuration: "Execution Duration",
  bufferDuration: "Buffer Duration",
  minResources: "Min Resources",
  minOverlapPercentage: "Min Overlap %",
}

function getCategoryBadge(category: "A" | "B" | "none"): ReactElement {
  switch (category) {
    case "A":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Structural Change</Badge>
    case "B":
      return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Content Change</Badge>
    case "none":
      return <Badge variant="outline" className="text-gray-500">Config Change</Badge>
    default:
      return <Badge variant="outline" className="text-gray-400">Other</Badge>
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatValue(value: any, field: string): string | ReactNode {
  if (value === null || value === undefined) return <span className="italic text-gray-400">Not set</span>

  if (typeof value === "string") {
    if (value.length > 200) return value.slice(0, 200) + "..."
    return value
  }

  if (typeof value === "number" || typeof value === "boolean") return String(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="italic text-gray-400">Empty</span>

    // For simple string arrays (check all items, not just the first)
    if (value.every((v) => typeof v === "string")) return value.join(", ")

    // For object arrays (subprojects, FAQ, etc.)
    return (
      <span className="text-sm">
        {value.length} item{value.length !== 1 ? "s" : ""}
        {value.map((item, i) => (
          <span key={i} className="block text-xs text-gray-600 ml-2">
            {item && typeof item === "object"
              ? (item.name || item.question || item.title || JSON.stringify(item).slice(0, 80))
              : String(item)}
          </span>
        ))}
      </span>
    )
  }

  if (typeof value === "object") {
    // Media special handling
    if (field === "media") {
      const images = value.images || []
      const video = value.video
      return (
        <span className="text-sm">
          {images.length} image{images.length !== 1 ? "s" : ""}
          {video ? " + 1 video" : ""}
        </span>
      )
    }
    // Generic object
    return <span className="text-xs text-gray-600">{JSON.stringify(value).slice(0, 150)}</span>
  }

  return String(value)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MediaPreview({ value }: { value: any }) {
  if (!value || typeof value !== "object") return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const images: string[] = (value.images || []).map((img: any) => typeof img === "string" ? img : img?.url || "").filter((src: string) => src.length > 0)
  const hasVideo = !!(value.video || value.videos)

  if (images.length === 0 && !hasVideo) return null

  return (
    <div className="flex gap-2 mt-1 flex-wrap">
      {images.slice(0, 4).map((src, i) => (
        <div key={i} className="relative w-16 h-16 rounded border overflow-hidden bg-gray-100">
          <Image src={src} alt={`img ${i + 1}`} fill className="object-cover" sizes="64px" />
        </div>
      ))}
      {images.length > 4 && (
        <div className="w-16 h-16 rounded border flex items-center justify-center bg-gray-50 text-xs text-gray-500">
          +{images.length - 4}
        </div>
      )}
      {hasVideo && (
        <div className="w-16 h-16 rounded border flex flex-col items-center justify-center bg-gray-100 text-xs text-gray-500">
          <Play className="w-4 h-4" />
          <span>Video</span>
        </div>
      )}
    </div>
  )
}

export default function ProjectDiffView({ changes, reapprovalType }: ProjectDiffViewProps) {
  // Filter out "none" category changes — these are config/operational fields
  // that don't require admin review (they would auto-approve on their own)
  const reviewableChanges = (changes || []).filter((c) => c.category !== "none")

  if (reviewableChanges.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        No changes detected
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="bg-purple-100 text-purple-800">
          Resubmission
        </Badge>
        {reapprovalType === "full" && (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300">
            Contains structural changes
          </Badge>
        )}
        {reapprovalType === "moderation_failed" && (
          <Badge className="bg-red-100 text-red-800 border-red-300">
            Content moderation flagged
          </Badge>
        )}
        <span className="text-sm text-gray-500">
          {reviewableChanges.length} field{reviewableChanges.length !== 1 ? "s" : ""} changed
        </span>
      </div>

      {/* Change cards */}
      {reviewableChanges.map((change, index) => {
        const borderClass =
          change.category === "A"
            ? "border-amber-300 bg-amber-50/50"
            : change.category === "B" && change.moderationResult && !change.moderationResult.passed
            ? "border-red-300 bg-red-50/50"
            : "border-gray-200"

        return (
          <Card key={index} className={`${borderClass}`}>
            <CardContent className="p-4 space-y-2">
              {/* Field header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h5 className="font-medium text-sm">
                  {FIELD_LABELS[change.field] || change.field}
                </h5>
                {getCategoryBadge(change.category)}
              </div>

              {/* Moderation warning */}
              {change.moderationResult && !change.moderationResult.passed && (
                <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">Moderation flagged:</span>
                    <ul className="list-disc ml-4 mt-1">
                      {change.moderationResult.reasons?.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Old vs New values */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2 items-start">
                <div className="p-2 rounded bg-red-50 border border-red-100 min-h-[40px]">
                  <div className="text-xs text-red-600 font-medium mb-1">Previous</div>
                  <div className="text-sm text-red-900 break-words">
                    {formatValue(change.oldValue, change.field)}
                    {change.field === "media" && <MediaPreview value={change.oldValue} />}
                  </div>
                </div>

                <div className="hidden md:flex items-center justify-center pt-6">
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </div>

                <div className="p-2 rounded bg-green-50 border border-green-100 min-h-[40px]">
                  <div className="text-xs text-green-600 font-medium mb-1">New</div>
                  <div className="text-sm text-green-900 break-words">
                    {formatValue(change.newValue, change.field)}
                    {change.field === "media" && <MediaPreview value={change.newValue} />}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
