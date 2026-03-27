export type WarrantyClaimStatus =
  | "open"
  | "proposal_sent"
  | "proposal_accepted"
  | "resolved"
  | "escalated"
  | "closed"

export const STATUS_OPTIONS: Array<{ value: "all" | WarrantyClaimStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "proposal_accepted", label: "Proposal Accepted" },
  { value: "resolved", label: "Resolved" },
  { value: "escalated", label: "Escalated" },
  { value: "closed", label: "Closed" },
]

export const STATUS_STYLES: Record<WarrantyClaimStatus, string> = {
  open: "bg-amber-50 text-amber-700 border border-amber-200",
  proposal_sent: "bg-blue-50 text-blue-700 border border-blue-200",
  proposal_accepted: "bg-violet-50 text-violet-700 border border-violet-200",
  resolved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  escalated: "bg-rose-50 text-rose-700 border border-rose-200",
  closed: "bg-slate-100 text-slate-700 border border-slate-200",
}

export const REASON_LABELS: Record<string, string> = {
  defect: "Defect",
  incomplete_work: "Incomplete Work",
  material_issue: "Material Issue",
  functionality_issue: "Functionality Issue",
  safety_issue: "Safety Issue",
  other: "Other",
}
