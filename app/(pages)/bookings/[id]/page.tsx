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
import { ArrowLeft, Calendar, Clock, Package, Briefcase, User, Mail, Phone, Shield, CheckCircle, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import { getAuthToken } from "@/lib/utils"

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
  | string

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
}

const DETAIL_STATUS_STYLES: Record<string, string> = {
  rfq: "bg-indigo-50 text-indigo-700 border border-indigo-100",
  quoted: "bg-blue-50 text-blue-700 border border-blue-100",
  quote_accepted: "bg-emerald-50 text-emerald-700 border border-emerald-100",
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

export default function BookingDetailPage() {
  const { isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const bookingId = (params?.id || params?.bookingId) as string | undefined
  const showPostBookingQuestions = searchParams?.get("postBookingQuestions") === "true"

  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [postBookingAnswers, setPostBookingAnswers] = useState<Record<number, string>>({})
  const [submittingAnswers, setSubmittingAnswers] = useState(false)
  const [answersSubmitted, setAnswersSubmitted] = useState(false)
  const [validationErrors, setValidationErrors] = useState<number[]>([])

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login?redirect=/dashboard")
    }
  }, [isAuthenticated, loading, router])

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
        const data = await response.json()
        if (!isBookingApiResponse(data)) {
          setError("Unexpected response from server.")
          return
        }

        if (response.ok && data.success && data.booking) {
          setBooking(data.booking)
        } else {
          setError(data.msg || "Failed to load booking details.")
        }
      } catch (err) {
        console.error("Failed to fetch booking:", err)
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

      const data = await response.json() as { success?: boolean; postBookingData?: PostBookingAnswer[]; msg?: string }

      if (response.ok && data.success) {
        toast.success("Thank you! Your answers have been submitted.")
        setAnswersSubmitted(true)
        // Update the local booking state
        setBooking(prev => prev ? { ...prev, postBookingData: data.postBookingData || answers } : prev)
      } else {
        toast.error(data.msg || "Failed to submit answers. Please try again.")
      }
    } catch (err) {
      console.error("Failed to submit post-booking answers:", err)
      toast.error("Failed to submit answers. Please try again.")
    } finally {
      setSubmittingAnswers(false)
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
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="bg-white/80 backdrop-blur border-indigo-100 hover:border-indigo-300"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
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

