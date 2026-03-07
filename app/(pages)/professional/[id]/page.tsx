"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/contexts/AuthContext"
import {
  Star,
  MapPin,
  Calendar,
  Globe,
  Loader2,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Euro,
  ArrowLeft,
  CheckCircle,
  Quote,
  TrendingUp,
  Shield,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { getAuthToken } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import StartChatButton from "@/components/chat/StartChatButton"

interface ProfessionalData {
  _id: string
  name?: string
  profileImage?: string
  businessInfo?: {
    companyName?: string
    description?: string
    website?: string
    city?: string
    country?: string
  }
  serviceCategories?: string[]
  hourlyRate?: number
  currency?: string
  createdAt?: string
  location?: {
    city?: string
    country?: string
  }
}

interface ReviewData {
  _id: string
  customerReview: {
    communicationLevel: number
    valueOfDelivery: number
    qualityOfService: number
    comment?: string
    reviewedAt: string
    reply?: {
      comment: string
      repliedAt: string
    }
  }
  customer: {
    _id: string
    name?: string
    profileImage?: string
  }
}

interface RatingsSummary {
  overallAverage: number
  avgCommunication: number
  avgValueOfDelivery: number
  avgQualityOfService: number
  totalReviews: number
}

function StarDisplay({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-6 w-6" : size === "md" ? "h-5 w-5" : "h-4 w-4"
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${sizeClass} ${
            star <= Math.round(rating)
              ? "fill-yellow-400 text-yellow-400"
              : star - 0.5 <= rating
              ? "fill-yellow-200 text-yellow-400"
              : "text-gray-200"
          }`}
        />
      ))}
    </div>
  )
}

function RatingBar({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  const clamped = Math.min(5, Math.max(0, value))
  const percentage = (clamped / 5) * 100
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600 flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="text-sm font-semibold text-gray-800">{clamped.toFixed(1)}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${percentage}%`,
            background: percentage >= 80
              ? "linear-gradient(90deg, #facc15, #f59e0b)"
              : percentage >= 60
              ? "linear-gradient(90deg, #fbbf24, #f59e0b)"
              : "linear-gradient(90deg, #fb923c, #f97316)",
          }}
        />
      </div>
    </div>
  )
}

function RatingScoreBadge({ rating, totalReviews }: { rating: number; totalReviews: number }) {
  return (
    <div className="flex flex-col items-center gap-2 p-6 rounded-2xl bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-100">
      <div className="text-5xl font-bold text-gray-900 tracking-tight">{rating.toFixed(1)}</div>
      <StarDisplay rating={rating} size="lg" />
      <p className="text-sm text-gray-500 font-medium">
        {totalReviews} review{totalReviews !== 1 ? "s" : ""}
      </p>
    </div>
  )
}

export default function ProfessionalProfilePage() {
  const params = useParams()
  const router = useRouter()
  const professionalId = params?.id as string
  const { user } = useAuth()

  const [professional, setProfessional] = useState<ProfessionalData | null>(null)
  const [reviews, setReviews] = useState<ReviewData[]>([])
  const [ratingsSummary, setRatingsSummary] = useState<RatingsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Reply state
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [submittingReply, setSubmittingReply] = useState(false)

  const isOwner = user?._id === professionalId && user?.role === "professional"

  const fetchReviews = useCallback(async (pageNum: number) => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/professionals/${professionalId}/reviews?page=${pageNum}&limit=10`
      )
      const data = await res.json()
      if (data.success) {
        setProfessional(data.data.professional)
        setReviews(data.data.reviews)
        setRatingsSummary(data.data.ratingsSummary)
        setTotalPages(data.data.pagination.totalPages)
      }
    } catch {
      toast.error("Failed to load professional profile")
    } finally {
      setLoading(false)
    }
  }, [professionalId])

  useEffect(() => {
    if (professionalId) {
      fetchReviews(page)
    }
  }, [professionalId, page, fetchReviews])

  const handleReply = async (bookingId: string) => {
    if (!replyText.trim()) {
      toast.error("Please enter a reply")
      return
    }

    setSubmittingReply(true)
    try {
      const token = getAuthToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/customer-review/reply`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ comment: replyText.trim() }),
        }
      )
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success("Reply posted successfully")
        setReplyingTo(null)
        setReplyText("")
        fetchReviews(page)
      } else {
        toast.error(data.msg || "Failed to post reply")
      }
    } catch {
      toast.error("Failed to post reply")
    } finally {
      setSubmittingReply(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
          {/* Hero skeleton */}
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8">
            <div className="space-y-3">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-72" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            </div>
          </div>
          {/* Content skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
            <div className="space-y-4">
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
            <div className="lg:col-span-2 space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-36 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!professional) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
            <MessageSquare className="h-7 w-7 text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800">Professional not found</h2>
          <p className="text-gray-500 text-sm">This profile may have been removed or is no longer available.</p>
          <Button variant="outline" onClick={() => router.push("/search")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Search
          </Button>
        </div>
      </div>
    )
  }

  const name = professional.businessInfo?.companyName || professional.name || "Professional"
  const personalName = professional.businessInfo?.companyName && professional.name !== professional.businessInfo.companyName
    ? professional.name
    : null
  const location = [professional.businessInfo?.city, professional.businessInfo?.country].filter(Boolean).join(", ")
  const memberSince = professional.createdAt
    ? new Date(professional.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null
  const hasReviews = ratingsSummary && ratingsSummary.totalReviews > 0

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">

        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 text-gray-500 hover:text-gray-700 -ml-2"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        {/* Hero Card */}
        <div className="relative rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden mb-8">
          <div className="px-6 sm:px-8 py-8">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">{name}</h1>
                      <CheckCircle className="h-5 w-5 text-blue-500 shrink-0" />
                    </div>

                    {personalName && (
                      <p className="text-sm text-gray-500 mt-0.5">{personalName}</p>
                    )}

                    {professional.businessInfo?.description && (
                      <p className="text-gray-600 mt-2 text-sm leading-relaxed max-w-2xl line-clamp-3">
                        {professional.businessInfo.description}
                      </p>
                    )}

                    {/* Meta info */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-sm text-gray-500">
                      {location && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          {location}
                        </span>
                      )}
                      {memberSince && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          Since {memberSince}
                        </span>
                      )}
                      {professional.hourlyRate && (
                        <span className="flex items-center gap-1.5 font-medium text-gray-700">
                          <Euro className="h-4 w-4 text-gray-400" />
                          {professional.currency || "\u20AC"}{professional.hourlyRate}/hr
                        </span>
                      )}
                      {professional.businessInfo?.website && (() => {
                        try {
                          const url = new URL(professional.businessInfo!.website!)
                          if (url.protocol !== "http:" && url.protocol !== "https:") return null
                          return (
                            <a
                              href={url.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 hover:underline"
                            >
                              <Globe className="h-4 w-4" />
                              Website
                            </a>
                          )
                        } catch {
                          return null
                        }
                      })()}
                    </div>

                    {/* Service categories */}
                    {professional.serviceCategories && professional.serviceCategories.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        {professional.serviceCategories.map((cat) => (
                          <Badge key={cat} variant="secondary" className="text-xs font-medium px-3 py-1 bg-indigo-50 text-indigo-700 border-indigo-100">
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  {!isOwner && (
                    <div className="shrink-0 flex flex-col gap-2 sm:items-end">
                      <StartChatButton
                        professionalId={professional._id}
                        label="Send Message"
                        variant="default"
                        size="default"
                      />
                    </div>
                  )}

                  {isOwner && (
                    <Badge variant="secondary" className="text-xs">
                      <Shield className="h-3 w-3 mr-1" />
                      Your Profile
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left Sidebar */}
          <div className="space-y-6">

            {/* Rating Overview Card */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-indigo-500" />
                  Rating Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {hasReviews ? (
                  <>
                    <RatingScoreBadge
                      rating={ratingsSummary!.overallAverage}
                      totalReviews={ratingsSummary!.totalReviews}
                    />
                    <div className="space-y-4 pt-2">
                      <RatingBar
                        label="Communication"
                        value={ratingsSummary!.avgCommunication}
                        icon={<MessageSquare className="h-3.5 w-3.5 text-gray-400" />}
                      />
                      <RatingBar
                        label="Value of Delivery"
                        value={ratingsSummary!.avgValueOfDelivery}
                        icon={<Euro className="h-3.5 w-3.5 text-gray-400" />}
                      />
                      <RatingBar
                        label="Quality of Service"
                        value={ratingsSummary!.avgQualityOfService}
                        icon={<Star className="h-3.5 w-3.5 text-gray-400" />}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
                      <Star className="h-5 w-5 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-400">No reviews yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Info Card */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  Verified Professional
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2.5 text-gray-600">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    <span>Identity verified</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-gray-600">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    <span>Professional approved</span>
                  </div>
                  {hasReviews && (
                    <div className="flex items-center gap-2.5 text-gray-600">
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      <span>{ratingsSummary!.totalReviews} verified review{ratingsSummary!.totalReviews !== 1 ? "s" : ""}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Content — Reviews */}
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-sm">
              <CardHeader className="border-b border-gray-50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Quote className="h-5 w-5 text-indigo-500" />
                    Customer Reviews
                    {hasReviews && (
                      <Badge variant="secondary" className="ml-1 text-xs font-medium">
                        {ratingsSummary!.totalReviews}
                      </Badge>
                    )}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {reviews.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="h-7 w-7 text-gray-300" />
                    </div>
                    <h3 className="text-base font-medium text-gray-700">No reviews yet</h3>
                    <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                      Reviews from customers will appear here once bookings are completed.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {reviews.map((review) => {
                      const cr = review.customerReview
                      const avg = Math.round(((cr.communicationLevel + cr.valueOfDelivery + cr.qualityOfService) / 3) * 10) / 10

                      return (
                        <div key={review._id} className="p-6 hover:bg-gray-50/50 transition-colors">
                          {/* Reviewer info */}
                          <div className="flex items-start gap-4">
                            <Avatar className="h-10 w-10 shrink-0">
                              {review.customer?.profileImage ? (
                                <AvatarImage src={review.customer.profileImage} alt={review.customer.name || "User"} />
                              ) : null}
                              <AvatarFallback className="bg-gradient-to-br from-blue-100 to-indigo-100 text-indigo-600 text-sm font-semibold">
                                {(review.customer?.name || "U").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>

                            <div className="flex-1 min-w-0">
                              {/* Name and date row */}
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-gray-900">
                                  {review.customer?.name || "Anonymous"}
                                </span>
                                <span className="text-xs text-gray-400 shrink-0">
                                  {new Date(cr.reviewedAt).toLocaleDateString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              </div>

                              {/* Stars and avg */}
                              <div className="flex items-center gap-2 mt-1">
                                <StarDisplay rating={avg} size="sm" />
                                <span className="text-sm font-medium text-gray-700">{avg.toFixed(1)}</span>
                              </div>

                              {/* Category breakdown pills */}
                              <div className="flex flex-wrap gap-2 mt-2">
                                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                  Communication {cr.communicationLevel}/5
                                </span>
                                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                                  Value {cr.valueOfDelivery}/5
                                </span>
                                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                                  Quality {cr.qualityOfService}/5
                                </span>
                              </div>

                              {/* Comment */}
                              {cr.comment && (
                                <p className="text-sm text-gray-700 mt-3 leading-relaxed">{cr.comment}</p>
                              )}

                              {/* Professional&apos;s reply */}
                              {cr.reply?.comment && (
                                <div className="mt-4 rounded-xl bg-indigo-50/70 border border-indigo-100 p-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center">
                                      <MessageSquare className="h-3 w-3 text-white" />
                                    </div>
                                    <span className="text-xs font-semibold text-indigo-700">
                                      Professional&apos;s Response
                                    </span>
                                    {cr.reply.repliedAt && (
                                      <span className="text-xs text-indigo-400">
                                        {new Date(cr.reply.repliedAt).toLocaleDateString(undefined, {
                                          year: "numeric",
                                          month: "short",
                                          day: "numeric",
                                        })}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-700 leading-relaxed">{cr.reply.comment}</p>
                                </div>
                              )}

                              {/* Reply button for owner */}
                              {isOwner && !cr.reply?.comment && (
                                <div className="mt-3">
                                  {replyingTo === review._id ? (
                                    <div className="space-y-3 rounded-xl bg-white border border-gray-200 p-4">
                                      <Textarea
                                        placeholder="Write your public reply to this review..."
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        maxLength={1000}
                                        rows={3}
                                        className="text-sm resize-none"
                                      />
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-400">
                                          {replyText.length}/1000
                                        </span>
                                        <div className="flex gap-2">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                              setReplyingTo(null)
                                              setReplyText("")
                                            }}
                                            disabled={submittingReply}
                                          >
                                            Cancel
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={() => handleReply(review._id)}
                                            disabled={submittingReply || !replyText.trim()}
                                          >
                                            {submittingReply ? (
                                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                            ) : (
                                              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                                            )}
                                            Post Reply
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 -ml-2"
                                      onClick={() => setReplyingTo(review._id)}
                                    >
                                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                                      Reply to this review
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 py-6 border-t border-gray-50">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      aria-label="Previous page"
                      className="rounded-lg"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <span className="text-sm text-gray-500 font-medium">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      aria-label="Next page"
                      className="rounded-lg"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
