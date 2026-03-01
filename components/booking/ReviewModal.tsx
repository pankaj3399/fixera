"use client"

import { useState } from "react"
import { Star } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { getAuthToken } from "@/lib/utils"

interface ReviewModalProps {
  open: boolean
  onClose: () => void
  bookingId: string
  role: "customer" | "professional"
  onSubmitted?: () => void
}

const CUSTOMER_CATEGORIES = [
  { key: "communicationLevel", label: "Communication Level" },
  { key: "valueOfDelivery", label: "Value of Delivery" },
  { key: "qualityOfService", label: "Quality of Service" },
] as const

function StarSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)

  return (
    <div className="flex items-center gap-1" role="radiogroup">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={star === value}
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(star)}
          className="p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <Star
            className={`h-6 w-6 transition-colors ${
              star <= (hover || value)
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300"
            }`}
          />
        </button>
      ))}
    </div>
  )
}

export default function ReviewModal({ open, onClose, bookingId, role, onSubmitted }: ReviewModalProps) {
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const isCustomer = role === "customer"

  const handleSubmit = async () => {
    if (isCustomer) {
      const missing = CUSTOMER_CATEGORIES.filter((c) => !ratings[c.key] || ratings[c.key] < 1)
      if (missing.length > 0) {
        toast.error("Please rate all categories")
        return
      }
    } else {
      if (!ratings.rating || ratings.rating < 1) {
        toast.error("Please select a rating")
        return
      }
    }

    setSubmitting(true)
    try {
      const token = getAuthToken()
      const endpoint = isCustomer ? "customer-review" : "professional-review"
      const body = isCustomer
        ? {
            communicationLevel: ratings.communicationLevel,
            valueOfDelivery: ratings.valueOfDelivery,
            qualityOfService: ratings.qualityOfService,
            comment: comment.trim() || undefined,
          }
        : {
            rating: ratings.rating,
            comment: comment.trim() || undefined,
          }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/${endpoint}`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        }
      )

      const data = await res.json()
      if (res.ok && data.success) {
        toast.success("Review submitted successfully!")
        onSubmitted?.()
        onClose()
      } else {
        toast.error(data.msg || "Failed to submit review")
      }
    } catch {
      toast.error("Failed to submit review")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isCustomer ? "Rate this Professional" : "Rate this Customer"}
          </DialogTitle>
          <DialogDescription>
            {isCustomer
              ? "Share your experience to help others make informed decisions."
              : "Rate your experience working with this customer."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {isCustomer ? (
            CUSTOMER_CATEGORIES.map((cat) => (
              <div key={cat.key} className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">{cat.label}</label>
                <StarSelector
                  value={ratings[cat.key] || 0}
                  onChange={(v) => setRatings((prev) => ({ ...prev, [cat.key]: v }))}
                />
              </div>
            ))
          ) : (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Overall Rating</label>
              <StarSelector
                value={ratings.rating || 0}
                onChange={(v) => setRatings({ rating: v })}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Review <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Textarea
              placeholder="Share your experience..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={4}
            />
            <p className="text-xs text-gray-400 text-right">{comment.length}/1000</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Later
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
