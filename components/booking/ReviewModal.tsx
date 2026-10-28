"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Star, ImagePlus, X } from "lucide-react"
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
  { key: "communicationLevel", labelKey: "reviewModal.categories.communicationLevel" },
  { key: "valueOfDelivery", labelKey: "reviewModal.categories.valueOfDelivery" },
  { key: "qualityOfService", labelKey: "reviewModal.categories.qualityOfService" },
] as const

function StarSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const t = useTranslations('checkout')
  const [hover, setHover] = useState(0)

  return (
    <div className="flex items-center gap-1" role="radiogroup">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={star === value}
          aria-label={t('reviewModal.starAriaLabel', { count: star })}
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
  const t = useTranslations('checkout')
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isCustomer = role === "customer"

  // Cleanup object URLs and reset state when modal closes or unmounts
  const resetState = useCallback(() => {
    imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    setImages([])
    setImagePreviews([])
    setRatings({})
    setComment("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [imagePreviews])

  useEffect(() => {
    if (!open) {
      resetState()
    }
    return () => {
      // Cleanup on unmount
      imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [open])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    // Validate all files first, then enforce the 2-image cap
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    const validatedFiles = files.filter((f) => {
      if (!validTypes.includes(f.type)) {
        toast.error(t('reviewModal.errors.onlyImages', { name: f.name }))
        return false
      }
      if (f.size > 5 * 1024 * 1024) {
        toast.error(t('reviewModal.errors.maxFileSize', { name: f.name }))
        return false
      }
      return true
    })
    const remaining = 2 - images.length
    if (remaining <= 0) {
      toast.error(t('reviewModal.errors.maxImages'))
      return
    }
    const valid = validatedFiles.slice(0, remaining)
    setImages((prev) => [...prev, ...valid])
    setImagePreviews((prev) => [...prev, ...valid.map((f) => URL.createObjectURL(f))])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const removeImage = (idx: number) => {
    URL.revokeObjectURL(imagePreviews[idx])
    setImages((prev) => prev.filter((_, i) => i !== idx))
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async () => {
    if (isCustomer) {
      const missing = CUSTOMER_CATEGORIES.filter((c) => !ratings[c.key] || ratings[c.key] < 1)
      if (missing.length > 0) {
        toast.error(t('reviewModal.errors.rateAllCategories'))
        return
      }
    } else {
      if (!ratings.rating || ratings.rating < 1) {
        toast.error(t('reviewModal.errors.selectRating'))
        return
      }
    }

    setSubmitting(true)
    try {
      const token = getAuthToken()
      const endpoint = isCustomer ? "customer-review" : "professional-review"

      // Use FormData for customer reviews (supports image upload), JSON for professional
      if (isCustomer) {
        const formData = new FormData()
        formData.append("communicationLevel", String(ratings.communicationLevel))
        formData.append("valueOfDelivery", String(ratings.valueOfDelivery))
        formData.append("qualityOfService", String(ratings.qualityOfService))
        if (comment.trim()) formData.append("comment", comment.trim())
        images.forEach((img) => formData.append("images", img))

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/${endpoint}`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: formData,
          }
        )
        const data = await res.json()
        if (res.ok && data.success) {
          toast.success(t("reviewModal.submitSuccess"))
          onSubmitted?.()
          onClose()
        } else {
          toast.error(data.msg || t("reviewModal.submitFailed"))
        }
      } else {
        const body = {
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
          toast.success(t("reviewModal.submitSuccess"))
          onSubmitted?.()
          onClose()
        } else {
          toast.error(data.msg || t("reviewModal.submitFailed"))
        }
      }
    } catch {
      toast.error(t("reviewModal.submitFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isCustomer ? t("reviewModal.titleCustomer") : t("reviewModal.titleProfessional")}
          </DialogTitle>
          <DialogDescription>
            {isCustomer
              ? t("reviewModal.descriptionCustomer")
              : t("reviewModal.descriptionProfessional")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {isCustomer ? (
            CUSTOMER_CATEGORIES.map((cat) => (
              <div key={cat.key} className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">{t(cat.labelKey)}</label>
                <StarSelector
                  value={ratings[cat.key] || 0}
                  onChange={(v) => setRatings((prev) => ({ ...prev, [cat.key]: v }))}
                />
              </div>
            ))
          ) : (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">{t("reviewModal.overallRating")}</label>
              <StarSelector
                value={ratings.rating || 0}
                onChange={(v) => setRatings({ rating: v })}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              {t("reviewModal.reviewLabel")} <span className="text-gray-400 font-normal">{t("reviewModal.optional")}</span>
            </label>
            <Textarea
              placeholder={t("reviewModal.commentPlaceholder")}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={4}
            />
            <p className="text-xs text-gray-400 text-right">{comment.length}/1000</p>
          </div>

          {/* Image upload - customer only */}
          {isCustomer && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                {t("reviewModal.photosLabel")} <span className="text-gray-400 font-normal">{t("reviewModal.photosHint")}</span>
              </label>
              <div className="flex items-center gap-2">
                {imagePreviews.map((src, idx) => (
                  <div key={idx} className="relative">
                    <img src={src} alt={t("reviewModal.previewAlt", { number: idx + 1 })} className="h-16 w-16 object-cover rounded-md border border-gray-200" />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {images.length < 2 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-16 w-16 border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors"
                  >
                    <ImagePlus className="h-5 w-5" />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t("reviewModal.later")}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? t("reviewModal.submitting") : t("reviewModal.submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
