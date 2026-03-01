'use client'

import { useEffect, useState } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ArrowLeft, Calendar, Clock, Package, Briefcase, User, Mail, Phone, Shield, CheckCircle, XCircle, Play, CheckCheck, CreditCard, FileText, Loader2, Upload, Star } from "lucide-react"
import { toast } from "sonner"
import { getAuthToken } from "@/lib/utils"
import StartChatButton from "@/components/chat/StartChatButton"
import ReviewModal from "@/components/booking/ReviewModal"

type BookingStatus =
  | "rfq"
  | "quoted"
  | "quote_accepted"
  | "quote_rejected"
  | "payment_pending"
  | "booked"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "dispute"
  | "refunded"

interface PostBookingQuestion {
  _id?: string
  id?: string
  question: string
  type: "text" | "multiple_choice" | "attachment"
  options?: string[]
  isRequired: boolean
}

interface PostBookingAnswer {
  questionId: string
  question: string
  answer: string
}

interface BookingDetail {
  _id: string
  bookingType: "professional" | "project"
  status: BookingStatus
  rfqData?: {
    serviceType?: string
    description?: string
    preferredStartDate?: string
    urgency?: "low" | "medium" | "high" | "urgent"
    budget?: {
      min?: number
      max?: number
      currency?: string
    }
  }
  quote?: {
    amount?: number
    currency?: string
    description?: string
    breakdown?: Array<{ item: string; amount: number }>
    validUntil?: string
    termsAndConditions?: string
    estimatedDuration?: string
    submittedAt?: string
    submittedBy?: string
  }
  scheduledStartDate?: string
  scheduledEndDate?: string
  createdAt?: string
  updatedAt?: string
  postBookingData?: PostBookingAnswer[]
  project?: {
    _id: string
    title?: string
    category?: string
    service?: string
    description?: string
    postBookingQuestions?: PostBookingQuestion[]
  }
  professional?: {
    _id: string
    name?: string
    email?: string
    phone?: string
    businessInfo?: {
      companyName?: string
    }
  }
  customer?: {
    _id: string
    name?: string
    email?: string
    phone?: string
    customerType?: string
  }
  customerReview?: {
    communicationLevel?: number
    valueOfDelivery?: number
    qualityOfService?: number
    comment?: string
    reviewedAt?: string
    reply?: {
      comment?: string
      repliedAt?: string
    }
  }
  professionalReview?: {
    rating?: number
    comment?: string
    reviewedAt?: string
  }
}

const DETAIL_STATUS_STYLES: Record<string, string> = {
  rfq: "bg-indigo-50 text-indigo-700 border border-indigo-100",
  quoted: "bg-blue-50 text-blue-700 border border-blue-100",
  quote_accepted: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  quote_rejected: "bg-rose-50 text-rose-700 border border-rose-100",
  payment_pending: "bg-amber-50 text-amber-700 border border-amber-100",
  booked: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  in_progress: "bg-sky-50 text-sky-700 border border-sky-100",
  completed: "bg-teal-50 text-teal-700 border border-teal-100",
  cancelled: "bg-rose-50 text-rose-700 border border-rose-100",
  refunded: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100",
  dispute: "bg-red-50 text-red-700 border border-red-100",
}

const formatCurrencyRange = (booking: BookingDetail): string | null => {
  const budget = booking.rfqData?.budget
  if (!budget || (budget.min == null && budget.max == null)) return null

  const currency = budget.currency || "€"
  if (budget.min != null && budget.max != null && budget.min !== budget.max) {
    return `${currency}${budget.min.toLocaleString()} – ${currency}${budget.max.toLocaleString()}`
  }
  const value = budget.min ?? budget.max
  if (value == null) return null
  return `${currency}${value.toLocaleString()}`
}

type BookingApiResponse = {
  success: boolean
  booking?: BookingDetail
  msg?: string
}

const isBookingApiResponse = (value: unknown): value is BookingApiResponse => {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return typeof record.success === "boolean"
}

const parseResponseBody = async <T,>(response: Response): Promise<{ data: T | null; rawText: string | null }> => {
  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    try {
      return { data: await response.json() as T, rawText: null }
    } catch {
      // fall through to text fallback
    }
  }
  try {
    return { data: null, rawText: await response.text() }
  } catch {
    return { data: null, rawText: null }
  }
}

export default function BookingDetailPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const bookingId = (params?.id || params?.bookingId) as string | undefined
  const showPostBookingQuestions = searchParams?.get("postBookingQuestions") === "true"

  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showQuoteForm, setShowQuoteForm] = useState(false)
  const [quoteAmount, setQuoteAmount] = useState("")
  const [quoteDescription, setQuoteDescription] = useState("")
  const [submittingQuote, setSubmittingQuote] = useState(false)
  const [respondingToQuote, setRespondingToQuote] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [postBookingAnswers, setPostBookingAnswers] = useState<Record<number, string>>({})
  const [submittingAnswers, setSubmittingAnswers] = useState(false)
  const [answersSubmitted, setAnswersSubmitted] = useState(false)
  const [validationErrors, setValidationErrors] = useState<number[]>([])
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewAutoShown, setReviewAutoShown] = useState(false)

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login?redirect=/dashboard")
    }
  }, [isAuthenticated, loading, router])

  // Auto-popup review modal when booking is completed and user hasn't reviewed yet
  useEffect(() => {
    if (!booking || booking.status !== "completed" || reviewAutoShown) return
    const isBookingCustomer = user?._id === booking.customer?._id
    const isBookingProfessional = user?._id === booking.professional?._id
    const customerHasReviewed = !!booking.customerReview?.communicationLevel
    const professionalHasReviewed = !!booking.professionalReview?.rating

    if ((isBookingCustomer && !customerHasReviewed) || (isBookingProfessional && !professionalHasReviewed)) {
      setShowReviewModal(true)
      setReviewAutoShown(true)
    }
  }, [booking, user, reviewAutoShown])

  useEffect(() => {
    if (!bookingId || !isAuthenticated) return

    const fetchBooking = async () => {
      setIsLoading(true)
      setError(null)
      try {
        // Get token for Authorization header fallback
        const token = getAuthToken()
        const headers: Record<string, string> = {}
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}`,
          {
            credentials: "include",
            headers
          }
        )
        const { data, rawText } = await parseResponseBody<BookingApiResponse>(response)
        if (!data || !isBookingApiResponse(data)) {
          setError(rawText || `Unexpected response from server (${response.status}).`)
          return
        }

        if (response.ok && data.success && data.booking) {
          setBooking(data.booking)
        } else {
          setError(data.msg || "Failed to load booking details.")
        }
      } catch (err) {
        console.error("Failed to fetch booking:", err instanceof Error ? err.message : err)
        setError("Failed to load booking details.")
      } finally {
        setIsLoading(false)
      }
    }

    fetchBooking()
  }, [bookingId, isAuthenticated])

  // Check if post-booking questions need to be answered
  const postBookingQuestions = booking?.project?.postBookingQuestions || []
  const hasPostBookingQuestions = postBookingQuestions.length > 0
  const alreadyAnswered = (booking?.postBookingData?.length || 0) > 0
  const shouldShowPostBookingForm = showPostBookingQuestions && hasPostBookingQuestions && !alreadyAnswered && !answersSubmitted
  const currencyRange = booking ? formatCurrencyRange(booking) : null

  const handleAnswerChange = (index: number, answer: string) => {
    setPostBookingAnswers(prev => ({ ...prev, [index]: answer }))
    setValidationErrors(prev => prev.filter((item) => item !== index))
  }

  const handleSubmitPostBookingAnswers = async () => {
    if (!booking || !bookingId) return

    // Validate required answers
    const missingRequired = postBookingQuestions
      .map((q, index) => (q.isRequired && !postBookingAnswers[index]?.trim() ? index : null))
      .filter((index): index is number => index != null)

    if (missingRequired.length > 0) {
      setValidationErrors(missingRequired)
      const firstMissing = missingRequired[0]
      const focusId = postBookingQuestions[firstMissing]?.type === "multiple_choice"
        ? `q${firstMissing}-opt0`
        : `q${firstMissing}-field`
      setTimeout(() => document.getElementById(focusId)?.focus(), 0)
      toast.error(`Please answer required questions: ${missingRequired.map((index) => index + 1).join(', ')}`)
      return
    }
    setValidationErrors([])

    setSubmittingAnswers(true)

    try {
      const answers = postBookingQuestions.map((q, index) => ({
        questionId: q._id || q.id || `q-${index}`,
        question: q.question,
        answer: postBookingAnswers[index] || ""
      })).filter(a => a.answer.trim())

      // Get token for Authorization header fallback
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/post-booking-answers`,
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ answers })
        }
      )

      const { data, rawText } = await parseResponseBody<{ success?: boolean; postBookingData?: PostBookingAnswer[]; msg?: string }>(response)

      if (response.ok && data?.success) {
        toast.success("Thank you! Your answers have been submitted.")
        setAnswersSubmitted(true)
        // Update the local booking state
        setBooking(prev => prev ? { ...prev, postBookingData: data.postBookingData || answers } : prev)
      } else {
        toast.error(data?.msg || rawText || `Failed to submit answers (${response.status}).`)
      }
    } catch (err) {
      console.error("Failed to submit post-booking answers:", err)
      toast.error("Failed to submit answers. Please try again.")
    } finally {
      setSubmittingAnswers(false)
    }
  }

  const refreshBooking = async () => {
    if (!bookingId) return
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}`,
        { credentials: "include", headers }
      )
      if (!response.ok) return
      const { data } = await parseResponseBody<BookingApiResponse>(response)
      if (isBookingApiResponse(data) && data.success && data.booking) {
        setBooking(data.booking)
      }
    } catch {
      // Silently fail - the page already has stale data
    }
  }

  const handleSubmitQuote = async () => {
    const parsedAmount = parseFloat(quoteAmount)
    if (!quoteAmount || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid quote amount.")
      return
    }
    if (!bookingId) return

    setSubmittingQuote(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/quote`,
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            amount: parsedAmount,
            currency: "EUR",
            description: quoteDescription || "Quote for your booking request"
          })
        }
      )

      const { data, rawText } = await parseResponseBody<{ success?: boolean; msg?: string }>(response)

      if (response.ok && data?.success) {
        toast.success("Quote submitted successfully!")
        setShowQuoteForm(false)
        await refreshBooking()
      } else {
        toast.error(data?.msg || rawText || `Failed to submit quote (${response.status}).`)
      }
    } catch (err) {
      console.error("Error submitting quote:", err instanceof Error ? err.message : err)
      toast.error("Failed to submit quote. Please try again.")
    } finally {
      setSubmittingQuote(false)
    }
  }

  const handleRespondToQuote = async (action: "accept" | "reject") => {
    if (!bookingId) return

    setRespondingToQuote(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/respond`,
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ action })
        }
      )

      const { data, rawText } = await parseResponseBody<{ success?: boolean; msg?: string }>(response)

      if (response.ok && data?.success) {
        if (action === "accept") {
          toast.success("Quote accepted! Checking payment readiness...")
          const POLL_INTERVAL = 1000
          const POLL_TIMEOUT = 10000
          const startedAt = Date.now()
          let isReadyForPayment = false

          while (Date.now() - startedAt < POLL_TIMEOUT) {
            try {
              const pollHeaders: Record<string, string> = {}
              if (token) pollHeaders['Authorization'] = `Bearer ${token}`
              const pollRes = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}`,
                { credentials: "include", headers: pollHeaders }
              )
              if (pollRes.ok) {
                const { data: pollData } = await parseResponseBody<BookingApiResponse>(pollRes)
                if (
                  isBookingApiResponse(pollData) &&
                  pollData.booking &&
                  ["quote_accepted", "payment_pending", "booked"].includes(pollData.booking.status)
                ) {
                  isReadyForPayment = true
                  break
                }
              }
            } catch {
              break
            }
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))
          }

          if (isReadyForPayment) {
            router.push(`/bookings/${bookingId}/payment`)
          } else {
            toast.error("Quote acceptance is still syncing. Please refresh and try again in a moment.")
            await refreshBooking()
          }
        } else {
          toast.success("Quote rejected.")
          await refreshBooking()
        }
      } else {
        toast.error(data?.msg || rawText || `Failed to ${action} quote (${response.status}).`)
      }
    } catch (err) {
      console.error(`Error ${action}ing quote:`, err instanceof Error ? err.message : err)
      toast.error(`Failed to ${action} quote. Please try again.`)
    } finally {
      setRespondingToQuote(false)
    }
  }

  const handleUpdateStatus = async (newStatus: BookingStatus, confirmMessage?: string) => {
    if (confirmMessage && !confirm(confirmMessage)) {
      return
    }
    if (!bookingId) return

    setUpdatingStatus(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/status`,
        {
          method: "PUT",
          headers,
          credentials: "include",
          body: JSON.stringify({ status: newStatus })
        }
      )

      const { data, rawText } = await parseResponseBody<{ success?: boolean; msg?: string }>(response)

      if (response.ok && data?.success) {
        if (newStatus === "completed") {
          toast.success("Booking marked as completed. Payment has been released.")
        } else if (newStatus === "in_progress") {
          toast.success("Work started! Good luck with the project.")
        } else {
          toast.success("Booking status updated.")
        }
        await refreshBooking()
      } else {
        toast.error(data?.msg || rawText || `Failed to update booking status (${response.status}).`)
      }
    } catch (err) {
      console.error("Failed to update booking status:", err instanceof Error ? err.message : err)
      toast.error("Failed to update booking status. Please try again.")
    } finally {
      setUpdatingStatus(false)
    }
  }

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-500 mx-auto" />
          <p className="mt-4 text-gray-600 text-sm">Loading booking details...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
      <div className="max-w-4xl mx-auto pt-20 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">
              Booking details
            </h1>
            <p className="text-sm text-gray-600">
              See all the information about this booking.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {user?.role === "customer" && booking?.professional?._id && (
              <StartChatButton
                professionalId={booking.professional._id}
                className="bg-white/80 backdrop-blur border-indigo-100 hover:border-indigo-300"
              />
            )}
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="bg-white/80 backdrop-blur border-indigo-100 hover:border-indigo-300"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>
        </div>

        {error && (
          <Card className="bg-rose-50 border border-rose-100">
            <CardContent className="py-4 text-sm text-rose-700">
              {error}
            </CardContent>
          </Card>
        )}

        {/* Post-Booking Questions Form */}
        {!error && booking && shouldShowPostBookingForm && (
          <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <div>
                  <CardTitle className="text-lg text-green-800">Booking Confirmed!</CardTitle>
                  <CardDescription className="text-green-700">
                    Please answer the following questions to help the service provider prepare for your appointment.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {postBookingQuestions.map((question, index) => {
                const hasError = validationErrors.includes(index)
                const errorId = hasError ? `q${index}-error` : undefined
                return (
                  <div key={index} className="space-y-2">
                  <Label className="text-sm font-medium text-gray-900">
                    {question.question}
                    {question.isRequired && <span className="text-red-500 ml-1">*</span>}
                  </Label>

                  {question.type === "text" && (
                    <Textarea
                      id={`q${index}-field`}
                      placeholder="Your answer..."
                      value={postBookingAnswers[index] || ""}
                      onChange={(e) => handleAnswerChange(index, e.target.value)}
                      rows={3}
                      className="bg-white"
                      aria-invalid={hasError}
                      aria-describedby={errorId}
                      aria-required={question.isRequired}
                    />
                  )}

                  {question.type === "multiple_choice" && question.options && (
                    <RadioGroup
                      value={postBookingAnswers[index] || ""}
                      onValueChange={(value) => handleAnswerChange(index, value)}
                      aria-invalid={hasError}
                      aria-describedby={errorId}
                      aria-required={question.isRequired}
                    >
                      {question.options.map((option, optIdx) => (
                        <div key={optIdx} className="flex items-center space-x-2">
                          <RadioGroupItem value={option} id={`q${index}-opt${optIdx}`} />
                          <Label htmlFor={`q${index}-opt${optIdx}`} className="font-normal cursor-pointer">
                            {option}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}

                  {question.type === "attachment" && (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-white">
                      <Upload className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">File upload coming soon</p>
                      <Input
                        id={`q${index}-field`}
                        type="text"
                        placeholder="For now, please describe or provide a link"
                        value={postBookingAnswers[index] || ""}
                        onChange={(e) => handleAnswerChange(index, e.target.value)}
                        className="mt-2"
                        aria-invalid={hasError}
                        aria-describedby={errorId}
                        aria-required={question.isRequired}
                      />
                    </div>
                  )}
                  {hasError && (
                    <p id={errorId} role="alert" className="text-xs text-red-600">
                      This question is required.
                    </p>
                  )}
                </div>
                )
              })}

              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={handleSubmitPostBookingAnswers}
                  disabled={submittingAnswers}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {submittingAnswers ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Submit Answers
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                >
                  Skip for Now
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Success message after submitting answers */}
        {!error && booking && answersSubmitted && (
          <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
            <CardContent className="py-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-800 mb-2">Thank You!</h3>
              <p className="text-green-700 mb-4">
                Your answers have been submitted successfully. The service provider will review them shortly.
              </p>
              <Button onClick={() => router.push("/dashboard")} className="bg-green-600 hover:bg-green-700">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {!error && booking && (
          <div className="bg-gradient-to-r from-pink-100 via-purple-100 to-blue-100 rounded-2xl p-[1px]">
            <Card className="bg-white/90 backdrop-blur rounded-[1rem] shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {booking.bookingType === "project" ? (
                        <Package className="h-5 w-5 text-indigo-500" />
                      ) : (
                        <Briefcase className="h-5 w-5 text-indigo-500" />
                      )}
                      <CardTitle className="text-lg text-gray-900">
                        {booking.project?.title ||
                          booking.professional?.businessInfo?.companyName ||
                          booking.rfqData?.serviceType ||
                          "Booking"}
                      </CardTitle>
                    </div>
                    <CardDescription className="text-xs text-gray-500">
                      {booking.bookingType === "project"
                        ? "Project booking"
                        : "Professional booking"}
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs font-medium capitalize rounded-full px-2.5 py-1 ${
                      DETAIL_STATUS_STYLES[booking.status] ||
                      "bg-slate-50 text-slate-700 border border-slate-100"
                    }`}
                  >
                    {booking.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="pt-4 space-y-6">
                {/* Payment Action - Show when quote is accepted but not yet paid (CUSTOMER ONLY) */}
                {user?.role === "customer" && (booking.status === "quote_accepted" || booking.status === "payment_pending") && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-blue-900 mb-1">
                          Payment Required
                        </h3>
                        <p className="text-xs text-blue-700">
                          Your quote has been accepted. Please proceed with payment to confirm your booking.
                        </p>
                      </div>
                      <Button
                        onClick={() => router.push(`/bookings/${booking._id}/payment`)}
                        className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                        size="sm"
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Pay Now
                      </Button>
                    </div>
                  </div>
                )}

                {/* Professional: Quote Accepted - Waiting for Payment */}
                {user?.role === "professional" && (booking.status === "quote_accepted" || booking.status === "payment_pending") && (
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-amber-900 mb-1">
                          Quote Accepted - Awaiting Payment
                        </h3>
                        <p className="text-xs text-amber-700">
                          The customer has accepted your quote. Once they complete payment, you&apos;ll be notified to begin work.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Professional: Submit Quote (when status is RFQ) */}
                {user?.role === "professional" && booking.status === "rfq" && (
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4">
                    {!showQuoteForm ? (
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-semibold text-purple-900 mb-1">
                            Quote Requested
                          </h3>
                          <p className="text-xs text-purple-700">
                            The customer is waiting for your quote. Please review the requirements and submit your quote.
                          </p>
                        </div>
                        <Button
                          onClick={() => setShowQuoteForm(true)}
                          className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                          size="sm"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Submit Quote
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-purple-900">Submit Your Quote</h3>
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="quoteAmount" className="text-xs">Quote Amount (EUR) *</Label>
                            <Input
                              id="quoteAmount"
                              type="number"
                              placeholder="1500"
                              value={quoteAmount}
                              onChange={(e) => setQuoteAmount(e.target.value)}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="quoteDescription" className="text-xs">Description (Optional)</Label>
                            <Textarea
                              id="quoteDescription"
                              placeholder="Brief description of what's included..."
                              value={quoteDescription}
                              onChange={(e) => setQuoteDescription(e.target.value)}
                              className="mt-1"
                              rows={3}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={handleSubmitQuote}
                              disabled={submittingQuote}
                              className="bg-purple-600 hover:bg-purple-700 text-white"
                              size="sm"
                            >
                              {submittingQuote ? "Submitting..." : "Submit Quote"}
                            </Button>
                            <Button
                              onClick={() => setShowQuoteForm(false)}
                              variant="outline"
                              size="sm"
                              disabled={submittingQuote}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Customer: Quote Ready - Accept/Reject */}
                {user?.role === "customer" && booking.status === "quoted" && booking.quote && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-green-900 mb-3">Quote Received</h3>
                    <div className="bg-white rounded-lg p-4 mb-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Quote Amount:</span>
                        <span className="text-2xl font-bold text-green-600">
                          {booking.quote.currency || "€"}{booking.quote.amount != null ? booking.quote.amount.toLocaleString() : "—"}
                        </span>
                      </div>
                      {booking.quote.description && (
                        <div className="pt-2 border-t">
                          <p className="text-xs text-gray-600 mb-1">Description:</p>
                          <p className="text-sm text-gray-800">{booking.quote.description}</p>
                        </div>
                      )}
                      {booking.quote.submittedAt && (
                        <p className="text-xs text-gray-500 pt-2">
                          Submitted: {new Date(booking.quote.submittedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <Button
                        onClick={() => handleRespondToQuote("accept")}
                        disabled={respondingToQuote}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {respondingToQuote ? "Processing..." : "Accept & Pay"}
                      </Button>
                      <Button
                        onClick={() => handleRespondToQuote("reject")}
                        disabled={respondingToQuote}
                        variant="outline"
                        className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                        size="sm"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {/* Professional: Start Work (when status is booked) */}
                {user?.role === "professional" && booking.status === "booked" && (
                  <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-blue-900 mb-1">
                          Ready to Start Work
                        </h3>
                        <p className="text-xs text-blue-700">
                          Payment has been authorized and is held in escrow. Click below to mark the work as started.
                        </p>
                      </div>
                      <Button
                        onClick={() => handleUpdateStatus("in_progress")}
                        disabled={updatingStatus}
                        className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                        size="sm"
                      >
                        {updatingStatus ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Starting...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Start Work
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Professional: Customer must confirm completion */}
                {user?.role === "professional" && booking.status === "in_progress" && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-green-900 mb-1">
                          Waiting for customer confirmation
                        </h3>
                        <p className="text-xs text-green-700 mb-2">
                          Finish the work and notify your customer. Only they can confirm completion and release the payment from escrow.
                        </p>
                        <p className="text-xs text-green-600 font-medium">
                          Funds stay protected until the customer marks the booking as completed.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Customer: Confirm Work Completion (when status is in_progress) */}
                {user?.role === "customer" && booking.status === "in_progress" && (
                  <div className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-teal-900 mb-1">
                          Work In Progress
                        </h3>
                        <p className="text-xs text-teal-700 mb-2">
                          The professional is currently working on your request. Once they complete the work, you can confirm completion.
                        </p>
                        <p className="text-xs text-teal-600 font-medium">
                          Payment will be released from escrow when you confirm completion.
                        </p>
                      </div>
                      <Button
                        onClick={() => handleUpdateStatus(
                          "completed",
                          "Are you satisfied with the work?\n\nThis will release the payment from escrow to the professional."
                        )}
                        disabled={updatingStatus}
                        className="bg-teal-600 hover:bg-teal-700 text-white shrink-0"
                        size="sm"
                      >
                        {updatingStatus ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <CheckCheck className="h-4 w-4 mr-2" />
                            Confirm Completion
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Both: Work Completed */}
                {booking.status === "completed" && (
                  <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-emerald-600 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-emerald-900 mb-1">
                          Work Completed
                        </h3>
                        <p className="text-xs text-emerald-700">
                          This booking has been marked as completed. Payment has been transferred to the professional.
                        </p>
                        {user?.role === "professional" && (
                          <p className="text-xs text-emerald-600 font-medium mt-2">
                            Funds will arrive in your bank account within 2-7 business days.
                          </p>
                        )}

                        {/* Review button */}
                        {(() => {
                          const isCustomer = user?._id === booking.customer?._id
                          const isProfessional = user?._id === booking.professional?._id
                          const customerHasReviewed = !!booking.customerReview?.communicationLevel
                          const professionalHasReviewed = !!booking.professionalReview?.rating
                          const canReview = (isCustomer && !customerHasReviewed) || (isProfessional && !professionalHasReviewed)

                          if (canReview) {
                            return (
                              <Button
                                size="sm"
                                className="mt-3 bg-yellow-500 hover:bg-yellow-600 text-white"
                                onClick={() => setShowReviewModal(true)}
                              >
                                <Star className="h-4 w-4 mr-1.5" />
                                Leave a Review
                              </Button>
                            )
                          }

                          if ((isCustomer && customerHasReviewed) || (isProfessional && professionalHasReviewed)) {
                            return (
                              <p className="text-xs text-emerald-600 font-medium mt-2 flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                You have already reviewed this booking
                              </p>
                            )
                          }

                          return null
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Review Modal */}
                {booking.status === "completed" && (
                  <ReviewModal
                    open={showReviewModal}
                    onClose={() => setShowReviewModal(false)}
                    bookingId={booking._id}
                    role={
                      user?._id === booking.customer?._id
                        ? "customer"
                        : "professional"
                    }
                    onSubmitted={() => {
                      void refreshBooking()
                    }}
                  />
                )}

                {/* Core info */}
                <section className="grid md:grid-cols-2 gap-4 text-xs text-gray-700">
                  {booking.createdAt && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-gray-400" />
                      <span>
                        Requested on{" "}
                        <span className="font-medium">
                          {new Date(booking.createdAt).toLocaleString()}
                        </span>
                      </span>
                    </div>
                  )}
                  {booking.rfqData?.preferredStartDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-indigo-500" />
                      <span>
                        Preferred start:{" "}
                        <span className="font-medium">
                          {new Date(booking.rfqData.preferredStartDate).toLocaleDateString()}
                        </span>
                      </span>
                    </div>
                  )}
                  {booking.scheduledStartDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-emerald-500" />
                      <span>
                        Start Date:{" "}
                        <span className="font-medium">
                          {new Date(booking.scheduledStartDate).toLocaleDateString()}
                        </span>
                      </span>
                    </div>
                  )}
                  {booking.scheduledEndDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-blue-500" />
                      <span>
                        Completion Date:{" "}
                        <span className="font-medium">
                          {new Date(booking.scheduledEndDate).toLocaleDateString()}
                        </span>
                      </span>
                    </div>
                  )}
                  {booking.rfqData?.urgency && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-amber-500" />
                      <span className="capitalize">
                        Urgency:{" "}
                        <span className="font-medium">
                          {booking.rfqData.urgency}
                        </span>
                      </span>
                    </div>
                  )}
                  {currencyRange && (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold">
                        €
                      </span>
                      <span>
                        Budget:{" "}
                        <span className="font-medium">
                          {currencyRange}
                        </span>
                      </span>
                    </div>
                  )}
                </section>

                {/* Description */}
                {booking.rfqData?.description && (
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-gray-900">
                      Request details
                    </h2>
                    <p className="text-xs leading-relaxed text-gray-700 whitespace-pre-line">
                      {booking.rfqData.description}
                    </p>
                  </section>
                )}

                {/* Parties */}
                <section className="grid md:grid-cols-2 gap-4">
                  {booking.customer && (
                    <Card className="bg-slate-50/60 border border-slate-100">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-xs">
                          <User className="h-4 w-4 text-slate-600" />
                          Customer
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 text-xs text-gray-700">
                        {booking.customer.name && (
                          <div className="flex items-center gap-2">
                            <Shield className="h-3 w-3 text-gray-400" />
                            <span>{booking.customer.name}</span>
                          </div>
                        )}
                        {booking.customer.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3 text-gray-400" />
                            <span>{booking.customer.email}</span>
                          </div>
                        )}
                        {booking.customer.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3 text-gray-400" />
                            <span>{booking.customer.phone}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {(booking.professional || booking.project) && (
                    <Card className="bg-slate-50/60 border border-slate-100">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-xs">
                          {booking.bookingType === "project" ? (
                            <Package className="h-4 w-4 text-slate-600" />
                          ) : (
                            <Briefcase className="h-4 w-4 text-slate-600" />
                          )}
                          Service provider
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 text-xs text-gray-700">
                        {booking.bookingType === "project" && booking.project && (
                          <>
                            {booking.project.title && (
                              <div className="flex items-center gap-2">
                                <Shield className="h-3 w-3 text-gray-400" />
                                <span>{booking.project.title}</span>
                              </div>
                            )}
                            {booking.project.service && (
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-indigo-400" />
                                <span className="text-[11px] text-gray-600">
                                  {booking.project.service}
                                </span>
                              </div>
                            )}
                          </>
                        )}

                        {booking.bookingType === "professional" && booking.professional && (
                          <>
                            {booking.professional.businessInfo?.companyName && (
                              <div className="flex items-center gap-2">
                                <Shield className="h-3 w-3 text-gray-400" />
                                <span>{booking.professional.businessInfo.companyName}</span>
                              </div>
                            )}
                            {booking.professional.name && (
                              <div className="flex items-center gap-2">
                                <User className="h-3 w-3 text-gray-400" />
                                <span>{booking.professional.name}</span>
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </section>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

