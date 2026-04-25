'use client'

import { useEffect, useRef, useState } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ArrowLeft, Calendar, Clock, Package, Briefcase, User, Mail, Phone, Shield, CheckCircle, XCircle, Play, CheckCheck, CreditCard, FileText, Loader2, Upload, Star, Gift, ChevronDown, ChevronUp, MessageSquare, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { type WarrantyClaimStatus, REASON_LABELS as warrantyReasonLabels, STATUS_LABELS as warrantyStatusLabels } from "@/lib/warrantyClaim"
import { getAuthToken } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import StartChatButton from "@/components/chat/StartChatButton"
import ReviewModal from "@/components/booking/ReviewModal"
import QuotationWizard from "@/components/quotation/QuotationWizard"
import { StripeProvider } from "@/components/stripe/StripeProvider"
import { PaymentForm } from "@/components/stripe/PaymentForm"
import type { QuoteVersion, BookingMilestone } from "@/types/quotation"
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/dashboardBookingHelpers"
import { useCustomerPricing } from "@/hooks/useCustomerPricing"
import { createOrGetConversation } from "@/lib/chatApi"

const PRE_SERVICE_BOOKING_STATUSES: BookingStatus[] = BOOKING_STATUSES.filter((status) =>
  [
    "rfq",
    "rfq_accepted",
    "draft_quote",
    "quoted",
    "quote_accepted",
    "payment_pending",
    "booked",
  ].includes(status)
) as BookingStatus[]

const formatValidUntilLabel = (value?: string) => {
  if (!value) return "N/A"
  const raw = String(value).trim()
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    const parsed = new Date(year, month - 1, day)
    if (parsed.getFullYear() === year && parsed.getMonth() + 1 === month && parsed.getDate() === day) {
      return parsed.toLocaleDateString()
    }
    return "N/A"
  }
  const fallback = new Date(raw)
  if (!isNaN(fallback.getTime())) return fallback.toLocaleDateString()
  return "N/A"
}

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

interface RFQAnswer {
  questionId?: string
  question: string
  answer: string
  fieldType?: string
}

interface BookingDetail {
  _id: string
  bookingType: "professional" | "project"
  status: BookingStatus
  payment?: {
    status?: string
    currency?: string
    totalWithVat?: number
    amount?: number
    netAmount?: number
    vatAmount?: number
    vatRate?: number
    platformCommission?: number
    professionalPayout?: number
    stripeFeeAmount?: number
    stripePaymentIntentId?: string
    extraCostStripePaymentIntentId?: string
    extraCostClientSecret?: string
    extraCostAmount?: number
    authorizedAt?: string
    capturedAt?: string
    transferredAt?: string
    paidAt?: string
    discount?: {
      loyaltyTier?: string
      loyaltyAmount?: number
      repeatBuyerAmount?: number
      pointsDiscountAmount?: number
      totalDiscount?: number
      originalAmount?: number
    }
  }
  completionAttestation?: {
    confirmedAt?: string
    confirmedBy?: string
    attachments?: string[]
    notes?: string
  }
  extraCosts?: Array<{
    type: 'unit_adjustment' | 'condition' | 'option' | 'other'
    name: string
    justification: string
    amount: number
    estimatedUnits?: number
    actualUnits?: number
    unitPrice?: number
    referenceIndex?: number
  }>
  extraCostStatus?: 'pending' | 'confirmed' | 'disputed'
  extraCostTotal?: number
  rfqData?: {
    serviceType?: string
    description?: string
    answers?: RFQAnswer[]
    attachments?: string[]
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
  quotationNumber?: string
  quoteVersions?: QuoteVersion[]
  currentQuoteVersion?: number
  rfqResponse?: { action: 'accepted' | 'rejected'; respondedAt: string; rejectionReason?: string }
  rfqDeadline?: string
  customerRejectionReason?: string
  milestonePayments?: BookingMilestone[]
  selectedSubprojectIndex?: number
  scheduledStartDate?: string
  scheduledExecutionEndDate?: string
  scheduledEndDate?: string
  createdAt?: string
  updatedAt?: string
  warrantyCoverage?: {
    duration?: { value?: number; unit?: "months" | "years" }
    startsAt?: string
    endsAt?: string
    source?: "quote" | "project_subproject"
  }
  postBookingData?: PostBookingAnswer[]
  project?: {
    _id: string
    title?: string
    category?: string
    service?: string
    description?: string
    rfqQuestions?: PostBookingQuestion[]
    postBookingQuestions?: PostBookingQuestion[]
    extraOptions?: Array<{ name?: string; price?: number }>
    termsConditions?: Array<{ name?: string; additionalCost?: number; type?: 'condition' | 'warning' }>
    subprojects?: Array<{
      name?: string
      pricing?: { type?: 'fixed' | 'unit' | 'rfq'; amount?: number }
      professionalInputs?: Array<{ fieldName?: string; value?: string | number }>
    }>
  }
  professional?: {
    _id: string
    name?: string
    email?: string
    phone?: string
    username?: string
    businessInfo?: {
      companyName?: string
      kvkNumber?: string
      vatNumber?: string
      country?: string
    }
    role?: string
    createdAt?: string
  }
  customer?: {
    _id: string
    name?: string
    email?: string
    phone?: string
    customerType?: string
    vatNumber?: string
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

interface WarrantyClaimDetail {
  _id: string
  claimNumber: string
  status: WarrantyClaimStatus
  reason: string
  description: string
  evidence?: string[]
  createdAt?: string
  warrantyEndsAt?: string
  proposal?: {
    message?: string
    resolveByDate?: string
    proposedScheduleAt?: string
    customerDecision?: "accepted" | "declined"
    decisionNote?: string
  }
  escalation?: {
    escalatedAt?: string
    reason?: string
    note?: string
    autoEscalated?: boolean
  }
  resolution?: {
    summary?: string
    attachments?: string[]
    resolvedAt?: string
    customerConfirmedAt?: string
    autoClosedAt?: string
  }
  sla?: {
    professionalResponseDueAt?: string
    customerConfirmationDueAt?: string
    customerAutoCloseDays?: number
  }
}

type CompletionExtraCost = {
  type: 'unit_adjustment' | 'condition' | 'option' | 'other'
  name: string
  justification: string
  amount: number
  referenceIndex?: number
  estimatedUnits?: number
  actualUnits?: number
  unitPrice?: number
}

const UNSELECTED_REFERENCE_INDEX = -1

const hasSelectedReferenceIndex = (referenceIndex?: number) =>
  typeof referenceIndex === "number" && referenceIndex >= 0

const DETAIL_STATUS_STYLES: Record<string, string> = {
  rfq: "bg-indigo-50 text-indigo-700 border border-indigo-100",
  rfq_accepted: "bg-violet-50 text-violet-700 border border-violet-100",
  draft_quote: "bg-slate-50 text-slate-700 border border-slate-100",
  quoted: "bg-blue-50 text-blue-700 border border-blue-100",
  quote_accepted: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  quote_rejected: "bg-rose-50 text-rose-700 border border-rose-100",
  payment_pending: "bg-amber-50 text-amber-700 border border-amber-100",
  booked: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  in_progress: "bg-sky-50 text-sky-700 border border-sky-100",
  professional_completed: "bg-amber-50 text-amber-700 border border-amber-100",
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
  viewerRole?: 'admin' | 'customer' | 'professional'
  msg?: string
}

interface DiscountPreview {
  originalAmount: number
  loyaltyDiscount: {
    tier: string
    percentage: number
    amount: number
    capped: boolean
  }
  repeatBuyerDiscount: {
    percentage: number
    amount: number
    previousBookings: number
    capped: boolean
  }
  pointsDiscount?: {
    pointsUsed: number
    discountAmount: number
    conversionRate: number
  }
  availablePoints?: number
  pointsExpiry?: string
  totalDiscount: number
  finalAmount: number
  currency: string
}

const isBookingApiResponse = (value: unknown): value is BookingApiResponse => {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return typeof record.success === "boolean"
}

const formatMoney = (amount: number, currencyCode = "EUR"): string =>
  `${currencyCode.toUpperCase()} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const isHttpUrl = (value?: string | null) => {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

const getFileLabel = (value?: string | null, fallback = "Open attachment") => {
  if (!value) return fallback
  try {
    const parsed = new URL(value)
    const segments = parsed.pathname.split("/").filter(Boolean)
    return decodeURIComponent(segments[segments.length - 1] || fallback)
  } catch {
    return fallback
  }
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

const WARRANTY_ALLOWED_FILE_TYPES = ['image/', 'video/', 'application/pdf']
const WARRANTY_MAX_FILE_SIZE = 50 * 1024 * 1024
const WARRANTY_MAX_FILES = 10

const validateWarrantyFiles = (fileList: FileList | File[] | null | undefined) => {
  const raw = Array.from(fileList || [])
  const valid: File[] = []
  const rejected: string[] = []

  for (const file of raw.slice(0, WARRANTY_MAX_FILES)) {
    if (!WARRANTY_ALLOWED_FILE_TYPES.some((type) => file.type.startsWith(type))) {
      rejected.push(`${file.name}: unsupported type`)
    } else if (file.size > WARRANTY_MAX_FILE_SIZE) {
      rejected.push(`${file.name}: exceeds 50 MB`)
    } else {
      valid.push(file)
    }
  }

  if (raw.length > WARRANTY_MAX_FILES) {
    rejected.push(`Only ${WARRANTY_MAX_FILES} files allowed`)
  }

  return { valid, rejected }
}


export default function BookingDetailPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const { commissionPercent, customerPrice } = useCustomerPricing()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const disputeAutoOpenedRef = useRef(false)
  const bookingId = (params?.id || params?.bookingId) as string | undefined

  useEffect(() => {
    disputeAutoOpenedRef.current = false
  }, [bookingId])

  const showPostBookingQuestions = searchParams?.get("postBookingQuestions") === "true"
  const autoOpenWarrantyClaim = searchParams?.get("openWarrantyClaim") === "true"
  const autoOpenCompletion = searchParams?.get("openCompletion") === "1"
  const autoPayExtras = searchParams?.get("payExtras") === "1"

  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [viewerRole, setViewerRole] = useState<'admin' | 'customer' | 'professional' | null>(null)
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
  const [discountPreview, setDiscountPreview] = useState<DiscountPreview | null>(null)
  const [loadingDiscountPreview, setLoadingDiscountPreview] = useState(false)
  const [pointsToRedeem, setPointsToRedeem] = useState(0)
  // New quotation flow state
  const [showQuotationWizard, setShowQuotationWizard] = useState(false)
  const [respondingToRFQ, setRespondingToRFQ] = useState(false)
  const [showRejectionModal, setShowRejectionModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [respondingToQuotation, setRespondingToQuotation] = useState(false)
  const [showQuoteRejectionModal, setShowQuoteRejectionModal] = useState(false)
  const [quoteRejectionReason, setQuoteRejectionReason] = useState("")
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
  const [payingMilestone, setPayingMilestone] = useState<number | null>(null)
  const [uploadingPostBookingQuestionIndexes, setUploadingPostBookingQuestionIndexes] = useState<Set<number>>(new Set())
  const [updatingMilestoneIndexes, setUpdatingMilestoneIndexes] = useState<Set<number>>(new Set())
  const [warrantyClaim, setWarrantyClaim] = useState<WarrantyClaimDetail | null | undefined>(undefined)
  const [loadingWarrantyClaim, setLoadingWarrantyClaim] = useState(false)
  const [showWarrantyClaimDialog, setShowWarrantyClaimDialog] = useState(false)
  const [openingWarrantyClaim, setOpeningWarrantyClaim] = useState(false)
  const [warrantyClaimReason, setWarrantyClaimReason] = useState("defect")
  const [warrantyClaimDescription, setWarrantyClaimDescription] = useState("")
  const [warrantyEvidenceFiles, setWarrantyEvidenceFiles] = useState<File[]>([])
  const [warrantyActionLoading, setWarrantyActionLoading] = useState(false)
  const [warrantyProposalMessage, setWarrantyProposalMessage] = useState("")
  const [warrantyProposalSchedule, setWarrantyProposalSchedule] = useState("")
  const [warrantyResolutionSummary, setWarrantyResolutionSummary] = useState("")
  const [warrantyResolutionFiles, setWarrantyResolutionFiles] = useState<File[]>([])
  const [warrantyDialogAutoOpened, setWarrantyDialogAutoOpened] = useState(false)
  const [showDeclineReasonDialog, setShowDeclineReasonDialog] = useState(false)
  const [declineReason, setDeclineReason] = useState("")

  // Professional completion flow state
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  const [completionNotes, setCompletionNotes] = useState("")
  const [completionFiles, setCompletionFiles] = useState<File[]>([])
  const [completionExtraCosts, setCompletionExtraCosts] = useState<CompletionExtraCost[]>([])
  const [submittingCompletion, setSubmittingCompletion] = useState(false)

  // Customer dispute state
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [disputeReason, setDisputeReason] = useState("")
  const [disputeDescription, setDisputeDescription] = useState("")
  const [submittingDispute, setSubmittingDispute] = useState(false)
  const [confirmingCompletion, setConfirmingCompletion] = useState(false)
  const [extraCostClientSecret, setExtraCostClientSecret] = useState("")
  const [loadingExtraCostPayment, setLoadingExtraCostPayment] = useState(false)
  const [extraCostPaymentCompleted, setExtraCostPaymentCompleted] = useState(false)

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
          if (data.viewerRole) setViewerRole(data.viewerRole)
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

  useEffect(() => {
    const canPreviewDiscount =
      Boolean(bookingId) &&
      user?.role === "customer" &&
      booking?.status === "quoted" &&
      Boolean(booking?.quote?.amount)

    if (!canPreviewDiscount) {
      setDiscountPreview(null)
      setLoadingDiscountPreview(false)
      return
    }

    let isCancelled = false

    const fetchDiscountPreview = async () => {
      setLoadingDiscountPreview(true)
      try {
        const token = getAuthToken()
        const headers: Record<string, string> = {}
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const url = new URL(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/discount-preview`)
        if (pointsToRedeem > 0) {
          url.searchParams.set('pointsToRedeem', String(pointsToRedeem))
        }

        const response = await fetch(url.toString(), {
            credentials: "include",
            headers,
          }
        )

        const { data } = await parseResponseBody<{ success?: boolean; data?: { discount: Omit<DiscountPreview, 'availablePoints' | 'pointsExpiry' | 'currency'>; availablePoints?: number; pointsExpiry?: string } }>(response)
        if (!isCancelled && response.ok && data?.success && data.data?.discount) {
          const d = data.data.discount
          setDiscountPreview({
            originalAmount: d.originalAmount,
            loyaltyDiscount: d.loyaltyDiscount,
            repeatBuyerDiscount: d.repeatBuyerDiscount,
            pointsDiscount: d.pointsDiscount,
            totalDiscount: d.totalDiscount,
            finalAmount: d.finalAmount,
            availablePoints: data.data.availablePoints,
            pointsExpiry: data.data.pointsExpiry,
            currency: booking?.quote?.currency || 'EUR',
          })
        }
      } catch {
        // Keep booking flow usable if preview fails
      } finally {
        if (!isCancelled) {
          setLoadingDiscountPreview(false)
        }
      }
    }

    fetchDiscountPreview()

    return () => {
      isCancelled = true
    }
  }, [bookingId, booking?.quote?.amount, booking?.status, user?.role, pointsToRedeem])

  useEffect(() => {
    if (!bookingId || !isAuthenticated) return
    if (booking?.status !== "completed") {
      setWarrantyClaim(null)
      return
    }
    void fetchWarrantyClaim()
  }, [bookingId, isAuthenticated, booking?.status, booking?.updatedAt])

  // Auto-open quote form when navigated with ?action=quote
  useEffect(() => {
    if (booking?.status === "rfq" && searchParams?.get("action") === "quote" && user?.role === "professional") {
      setShowQuoteForm(true)
    }
    // Auto-open quotation wizard for draft_quote or rfq_accepted with action=quote
    if (
      (booking?.status === "draft_quote" || booking?.status === "rfq_accepted") &&
      searchParams?.get("action") === "quote" &&
      user?.role === "professional"
    ) {
      setShowQuotationWizard(true)
    }
    // Auto-open dispute modal when navigated with ?dispute=1 (one-shot)
    if (
      booking?.status === "professional_completed" &&
      searchParams?.get("dispute") === "1" &&
      user?.role === "customer" &&
      !disputeAutoOpenedRef.current
    ) {
      disputeAutoOpenedRef.current = true
      setShowDisputeModal(true)
    }
  }, [booking, searchParams, user?.role])

  // Check if post-booking questions need to be answered
  const postBookingQuestions = booking?.project?.postBookingQuestions || []
  const hasPostBookingQuestions = postBookingQuestions.length > 0
  const alreadyAnswered = (booking?.postBookingData?.length || 0) > 0
  const paymentCompletedForPostBooking =
    booking?.payment?.status === "authorized" ||
    booking?.payment?.status === "completed"
  const customerCanAnswerPostBooking =
    user?.role === "customer" &&
    (booking?.customer?._id ? user?._id === booking.customer._id : true)
  const isPreServiceBookingStatus = booking?.status ? PRE_SERVICE_BOOKING_STATUSES.includes(booking.status) : false
  const shouldShowPostBookingForm =
    isPreServiceBookingStatus &&
    hasPostBookingQuestions &&
    !alreadyAnswered &&
    !answersSubmitted &&
    customerCanAnswerPostBooking &&
    (showPostBookingQuestions || paymentCompletedForPostBooking)
  const currencyRange = booking ? formatCurrencyRange(booking) : null
  const warrantyDurationValue = Number(booking?.warrantyCoverage?.duration?.value || 0)
  const hasWarrantyCoverage = warrantyDurationValue > 0
  const warrantyEndsAtTs = booking?.warrantyCoverage?.endsAt
    ? new Date(booking.warrantyCoverage.endsAt).getTime()
    : NaN
  const warrantyEndsAtDate = Number.isFinite(warrantyEndsAtTs) ? new Date(warrantyEndsAtTs) : null
  const isWarrantyExpired = warrantyEndsAtDate ? warrantyEndsAtDate.getTime() <= Date.now() : true
  const warrantyClaimResolved = warrantyClaim !== undefined
  const hasActiveWarrantyClaim = !!warrantyClaim && warrantyClaim.status !== "closed"
  const canOpenWarrantyClaim =
    user?.role === "customer" &&
    booking?.status === "completed" &&
    hasWarrantyCoverage &&
    !isWarrantyExpired &&
    !hasActiveWarrantyClaim &&
    warrantyClaimResolved &&
    !loadingWarrantyClaim

  useEffect(() => {
    if (!autoOpenWarrantyClaim || warrantyDialogAutoOpened) return
    if (canOpenWarrantyClaim) {
      setShowWarrantyClaimDialog(true)
      setWarrantyDialogAutoOpened(true)
    }
  }, [autoOpenWarrantyClaim, warrantyDialogAutoOpened, canOpenWarrantyClaim])

  useEffect(() => {
    if (!autoOpenCompletion) return
    if (user?.role !== "professional") return
    if (booking?.status !== "in_progress") return
    setShowCompletionModal(true)
  }, [autoOpenCompletion, user?.role, booking?.status])

  useEffect(() => {
    if (!autoPayExtras) return
    if (user?.role !== "customer") return
    if (booking?.status !== "professional_completed") return
    if ((booking?.extraCostTotal || 0) <= 0) return
    if (extraCostClientSecret) return
    if (booking?.extraCostStatus === "confirmed" || booking?.extraCostStatus === "disputed") return
    initializeExtraCostPayment()
    // initializeExtraCostPayment is stable enough — intentionally not in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPayExtras, user?.role, booking?.status, booking?.extraCostTotal, booking?.extraCostStatus, extraCostClientSecret])

  const handleAnswerChange = (index: number, answer: string) => {
    setPostBookingAnswers(prev => ({ ...prev, [index]: answer }))
    setValidationErrors(prev => prev.filter((item) => item !== index))
  }

  const handlePostBookingAttachmentUpload = async (index: number, file: File | null) => {
    if (!file || !booking?.project?._id) return

    setUploadingPostBookingQuestionIndexes(prev => new Set(prev).add(index))
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`

      const formData = new FormData()
      formData.append("attachment", file)
      formData.append("projectId", booking.project._id)
      formData.append("questionId", postBookingQuestions[index]?._id || postBookingQuestions[index]?.id || `post-booking-${index}`)

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/projects/upload/attachment`,
        {
          method: "POST",
          credentials: "include",
          headers,
          body: formData,
        }
      )

      const { data, rawText } = await parseResponseBody<{ success?: boolean; data?: { url?: string }; message?: string }>(response)

      if (response.ok && data?.success && data.data?.url) {
        handleAnswerChange(index, data.data.url)
        toast.success("Attachment uploaded")
      } else {
        toast.error(data?.message || rawText || `Failed to upload attachment (${response.status}).`)
      }
    } catch (err) {
      console.error("Failed to upload post-booking attachment:", err)
      toast.error("Failed to upload attachment. Please try again.")
    } finally {
      setUploadingPostBookingQuestionIndexes(prev => { const next = new Set(prev); next.delete(index); return next })
    }
  }

  const fetchWarrantyClaim = async () => {
    if (!bookingId || !isAuthenticated || !booking || booking.status !== "completed") {
      setWarrantyClaim(null)
      return
    }

    setLoadingWarrantyClaim(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/booking/${bookingId}`,
        { credentials: "include", headers }
      )
      const { data } = await parseResponseBody<{
        success?: boolean
        data?: {
          activeClaim?: WarrantyClaimDetail | null
          latestClaim?: WarrantyClaimDetail | null
        }
      }>(response)

      if (response.ok && data?.success) {
        setWarrantyClaim(data.data?.activeClaim || data.data?.latestClaim || null)
      }
    } catch (err) {
      console.error("Failed to fetch warranty claim:", err)
    } finally {
      setLoadingWarrantyClaim(false)
    }
  }

  const uploadWarrantyEvidence = async (claimId: string): Promise<void> => {
    if (!warrantyEvidenceFiles.length) return
    const token = getAuthToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const form = new FormData()
    warrantyEvidenceFiles.forEach((file) => {
      form.append("files", file)
    })

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/${claimId}/evidence`,
      {
        method: "POST",
        credentials: "include",
        headers,
        body: form,
      }
    )
    const { data, rawText } = await parseResponseBody<{
      success?: boolean
      msg?: string
    }>(response)

    if (!response.ok || !data?.success) {
      throw new Error(data?.msg || rawText || "Failed to upload evidence")
    }
  }

  const deleteDraftClaim = async (claimId: string): Promise<void> => {
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/${claimId}`,
        {
          method: "DELETE",
          credentials: "include",
          headers,
        }
      ).catch(() => { /* best-effort cleanup */ })
    } catch {
      // best-effort cleanup
    }
  }

  const handleOpenWarrantyClaim = async () => {
    if (!bookingId) return
    if (!warrantyClaimDescription.trim() || warrantyClaimDescription.trim().length < 10) {
      toast.error("Please provide at least 10 characters describing the issue.")
      return
    }

    // Re-check for existing claim to prevent duplicate creation
    if (warrantyClaim && warrantyClaim.status !== "closed") {
      toast.error("An active warranty claim already exists for this booking.")
      return
    }

    setOpeningWarrantyClaim(true)
    let createdClaimId: string | null = null
    try {
      // Step 1: Create the claim without evidence
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims`,
        {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({
            bookingId,
            reason: warrantyClaimReason,
            description: warrantyClaimDescription.trim(),
          }),
        }
      )
      const { data, rawText } = await parseResponseBody<{
        success?: boolean
        msg?: string
        claim?: WarrantyClaimDetail
      }>(response)

      if (!response.ok || !data?.success || !data.claim) {
        toast.error(data?.msg || rawText || "Failed to open warranty claim")
        return
      }

      createdClaimId = data.claim._id

      try {
        await uploadWarrantyEvidence(createdClaimId)
      } catch (evidenceErr) {
        await deleteDraftClaim(createdClaimId)
        throw evidenceErr
      }

      const refreshRes = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/${createdClaimId}`,
        {
          method: "GET",
          credentials: "include",
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        }
      )
      const refreshData = await parseResponseBody<{
        success?: boolean
        claim?: WarrantyClaimDetail
      }>(refreshRes)

      const finalClaim = refreshData.data?.claim || data.claim
      toast.success("Warranty claim opened.")
      setWarrantyClaim(finalClaim)
      setWarrantyClaimReason("defect")
      setWarrantyClaimDescription("")
      setWarrantyEvidenceFiles([])
      setShowWarrantyClaimDialog(false)
    } catch (err) {
      console.error("Failed to open warranty claim:", err)
      toast.error(err instanceof Error ? err.message : "Failed to open warranty claim")
    } finally {
      setOpeningWarrantyClaim(false)
    }
  }

  const callWarrantyAction = async (path: string, body?: Record<string, unknown>) => {
    const token = getAuthToken()
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/${path}`,
      {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body || {}),
      }
    )
    const { data, rawText } = await parseResponseBody<{
      success?: boolean
      msg?: string
      claim?: WarrantyClaimDetail
    }>(response)
    if (!response.ok || !data?.success) {
      throw new Error(data?.msg || rawText || "Warranty action failed")
    }
    return data
  }

  const handleSubmitWarrantyProposal = async () => {
    if (!warrantyClaim?._id) return
    if (!warrantyProposalMessage.trim()) {
      toast.error("Resolve proposal is required.")
      return
    }
    if (!warrantyProposalSchedule) {
      toast.error("Resolve date is required.")
      return
    }
    setWarrantyActionLoading(true)
    try {
      const data = await callWarrantyAction(`${warrantyClaim._id}/proposal`, {
        message: warrantyProposalMessage.trim(),
        resolveByDate: warrantyProposalSchedule,
      })
      setWarrantyClaim(data.claim || null)
      setWarrantyProposalMessage("")
      setWarrantyProposalSchedule("")
      toast.success("Resolve proposal sent.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit proposal")
    } finally {
      setWarrantyActionLoading(false)
    }
  }

  const handleDeclineWarrantyClaim = async () => {
    if (!warrantyClaim?._id) return
    const trimmed = declineReason.trim()
    if (!trimmed) {
      toast.error("Please provide a reason for declining.")
      return
    }

    setWarrantyActionLoading(true)
    try {
      const data = await callWarrantyAction(`${warrantyClaim._id}/decline`, { reason: trimmed })
      setWarrantyClaim(data.claim || null)
      setShowDeclineReasonDialog(false)
      setDeclineReason("")
      toast.success("Claim declined and escalated.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to decline claim")
    } finally {
      setWarrantyActionLoading(false)
    }
  }

  const handleRespondToWarrantyProposal = async (action: "accept" | "decline") => {
    if (!warrantyClaim?._id) return
    setWarrantyActionLoading(true)
    try {
      const data = await callWarrantyAction(`${warrantyClaim._id}/proposal-response`, { action })
      setWarrantyClaim(data.claim || null)
      toast.success(action === "accept" ? "Proposal accepted." : "Proposal declined and escalated.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to respond to proposal")
    } finally {
      setWarrantyActionLoading(false)
    }
  }

  const handleMarkWarrantyResolved = async () => {
    if (!warrantyClaim?._id) return
    if (!warrantyResolutionSummary.trim()) {
      toast.error("Resolution summary is required.")
      return
    }
    setWarrantyActionLoading(true)
    try {
      const token = getAuthToken()
      let attachmentUrls: string[] = []
      let uploadedFiles: Array<{ url?: string; key?: string }> = []
      if (warrantyResolutionFiles.length > 0) {
        const formData = new FormData()
        warrantyResolutionFiles.forEach((file) => formData.append("files", file))
        const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/upload-evidence`, {
          method: "POST",
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        })
        const uploadPayload = await uploadResponse.json()
        if (!uploadResponse.ok || !uploadPayload.success) {
          throw new Error(uploadPayload.msg || "Failed to upload resolution attachments")
        }
        uploadedFiles = Array.isArray(uploadPayload.data?.files) ? uploadPayload.data.files : []
        attachmentUrls = uploadedFiles
          .map((file: { url?: string }) => file.url)
          .filter((url): url is string => Boolean(url))
      }
      let data
      try {
        data = await callWarrantyAction(`${warrantyClaim._id}/resolve`, {
          summary: warrantyResolutionSummary.trim(),
          attachments: attachmentUrls,
        })
      } catch (error) {
        if (uploadedFiles.length > 0) {
          try {
            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/upload-evidence`, {
              method: "DELETE",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                urls: uploadedFiles.map((file) => file.url).filter(Boolean),
                keys: uploadedFiles.map((file) => file.key).filter(Boolean),
              }),
            })
          } catch (cleanupError) {
            console.error("Failed to clean up warranty resolution attachments:", cleanupError)
          }
        }
        throw error
      }
      setWarrantyClaim(data.claim || null)
      setWarrantyResolutionSummary("")
      setWarrantyResolutionFiles([])
      toast.success("Claim marked as resolved.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark claim resolved")
    } finally {
      setWarrantyActionLoading(false)
    }
  }

  const handleConfirmWarrantyResolution = async () => {
    if (!warrantyClaim?._id) return
    setWarrantyActionLoading(true)
    try {
      const data = await callWarrantyAction(`${warrantyClaim._id}/confirm`)
      setWarrantyClaim(data.claim || null)
      toast.success("Warranty claim closed.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm resolution")
    } finally {
      setWarrantyActionLoading(false)
    }
  }

  const handleEscalateWarrantyClaim = async (reason = "Manual escalation requested") => {
    if (!warrantyClaim?._id) return
    setWarrantyActionLoading(true)
    try {
      const data = await callWarrantyAction(`${warrantyClaim._id}/escalate`, {
        reason,
      })
      setWarrantyClaim(data.claim || null)
      toast.success("Claim escalated to admin.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to escalate claim")
    } finally {
      setWarrantyActionLoading(false)
    }
  }

  const handleSubmitPostBookingAnswers = async () => {
    if (!booking || !bookingId) return
    if (uploadingPostBookingQuestionIndexes.size > 0) {
      toast.error("Please wait for all uploads to finish before submitting.")
      return
    }

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
        if (data.viewerRole) setViewerRole(data.viewerRole)
      }
    } catch {
      // Silently fail - the page already has stale data
    }
  }

  // ── New Quotation Flow Handlers ──

  const handleRespondToRFQ = async (action: 'accepted' | 'rejected') => {
    if (!bookingId) return
    if (action === 'rejected' && !rejectionReason.trim()) {
      toast.error("Please provide a rejection reason")
      return
    }

    setRespondingToRFQ(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/${bookingId}/respond-rfq`,
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ action, rejectionReason: action === 'rejected' ? rejectionReason : undefined }),
        }
      )
      const { data } = await parseResponseBody<{ success?: boolean; error?: { message?: string }; data?: Record<string, unknown> }>(response)

      if (response.ok && data?.success) {
        if (action === 'accepted') {
          toast.success("RFQ accepted! You can now create your quotation.")
          setShowQuotationWizard(true)
        } else {
          toast.success("RFQ rejected.")
          setRejectionReason('')
          setShowRejectionModal(false)
        }
        await refreshBooking()
      } else {
        toast.error(data?.error?.message || "Failed to respond to RFQ")
      }
    } catch (err) {
      console.error("Error responding to RFQ:", err)
      toast.error("Failed to respond to RFQ. Please try again.")
    } finally {
      setRespondingToRFQ(false)
    }
  }

  const handleRespondToQuotation = async (action: 'accepted' | 'rejected') => {
    if (!bookingId) return
    if (action === 'rejected' && !quoteRejectionReason.trim()) {
      toast.error("Please provide a reason for rejection")
      return
    }

    setRespondingToQuotation(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/${bookingId}/customer-respond`,
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            action,
            rejectionReason: action === 'rejected' ? quoteRejectionReason : undefined,
            pointsToRedeem: action === 'accepted' ? pointsToRedeem : undefined,
          }),
        }
      )
      const { data } = await parseResponseBody<{ success?: boolean; error?: { message?: string }; data?: { clientSecret?: string } }>(response)

      if (response.ok && data?.success) {
        if (action === 'accepted') {
          toast.success("Quotation accepted! Please select your start date and complete the booking.")
          router.push(`/bookings/${bookingId}/payment`)
        } else {
          toast.success("Quotation rejected. The professional will be notified.")
          setQuoteRejectionReason('')
          setShowQuoteRejectionModal(false)
          await refreshBooking()
        }
      } else {
        toast.error(data?.error?.message || "Failed to respond to quotation")
      }
    } catch (err) {
      console.error("Error responding to quotation:", err)
      toast.error("Failed to respond. Please try again.")
    } finally {
      setRespondingToQuotation(false)
    }
  }

  const handlePayMilestone = async (index: number) => {
    if (!bookingId) return
    setPayingMilestone(index)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/${bookingId}/milestones/${index}/payment-intent`,
        { method: "POST", headers, credentials: "include" }
      )
      const { data } = await parseResponseBody<{ success?: boolean; error?: { message?: string }; data?: { clientSecret?: string } }>(response)

      if (response.ok && data?.success) {
        router.push(`/bookings/${bookingId}/payment`)
      } else {
        toast.error(data?.error?.message || "Failed to create payment")
      }
    } catch (err) {
      console.error("Error paying milestone:", err)
      toast.error("Failed to initiate payment. Please try again.")
    } finally {
      setPayingMilestone(null)
    }
  }

  const handleMilestoneWorkStatus = async (index: number, action: "start" | "complete") => {
    if (!bookingId) return

    setUpdatingMilestoneIndexes(prev => new Set(prev).add(index))
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers.Authorization = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/${bookingId}/milestones/${index}/work-status`,
        {
          method: "PATCH",
          headers,
          credentials: "include",
          body: JSON.stringify({ action }),
        }
      )

      const { data } = await parseResponseBody<{ success?: boolean; error?: { message?: string } }>(response)

      if (response.ok && data?.success) {
        toast.success(action === "start" ? "Milestone started." : "Milestone completed.")
        await refreshBooking()
      } else {
        toast.error(data?.error?.message || "Failed to update milestone.")
      }
    } catch (err) {
      console.error("Error updating milestone:", err)
      toast.error("Failed to update milestone. Please try again.")
    } finally {
      setUpdatingMilestoneIndexes(prev => { const next = new Set(prev); next.delete(index); return next })
    }
  }

  // Helper: check if this booking uses new quotation system
  const hasQuotationVersions = (booking?.quoteVersions?.length || 0) > 0
  const currentVersion = hasQuotationVersions
    ? booking?.quoteVersions?.find(v => v.version === booking?.currentQuoteVersion)
    : null
  const rfqDeadlineDate = booking?.rfqDeadline ? new Date(booking.rfqDeadline) : null
  const rfqDeadlineRemaining = rfqDeadlineDate
    ? Math.max(0, Math.ceil((rfqDeadlineDate.getTime() - Date.now()) / (1000 * 60 * 60)))
    : null

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
          body: JSON.stringify({ action, pointsToRedeem: action === "accept" ? pointsToRedeem : undefined })
        }
      )

      const { data, rawText } = await parseResponseBody<{ success?: boolean; msg?: string }>(response)

      if (response.ok && data?.success) {
        if (action === "accept") {
          toast.success("Quote accepted! Please select your start date and proceed to payment.")
          router.push(`/bookings/${bookingId}/payment`)
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

  const handleProfessionalComplete = async () => {
    if (!bookingId) return

    const invalidExtraCost = completionExtraCosts.find((cost) => {
      if (!cost.justification.trim()) return true
      if ((cost.type === 'condition' || cost.type === 'option') && !hasSelectedReferenceIndex(cost.referenceIndex)) {
        return true
      }
      return false
    })

    if (invalidExtraCost) {
      toast.error(
        invalidExtraCost.type === 'condition'
          ? 'Select a project condition before confirming completion.'
          : invalidExtraCost.type === 'option'
            ? 'Select a project option before confirming completion.'
            : 'Each extra cost requires a justification.'
      )
      return
    }

    setSubmittingCompletion(true)
    try {
      const token = getAuthToken()
      const formData = new FormData()
      if (completionNotes) formData.append('notes', completionNotes)
      if (completionExtraCosts.length > 0) {
        formData.append('extraCosts', JSON.stringify(completionExtraCosts))
      }
      completionFiles.forEach(file => formData.append('attachments', file))

      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/professional-complete`,
        { method: "POST", headers, credentials: "include", body: formData }
      )
      const result = await response.json()
      if (response.ok && result.success) {
        toast.success("Completion confirmed. Awaiting customer confirmation.")
        setShowCompletionModal(false)
        setCompletionNotes("")
        setCompletionFiles([])
        setCompletionExtraCosts([])
        await refreshBooking()
      } else {
        toast.error(result.error?.message || "Failed to confirm completion")
      }
    } catch (err) {
      console.error("Failed to confirm completion:", err)
      toast.error("Failed to confirm completion. Please try again.")
    } finally {
      setSubmittingCompletion(false)
    }
  }

  const initializeExtraCostPayment = async () => {
    if (!bookingId) return false

    if (extraCostClientSecret) return true

    setLoadingExtraCostPayment(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers["Authorization"] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/extra-cost-payment-intent`,
        { method: "POST", headers, credentials: "include" }
      )
      const result = await response.json()

      if (response.ok && result.success && result.data?.clientSecret) {
        setExtraCostClientSecret(result.data.clientSecret)
        return true
      }

      toast.error(result.error?.message || "Failed to initialize extra cost payment")
      return false
    } catch (err) {
      console.error("Failed to initialize extra cost payment:", err)
      toast.error("Failed to initialize extra cost payment. Please try again.")
      return false
    } finally {
      setLoadingExtraCostPayment(false)
    }
  }

  const submitCustomerConfirmCompletion = async (skipPrompt = false) => {
    if (!bookingId) return false
    if (!skipPrompt && !confirm("Are you satisfied with the work and extra costs?\n\nThis will release the payment to the professional.")) return false

    setConfirmingCompletion(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/customer-confirm-completion`,
        { method: "POST", headers, credentials: "include" }
      )
      const result = await response.json()
      if (response.ok && result.success) {
        toast.success("Booking completed! Payment has been released.")
        setExtraCostClientSecret("")
        setExtraCostPaymentCompleted(false)
        await refreshBooking()
        return true
      }

      if (result.error?.code === "EXTRA_COST_NOT_PAID" && (booking?.extraCostTotal || 0) > 0) {
        const paymentReady = await initializeExtraCostPayment()
        if (paymentReady) {
          toast.info("Pay the extra costs below to complete the booking.")
        }
        return false
      }

      toast.error(result.error?.message || "Failed to confirm completion")
      return false
    } catch (err) {
      console.error("Failed to confirm completion:", err)
      toast.error("Failed to confirm completion. Please try again.")
      return false
    } finally {
      setConfirmingCompletion(false)
    }
  }

  const handleCustomerConfirmCompletion = async () => {
    await submitCustomerConfirmCompletion()
  }

  const handleExtraCostPaymentSuccess = async () => {
    setExtraCostPaymentCompleted(true)
    toast.success("Extra costs paid. Finalizing booking...")
    await submitCustomerConfirmCompletion(true)
  }

  const handleExtraCostPaymentError = (message: string) => {
    toast.error(message)
  }

  const handleCustomerDispute = async () => {
    if (!bookingId || !disputeReason) return
    setSubmittingDispute(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/dispute-extra-costs`,
        {
          method: "POST", headers, credentials: "include",
          body: JSON.stringify({ reason: disputeReason, description: disputeDescription })
        }
      )
      const result = await response.json()
      if (response.ok && result.success) {
        toast.success("Dispute raised. An admin will review your case.")
        setShowDisputeModal(false)
        setDisputeReason("")
        setDisputeDescription("")
        await refreshBooking()
      } else {
        toast.error(result.error?.message || "Failed to raise dispute")
      }
    } catch (err) {
      console.error("Failed to raise dispute:", err)
      toast.error("Failed to raise dispute. Please try again.")
    } finally {
      setSubmittingDispute(false)
    }
  }

  const addExtraCost = (type: 'unit_adjustment' | 'condition' | 'option' | 'other') => {
    let unitDefaults: { estimatedUnits: number; actualUnits: number; unitPrice: number } | null = null
    if (type === 'unit_adjustment') {
      const subprojects = booking?.project?.subprojects || []
      let subIdx: number
      if (typeof booking?.selectedSubprojectIndex === 'number') {
        subIdx = booking.selectedSubprojectIndex
      } else if (subprojects.length === 1) {
        subIdx = 0
      } else {
        toast.error('Cannot add a unit adjustment: no subproject is selected for this booking.')
        return
      }
      const sub = subprojects[subIdx]
      if (sub?.pricing?.type !== 'unit') {
        toast.error('Cannot add a unit adjustment: this subproject is not priced per unit.')
        return
      }
      const unitPrice = Number(sub?.pricing?.amount)
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        toast.error('Cannot add a unit adjustment: the unit price is not set.')
        return
      }

      const inputs = sub?.professionalInputs || []
      const priceModelToken = ((booking?.project as { priceModel?: string } | undefined)?.priceModel || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const quantityTokens = ['quantity', 'units', 'unit', 'amount', 'size', 'area', 'surface', 'length', 'width', 'height', 'volume', 'weight', 'pieces', 'count', 'hours', 'days', 'm2', 'm3']
      if (priceModelToken) quantityTokens.unshift(priceModelToken)

      const isNumericValue = (v: unknown) => {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) return true
        if (typeof v === 'object' && v != null && 'min' in v && 'max' in v) {
          const minVal = (v as { min: unknown }).min
          return Number.isFinite(Number(minVal))
        }
        return false
      }

      let quantityInput = inputs.find((p) => {
        const name = (p.fieldName || '').toLowerCase()
        return quantityTokens.some((t) => t && name.includes(t)) && isNumericValue(p.value)
      })
      if (!quantityInput) {
        quantityInput = inputs.find((p) => isNumericValue(p.value))
      }

      let estimatedUnits = 0
      if (quantityInput) {
        const rawValue: unknown = quantityInput.value
        if (typeof rawValue === 'object' && rawValue != null && 'min' in rawValue) {
          estimatedUnits = Number((rawValue as { min: unknown }).min)
        } else {
          estimatedUnits = Number(rawValue)
        }
      }
      if (!Number.isFinite(estimatedUnits) || estimatedUnits <= 0) {
        estimatedUnits = 0
      }

      unitDefaults = { estimatedUnits, actualUnits: estimatedUnits, unitPrice }
    }
    setCompletionExtraCosts(prev => [...prev, {
      type,
      name: type === 'unit_adjustment' ? 'Unit-based adjustment' : '',
      justification: '',
      amount: 0,
      ...(unitDefaults || {}),
      ...(type === 'condition' || type === 'option' ? { referenceIndex: UNSELECTED_REFERENCE_INDEX } : {}),
    }])
  }

  const updateExtraCost = (index: number, field: keyof CompletionExtraCost, value: string | number) => {
    setCompletionExtraCosts(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (updated[index].type === 'unit_adjustment' && (field === 'actualUnits' || field === 'estimatedUnits' || field === 'unitPrice')) {
        const diff = (updated[index].actualUnits || 0) - (updated[index].estimatedUnits || 0)
        updated[index].amount = diff * (updated[index].unitPrice || 0)
      }
      if (field === 'referenceIndex' && (updated[index].type === 'condition' || updated[index].type === 'option')) {
        const refIndex = typeof value === 'number' ? value : parseInt(String(value), 10)
        if (Number.isFinite(refIndex) && refIndex >= 0) {
          if (updated[index].type === 'condition') {
            const condition = booking?.project?.termsConditions?.[refIndex]
            const conditionCost = Number(condition?.additionalCost)
            updated[index].amount = Number.isFinite(conditionCost) && conditionCost >= 0 ? conditionCost : 0
            updated[index].name = condition?.name || updated[index].name
          } else {
            const option = booking?.project?.extraOptions?.[refIndex]
            const optionPrice = Number(option?.price)
            updated[index].amount = Number.isFinite(optionPrice) && optionPrice >= 0 ? optionPrice : 0
            updated[index].name = option?.name || updated[index].name
          }
        }
      }
      return updated
    })
  }

  const removeExtraCost = (index: number) => {
    setCompletionExtraCosts(prev => prev.filter((_, i) => i !== index))
  }

  useEffect(() => {
    setExtraCostClientSecret(booking?.payment?.extraCostClientSecret || "")
    if (booking?.status !== "professional_completed") {
      setExtraCostPaymentCompleted(false)
    }
  }, [booking?.payment?.extraCostClientSecret, booking?.status])

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
        <div className="max-w-4xl mx-auto pt-20 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-7 w-44" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          {/* Booking Info Card Skeleton */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 space-y-5">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5 rounded" />
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Payment Card Skeleton */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
            <Skeleton className="h-6 w-32" />
            {[1, 2, 3].map(i => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const allMilestonesCompleted = !booking?.milestonePayments?.length
    || booking.milestonePayments.every((milestone) => (milestone.workStatus || 'pending') === 'completed')
  const invalidCompletionExtraCosts = completionExtraCosts.some((cost) => {
    if (!cost.justification.trim()) return true
    if ((cost.type === 'condition' || cost.type === 'option') && !hasSelectedReferenceIndex(cost.referenceIndex)) {
      return true
    }
    return false
  })
  const projectConditions = (booking?.project?.termsConditions || [])
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => !item.type || item.type === 'condition')
  const projectOptions = booking?.project?.extraOptions || []

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
                      <p className="text-sm text-gray-600">Upload a file for this question</p>
                      <Input
                        id={`q${index}-field`}
                        type="file"
                        accept=".pdf,image/*"
                        disabled={uploadingPostBookingQuestionIndexes.has(index)}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          void handlePostBookingAttachmentUpload(index, file)
                          e.currentTarget.value = ""
                        }}
                        className="mt-2"
                        aria-invalid={hasError}
                        aria-describedby={errorId}
                        aria-required={question.isRequired}
                      />
                      {uploadingPostBookingQuestionIndexes.has(index) && (
                        <div className="mt-2 inline-flex items-center text-xs text-indigo-600">
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          Uploading...
                        </div>
                      )}
                      {postBookingAnswers[index] && isHttpUrl(postBookingAnswers[index]) ? (
                        <a
                          href={postBookingAnswers[index]}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-2 inline-flex text-sm text-indigo-600 hover:underline"
                        >
                          {getFileLabel(postBookingAnswers[index])}
                        </a>
                      ) : postBookingAnswers[index] ? (
                        <span className="mt-2 inline-flex text-sm text-gray-700">
                          {getFileLabel(postBookingAnswers[index])}
                        </span>
                      ) : null}
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
                          booking.professional?.username ||
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

                {/* Professional: RFQ Response (new flow) - Accept/Reject/Chat */}
                {user?.role === "professional" && booking.status === "rfq" && (
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4">
                    {!showQuoteForm && !showQuotationWizard ? (
                      <div className="space-y-3">
                        <div>
                          <h3 className="text-sm font-semibold text-purple-900 mb-1">
                            Request for Quote Received
                          </h3>
                          <p className="text-xs text-purple-700">
                            Review the customer&apos;s requirements. Accept to start preparing a detailed quotation, or chat for more information.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => handleRespondToRFQ('accepted')}
                            disabled={respondingToRFQ}
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                            size="sm"
                          >
                            {respondingToRFQ ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                            Accept & Create Quotation
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const customerId = booking.customer?._id
                              if (customerId) {
                                try {
                                  const conversation = await createOrGetConversation({ customerId })
                                  router.push(`/chat?conversationId=${conversation._id}`)
                                } catch (error) {
                                  console.error("Failed to open chat:", error)
                                  toast.info("Unable to open the conversation right now")
                                }
                              } else {
                                toast.info("Customer information not available")
                              }
                            }}
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Chat for More Info
                          </Button>
                          <Button
                            onClick={() => setShowRejectionModal(true)}
                            disabled={respondingToRFQ}
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50"
                            size="sm"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject
                          </Button>
                        </div>

                        {/* Fallback: Legacy simple quote form */}
                        <div className="pt-2 border-t border-purple-200">
                          <button
                            onClick={() => setShowQuoteForm(true)}
                            className="text-xs text-purple-600 hover:text-purple-800 underline"
                          >
                            Or submit a simple quote instead
                          </button>
                        </div>
                      </div>
                    ) : showQuoteForm ? (
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-purple-900">Submit Simple Quote</h3>
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
                            <Button onClick={handleSubmitQuote} disabled={submittingQuote} className="bg-purple-600 hover:bg-purple-700 text-white" size="sm">
                              {submittingQuote ? "Submitting..." : "Submit Quote"}
                            </Button>
                            <Button onClick={() => setShowQuoteForm(false)} variant="outline" size="sm" disabled={submittingQuote}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Professional: RFQ Accepted - Show QuotationWizard with deadline */}
                {user?.role === "professional" && booking.status === "rfq_accepted" && (
                  <div className="space-y-4">
                    {/* Deadline countdown */}
                    {rfqDeadlineRemaining !== null && (
                      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                          <div>
                            <h3 className="text-sm font-semibold text-amber-900">
                              {rfqDeadlineRemaining > 0
                                ? `${rfqDeadlineRemaining} hour${rfqDeadlineRemaining !== 1 ? 's' : ''} remaining to submit quotation`
                                : 'Deadline has passed!'}
                            </h3>
                            <p className="text-xs text-amber-700">
                              Deadline: {rfqDeadlineDate?.toLocaleDateString()} {rfqDeadlineDate?.toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    {showQuotationWizard ? (
                      <QuotationWizard
                        bookingId={bookingId!}
                        commissionPercent={commissionPercent ?? undefined}
                        onSuccess={async () => { setShowQuotationWizard(false); await refreshBooking() }}
                        onCancel={() => setShowQuotationWizard(false)}
                      />
                    ) : (
                      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-semibold text-purple-900 mb-1">Create Your Quotation</h3>
                            <p className="text-xs text-purple-700">Fill out the detailed quotation wizard with scope, pricing, milestones, and timeline.</p>
                          </div>
                          <Button onClick={() => setShowQuotationWizard(true)} className="bg-purple-600 hover:bg-purple-700 text-white shrink-0" size="sm">
                            <FileText className="h-4 w-4 mr-2" />
                            Open Wizard
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Professional: Draft Quote - Show QuotationWizard (direct quotation entry) */}
                {user?.role === "professional" && booking.status === "draft_quote" && (
                  showQuotationWizard ? (
                    <QuotationWizard
                      bookingId={bookingId!}
                      commissionPercent={commissionPercent ?? undefined}
                      onSuccess={async () => { setShowQuotationWizard(false); await refreshBooking() }}
                      onCancel={() => setShowQuotationWizard(false)}
                    />
                  ) : (
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-semibold text-purple-900 mb-1">Direct Quotation Draft</h3>
                          <p className="text-xs text-purple-700">Complete the quotation wizard to send this quote to the customer.</p>
                        </div>
                        <Button onClick={() => setShowQuotationWizard(true)} className="bg-purple-600 hover:bg-purple-700 text-white shrink-0" size="sm">
                          <FileText className="h-4 w-4 mr-2" />
                          Create Quotation
                        </Button>
                      </div>
                    </div>
                  )
                )}

                {/* Customer: New Quotation Display (when quoteVersions exist) */}
                {user?.role === "customer" && booking.status === "quoted" && hasQuotationVersions && currentVersion && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-green-900">Quotation Received</h3>
                      {booking.quotationNumber && (
                        <Badge variant="outline" className="text-xs">{booking.quotationNumber}</Badge>
                      )}
                    </div>

                    <div className="bg-white rounded-lg p-4 space-y-3">
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Scope</p>
                        <p className="text-sm text-gray-900">{currentVersion.scope}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Description</p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{currentVersion.description}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Warranty</p>
                          <p className="text-sm">{currentVersion.warrantyDuration.value} {currentVersion.warrantyDuration.unit}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Materials</p>
                          <p className="text-sm">{currentVersion.materialsIncluded ? 'Included' : 'Not included'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Prep Time</p>
                          <p className="text-sm">{currentVersion.preparationDuration.value} {currentVersion.preparationDuration.unit}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Execution Time</p>
                          <p className="text-sm">{currentVersion.executionDuration.value} {currentVersion.executionDuration.unit}</p>
                        </div>
                      </div>
                      {currentVersion.materialsIncluded && currentVersion.materials && currentVersion.materials.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">Materials List</p>
                          <ul className="text-sm space-y-0.5">
                            {currentVersion.materials.map((m, i) => (
                              <li key={i} className="text-gray-700">
                                {m.name}{m.quantity ? ` x${m.quantity}` : ''}{m.unit ? ` ${m.unit}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {/* Milestones */}
                      {currentVersion.milestones && currentVersion.milestones.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">Payment Milestones</p>
                          <div className="space-y-1.5">
                            {currentVersion.milestones.map((ms, i) => (
                              <div key={i} className="flex justify-between items-center text-sm bg-gray-50 rounded px-2 py-1">
                                <span className="text-gray-700">{ms.title}</span>
                                <span className="font-medium">{booking.quote?.currency || 'EUR'} {customerPrice(ms.amount).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-sm font-semibold text-gray-900">Total</span>
                        <span className="text-2xl font-bold text-green-600">{booking.quote?.currency || 'EUR'} {customerPrice(currentVersion.totalAmount).toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Valid until: {formatValidUntilLabel(currentVersion?.validUntil)}
                      </p>
                    </div>

                    {/* Version history accordion */}
                    {(booking.quoteVersions?.length || 0) > 1 && (
                      <div className="border rounded-lg">
                        <button
                          onClick={() => setVersionHistoryOpen(!versionHistoryOpen)}
                          className="flex items-center justify-between w-full p-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <span>Version History ({booking.quoteVersions?.length} versions)</span>
                          {versionHistoryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {versionHistoryOpen && (
                          <div className="border-t p-3 space-y-2">
                            {booking.quoteVersions?.map((v, i) => (
                              <div key={i} className={`p-2 rounded text-sm ${v.version === booking.currentQuoteVersion ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">v{v.version}</span>
                                  <span className="text-xs text-gray-500">{new Date(v.createdAt).toLocaleDateString()}</span>
                                </div>
                                <p className="text-xs text-gray-600">{booking.quote?.currency || 'EUR'} {customerPrice(v.totalAmount).toFixed(2)}</p>
                                {v.changeNote && <p className="text-xs text-gray-500 italic mt-1">{v.changeNote}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-3">
                      <Button
                        onClick={() => handleRespondToQuotation('accepted')}
                        disabled={respondingToQuotation}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                      >
                        {respondingToQuotation ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                        Accept & Pay
                      </Button>
                      <Button
                        onClick={() => setShowQuoteRejectionModal(true)}
                        disabled={respondingToQuotation}
                        variant="outline"
                        className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                        size="sm"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject with Reason
                      </Button>
                    </div>
                  </div>
                )}

                {/* Professional: View submitted quotation (read-only) + Edit button */}
                {user?.role === "professional" && booking.status === "quoted" && hasQuotationVersions && currentVersion && !showQuotationWizard && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-blue-900">Your Quotation (v{currentVersion.version})</h3>
                      <Button onClick={() => setShowQuotationWizard(true)} variant="outline" size="sm">
                        <FileText className="h-4 w-4 mr-2" />
                        Edit Quotation
                      </Button>
                    </div>
                    <div className="bg-white rounded-lg p-3 space-y-2 text-sm">
                      <p><span className="text-gray-500">Scope:</span> {currentVersion.scope}</p>
                      <p><span className="text-gray-500">Total:</span> <strong>{booking.quote?.currency || 'EUR'} {currentVersion.totalAmount.toFixed(2)}</strong></p>
                      <p><span className="text-gray-500">Valid until:</span> {formatValidUntilLabel(currentVersion?.validUntil)}</p>
                      <p className="text-xs text-gray-500">Waiting for customer response...</p>
                    </div>
                  </div>
                )}

                {/* Professional editing quotation inline */}
                {user?.role === "professional" && booking.status === "quoted" && showQuotationWizard && (
                  <QuotationWizard
                    bookingId={bookingId!}
                    existingVersion={currentVersion || undefined}
                    isEditing
                    commissionPercent={commissionPercent ?? undefined}
                    onSuccess={async () => { setShowQuotationWizard(false); await refreshBooking() }}
                    onCancel={() => setShowQuotationWizard(false)}
                  />
                )}

                {/* Professional: Quote Rejected - Show reason + Revise button */}
                {user?.role === "professional" && booking.status === "quote_rejected" && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-rose-50 to-red-50 border border-rose-200 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-rose-900 mb-2">Quotation Rejected by Customer</h3>
                      {booking.customerRejectionReason && (
                        <div className="bg-white rounded-lg p-3 mb-3">
                          <p className="text-xs text-gray-500 mb-1">Customer&apos;s feedback:</p>
                          <p className="text-sm text-gray-800">{booking.customerRejectionReason}</p>
                        </div>
                      )}
                      {!showQuotationWizard && (
                        <Button onClick={() => setShowQuotationWizard(true)} className="bg-purple-600 hover:bg-purple-700 text-white" size="sm">
                          <FileText className="h-4 w-4 mr-2" />
                          Revise & Resubmit
                        </Button>
                      )}
                    </div>
                    {showQuotationWizard && (
                      <QuotationWizard
                        bookingId={bookingId!}
                        existingVersion={currentVersion || undefined}
                        isEditing
                        commissionPercent={commissionPercent ?? undefined}
                        onSuccess={async () => { setShowQuotationWizard(false); await refreshBooking() }}
                        onCancel={() => setShowQuotationWizard(false)}
                      />
                    )}
                  </div>
                )}

                {/* Milestone Tracker (when booking has milestonePayments and is booked/in_progress) */}
                {booking.milestonePayments && booking.milestonePayments.length > 0 && ['booked', 'in_progress', 'professional_completed', 'completed'].includes(booking.status) && (
                  <div className="bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-sky-900 mb-3">Milestones</h3>
                    {(() => {
                      const total = booking.milestonePayments!.reduce((s, m) => s + m.amount, 0)
                      const paid = booking.milestonePayments!.filter(m => m.status === 'paid').reduce((s, m) => s + m.amount, 0)
                      const completed = booking.milestonePayments!.filter(m => (m.workStatus || 'pending') === 'completed').reduce((s, m) => s + m.amount, 0)
                      const paymentPct = total > 0 ? Math.round((paid / total) * 100) : 0
                      const workPct = total > 0 ? Math.round((completed / total) * 100) : 0
                      return (
                        <div className="mb-4 space-y-3">
                          <div>
                            <div className="flex justify-between text-xs text-gray-600 mb-1">
                              <span>Work progress</span>
                              <span>{workPct}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${workPct}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-xs text-gray-600 mb-1">
                              <span>Payment progress</span>
                              <span>{paymentPct}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div className="bg-sky-500 h-2 rounded-full transition-all" style={{ width: `${paymentPct}%` }} />
                            </div>
                          </div>
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>{booking.quote?.currency || 'EUR'} {customerPrice(completed).toFixed(2)} completed</span>
                            <span>{booking.quote?.currency || 'EUR'} {customerPrice(paid).toFixed(2)} paid</span>
                          </div>
                        </div>
                      )
                    })()}
                    <div className="space-y-2">
                      {booking.milestonePayments.map((ms, i) => {
                        const isPaid = ms.status === 'paid'
                        const workStatus = ms.workStatus || 'pending'
                        const prevPaid = booking.milestonePayments!.slice(0, i).every(m => m.status === 'paid')
                        const prevCompleted = booking.milestonePayments!.slice(0, i).every(m => (m.workStatus || 'pending') === 'completed')
                        const dueCondition = ms.dueCondition
                        const isDueNow = (() => {
                          if (dueCondition === 'on_start') return true
                          if (dueCondition === 'on_milestone_start') return workStatus === 'in_progress' || workStatus === 'completed'
                          if (dueCondition === 'on_milestone_completion') return workStatus === 'completed'
                          if (dueCondition === 'custom_date') {
                            if (workStatus === 'completed') return true
                            return !!ms.customDueDate && new Date(ms.customDueDate) <= new Date()
                          }
                          return true
                        })()
                        const dueLabel = (() => {
                          if (dueCondition === 'on_start') return 'Due on project start'
                          if (dueCondition === 'on_milestone_start') return 'Due when milestone starts'
                          if (dueCondition === 'on_milestone_completion') return 'Due on milestone completion'
                          if (dueCondition === 'custom_date' && ms.customDueDate) return `Due ${new Date(ms.customDueDate).toLocaleDateString()}`
                          return null
                        })()
                        const canPay = !isPaid && prevPaid && isDueNow && user?.role === 'customer'
                        const canStart = user?.role === 'professional'
                          && workStatus === 'pending'
                          && prevCompleted
                          && booking.status !== 'professional_completed'
                          && booking.status !== 'completed'
                        const canComplete = user?.role === 'professional'
                          && workStatus === 'in_progress'
                          && booking.status !== 'professional_completed'
                          && booking.status !== 'completed'

                        return (
                          <div key={i} className={`rounded border p-3 ${isPaid ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2">
                                {workStatus === 'completed' ? (
                                  <CheckCircle className="h-4 w-4 mt-0.5 text-emerald-500" />
                                ) : workStatus === 'in_progress' ? (
                                  <Play className="h-4 w-4 mt-0.5 text-amber-500" />
                                ) : (
                                  <Clock className="h-4 w-4 mt-0.5 text-gray-400" />
                                )}
                                <div>
                                  <p className="text-sm font-medium">{ms.title}</p>
                                  <p className="text-xs text-gray-500">{booking.quote?.currency || 'EUR'} {customerPrice(ms.amount).toFixed(2)}</p>
                                  {dueLabel && !isPaid && (
                                    <p className="text-[11px] text-sky-700">{dueLabel}</p>
                                  )}
                                  {ms.startedAt && (
                                    <p className="text-[11px] text-gray-500">Started: {new Date(ms.startedAt).toLocaleDateString()}</p>
                                  )}
                                  {ms.completedAt && (
                                    <p className="text-[11px] text-gray-500">Completed: {new Date(ms.completedAt).toLocaleDateString()}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <Badge className={
                                  workStatus === 'completed'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : workStatus === 'in_progress'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-700'
                                }>
                                  {workStatus === 'completed' ? 'Completed' : workStatus === 'in_progress' ? 'In Progress' : 'Not Started'}
                                </Badge>
                                <Badge className={isPaid ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}>
                                  {isPaid ? 'Paid' : 'Unpaid'}
                                </Badge>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {canStart && (
                                <Button
                                  onClick={() => handleMilestoneWorkStatus(i, 'start')}
                                  disabled={updatingMilestoneIndexes.has(i)}
                                  size="sm"
                                  variant="outline"
                                >
                                  {updatingMilestoneIndexes.has(i) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                                  Start
                                </Button>
                              )}
                              {canComplete && (
                                <Button
                                  onClick={() => handleMilestoneWorkStatus(i, 'complete')}
                                  disabled={updatingMilestoneIndexes.has(i)}
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  {updatingMilestoneIndexes.has(i) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCheck className="h-4 w-4 mr-1" />}
                                  Mark Complete
                                </Button>
                              )}
                              {canPay && (
                                <Button
                                  onClick={() => handlePayMilestone(i)}
                                  disabled={payingMilestone === i}
                                  size="sm"
                                  className="bg-sky-600 hover:bg-sky-700 text-white"
                                >
                                  {payingMilestone === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1" />}
                                  Pay
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Customer: Legacy Quote Ready - Accept/Reject (backward compat: only when no quoteVersions) */}
                {user?.role === "customer" && booking.status === "quoted" && !hasQuotationVersions && booking.quote && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-green-900 mb-3">Quote Received</h3>
                    <div className="bg-white rounded-lg p-4 mb-4 space-y-2">
                      {/* Original quote amount */}
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Quote Amount:</span>
                        <span className={`text-2xl font-bold ${discountPreview && discountPreview.totalDiscount > 0 ? "text-gray-400 line-through text-lg" : "text-green-600"}`}>
                          {booking.quote.currency || "€"}{booking.quote.amount != null ? booking.quote.amount.toLocaleString() : "—"}
                        </span>
                      </div>

                      {/* Discount breakdown */}
                      {loadingDiscountPreview && (
                        <div className="flex items-center gap-2 text-xs text-gray-500 pt-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Checking available discounts...
                        </div>
                      )}

                      {discountPreview && discountPreview.totalDiscount > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-dashed border-green-200">
                          {discountPreview.loyaltyDiscount.amount > 0 && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-green-700 flex items-center gap-1">
                                <Shield className="h-3.5 w-3.5" />
                                {discountPreview.loyaltyDiscount.tier} Member Discount ({discountPreview.loyaltyDiscount.percentage}%)
                              </span>
                              <span className="text-green-600 font-medium">
                                -{booking.quote.currency || "€"}{discountPreview.loyaltyDiscount.amount.toLocaleString()}
                              </span>
                            </div>
                          )}
                          {discountPreview.repeatBuyerDiscount.amount > 0 && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-green-700 flex items-center gap-1">
                                <Star className="h-3.5 w-3.5" />
                                Returning Customer ({discountPreview.repeatBuyerDiscount.percentage}%)
                              </span>
                              <span className="text-green-600 font-medium">
                                -{booking.quote.currency || "€"}{discountPreview.repeatBuyerDiscount.amount.toLocaleString()}
                              </span>
                            </div>
                          )}
                          {discountPreview.pointsDiscount && discountPreview.pointsDiscount.discountAmount > 0 && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-green-700 flex items-center gap-1">
                                <Gift className="h-3.5 w-3.5" />
                                Points Redeemed ({discountPreview.pointsDiscount.pointsUsed} pts)
                              </span>
                              <span className="text-green-600 font-medium">
                                -{booking.quote.currency || "€"}{discountPreview.pointsDiscount.discountAmount.toLocaleString()}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-2 border-t border-green-200">
                            <span className="text-sm font-semibold text-green-900">You Pay:</span>
                            <span className="text-2xl font-bold text-green-600">
                              {booking.quote.currency || "€"}{discountPreview.finalAmount.toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-green-600 text-right">
                            You save {booking.quote.currency || "€"}{discountPreview.totalDiscount.toLocaleString()}!
                          </p>
                        </div>
                      )}

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

                    {loadingDiscountPreview && (
                      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <p className="text-xs text-blue-700">Calculating your member savings...</p>
                      </div>
                    )}

                    {discountPreview && (
                      <div className="mb-4 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-amber-900">
                            {discountPreview.loyaltyDiscount.tier} Member Benefits
                          </p>
                          <Badge variant="outline" className="border-amber-300 bg-white text-amber-800">
                            {discountPreview.loyaltyDiscount.tier}
                          </Badge>
                        </div>

                        <div className="mt-3 space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-700">Original quote</span>
                            <span className="font-medium text-gray-900">
                              {formatMoney(discountPreview.originalAmount, discountPreview.currency)}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-gray-700">
                              Loyalty discount ({discountPreview.loyaltyDiscount.percentage}%)
                            </span>
                            <span className="font-medium text-green-700">
                              -{formatMoney(discountPreview.loyaltyDiscount.amount, discountPreview.currency)}
                            </span>
                          </div>

                          {discountPreview.repeatBuyerDiscount.amount > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-700">
                                Returning customer discount ({discountPreview.repeatBuyerDiscount.percentage}%)
                              </span>
                              <span className="font-medium text-green-700">
                                -{formatMoney(discountPreview.repeatBuyerDiscount.amount, discountPreview.currency)}
                              </span>
                            </div>
                          )}

                          {discountPreview.pointsDiscount && discountPreview.pointsDiscount.discountAmount > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-700">
                                Points redeemed ({discountPreview.pointsDiscount.pointsUsed} pts)
                              </span>
                              <span className="font-medium text-green-700">
                                -{formatMoney(discountPreview.pointsDiscount.discountAmount, discountPreview.currency)}
                              </span>
                            </div>
                          )}

                          <div className="flex justify-between border-t border-amber-200 pt-2">
                            <span className="font-semibold text-gray-900">You save</span>
                            <span className="font-semibold text-green-700">
                              {formatMoney(discountPreview.totalDiscount, discountPreview.currency)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-semibold text-gray-900">You pay</span>
                            <span className="text-base font-bold text-blue-700">
                              {formatMoney(discountPreview.finalAmount, discountPreview.currency)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Points Redemption */}
                    {discountPreview && (discountPreview.availablePoints ?? 0) > 0 && (() => {
                      const conversionRate = discountPreview.pointsDiscount?.conversionRate ?? 1
                      const payableAmount = discountPreview.finalAmount ?? booking.quote?.amount ?? 0
                      const maxPointsByBalance = discountPreview.availablePoints ?? 0
                      const maxPointsByPayable = conversionRate > 0 ? Math.ceil(payableAmount / conversionRate) : maxPointsByBalance
                      const maxRedeem = Math.min(maxPointsByBalance, maxPointsByPayable)
                      const pointsEuroValue = ((discountPreview.availablePoints ?? 0) * conversionRate).toFixed(2)
                      return (
                      <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3">
                        <p className="text-sm font-medium text-purple-900 mb-2 flex items-center gap-1">
                          <Gift className="h-4 w-4" />
                          Use Your Points
                        </p>
                        <p className="text-xs text-purple-700 mb-2">
                          You have {discountPreview.availablePoints} points available (&euro;{pointsEuroValue})
                          {discountPreview.pointsExpiry && (
                            <span> &middot; Expires {new Date(discountPreview.pointsExpiry).toLocaleDateString()}</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            max={maxRedeem}
                            value={pointsToRedeem || ''}
                            onChange={(e) => setPointsToRedeem(Math.min(Number(e.target.value) || 0, maxRedeem))}
                            placeholder="0"
                            className="w-24 bg-white text-sm"
                          />
                          <span className="text-xs text-purple-700">points to redeem</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-auto text-xs border-purple-300"
                            onClick={() => setPointsToRedeem(maxRedeem)}
                          >
                            Use All
                          </Button>
                        </div>
                      </div>
                      )
                    })()}

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
                {user?.role === "professional" && booking.status === "booked" && !(booking.milestonePayments && booking.milestonePayments.length > 0) && (
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

                {/* Professional: Confirm Completion (when status is in_progress) */}
                {user?.role === "professional" && booking.status === "in_progress" && allMilestonesCompleted && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-green-900 mb-1">
                          Ready to confirm completion?
                        </h3>
                        <p className="text-xs text-green-700 mb-2">
                          Once you confirm completion, you can attach certificates/photos and declare any extra costs. The customer will then review and confirm.
                        </p>
                      </div>
                      <Button
                        onClick={() => setShowCompletionModal(true)}
                        className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                        size="sm"
                      >
                        <CheckCheck className="h-4 w-4 mr-2" />
                        Confirm Completion
                      </Button>
                    </div>
                  </div>
                )}

                {/* Professional: Waiting for customer after professional confirmed */}
                {user?.role === "professional" && booking.status === "professional_completed" && (
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-amber-900 mb-1">
                          Awaiting customer confirmation
                        </h3>
                        <p className="text-xs text-amber-700 mb-2">
                          You have confirmed completion. The customer is reviewing the work{booking.extraCostTotal ? ` and extra costs (${booking.payment?.currency || 'EUR'} ${booking.extraCostTotal.toFixed(2)})` : ''}.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Customer: Work In Progress - waiting for professional to confirm */}
                {user?.role === "customer" && booking.status === "in_progress" && (
                  <div className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-lg p-4">
                    <div className="flex items-start gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-teal-900 mb-1">
                          Work In Progress
                        </h3>
                        <p className="text-xs text-teal-700 mb-2">
                          The professional is currently working on your request. They will confirm completion when done.
                        </p>
                        <p className="text-xs text-teal-600 font-medium">
                          Payment is held in escrow until the work is completed and confirmed.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Customer: Review & Confirm Completion (when professional has confirmed) */}
                {user?.role === "customer" && booking.status === "professional_completed" && (
                  <div className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-lg p-4 space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-teal-900 mb-1">
                        Professional has completed the work
                      </h3>
                      <p className="text-xs text-teal-700">
                        Review the completion details below and confirm to release payment.
                      </p>
                    </div>

                    {booking.completionAttestation?.notes && (
                      <div className="bg-white/60 rounded p-2">
                        <p className="text-xs font-medium text-gray-700 mb-1">Professional&apos;s notes:</p>
                        <p className="text-xs text-gray-600">{booking.completionAttestation.notes}</p>
                      </div>
                    )}

                    {booking.completionAttestation?.attachments && booking.completionAttestation.attachments.length > 0 && (
                      <div className="bg-white/60 rounded p-2">
                        <p className="text-xs font-medium text-gray-700 mb-1">Attachments ({booking.completionAttestation.attachments.length}):</p>
                        <div className="flex flex-wrap gap-1">
                          {booking.completionAttestation.attachments.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                              Attachment {i + 1}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {booking.extraCosts && booking.extraCosts.length > 0 && (
                      <div className="bg-white/60 rounded p-2 space-y-2">
                        <p className="text-xs font-semibold text-gray-700">Extra Costs:</p>
                        {booking.extraCosts.map((cost, i) => {
                          const displayAmount = user?.role === "customer" ? customerPrice(cost.amount) : cost.amount
                          return (
                            <div key={i} className="border-b border-gray-100 pb-1.5 last:border-0">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-medium text-gray-800">{cost.name}</span>
                                <span className={`text-xs font-semibold ${displayAmount >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {displayAmount >= 0 ? '+' : ''}{booking.payment?.currency || 'EUR'} {displayAmount.toFixed(2)}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                <span className="capitalize">{cost.type.replace('_', ' ')}</span>
                                {cost.type === 'unit_adjustment' && ` (estimated: ${cost.estimatedUnits}, actual: ${cost.actualUnits})`}
                              </p>
                              <p className="text-xs text-gray-500 italic">{cost.justification}</p>
                            </div>
                          )
                        })}
                        <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                          <span className="text-xs font-semibold text-gray-800">Total Extra Costs</span>
                          <span className={`text-sm font-bold ${(booking.extraCostTotal || 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {(booking.extraCostTotal || 0) >= 0 ? '+' : ''}{booking.payment?.currency || 'EUR'} {(user?.role === "customer" ? customerPrice(booking.extraCostTotal || 0) : (booking.extraCostTotal || 0)).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}

                    {Array.isArray(booking.milestonePayments) && booking.milestonePayments.length > 0 && booking.milestonePayments.some(m => m.status !== 'paid') && (
                      <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                        One or more milestone payments are still outstanding. Pay the remaining milestones above before confirming completion.
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button
                        onClick={handleCustomerConfirmCompletion}
                        disabled={
                          confirmingCompletion
                          || loadingExtraCostPayment
                          || (Array.isArray(booking.milestonePayments) && booking.milestonePayments.some(m => m.status !== 'paid'))
                        }
                        className="bg-teal-600 hover:bg-teal-700 text-white"
                        size="sm"
                      >
                        {confirmingCompletion || loadingExtraCostPayment ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
                        ) : (
                          <><CheckCheck className="h-4 w-4 mr-2" />{booking.extraCostTotal && booking.extraCostTotal > 0 ? 'Review Payment & Complete' : 'Confirm Completion'}</>
                        )}
                      </Button>
                      <Button
                        onClick={() => setShowDisputeModal(true)}
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                        size="sm"
                      >
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Dispute
                      </Button>
                    </div>

                    {(booking.extraCostTotal || 0) > 0 && extraCostClientSecret && (
                      <div className="rounded-lg border border-teal-200 bg-white/80 p-3 space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-teal-900">Pay extra costs before final confirmation</p>
                          <p className="text-xs text-teal-700">
                            Once this payment succeeds, the booking will be finalized automatically.
                          </p>
                        </div>
                        {extraCostPaymentCompleted && (
                          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                            Extra cost payment succeeded. Finalizing the booking now. If the page does not refresh, use the confirm button again.
                          </div>
                        )}
                        <StripeProvider>
                          <PaymentForm
                            clientSecret={extraCostClientSecret}
                            amount={booking.extraCostTotal || 0}
                            currency={booking.payment?.currency || "EUR"}
                            onSuccess={handleExtraCostPaymentSuccess}
                            onError={handleExtraCostPaymentError}
                          />
                        </StripeProvider>
                      </div>
                    )}
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

                {booking.status === "completed" && (
                  <div className="bg-white border border-indigo-100 rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-indigo-900">Warranty</h3>
                        {!hasWarrantyCoverage && (
                          <p className="text-xs text-gray-600 mt-1">
                            This booking has no warranty coverage.
                          </p>
                        )}
                        {hasWarrantyCoverage && (
                          <p className="text-xs text-gray-600 mt-1">
                            Coverage: {booking.warrantyCoverage?.duration?.value} {booking.warrantyCoverage?.duration?.unit}
                            {warrantyEndsAtDate && (
                              <> · Expires on {warrantyEndsAtDate.toLocaleDateString()}</>
                            )}
                          </p>
                        )}
                      </div>
                      {user?.role === "customer" && hasWarrantyCoverage && (
                        <Button
                          size="sm"
                          disabled={!canOpenWarrantyClaim}
                          title={
                            hasActiveWarrantyClaim
                              ? "An active claim already exists"
                              : isWarrantyExpired
                              ? "Warranty period expired"
                              : undefined
                          }
                          onClick={() => setShowWarrantyClaimDialog(true)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          Open Warranty Claim
                        </Button>
                      )}
                    </div>

                    {loadingWarrantyClaim && (
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading warranty claim...
                      </div>
                    )}

                    {warrantyClaim && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-gray-800">
                              {warrantyClaim.claimNumber}
                            </p>
                            <p className="text-xs text-gray-500">
                              Reason: {warrantyReasonLabels[warrantyClaim.reason] || warrantyClaim.reason}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs bg-white">
                            {warrantyStatusLabels[warrantyClaim.status] || warrantyClaim.status}
                          </Badge>
                        </div>

                        <p className="text-xs text-gray-700 whitespace-pre-line">
                          {warrantyClaim.description}
                        </p>

                        {Array.isArray(warrantyClaim.evidence) && warrantyClaim.evidence.length > 0 && (
                          <div className="text-xs">
                            <p className="font-medium text-gray-600 mb-1">Evidence</p>
                            <div className="flex flex-wrap gap-2">
                              {warrantyClaim.evidence.map((url, idx) => (
                                <a
                                  key={`${url}-${idx}`}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline text-indigo-600"
                                >
                                  File {idx + 1}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {warrantyClaim.proposal?.message && (
                          <div className="rounded border bg-white p-2">
                            <p className="text-xs font-medium text-gray-700 mb-1">Resolve Proposal</p>
                            <p className="text-xs text-gray-700 whitespace-pre-line">{warrantyClaim.proposal.message}</p>
                            {(warrantyClaim.proposal.resolveByDate || warrantyClaim.proposal.proposedScheduleAt) && (
                              <p className="mt-1 text-[11px] text-gray-500">
                                Resolve date: {new Date(warrantyClaim.proposal.resolveByDate || warrantyClaim.proposal.proposedScheduleAt || "").toLocaleString()}
                              </p>
                            )}
                          </div>
                        )}

                        {warrantyClaim.escalation && (
                          <div className="rounded border border-amber-200 bg-amber-50 p-2">
                            <p className="text-xs font-medium text-amber-800">Escalated to Admin</p>
                            <p className="text-xs text-amber-700">
                              {warrantyClaim.escalation.reason}
                              {warrantyClaim.escalation.note ? ` · ${warrantyClaim.escalation.note}` : ""}
                            </p>
                          </div>
                        )}

                        {warrantyClaim.resolution?.summary && (
                          <div className="rounded border border-green-200 bg-green-50 p-2">
                            <p className="text-xs font-medium text-green-800">Resolution</p>
                            <p className="text-xs text-green-700 whitespace-pre-line">{warrantyClaim.resolution.summary}</p>
                            {Array.isArray(warrantyClaim.resolution.attachments) && warrantyClaim.resolution.attachments.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {warrantyClaim.resolution.attachments.map((attachment, index) => (
                                  <a
                                    key={`${attachment}-${index}`}
                                    href={attachment}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="block text-[11px] text-green-700 hover:underline"
                                  >
                                    {getFileLabel(attachment, `Resolution attachment ${index + 1}`)}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {user?.role === "professional" && warrantyClaim.status === "open" && (
                          <div className="space-y-2 rounded border bg-white p-3">
                            <Label className="text-xs">Resolve Proposal</Label>
                            <Textarea
                              value={warrantyProposalMessage}
                              onChange={(e) => setWarrantyProposalMessage(e.target.value)}
                              placeholder="Describe your solution and repair plan..."
                              className="text-xs min-h-[90px]"
                            />
                            <Label className="text-xs">Resolve Date</Label>
                            <Input
                              type="datetime-local"
                              value={warrantyProposalSchedule}
                              onChange={(e) => setWarrantyProposalSchedule(e.target.value)}
                              className="text-xs"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={handleSubmitWarrantyProposal}
                                disabled={warrantyActionLoading}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                              >
                                {warrantyActionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                                Send Resolve Proposal
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowDeclineReasonDialog(true)}
                                disabled={warrantyActionLoading}
                                className="border-rose-300 text-rose-700"
                              >
                                Decline Claim
                              </Button>
                            </div>
                          </div>
                        )}

                        {user?.role === "customer" && warrantyClaim.status === "proposal_sent" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleRespondToWarrantyProposal("accept")}
                              disabled={warrantyActionLoading}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              Accept Proposal
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRespondToWarrantyProposal("decline")}
                              disabled={warrantyActionLoading}
                              className="border-rose-300 text-rose-700"
                            >
                              Decline & Escalate
                            </Button>
                          </div>
                        )}

                        {user?.role === "professional" && warrantyClaim.status === "proposal_accepted" && (
                          <div className="space-y-2 rounded border bg-white p-3">
                            <Label className="text-xs">Resolution Summary</Label>
                            <Textarea
                              value={warrantyResolutionSummary}
                              onChange={(e) => setWarrantyResolutionSummary(e.target.value)}
                              placeholder="Summarize what was fixed..."
                              className="text-xs min-h-[80px]"
                            />
                            <div className="space-y-2">
                              <Label className="text-xs">Resolution Attachments</Label>
                              <Input
                                type="file"
                                multiple
                                accept="image/*,video/*,.pdf"
                                onChange={(e) => {
                                  const { valid, rejected } = validateWarrantyFiles(e.target.files)
                                  setWarrantyResolutionFiles(valid)
                                  if (rejected.length > 0) {
                                    toast.error(rejected.join('; '))
                                  }
                                }}
                                className="text-xs"
                              />
                              {warrantyResolutionFiles.length > 0 && (
                                <p className="text-[11px] text-gray-500">{warrantyResolutionFiles.length} file(s) selected</p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              onClick={handleMarkWarrantyResolved}
                              disabled={warrantyActionLoading}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              Mark Resolved
                            </Button>
                          </div>
                        )}

                        {user?.role === "customer" && warrantyClaim.status === "resolved" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={handleConfirmWarrantyResolution}
                              disabled={warrantyActionLoading}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              Accept Resolution
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleEscalateWarrantyClaim("Customer declined final warranty resolution")
                              }
                              disabled={warrantyActionLoading}
                              className="border-rose-300 text-rose-700"
                            >
                              Decline Resolution
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Review Modal */}
                {booking.status === "completed" && (user?._id === booking.customer?._id || user?._id === booking.professional?._id) && (
                  <ReviewModal
                    open={showReviewModal}
                    onClose={() => setShowReviewModal(false)}
                    bookingId={booking._id}
                    role={user?._id === booking.customer?._id ? "customer" : "professional"}
                    onSubmitted={() => {
                      void refreshBooking()
                    }}
                  />
                )}

                <Dialog open={showWarrantyClaimDialog} onOpenChange={setShowWarrantyClaimDialog}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Open Warranty Claim</DialogTitle>
                      <DialogDescription>
                        Describe the issue and upload optional evidence files.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="warranty-reason">Reason</Label>
                        <select
                          id="warranty-reason"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={warrantyClaimReason}
                          onChange={(e) => setWarrantyClaimReason(e.target.value)}
                        >
                          {Object.entries(warrantyReasonLabels).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="warranty-description">Issue Description</Label>
                        <Textarea
                          id="warranty-description"
                          value={warrantyClaimDescription}
                          onChange={(e) => setWarrantyClaimDescription(e.target.value)}
                          placeholder="Describe what is wrong and what outcome you expect..."
                          className="min-h-[120px]"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="warranty-files">Evidence (optional)</Label>
                        <Input
                          id="warranty-files"
                          type="file"
                          multiple
                          accept="image/*,video/*,.pdf"
                          onChange={(e) => {
                            const { valid, rejected } = validateWarrantyFiles(e.target.files)
                            setWarrantyEvidenceFiles(valid)
                            if (rejected.length > 0) {
                              toast.error(rejected.join('; '))
                            }
                          }}
                        />
                        {warrantyEvidenceFiles.length > 0 && (
                          <p className="text-xs text-gray-500">
                            {warrantyEvidenceFiles.length} file(s) selected
                          </p>
                        )}
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowWarrantyClaimDialog(false)}
                          disabled={openingWarrantyClaim}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleOpenWarrantyClaim}
                          disabled={openingWarrantyClaim}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          {openingWarrantyClaim ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Submit Claim
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={showDeclineReasonDialog} onOpenChange={(open) => { setShowDeclineReasonDialog(open); if (!open) setDeclineReason("") }}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Decline Warranty Claim</DialogTitle>
                      <DialogDescription>
                        Please provide a reason for declining this claim. The claim will be escalated for admin review.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="decline-reason">Reason</Label>
                        <Textarea
                          id="decline-reason"
                          value={declineReason}
                          onChange={(e) => setDeclineReason(e.target.value)}
                          placeholder="Explain why you are declining this claim..."
                          className="min-h-[100px]"
                          aria-required="true"
                          autoFocus
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => { setShowDeclineReasonDialog(false); setDeclineReason("") }}
                          disabled={warrantyActionLoading}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleDeclineWarrantyClaim}
                          disabled={warrantyActionLoading || !declineReason.trim()}
                          className="bg-rose-600 hover:bg-rose-700 text-white"
                        >
                          {warrantyActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Decline Claim
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

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
                  {(booking.scheduledExecutionEndDate || booking.scheduledEndDate) && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-blue-500" />
                      <span>
                        Completion Date:{" "}
                        <span className="font-medium">
                          {new Date(booking.scheduledExecutionEndDate || booking.scheduledEndDate || "").toLocaleDateString()}
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

                {Array.isArray(booking.rfqData?.attachments) && booking.rfqData.attachments.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-gray-900">
                      Request attachments
                    </h2>
                    <div className="space-y-2">
                      {booking.rfqData.attachments.map((attachment, index) => (
                        <a
                          key={`${attachment}-${index}`}
                          href={attachment}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-indigo-700 hover:bg-slate-100"
                        >
                          <span className="truncate pr-3">{getFileLabel(attachment, `Attachment ${index + 1}`)}</span>
                          <span className="font-medium">Open</span>
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                {Array.isArray(booking.rfqData?.answers) && booking.rfqData.answers.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-gray-900">
                      RFQ answers
                    </h2>
                    <div className="space-y-2">
                      {booking.rfqData.answers.map((answer, index) => (
                        <div key={`${answer.question}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-xs font-medium text-gray-900">{answer.question}</p>
                          {isHttpUrl(answer.answer) ? (
                            <a
                              href={answer.answer}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="mt-1 inline-flex text-xs text-indigo-700 hover:underline"
                            >
                              {getFileLabel(answer.answer)}
                            </a>
                          ) : (
                            <p className="mt-1 text-xs text-gray-700 whitespace-pre-wrap">{answer.answer}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {Array.isArray(booking.postBookingData) && booking.postBookingData.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-gray-900">
                      Post-booking answers
                    </h2>
                    <div className="space-y-2">
                      {booking.postBookingData.map((answer, index) => (
                        <div key={`${answer.questionId}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-xs font-medium text-gray-900">{answer.question}</p>
                          {isHttpUrl(answer.answer) ? (
                            <a
                              href={answer.answer}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="mt-1 inline-flex text-xs text-indigo-700 hover:underline"
                            >
                              {getFileLabel(answer.answer)}
                            </a>
                          ) : (
                            <p className="mt-1 text-xs text-gray-700 whitespace-pre-wrap">{answer.answer}</p>
                          )}
                        </div>
                      ))}
                    </div>
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

                        {booking.professional && (
                          <>
                            {booking.professional.username && (
                              <div className="flex items-center gap-2">
                                <Shield className="h-3 w-3 text-gray-400" />
                                <span>{booking.professional.username}</span>
                              </div>
                            )}
                            {viewerRole !== 'customer' && booking.professional.name && (
                              <div className="flex items-center gap-2">
                                <User className="h-3 w-3 text-gray-400" />
                                <span>{booking.professional.name}</span>
                              </div>
                            )}
                            {viewerRole !== 'customer' && booking.professional.businessInfo?.companyName && (
                              <div className="flex items-center gap-2">
                                <Briefcase className="h-3 w-3 text-gray-400" />
                                <span>{booking.professional.businessInfo.companyName}</span>
                              </div>
                            )}
                            {viewerRole === 'admin' && (
                              <>
                                {booking.professional.email && (
                                  <div className="flex items-center gap-2">
                                    <Mail className="h-3 w-3 text-gray-400" />
                                    <span>{booking.professional.email}</span>
                                  </div>
                                )}
                                {booking.professional.phone && (
                                  <div className="flex items-center gap-2">
                                    <Phone className="h-3 w-3 text-gray-400" />
                                    <span>{booking.professional.phone}</span>
                                  </div>
                                )}
                                {booking.professional.businessInfo?.kvkNumber && (
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-3 w-3 text-gray-400" />
                                    <span>KVK: {booking.professional.businessInfo.kvkNumber}</span>
                                  </div>
                                )}
                                {booking.professional.businessInfo?.vatNumber && (
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-3 w-3 text-gray-400" />
                                    <span>VAT: {booking.professional.businessInfo.vatNumber}</span>
                                  </div>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {viewerRole === 'admin' && booking.customer && (
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
                            <User className="h-3 w-3 text-gray-400" />
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
                        {booking.customer.customerType && (
                          <div className="flex items-center gap-2">
                            <Briefcase className="h-3 w-3 text-gray-400" />
                            <span className="capitalize">{booking.customer.customerType}</span>
                          </div>
                        )}
                        {booking.customer.vatNumber && (
                          <div className="flex items-center gap-2">
                            <FileText className="h-3 w-3 text-gray-400" />
                            <span>VAT: {booking.customer.vatNumber}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {viewerRole === 'admin' && booking.payment && (
                    <Card className="bg-slate-50/60 border border-slate-100">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-xs">
                          <CreditCard className="h-4 w-4 text-slate-600" />
                          Payment Breakdown
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1.5 text-xs text-gray-700">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Status</span>
                          <Badge variant="outline" className="text-[10px] h-5">{booking.payment.status || 'unknown'}</Badge>
                        </div>
                        {booking.payment.amount != null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Net Amount</span>
                            <span>{booking.payment.currency || 'EUR'} {booking.payment.amount.toFixed(2)}</span>
                          </div>
                        )}
                        {booking.payment.vatAmount != null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">VAT ({booking.payment.vatRate || 0}%)</span>
                            <span>{booking.payment.currency || 'EUR'} {booking.payment.vatAmount.toFixed(2)}</span>
                          </div>
                        )}
                        {booking.payment.totalWithVat != null && (
                          <div className="flex justify-between font-medium">
                            <span>Total (incl. VAT)</span>
                            <span>{booking.payment.currency || 'EUR'} {booking.payment.totalWithVat.toFixed(2)}</span>
                          </div>
                        )}
                        {booking.payment.discount && booking.payment.discount.totalDiscount != null && booking.payment.discount.totalDiscount > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Discount</span>
                            <span>-{booking.payment.currency || 'EUR'} {booking.payment.discount.totalDiscount.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="border-t border-gray-200 pt-1.5 mt-1.5 space-y-1">
                          {booking.payment.platformCommission != null && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">Platform Commission</span>
                              <span>{booking.payment.currency || 'EUR'} {booking.payment.platformCommission.toFixed(2)}</span>
                            </div>
                          )}
                          {booking.payment.stripeFeeAmount != null && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">Stripe Fee</span>
                              <span>{booking.payment.currency || 'EUR'} {booking.payment.stripeFeeAmount.toFixed(2)}</span>
                            </div>
                          )}
                          {booking.payment.professionalPayout != null && (
                            <div className="flex justify-between font-medium">
                              <span>Professional Payout</span>
                              <span>{booking.payment.currency || 'EUR'} {booking.payment.professionalPayout.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                        {booking.extraCostTotal != null && booking.extraCostTotal !== 0 && (
                          <div className="border-t border-gray-200 pt-1.5 mt-1.5">
                            <div className="flex justify-between font-medium">
                              <span>Extra Costs</span>
                              <span className={booking.extraCostTotal >= 0 ? 'text-red-600' : 'text-green-600'}>
                                {booking.extraCostTotal >= 0 ? '+' : ''}{booking.payment.currency || 'EUR'} {booking.extraCostTotal.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}
                        {booking.payment.stripePaymentIntentId && (
                          <div className="border-t border-gray-200 pt-1.5 mt-1.5">
                            <p className="text-[10px] text-gray-400 break-all">PI: {booking.payment.stripePaymentIntentId}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </section>
              </CardContent>
            </Card>
          </div>
        )}

        {/* RFQ Rejection Modal */}
        <Dialog open={showRejectionModal} onOpenChange={setShowRejectionModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Request</DialogTitle>
              <DialogDescription>Please provide a reason for rejecting this request. The customer will be notified.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Explain why you cannot take on this request..."
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowRejectionModal(false)}>Cancel</Button>
                <Button
                  onClick={() => handleRespondToRFQ('rejected')}
                  disabled={respondingToRFQ || !rejectionReason.trim()}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {respondingToRFQ ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Reject Request
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Quotation Rejection Modal (customer rejects quotation with reason) */}
        <Dialog open={showQuoteRejectionModal} onOpenChange={setShowQuoteRejectionModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Quotation</DialogTitle>
              <DialogDescription>Please explain what changes you&apos;d like. The professional will be notified and can revise the quotation.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                value={quoteRejectionReason}
                onChange={e => setQuoteRejectionReason(e.target.value)}
                placeholder="What would you like changed? (e.g., price too high, missing scope items...)"
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowQuoteRejectionModal(false)}>Cancel</Button>
                <Button
                  onClick={() => handleRespondToQuotation('rejected')}
                  disabled={respondingToQuotation || !quoteRejectionReason.trim()}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {respondingToQuotation ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Reject & Send Feedback
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Professional Completion Modal */}
        <Dialog open={showCompletionModal} onOpenChange={setShowCompletionModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Confirm Completion</DialogTitle>
              <DialogDescription>
                Confirm the work is done, attach any documents, and declare extra costs if applicable.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="completion-notes">Notes (optional)</Label>
                <Textarea
                  id="completion-notes"
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Any notes about the completed work..."
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="completion-files">Attachments (optional)</Label>
                <p className="text-xs text-gray-500">Certificates, photos, documents</p>
                <Input
                  id="completion-files"
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={(e) => setCompletionFiles(Array.from(e.target.files || []))}
                />
                {completionFiles.length > 0 && (
                  <p className="text-xs text-gray-500">{completionFiles.length} file(s) selected</p>
                )}
              </div>

              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Extra Costs</Label>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => addExtraCost('unit_adjustment')} className="text-xs h-7">+ Unit Adj.</Button>
                    <Button size="sm" variant="outline" onClick={() => addExtraCost('condition')} className="text-xs h-7">+ Condition</Button>
                    <Button size="sm" variant="outline" onClick={() => addExtraCost('option')} className="text-xs h-7">+ Option</Button>
                    <Button size="sm" variant="outline" onClick={() => addExtraCost('other')} className="text-xs h-7">+ Other</Button>
                  </div>
                </div>

                {completionExtraCosts.map((cost, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs capitalize">{cost.type.replace('_', ' ')}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => removeExtraCost(i)} className="text-red-500 h-6 text-xs">Remove</Button>
                    </div>

                    {cost.type === 'unit_adjustment' && (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Estimated Units</Label>
                          <Input
                            type="number"
                            value={cost.estimatedUnits || ''}
                            disabled={!!cost.estimatedUnits && cost.estimatedUnits > 0}
                            onChange={(e) => updateExtraCost(i, 'estimatedUnits', parseFloat(e.target.value) || 0)}
                            className={`h-8 text-sm ${cost.estimatedUnits && cost.estimatedUnits > 0 ? 'bg-gray-100' : ''}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Actual Units</Label>
                          <Input type="number" value={cost.actualUnits || ''} onChange={(e) => updateExtraCost(i, 'actualUnits', parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Unit Price</Label>
                          <Input
                            type="number"
                            value={cost.unitPrice || ''}
                            disabled
                            className="h-8 text-sm bg-gray-100"
                          />
                        </div>
                      </div>
                    )}

                    {cost.type === 'condition' && (
                      <div>
                        <Label className="text-xs">Condition (select from project)</Label>
                        <Select
                          value={hasSelectedReferenceIndex(cost.referenceIndex) ? String(cost.referenceIndex) : undefined}
                          onValueChange={(value) => updateExtraCost(i, 'referenceIndex', parseInt(value, 10))}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder={projectConditions.length > 0 ? "Select a condition" : "No project conditions available"} />
                          </SelectTrigger>
                          <SelectContent>
                            {projectConditions.map(({ item: condition, originalIndex }) => {
                              const cost = Number(condition.additionalCost) || 0
                              const currency = booking?.quote?.currency || booking?.payment?.currency || 'EUR'
                              const label = cost > 0 ? `(+${currency} ${cost.toFixed(2)})` : '(no extra cost)'
                              return (
                                <SelectItem key={`condition-${originalIndex}`} value={String(originalIndex)}>
                                  {(condition.name || `Condition ${originalIndex + 1}`)} {label}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {cost.type === 'option' && (
                      <div>
                        <Label className="text-xs">Option (select from project)</Label>
                        <Select
                          value={hasSelectedReferenceIndex(cost.referenceIndex) ? String(cost.referenceIndex) : undefined}
                          onValueChange={(value) => updateExtraCost(i, 'referenceIndex', parseInt(value, 10))}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder={projectOptions.length > 0 ? "Select an option" : "No project options available"} />
                          </SelectTrigger>
                          <SelectContent>
                            {projectOptions.map((option, optionIndex) => (
                              <SelectItem key={`option-${optionIndex}`} value={String(optionIndex)}>
                                {(option.name || `Option ${optionIndex + 1}`)}
                                {typeof option.price === 'number' ? ` (+${option.price.toFixed(2)})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {cost.type === 'other' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input value={cost.name} onChange={(e) => updateExtraCost(i, 'name', e.target.value)} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Amount</Label>
                          <Input type="number" value={cost.amount || ''} onChange={(e) => updateExtraCost(i, 'amount', parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                        </div>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs">Justification (required)</Label>
                      <Textarea value={cost.justification} onChange={(e) => updateExtraCost(i, 'justification', e.target.value)} placeholder="Explain why this cost is necessary..." className="min-h-[50px] text-sm" />
                    </div>

                    {(cost.type === 'unit_adjustment' || cost.type === 'condition' || cost.type === 'option') && (
                      <p className="text-xs text-gray-600">
                        Calculated: {cost.amount >= 0 ? '+' : ''}{cost.amount.toFixed(2)}
                      </p>
                    )}
                  </div>
                ))}

                {completionExtraCosts.length > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm font-semibold">Total Extra Costs:</span>
                    <span className={`text-sm font-bold ${completionExtraCosts.reduce((s, c) => s + c.amount, 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {completionExtraCosts.reduce((s, c) => s + c.amount, 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setShowCompletionModal(false)}>Cancel</Button>
                <Button
                  onClick={handleProfessionalComplete}
                  disabled={submittingCompletion || invalidCompletionExtraCosts}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {submittingCompletion ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCheck className="h-4 w-4 mr-2" />}
                  Confirm Completion
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Customer Dispute Modal */}
        <Dialog open={showDisputeModal} onOpenChange={setShowDisputeModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dispute Extra Costs</DialogTitle>
              <DialogDescription>
                If you disagree with the extra costs or the work quality, raise a dispute. An admin will review your case.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dispute-reason">Reason</Label>
                <Input
                  id="dispute-reason"
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Brief reason for the dispute"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dispute-description">Description (optional)</Label>
                <Textarea
                  id="dispute-description"
                  value={disputeDescription}
                  onChange={(e) => setDisputeDescription(e.target.value)}
                  placeholder="Provide more details about your dispute..."
                  className="min-h-[100px]"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowDisputeModal(false)}>Cancel</Button>
                <Button
                  onClick={handleCustomerDispute}
                  disabled={submittingDispute || !disputeReason.trim()}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {submittingDispute ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
                  Submit Dispute
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

