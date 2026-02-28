"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Star, MapPin, Calendar, Globe, Briefcase, Loader2, MessageSquare, ChevronLeft, ChevronRight } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { getAuthToken } from "@/lib/utils"

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
  const sizeClass = size === "lg" ? "h-5 w-5" : size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"
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

function RatingBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-44 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div
          className="bg-yellow-400 h-2 rounded-full transition-all"
          style={{ width: `${(value / 5) * 100}%` }}
        />
      </div>
      <span className="text-sm font-medium text-gray-700 w-8 text-right">{value.toFixed(1)}</span>
    </div>
  )
}

export default function ProfessionalProfilePage() {
  const params = useParams()
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!professional) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">Professional not found</p>
      </div>
    )
  }

  const name = professional.businessInfo?.companyName || professional.name || "Professional"
  const location = [professional.businessInfo?.city, professional.businessInfo?.country].filter(Boolean).join(", ")
  const memberSince = professional.createdAt
    ? new Date(professional.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Profile Header */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              <Avatar className="h-20 w-20 shrink-0">
                <AvatarFallback className="bg-indigo-100 text-indigo-600 text-2xl font-bold">
                  {name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-gray-900">{name}</h1>

                {professional.businessInfo?.description && (
                  <p className="text-sm text-gray-600 mt-1 line-clamp-3">
                    {professional.businessInfo.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
                  {location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {location}
                    </span>
                  )}
                  {memberSince && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Member since {memberSince}
                    </span>
                  )}
                  {professional.businessInfo?.website && (
                    <a
                      href={professional.businessInfo.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-indigo-600 hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      Website
                    </a>
                  )}
                </div>

                {professional.serviceCategories && professional.serviceCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {professional.serviceCategories.map((cat) => (
                      <Badge key={cat} variant="secondary" className="text-xs">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Rating summary - right side */}
              {ratingsSummary && ratingsSummary.totalReviews > 0 && (
                <div className="text-center shrink-0 border-l border-gray-200 pl-5">
                  <div className="text-4xl font-bold text-gray-900">
                    {ratingsSummary.overallAverage.toFixed(1)}
                  </div>
                  <StarDisplay rating={ratingsSummary.overallAverage} size="md" />
                  <p className="text-sm text-gray-500 mt-1">
                    {ratingsSummary.totalReviews} review{ratingsSummary.totalReviews !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Rating Breakdown - Left Column */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Rating Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {ratingsSummary && ratingsSummary.totalReviews > 0 ? (
                  <>
                    <RatingBar label="Communication Level" value={ratingsSummary.avgCommunication} />
                    <RatingBar label="Value of Delivery" value={ratingsSummary.avgValueOfDelivery} />
                    <RatingBar label="Quality of Service" value={ratingsSummary.avgQualityOfService} />
                  </>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">No reviews yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Reviews List - Right Column */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Reviews
                  {ratingsSummary && (
                    <span className="text-sm font-normal text-gray-500">
                      ({ratingsSummary.totalReviews})
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {reviews.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No reviews yet</p>
                ) : (
                  <div className="space-y-6">
                    {reviews.map((review) => {
                      const cr = review.customerReview
                      const avg = (cr.communicationLevel + cr.valueOfDelivery + cr.qualityOfService) / 3

                      return (
                        <div key={review._id} className="border-b border-gray-100 pb-5 last:border-0 last:pb-0">
                          {/* Reviewer info */}
                          <div className="flex items-start gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="bg-gray-100 text-gray-600 text-sm">
                                {(review.customer?.name || "U").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">
                                  {review.customer?.name || "Anonymous"}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {new Date(cr.reviewedAt).toLocaleDateString()}
                                </span>
                              </div>

                              {/* Star ratings */}
                              <div className="flex items-center gap-2 mt-1">
                                <StarDisplay rating={avg} size="sm" />
                                <span className="text-xs text-gray-500">{avg.toFixed(1)}</span>
                              </div>

                              {/* Category breakdown */}
                              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                                <span>Communication: {cr.communicationLevel}/5</span>
                                <span>Value: {cr.valueOfDelivery}/5</span>
                                <span>Quality: {cr.qualityOfService}/5</span>
                              </div>

                              {/* Review text */}
                              {cr.comment && (
                                <p className="text-sm text-gray-700 mt-2">{cr.comment}</p>
                              )}

                              {/* Professional's reply */}
                              {cr.reply?.comment && (
                                <div className="mt-3 ml-4 pl-3 border-l-2 border-indigo-200 bg-indigo-50/50 rounded-r-lg p-3">
                                  <p className="text-xs font-medium text-indigo-700 mb-1">
                                    Professional&apos;s Response
                                    {cr.reply.repliedAt && (
                                      <span className="font-normal text-indigo-400 ml-2">
                                        {new Date(cr.reply.repliedAt).toLocaleDateString()}
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-sm text-gray-700">{cr.reply.comment}</p>
                                </div>
                              )}

                              {/* Reply button for owner */}
                              {isOwner && !cr.reply?.comment && (
                                <>
                                  {replyingTo === review._id ? (
                                    <div className="mt-3 space-y-2">
                                      <Textarea
                                        placeholder="Write your reply..."
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        maxLength={1000}
                                        rows={3}
                                        className="text-sm"
                                      />
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={() => handleReply(review._id)}
                                          disabled={submittingReply}
                                        >
                                          {submittingReply ? "Posting..." : "Post Reply"}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            setReplyingTo(null)
                                            setReplyText("")
                                          }}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                      onClick={() => setReplyingTo(review._id)}
                                    >
                                      Reply to this review
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-2 pt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-gray-600">
                          Page {page} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
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
