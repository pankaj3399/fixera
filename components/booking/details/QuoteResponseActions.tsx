"use client"

import { CheckCircle, Loader2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * The customer's Accept & Pay and Reject buttons on the booking page. Both
 * are disabled while a response is in flight and while a historical (pinned,
 * non-current) quotation version is displayed: accept authority stays on the
 * current version (see resolveQuoteVersionView).
 */
export function QuoteResponseActions({
  responding,
  viewingPinnedVersion,
  onAccept,
  onReject,
  acceptLabel,
  rejectLabel,
}: {
  responding: boolean
  viewingPinnedVersion: boolean
  onAccept: () => void
  onReject: () => void
  acceptLabel: string
  rejectLabel: string
}) {
  const disabled = responding || viewingPinnedVersion
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button
        onClick={onAccept}
        disabled={disabled}
        className="h-auto min-w-0 w-full whitespace-normal bg-green-600 py-2 text-center hover:bg-green-700 sm:flex-1 text-white"
        size="sm"
      >
        {responding ? <Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" /> : <CheckCircle className="h-4 w-4 mr-2" />}
        {acceptLabel}
      </Button>
      <Button
        onClick={onReject}
        disabled={disabled}
        variant="outline"
        className="h-auto min-w-0 w-full whitespace-normal border-red-300 py-2 text-center text-red-600 hover:bg-red-50 sm:flex-1"
        size="sm"
      >
        <XCircle className="h-4 w-4 mr-2" />
        {rejectLabel}
      </Button>
    </div>
  )
}
