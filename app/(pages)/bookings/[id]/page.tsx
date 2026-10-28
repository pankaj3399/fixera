'use client'

import { Suspense } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
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
import { type WarrantyClaimStatus } from "@/lib/warrantyClaim"
import { getAuthToken } from "@/lib/utils"
import { RESCHEDULE_REASONS } from "@/lib/constants/rescheduleReasons"
import { CANCEL_REASONS } from "@/lib/constants/cancelReasons"
import { Skeleton } from "@/components/ui/skeleton"
import StartChatButton from "@/components/chat/StartChatButton"
import ReviewModal from "@/components/booking/ReviewModal"
import QuotationWizard from "@/components/quotation/QuotationWizard"
import AvailabilityDatePicker from "@/components/booking/AvailabilityDatePicker"
import CustomerRefundOffer from "@/components/booking/CustomerRefundOffer"
import { StripeProvider } from "@/components/stripe/StripeProvider"
import { PaymentForm } from "@/components/stripe/PaymentForm"
import type { QuoteVersion, BookingMilestone } from "@/types/quotation"
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/dashboardBookingHelpers"
import { useCustomerPricing } from "@/hooks/useCustomerPricing"
import { getExtraCostAmounts, mergePersistedExtraCostCharge, type ExtraCostChargeSummary } from "@/lib/extraCostPricing"
import { commissionedExtraCost, commissionedExtraCostTotal } from "@/lib/customerPricing"
import { resolveRecordCurrency } from "@/lib/currency/convert"
import { createOrGetConversation } from "@/lib/chatApi"
import {
  calculateMilestoneGrossAmounts,
  calculateQuoteVersionVatTotals,
} from "@/lib/vatPricing"

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

const formatValidUntilLabel = (value: string | undefined, intl: string, notAvailable: string) => {
  if (!value) return notAvailable
  const raw = String(value).trim()
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    const parsed = new Date(year, month - 1, day)
    if (parsed.getFullYear() === year && parsed.getMonth() + 1 === month && parsed.getDate() === day) {
      return parsed.toLocaleDateString(intl)
    }
    return notAvailable
  }
  const fallback = new Date(raw)
  if (!isNaN(fallback.getTime())) return fallback.toLocaleDateString(intl)
  return notAvailable
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
    reverseCharge?: boolean
    vatBreakdown?: Array<{
      description: string
      netAmount: number
      vatRate: number
      vatAmount: number
      totalAmount: number
      vatCountry?: string
      vatLabel?: string
    }>
    platformCommission?: number
    professionalPayout?: number
    stripeFeeAmount?: number
    stripePaymentIntentId?: string
    extraCostStripePaymentIntentId?: string
    extraCostClientSecret?: string
    extraCostAmount?: number
    extraCostCustomerNetAmount?: number
    extraCostVatAmount?: number
    extraCostCustomerDiscount?: number
    extraCostLoyaltyTier?: string
    extraCostLoyaltyPercentage?: number
    authorizedAt?: string
    capturedAt?: string
    transferredAt?: string
    paidAt?: string
    refundedAt?: string
    refundReason?: string
    invoiceNumber?: string
    invoiceUrl?: string
    invoiceUblUrl?: string
    invoiceGeneratedAt?: string
    supplierInvoiceNumber?: string
    supplierInvoiceUrl?: string
    supplierInvoiceUblUrl?: string
    supplierInvoiceGeneratedAt?: string
    creditNoteNumber?: string
    creditNoteUrl?: string
    creditNoteUblUrl?: string
    creditNoteGeneratedAt?: string
    peppolDispatchStatus?: string
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
    breakdown?: Array<{ item: string; amount?: number; quantity?: number; unitPrice?: number; totalPrice?: number }>
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
  vatDecision?: {
    action?: 'standard_rate' | 'reduced_rate' | 'rfq'
    country?: string
    standardRate?: number
    appliedRate?: number
    reducedRate?: number
    reverseCharge?: boolean
    explanation?: string
    matchedRuleText?: string
    answers?: { fieldName: string; value: string | number | boolean | string[] }[]
  }
  scheduledStartDate?: string
  scheduledStartTime?: string
  scheduledEndTime?: string
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
    timeMode?: 'hours' | 'days' | 'mixed'
    executionDuration?: { value?: number; unit?: 'hours' | 'days' }
    rfqQuestions?: PostBookingQuestion[]
    postBookingQuestions?: PostBookingQuestion[]
    extraOptions?: Array<{ name?: string; price?: number }>
    termsConditions?: Array<{ name?: string; additionalCost?: number; type?: 'condition' | 'warning' }>
    subprojects?: Array<{
      name?: string
      pricing?: { type?: 'fixed' | 'unit' | 'rfq'; amount?: number }
      professionalInputs?: Array<{ fieldName?: string; value?: string | number | { min?: number | string; max?: number | string } }>
      executionDuration?: { value?: number; unit?: 'hours' | 'days' }
    }>
    minResources?: number
    minOverlapPercentage?: number
    resources?: string[]
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
  rescheduleRequest?: {
    status?: 'pending' | 'accepted' | 'declined'
    requestedBy?: string
    requestedAt?: string
    reason?: string
    description?: string
    note?: string
    proposedSchedule?: {
      scheduledStartDate?: string
      scheduledStartTime?: string
      scheduledExecutionEndDate?: string
      scheduledBufferEndDate?: string
    }
    previousSchedule?: {
      scheduledStartDate?: string
      scheduledStartTime?: string
    }
  }
  cancellation?: {
    cancelledBy?: string
    reason?: string
    cancelledAt?: string
    refundAmount?: number
  }
  dispute?: {
    raisedBy?: string
    reason?: string
    description?: string
    raisedAt?: string
    type?: 'extra_costs' | 'reschedule' | 'completion_request' | 'warranty_claim' | 'warranty_resolve' | 'refund_request' | 'in_progress'
    attachments?: string[]
    resolutionAttachments?: string[]
  }
  statusHistory?: Array<{
    status?: BookingStatus
    timestamp?: string
    updatedBy?: string
    note?: string
  }>
  actualEndDate?: string
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

const formatCurrencyRange = (
  booking: BookingDetail,
  formatAmount: (amount: number, currency?: string | null) => string
): string | null => {
  const budget = booking.rfqData?.budget
  if (!budget || (budget.min == null && budget.max == null)) return null

  const currency = budget.currency || "€"
  if (budget.min != null && budget.max != null && budget.min !== budget.max) {
    return `${formatAmount(budget.min, currency)} – ${formatAmount(budget.max, currency)}`
  }
  const value = budget.min ?? budget.max
  if (value == null) return null
  return formatAmount(value, currency)
}

type BookingApiResponse = {
  success: boolean
  booking?: BookingDetail
  viewerRole?: 'admin' | 'customer' | 'professional'
  msg?: string
}

const resolveBookingIsDaysMode = (booking?: BookingDetail | null): boolean => {
  const project = booking?.project
  const subprojects = project?.subprojects
  const selectedIndex = booking?.selectedSubprojectIndex
  let unit: 'hours' | 'days' | undefined
  if (subprojects && subprojects.length > 0) {
    const sub =
      typeof selectedIndex === 'number'
        ? subprojects[selectedIndex]
        : subprojects.length === 1
        ? subprojects[0]
        : undefined
    unit = sub?.executionDuration?.unit
  }
  if (!unit) unit = project?.executionDuration?.unit
  if (unit) return unit === 'days'
  return project?.timeMode === 'days'
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

const isHttpUrl = (value?: string | null) => {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

const CANCEL_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024

const getFileLabel = (value: string | null | undefined, fallback: string) => {
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

const RESCHEDULE_REASON_KEYS: Record<string, string> = {
  "Weather delay": "weatherDelay",
  "Resource availability": "resourceAvailability",
  "Material delivery issues": "materialDeliveryIssues",
  "Crew unavailable": "crewUnavailable",
  "Customer request": "customerRequest",
  "Other": "other",
}

const WARRANTY_REASON_VALUES = ["defect", "incomplete_work", "material_issue", "functionality_issue", "safety_issue", "other"] as const

const WARRANTY_ALLOWED_FILE_TYPES = ['image/', 'video/', 'application/pdf']
const WARRANTY_MAX_FILE_SIZE = 50 * 1024 * 1024
const WARRANTY_MAX_FILES = 10

type WarrantyFileRejection =
  | { kind: "unsupportedType"; name: string }
  | { kind: "tooLarge"; name: string }
  | { kind: "tooMany"; max: number }

const validateWarrantyFiles = (fileList: FileList | File[] | null | undefined) => {
  const raw = Array.from(fileList || [])
  const valid: File[] = []
  const rejected: WarrantyFileRejection[] = []

  for (const file of raw.slice(0, WARRANTY_MAX_FILES)) {
    if (!WARRANTY_ALLOWED_FILE_TYPES.some((type) => file.type.startsWith(type))) {
      rejected.push({ kind: "unsupportedType", name: file.name })
    } else if (file.size > WARRANTY_MAX_FILE_SIZE) {
      rejected.push({ kind: "tooLarge", name: file.name })
    } else {
      valid.push(file)
    }
  }

  if (raw.length > WARRANTY_MAX_FILES) {
    rejected.push({ kind: "tooMany", max: WARRANTY_MAX_FILES })
  }

  return { valid, rejected }
}


export default function BookingDetailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" /></div>}>
      <BookingDetailContent />
    </Suspense>
  )
}

function BookingDetailContent() {
  const { user, isAuthenticated, loading } = useAuth()
  const t = useTranslations("bookings")
  const { intl } = useFormatLocale()
  const { formatMoney } = useCurrency()
  const formatDate = (value: string | number | Date) => new Date(value).toLocaleDateString(intl)
  const formatDateTime = (value: string | number | Date) => new Date(value).toLocaleString(intl)
  const enumLabel = (prefix: string, value?: string | null) => {
    if (!value) return t("common.unknown")
    const key = `${prefix}.${value}`
    const hasKey = (t.has as unknown as (k: string) => boolean)(key)
    return hasKey ? (t as unknown as (k: string) => string)(key) : value.replace(/_/g, " ")
  }
  const formatWarrantyRejections = (rejected: WarrantyFileRejection[]) =>
    rejected
      .map((item) => {
        if (item.kind === "tooMany") return t("warranty.fileTooMany", { max: item.max })
        if (item.kind === "tooLarge") return t("warranty.fileTooLarge", { name: item.name })
        return t("warranty.fileUnsupported", { name: item.name })
      })
      .join("; ")
  const { commissionPercent, customerPrice, originalPrice, loyalty, loyaltyLoaded, withLoyaltyDiscount } = useCustomerPricing()
  const customerPricingReady = commissionPercent != null && loyaltyLoaded
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
  const [proceedingAtStandardVat, setProceedingAtStandardVat] = useState(false)
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
  const [disputeStep, setDisputeStep] = useState<'warning' | 'form'>('warning')
  const [disputeType, setDisputeType] = useState<'extra_costs' | 'reschedule' | 'in_progress' | 'completion_request' | 'warranty_claim' | 'warranty_resolve' | 'refund_request'>('extra_costs')
  const [disputeAttachments, setDisputeAttachments] = useState<File[]>([])

  // Customer cancel + reschedule state
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReasonCategory, setCancelReasonCategory] = useState("")
  const [cancelReason, setCancelReason] = useState("")
  const [cancelEvidence, setCancelEvidence] = useState<string[]>([])
  const [uploadingCancelAttachment, setUploadingCancelAttachment] = useState(false)
  const cancelUploadAbortRef = useRef<AbortController | null>(null)
  const [submittingCancel, setSubmittingCancel] = useState(false)
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState("")
  const [rescheduleTime, setRescheduleTime] = useState("")
  const [rescheduleReason, setRescheduleReason] = useState("")
  const [rescheduleDescription, setRescheduleDescription] = useState("")
  const [submittingReschedule, setSubmittingReschedule] = useState(false)
  const [respondingReschedule, setRespondingReschedule] = useState(false)
  const [showRescheduleRefundModal, setShowRescheduleRefundModal] = useState(false)
  const [rescheduleRefundNote, setRescheduleRefundNote] = useState("")
  const [confirmingCompletion, setConfirmingCompletion] = useState(false)
  const [extraCostClientSecret, setExtraCostClientSecret] = useState("")
  const [extraCostCharge, setExtraCostCharge] = useState<ExtraCostChargeSummary | null>(null)
  const [loadingExtraCostPayment, setLoadingExtraCostPayment] = useState(false)
  const extraCostInitInFlightRef = useRef(false)
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
          setError(rawText || t("errors.unexpectedResponse", { status: response.status }))
          return
        }

        if (response.ok && data.success && data.booking) {
          setBooking(data.booking)
          if (data.viewerRole) setViewerRole(data.viewerRole)
        } else {
          setError(data.msg || t("errors.loadBooking"))
        }
      } catch (err) {
        console.error("Failed to fetch booking:", err instanceof Error ? err.message : err)
        setError(t("errors.loadBooking"))
      } finally {
        setIsLoading(false)
      }
    }

    fetchBooking()
    // `t` is only used for the error message; refetching on locale change is not needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setDisputeType('extra_costs')
      setDisputeReason("")
      setDisputeDescription("")
      setDisputeAttachments([])
      setDisputeStep('warning')
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
  const currencyRange = booking ? formatCurrencyRange(booking, formatMoney) : null
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
    const milestonesAllDone = !booking?.milestonePayments?.length
      || booking.milestonePayments.every((m) => (m.workStatus || 'pending') === 'completed')
    if (!milestonesAllDone) return
    setShowCompletionModal(true)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.delete("openCompletion")
      router.replace(`${url.pathname}${url.search}${url.hash}`)
    }
  }, [autoOpenCompletion, user?.role, booking?.status, booking?.milestonePayments, router])

  useEffect(() => {
    if (!autoPayExtras) return
    if (user?.role !== "customer") return
    if (booking?.status !== "professional_completed") return
    if ((booking?.extraCostTotal || 0) <= 0) return
    if (extraCostClientSecret) return
    if (booking?.extraCostStatus === "confirmed" || booking?.extraCostStatus === "disputed") return
    let cancelled = false
    ;(async () => {
      const ok = await initializeExtraCostPayment()
      if (cancelled) return
      if (ok && typeof window !== "undefined") {
        const url = new URL(window.location.href)
        url.searchParams.delete("payExtras")
        router.replace(`${url.pathname}${url.search}${url.hash}`)
      }
    })()
    return () => {
      cancelled = true
    }
    // initializeExtraCostPayment is stable enough — intentionally not in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPayExtras, user?.role, booking?.status, booking?.extraCostTotal, booking?.extraCostStatus, extraCostClientSecret, router, bookingId])

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
        toast.success(t("toasts.attachmentUploaded"))
      } else {
        toast.error(data?.message || rawText || t("toasts.attachmentUploadFailedStatus", { status: response.status }))
      }
    } catch (err) {
      console.error("Failed to upload post-booking attachment:", err)
      toast.error(t("toasts.attachmentUploadFailed"))
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
      throw new Error(data?.msg || rawText || t("warranty.errors.uploadEvidence"))
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
      toast.error(t("warranty.toasts.descriptionTooShort"))
      return
    }

    // Re-check for existing claim to prevent duplicate creation
    if (warrantyClaim && warrantyClaim.status !== "closed") {
      toast.error(t("warranty.toasts.activeClaimExists"))
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
        toast.error(data?.msg || rawText || t("warranty.toasts.openFailed"))
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
      toast.success(t("warranty.toasts.opened"))
      setWarrantyClaim(finalClaim)
      setWarrantyClaimReason("defect")
      setWarrantyClaimDescription("")
      setWarrantyEvidenceFiles([])
      setShowWarrantyClaimDialog(false)
    } catch (err) {
      console.error("Failed to open warranty claim:", err)
      toast.error(err instanceof Error ? err.message : t("warranty.toasts.openFailed"))
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
      throw new Error(data?.msg || rawText || t("warranty.toasts.actionFailed"))
    }
    return data
  }

  const handleSubmitWarrantyProposal = async () => {
    if (!warrantyClaim?._id) return
    if (!warrantyProposalMessage.trim()) {
      toast.error(t("warranty.toasts.proposalRequired"))
      return
    }
    if (!warrantyProposalSchedule) {
      toast.error(t("warranty.toasts.resolveDateRequired"))
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
      toast.success(t("warranty.toasts.proposalSent"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("warranty.toasts.proposalFailed"))
    } finally {
      setWarrantyActionLoading(false)
    }
  }

  const handleDeclineWarrantyClaim = async () => {
    if (!warrantyClaim?._id) return
    const trimmed = declineReason.trim()
    if (!trimmed) {
      toast.error(t("warranty.toasts.declineReasonRequired"))
      return
    }

    setWarrantyActionLoading(true)
    try {
      const data = await callWarrantyAction(`${warrantyClaim._id}/decline`, { reason: trimmed })
      setWarrantyClaim(data.claim || null)
      setShowDeclineReasonDialog(false)
      setDeclineReason("")
      toast.success(t("warranty.toasts.declined"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("warranty.toasts.declineFailed"))
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
      toast.success(action === "accept" ? t("warranty.toasts.proposalAccepted") : t("warranty.toasts.proposalDeclined"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("warranty.toasts.proposalResponseFailed"))
    } finally {
      setWarrantyActionLoading(false)
    }
  }

  const handleMarkWarrantyResolved = async () => {
    if (!warrantyClaim?._id) return
    if (!warrantyResolutionSummary.trim()) {
      toast.error(t("warranty.toasts.resolutionSummaryRequired"))
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
          throw new Error(uploadPayload.msg || t("warranty.toasts.resolutionUploadFailed"))
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
      toast.success(t("warranty.toasts.markedResolved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("warranty.toasts.markResolvedFailed"))
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
      toast.success(t("warranty.toasts.closed"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("warranty.toasts.confirmResolutionFailed"))
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
      toast.success(t("warranty.toasts.escalated"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("warranty.toasts.escalateFailed"))
    } finally {
      setWarrantyActionLoading(false)
    }
  }

  const handleSubmitPostBookingAnswers = async () => {
    if (!booking || !bookingId) return
    if (uploadingPostBookingQuestionIndexes.size > 0) {
      toast.error(t("postBooking.waitForUploads"))
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
      toast.error(t("postBooking.missingRequired", { questions: missingRequired.map((index) => index + 1).join(", ") }))
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
        toast.success(t("postBooking.submitted"))
        setAnswersSubmitted(true)
        // Update the local booking state
        setBooking(prev => prev ? { ...prev, postBookingData: data.postBookingData || answers } : prev)
      } else {
        toast.error(data?.msg || rawText || t("postBooking.submitFailedStatus", { status: response.status }))
      }
    } catch (err) {
      console.error("Failed to submit post-booking answers:", err)
      toast.error(t("postBooking.submitFailed"))
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
      toast.error(t("rfq.toasts.rejectionReasonRequired"))
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
          toast.success(t("rfq.toasts.accepted"))
          setShowQuotationWizard(true)
        } else {
          toast.success(t("rfq.toasts.rejected"))
          setRejectionReason('')
          setShowRejectionModal(false)
        }
        await refreshBooking()
      } else {
        toast.error(data?.error?.message || t("rfq.toasts.respondFailed"))
      }
    } catch (err) {
      console.error("Error responding to RFQ:", err)
      toast.error(t("rfq.toasts.respondFailedRetry"))
    } finally {
      setRespondingToRFQ(false)
    }
  }

  const handleProceedAtStandardVat = async () => {
    if (!bookingId) return
    setProceedingAtStandardVat(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers.Authorization = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/vat-proceed-standard`,
        { method: "POST", headers, credentials: "include" }
      )
      const { data } = await parseResponseBody<{ success?: boolean; msg?: string; booking?: BookingDetail }>(response)
      if (response.ok && data?.success) {
        toast.success(data.msg || t("vat.toasts.proceedStandard"))
        if (data.booking?.status === "quote_accepted" && data.booking?._id) {
          router.push(`/bookings/${data.booking._id}/payment`)
          return
        }
        await refreshBooking()
      } else {
        toast.error(data?.msg || t("vat.toasts.updateFailed"))
      }
    } catch (error) {
      console.error("Proceed at standard VAT error:", error)
      toast.error(t("vat.toasts.updateFailed"))
    } finally {
      setProceedingAtStandardVat(false)
    }
  }

  const handleRespondToQuotation = async (action: 'accepted' | 'rejected') => {
    if (!bookingId) return
    if (action === 'rejected' && !quoteRejectionReason.trim()) {
      toast.error(t("quote.toasts.rejectionReasonRequired"))
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
          toast.success(t("quotation.toasts.accepted"))
          router.push(`/bookings/${bookingId}/payment`)
        } else {
          toast.success(t("quotation.toasts.rejected"))
          setQuoteRejectionReason('')
          setShowQuoteRejectionModal(false)
          await refreshBooking()
        }
      } else {
        toast.error(data?.error?.message || t("quotation.toasts.respondFailed"))
      }
    } catch (err) {
      console.error("Error responding to quotation:", err)
      toast.error(t("common.respondFailedRetry"))
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
        toast.error(data?.error?.message || t("milestones.toasts.createPaymentFailed"))
      }
    } catch (err) {
      console.error("Error paying milestone:", err)
      toast.error(t("milestones.toasts.initiatePaymentFailed"))
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
        toast.success(action === "start" ? t("milestones.toasts.started") : t("milestones.toasts.completed"))
        await refreshBooking()
      } else {
        toast.error(data?.error?.message || t("milestones.toasts.updateFailed"))
      }
    } catch (err) {
      console.error("Error updating milestone:", err)
      toast.error(t("milestones.toasts.updateFailedRetry"))
    } finally {
      setUpdatingMilestoneIndexes(prev => { const next = new Set(prev); next.delete(index); return next })
    }
  }

  // Helper: check if this booking uses new quotation system
  const hasQuotationVersions = (booking?.quoteVersions?.length || 0) > 0
  const currentVersion = hasQuotationVersions
    ? booking?.quoteVersions?.find(v => v.version === booking?.currentQuoteVersion)
    : null
  const currentVersionQuoteTotals = useMemo(
    () => calculateQuoteVersionVatTotals(
      currentVersion,
      customerPricingReady ? customerPrice : undefined
    ),
    [currentVersion, customerPricingReady, customerPrice]
  )
  const currentVersionMilestoneGrossAmounts = useMemo(
    () => calculateMilestoneGrossAmounts(
      currentVersion,
      customerPricingReady ? customerPrice : undefined
    ),
    [currentVersion, customerPricingReady, customerPrice]
  )
  const currentVersionOriginalQuoteTotals = useMemo(
    () => calculateQuoteVersionVatTotals(
      currentVersion,
      customerPricingReady ? originalPrice : undefined
    ),
    [currentVersion, customerPricingReady, originalPrice]
  )
  const bookingMilestoneGrossAmounts = useMemo(() => {
    if (!booking?.milestonePayments?.length || !currentVersion) return []
    return calculateMilestoneGrossAmounts(
      {
        ...currentVersion,
        milestones: booking.milestonePayments,
      },
      user?.role === 'customer' && customerPricingReady ? customerPrice : undefined
    )
  }, [booking?.milestonePayments, currentVersion, user?.role, customerPricingReady, customerPrice])
  const rfqDeadlineDate = booking?.rfqDeadline ? new Date(booking.rfqDeadline) : null
  const rfqDeadlineRemaining = rfqDeadlineDate
    ? Math.max(0, Math.ceil((rfqDeadlineDate.getTime() - Date.now()) / (1000 * 60 * 60)))
    : null

  const handleSubmitQuote = async () => {
    const parsedAmount = parseFloat(quoteAmount)
    if (!quoteAmount || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error(t("quote.toasts.invalidAmount"))
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
            description: quoteDescription || t("quote.defaultDescription")
          })
        }
      )

      const { data, rawText } = await parseResponseBody<{ success?: boolean; msg?: string }>(response)

      if (response.ok && data?.success) {
        toast.success(t("quote.toasts.submitted"))
        setShowQuoteForm(false)
        await refreshBooking()
      } else {
        toast.error(data?.msg || rawText || t("quote.toasts.submitFailedStatus", { status: response.status }))
      }
    } catch (err) {
      console.error("Error submitting quote:", err instanceof Error ? err.message : err)
      toast.error(t("quote.toasts.submitFailed"))
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
          toast.success(t("quote.toasts.accepted"))
          router.push(`/bookings/${bookingId}/payment`)
        } else {
          toast.success(t("quote.toasts.rejected"))
          await refreshBooking()
        }
      } else {
        toast.error(data?.msg || rawText || (action === "accept"
          ? t("quote.toasts.acceptFailedStatus", { status: response.status })
          : t("quote.toasts.rejectFailedStatus", { status: response.status })))
      }
    } catch (err) {
      console.error(`Error ${action}ing quote:`, err instanceof Error ? err.message : err)
      toast.error(action === "accept" ? t("quote.toasts.acceptFailed") : t("quote.toasts.rejectFailed"))
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
          toast.success(t("status.toasts.completed"))
        } else if (newStatus === "in_progress") {
          toast.success(t("status.toasts.started"))
        } else {
          toast.success(t("status.toasts.updated"))
        }
        await refreshBooking()
      } else {
        toast.error(data?.msg || rawText || t("status.toasts.updateFailedStatus", { status: response.status }))
      }
    } catch (err) {
      console.error("Failed to update booking status:", err instanceof Error ? err.message : err)
      toast.error(t("status.toasts.updateFailed"))
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleProfessionalComplete = async () => {
    if (!bookingId) return

    const milestonesAllDone = !booking?.milestonePayments?.length
      || booking.milestonePayments.every((m) => (m.workStatus || 'pending') === 'completed')
    if (!milestonesAllDone) {
      toast.error(t("completion.toasts.milestonesIncomplete"))
      return
    }

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
          ? t("completion.toasts.selectCondition")
          : invalidExtraCost.type === 'option'
            ? t("completion.toasts.selectOption")
            : t("completion.toasts.justificationRequired")
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
        toast.success(t("completion.toasts.submitted"))
        setShowCompletionModal(false)
        setCompletionNotes("")
        setCompletionFiles([])
        setCompletionExtraCosts([])
        await refreshBooking()
      } else {
        toast.error(result.error?.message || t("completion.toasts.failed"))
      }
    } catch (err) {
      console.error("Failed to confirm completion:", err)
      toast.error(t("completion.toasts.failedRetry"))
    } finally {
      setSubmittingCompletion(false)
    }
  }

  const initializeExtraCostPayment = async () => {
    if (!bookingId) return false

    if (extraCostClientSecret) return true
    if (extraCostInitInFlightRef.current) return false

    extraCostInitInFlightRef.current = true
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
        const chargeAmount = Number(result.data.customerChargeAmount)
        const vatAmount = result.data.vatAmount == null ? undefined : Number(result.data.vatAmount)
        const customerNet = result.data.customerNetChargeAmount == null ? undefined : Number(result.data.customerNetChargeAmount)
        if (Number.isFinite(chargeAmount)) {
          setExtraCostCharge({
            paymentIntentClientSecret: String(result.data.clientSecret),
            customerChargeAmount: chargeAmount,
            customerNetChargeAmount: Number.isFinite(customerNet) ? customerNet : undefined,
            vatAmount: Number.isFinite(vatAmount) ? vatAmount : undefined,
            subtotalInclCommission: result.data.subtotalInclCommission == null ? undefined : Number(result.data.subtotalInclCommission),
            loyaltyDiscountAmount: Number(result.data.loyaltyDiscount?.amount) || 0,
            loyaltyLevel: String(result.data.loyaltyDiscount?.level || ""),
            loyaltyPercentage: Number(result.data.loyaltyDiscount?.percentage) || 0,
          })
        }
        // Refresh so the persisted VAT-inclusive payment fields stay in sync
        // for reloads and for the confirm-completion flow.
        await refreshBooking()
        return true
      }

      toast.error(result.error?.message || t("extraCosts.toasts.initFailed"))
      return false
    } catch (err) {
      console.error("Failed to initialize extra cost payment:", err)
      toast.error(t("extraCosts.toasts.initFailedRetry"))
      return false
    } finally {
      setLoadingExtraCostPayment(false)
      extraCostInitInFlightRef.current = false
    }
  }

  const submitCustomerConfirmCompletion = async (skipPrompt = false) => {
    if (!bookingId) return false
    if (!skipPrompt && !confirm(t("completion.confirmPrompt"))) return false

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
        toast.success(t("completion.toasts.completed"))
        setExtraCostClientSecret("")
        setExtraCostPaymentCompleted(false)
        await refreshBooking()
        return true
      }

      if (result.error?.code === "EXTRA_COST_NOT_PAID" && (booking?.extraCostTotal || 0) > 0) {
        const paymentReady = await initializeExtraCostPayment()
        if (paymentReady) {
          toast.info(t("extraCosts.toasts.payToComplete"))
        }
        return false
      }

      toast.error(result.error?.message || t("completion.toasts.failed"))
      return false
    } catch (err) {
      console.error("Failed to confirm completion:", err)
      toast.error(t("completion.toasts.failedRetry"))
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
    toast.success(t("extraCosts.toasts.paid"))
    await submitCustomerConfirmCompletion(true)
  }

  const handleExtraCostPaymentError = (message: string) => {
    toast.error(message)
  }

  const handleCustomerDispute = async () => {
    const trimmedReason = disputeReason.trim()
    if (!bookingId || !trimmedReason) return
    setSubmittingDispute(true)
    try {
      const token = getAuthToken()

      let uploadedUrls: string[] = []
      if (disputeAttachments.length > 0) {
        const formData = new FormData()
        disputeAttachments.forEach((file) => formData.append("files", file))
        const uploadHeaders: Record<string, string> = {}
        if (token) uploadHeaders.Authorization = `Bearer ${token}`
        const uploadResponse = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/dispute-upload`,
          { method: "POST", headers: uploadHeaders, credentials: "include", body: formData }
        )
        const uploadPayload = await uploadResponse.json()
        if (!uploadResponse.ok || !uploadPayload.success) {
          toast.error(uploadPayload?.error?.message || t("dispute.toasts.uploadFailed"))
          setSubmittingDispute(false)
          return
        }
        uploadedUrls = Array.isArray(uploadPayload.data?.urls) ? uploadPayload.data.urls : []
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/dispute-extra-costs`,
        {
          method: "POST", headers, credentials: "include",
          body: JSON.stringify({
            reason: trimmedReason,
            description: disputeDescription.trim(),
            type: disputeType,
            attachments: uploadedUrls,
          })
        }
      )
      const result = await response.json()
      if (response.ok && result.success) {
        toast.success(t("dispute.toasts.raised"))
        setShowDisputeModal(false)
        setDisputeReason("")
        setDisputeDescription("")
        setDisputeAttachments([])
        setDisputeStep('warning')
        await refreshBooking()
      } else {
        toast.error(result.error?.message || t("dispute.toasts.raiseFailed"))
      }
    } catch (err) {
      console.error("Failed to raise dispute:", err)
      toast.error(t("dispute.toasts.raiseFailedRetry"))
    } finally {
      setSubmittingDispute(false)
    }
  }

  const handleCancelAttachmentUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !bookingId) return
    const remaining = 10 - cancelEvidence.length
    if (remaining <= 0) {
      toast.error(t("cancel.toasts.maxFiles"))
      return
    }
    const valid: File[] = []
    for (const file of Array.from(files)) {
      const okType = /^(image\/|video\/)/.test(file.type) || file.type === "application/pdf"
      if (!okType) {
        toast.error(t("cancel.toasts.unsupportedFileType", { name: file.name }))
        continue
      }
      if (file.size > CANCEL_ATTACHMENT_MAX_BYTES) {
        toast.error(t("cancel.toasts.fileTooLarge", { name: file.name, size: CANCEL_ATTACHMENT_MAX_BYTES / (1024 * 1024) }))
        continue
      }
      valid.push(file)
    }
    const toUpload = valid.slice(0, remaining)
    if (toUpload.length === 0) return
    const controller = new AbortController()
    cancelUploadAbortRef.current = controller
    setUploadingCancelAttachment(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const formData = new FormData()
      toUpload.forEach((file) => formData.append("files", file))
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/dispute-upload`,
        { method: "POST", credentials: "include", headers, body: formData, signal: controller.signal }
      )
      const result = await response.json()
      if (controller.signal.aborted) return
      const urls: string[] = (Array.isArray(result?.data?.urls) ? result.data.urls : [])
        .filter((u: unknown): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
      if (response.ok && result.success && urls.length > 0) {
        setCancelEvidence((prev) => [...prev, ...urls].slice(0, 10))
        toast.success(t("toasts.attachmentUploaded"))
      } else {
        toast.error(result?.error?.message || t("toasts.attachmentUploadFailedShort"))
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      console.error("Failed to upload cancellation attachment:", err)
      toast.error(t("toasts.attachmentUploadFailed"))
    } finally {
      if (cancelUploadAbortRef.current === controller) cancelUploadAbortRef.current = null
      setUploadingCancelAttachment(false)
    }
  }

  const resetCancelForm = () => {
    cancelUploadAbortRef.current?.abort()
    cancelUploadAbortRef.current = null
    setCancelReasonCategory("")
    setCancelReason("")
    setCancelEvidence([])
  }

  const handleCustomerCancel = async () => {
    if (!bookingId || !CANCEL_REASONS.some((r) => r.value === cancelReasonCategory)) {
      toast.error(t("cancel.toasts.reasonRequired"))
      return
    }
    setSubmittingCancel(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/cancel`,
        {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({
            reasonCategory: cancelReasonCategory,
            reason: cancelReason.trim() || undefined,
            evidence: cancelEvidence,
          }),
        }
      )
      const result = await response.json()
      if (response.ok && result.success) {
        toast.success(result.msg || t("cancel.toasts.submitted"))
        setShowCancelModal(false)
        resetCancelForm()
        await refreshBooking()
      } else {
        toast.error(result.msg || result.error?.message || t("cancel.toasts.failed"))
      }
    } catch (err) {
      console.error("Failed to cancel booking:", err)
      toast.error(t("cancel.toasts.failedRetry"))
    } finally {
      setSubmittingCancel(false)
    }
  }

  const handleCustomerReschedule = async () => {
    if (!bookingId || !rescheduleDate || !rescheduleReason) {
      toast.error(t("reschedule.toasts.dateAndReasonRequired"))
      return
    }
    const isDaysMode = resolveBookingIsDaysMode(booking)
    if (!isDaysMode && !rescheduleTime) {
      toast.error(t("reschedule.toasts.startTimeRequired"))
      return
    }
    setSubmittingReschedule(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/reschedule-request`,
        {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({
            scheduledStartDate: rescheduleDate,
            ...(isDaysMode ? {} : { scheduledStartTime: rescheduleTime }),
            reason: rescheduleReason,
            description: rescheduleDescription.trim() || undefined,
          }),
        }
      )
      const result = await response.json()
      if (response.ok && result.success) {
        toast.success(t("reschedule.toasts.sent"))
        setShowRescheduleModal(false)
        setRescheduleDate("")
        setRescheduleTime("")
        setRescheduleReason("")
        setRescheduleDescription("")
        await refreshBooking()
      } else {
        toast.error(result.error?.message || t("reschedule.toasts.requestFailed"))
      }
    } catch (err) {
      console.error("Failed to request rescheduling:", err)
      toast.error(t("reschedule.toasts.requestFailedRetry"))
    } finally {
      setSubmittingReschedule(false)
    }
  }

  const handleRespondReschedule = async (action: 'accept' | 'refund', extra?: { reason?: string; note?: string }) => {
    if (!bookingId) return
    setRespondingReschedule(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/respond-reschedule`,
        {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({ action, ...(extra || {}) }),
        }
      )
      const result = await response.json()
      if (response.ok && result.success) {
        toast.success(
          action === 'accept'
            ? t("reschedule.toasts.accepted")
            : t("reschedule.toasts.declinedRefunded")
        )
        setShowRescheduleRefundModal(false)
        setRescheduleRefundNote("")
        await refreshBooking()
      } else {
        toast.error(result.error?.message || t("reschedule.toasts.respondFailed"))
      }
    } catch (err) {
      console.error("Failed to respond to reschedule:", err)
      toast.error(t("common.respondFailedRetry"))
    } finally {
      setRespondingReschedule(false)
    }
  }

  const openDisputeModal = (type: 'extra_costs' | 'reschedule' | 'in_progress' | 'completion_request' = 'extra_costs') => {
    setDisputeType(type)
    setDisputeReason("")
    setDisputeDescription("")
    setDisputeAttachments([])
    setDisputeStep('warning')
    setShowDisputeModal(true)
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
        toast.error(t("extraCosts.toasts.noSubproject"))
        return
      }
      const sub = subprojects[subIdx]
      if (sub?.pricing?.type !== 'unit') {
        toast.error(t("extraCosts.toasts.notUnitPriced"))
        return
      }
      const unitPrice = Number(sub?.pricing?.amount)
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        toast.error(t("extraCosts.toasts.unitPriceMissing"))
        return
      }

      const inputs = sub?.professionalInputs || []
      const priceModelToken = ((booking?.project as { priceModel?: string } | undefined)?.priceModel || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const quantityTokens = ['quantity', 'units', 'unit', 'amount', 'size', 'area', 'surface', 'length', 'width', 'height', 'volume', 'weight', 'pieces', 'count', 'hours', 'days', 'm2', 'm3']
      if (priceModelToken) quantityTokens.unshift(priceModelToken)

      const toPositiveFinite = (raw: unknown): number | undefined => {
        if (raw == null || raw === '') return undefined
        const n = typeof raw === 'number' ? raw : Number(typeof raw === 'string' ? raw.trim() : raw)
        return Number.isFinite(n) && n > 0 ? n : undefined
      }

      const pickRangeValue = (v: object): number | undefined => {
        if ('min' in v) {
          const minNum = toPositiveFinite((v as { min: unknown }).min)
          if (minNum !== undefined) return minNum
        }
        if ('max' in v) {
          const maxNum = toPositiveFinite((v as { max: unknown }).max)
          if (maxNum !== undefined) return maxNum
        }
        return undefined
      }

      const isNumericValue = (v: unknown) => {
        if (typeof v === 'number' || typeof v === 'string') {
          return toPositiveFinite(v) !== undefined
        }
        if (typeof v === 'object' && v != null && ('min' in v || 'max' in v)) {
          return pickRangeValue(v) !== undefined
        }
        return false
      }

      let estimatedUnits = 0
      const breakdownPackageBase = (booking?.quote?.breakdown || []).find((b) => {
        const item = (b.item || '').toLowerCase()
        return item.includes('package base') || item === 'unit base' || item.startsWith('package_base')
      })
      if (breakdownPackageBase?.quantity && Number.isFinite(breakdownPackageBase.quantity) && breakdownPackageBase.quantity > 0) {
        estimatedUnits = Number(breakdownPackageBase.quantity)
      }

      if (estimatedUnits <= 0) {
        let quantityInput = inputs.find((p) => {
          const name = (p.fieldName || '').toLowerCase()
          return quantityTokens.some((t) => t && name.includes(t)) && isNumericValue(p.value)
        })
        if (!quantityInput) {
          quantityInput = inputs.find((p) => isNumericValue(p.value))
        }

        if (quantityInput) {
          const rawValue: unknown = quantityInput.value
          if (typeof rawValue === 'object' && rawValue != null && ('min' in rawValue || 'max' in rawValue)) {
            estimatedUnits = pickRangeValue(rawValue) ?? 0
          } else {
            estimatedUnits = toPositiveFinite(rawValue) ?? 0
          }
        }
      }
      if (!Number.isFinite(estimatedUnits) || estimatedUnits <= 0) {
        estimatedUnits = 0
      }

      unitDefaults = { estimatedUnits, actualUnits: estimatedUnits, unitPrice }
    }
    setCompletionExtraCosts(prev => [...prev, {
      type,
      name: type === 'unit_adjustment' ? t("extraCosts.unitAdjustmentName") : '',
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
    setExtraCostCharge(previous => mergePersistedExtraCostCharge(previous, {
      extraCostClientSecret: booking?.payment?.extraCostClientSecret,
      extraCostAmount: booking?.payment?.extraCostAmount,
      extraCostCustomerNetAmount: booking?.payment?.extraCostCustomerNetAmount,
      extraCostVatAmount: booking?.payment?.extraCostVatAmount,
      extraCostCustomerDiscount: booking?.payment?.extraCostCustomerDiscount,
      extraCostLoyaltyTier: booking?.payment?.extraCostLoyaltyTier,
      extraCostLoyaltyPercentage: booking?.payment?.extraCostLoyaltyPercentage,
    }))
    if (booking?.status !== "professional_completed") {
      setExtraCostPaymentCompleted(false)
    }
  }, [
    booking?.payment?.extraCostClientSecret,
    booking?.payment?.extraCostAmount,
    booking?.payment?.extraCostCustomerNetAmount,
    booking?.payment?.extraCostVatAmount,
    booking?.payment?.extraCostCustomerDiscount,
    booking?.payment?.extraCostLoyaltyTier,
    booking?.payment?.extraCostLoyaltyPercentage,
    booking?.status,
  ])

  // Before the charge exists: the per-unit customer price less the loyalty
  // discount the customer would get, as the server will compute it.
  const customerExtraCostEstimate = withLoyaltyDiscount(
    commissionedExtraCostTotal(booking?.extraCosts, booking?.extraCostTotal || 0, commissionPercent ?? 0),
  )
  const extraCostAmounts = getExtraCostAmounts(
    extraCostCharge,
    booking?.payment,
    // Extra-cost loyalty is capped at the commission, preserving the supplier's
    // net; a refund of fewer units already includes the commission and has no
    // discount to cap, so the floor applies to positive totals only.
    (booking?.extraCostTotal || 0) > 0
      ? Math.max(booking?.extraCostTotal || 0, customerExtraCostEstimate)
      : customerExtraCostEstimate,
  )

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
  // The completion charge is created in the booking payment's currency; the
  // quote currency is only a fallback for records without a payment yet.
  const completionCurrency = resolveRecordCurrency(
    booking?.payment?.currency,
    booking?.quote?.currency
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
      <div className="max-w-4xl mx-auto pt-20 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">
              {t("page.title")}
            </h1>
            <p className="text-sm text-gray-600">
              {t("page.subtitle")}
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
              {t("common.back")}
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

        {!error && user?.role === 'customer' && bookingId && (
          <CustomerRefundOffer
            bookingId={bookingId}
            currency={booking?.payment?.currency || 'EUR'}
            onResolved={refreshBooking}
          />
        )}

        {/* Refund banner — shown to customer when payment has been refunded */}
        {!error && user?.role === 'customer' && booking?.payment && (booking.payment.status === 'refunded' || booking.payment.status === 'partially_refunded') && (
          <Card className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle className="h-5 w-5 text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-emerald-900">
                    {booking.payment.status === 'refunded' ? t("refund.processed") : t("refund.partial")}
                  </h3>
                  <p className="text-sm text-emerald-800 mt-0.5">
                    {booking.payment.status === 'refunded' && booking.payment.totalWithVat != null && (
                      <>
                        <strong>{formatMoney(booking.payment.totalWithVat, booking.payment.currency || 'EUR')}</strong>{' '}
                        {t("refund.amountRefunded")}
                      </>
                    )}
                    {booking.payment.status === 'partially_refunded' && (
                      <>{t("refund.partialIssued")}</>
                    )}
                    {booking.payment.refundedAt && (
                      <>{t("refund.onDate", { date: formatDate(booking.payment.refundedAt) })}</>
                    )}
                    .
                  </p>
                  {booking.payment.refundReason && (
                    <p className="text-xs text-emerald-700 mt-1">
                      <strong>{t("refund.reasonLabel")}</strong> {booking.payment.refundReason}
                    </p>
                  )}
                  <p className="text-xs text-emerald-600 mt-1">
                    {t("refund.timeline")}
                  </p>
                </div>
              </div>
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
                  <CardTitle className="text-lg text-green-800">{t("postBooking.title")}</CardTitle>
                  <CardDescription className="text-green-700">
                    {t("postBooking.description")}
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
                      placeholder={t("postBooking.answerPlaceholder")}
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
                      <p className="text-sm text-gray-600">{t("postBooking.uploadHint")}</p>
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
                          {t("common.uploading")}
                        </div>
                      )}
                      {postBookingAnswers[index] && isHttpUrl(postBookingAnswers[index]) ? (
                        <a
                          href={postBookingAnswers[index]}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-2 inline-flex text-sm text-indigo-600 hover:underline"
                        >
                          {getFileLabel(postBookingAnswers[index], t("common.openAttachment"))}
                        </a>
                      ) : postBookingAnswers[index] ? (
                        <span className="mt-2 inline-flex text-sm text-gray-700">
                          {getFileLabel(postBookingAnswers[index], t("common.openAttachment"))}
                        </span>
                      ) : null}
                    </div>
                  )}
                  {hasError && (
                    <p id={errorId} role="alert" className="text-xs text-red-600">
                      {t("postBooking.questionRequired")}
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
                      {t("common.submitting")}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {t("postBooking.submit")}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                >
                  {t("postBooking.skip")}
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
              <h3 className="text-lg font-semibold text-green-800 mb-2">{t("postBooking.thankYouTitle")}</h3>
              <p className="text-green-700 mb-4">
                {t("postBooking.thankYouDescription")}
              </p>
              <Button onClick={() => router.push("/dashboard")} className="bg-green-600 hover:bg-green-700">
                {t("postBooking.goToDashboard")}
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
                          t("page.defaultTitle")}
                      </CardTitle>
                    </div>
                    <CardDescription className="text-xs text-gray-500">
                      {booking.bookingType === "project"
                        ? t("page.typeProject")
                        : t("page.typeProfessional")}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs font-medium capitalize rounded-full px-2.5 py-1 ${
                        DETAIL_STATUS_STYLES[booking.status] ||
                        "bg-slate-50 text-slate-700 border border-slate-100"
                      }`}
                    >
                      {enumLabel("status", booking.status)}
                    </Badge>
                    {user?.role === "customer" && (booking.status === "booked" || booking.status === "in_progress") && (
                      <div className="flex flex-wrap gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-300 text-rose-700 hover:bg-rose-50"
                          onClick={() => {
                            resetCancelForm()
                            setShowCancelModal(true)
                          }}
                        >
                          {t("common.cancel")}
                        </Button>
                        {booking.status === "in_progress" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-300 text-amber-700 hover:bg-amber-50"
                            onClick={() => openDisputeModal('in_progress')}
                          >
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            {t("common.dispute")}
                          </Button>
                        )}
                      </div>
                    )}
                    {user?.role === "customer"
                      && booking.rescheduleRequest?.status === "pending"
                      && booking.rescheduleRequest?.requestedBy !== user?._id && (
                      <div className="flex flex-wrap gap-2 justify-end">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => handleRespondReschedule('accept')}
                          disabled={respondingReschedule}
                        >
                          {respondingReschedule ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
                          {t("common.accept")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-300 text-rose-700 hover:bg-rose-50"
                          onClick={() => {
                            setRescheduleRefundNote("")
                            setShowRescheduleRefundModal(true)
                          }}
                          disabled={respondingReschedule}
                        >
                          {t("common.refund")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-300 text-amber-700 hover:bg-amber-50"
                          onClick={() => openDisputeModal('reschedule')}
                          disabled={respondingReschedule}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                          {t("common.dispute")}
                        </Button>
                      </div>
                    )}
                    {user?.role === "customer" && booking.status === "completed" && booking.actualEndDate && (() => {
                      const endTime = new Date(booking.actualEndDate).getTime()
                      const sevenDays = 7 * 24 * 60 * 60 * 1000
                      const withinWindow = Date.now() - endTime <= sevenDays
                      if (!withinWindow) return null
                      if (booking.dispute?.raisedAt) return null
                      return (
                        <div className="flex flex-wrap gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-300 text-amber-700 hover:bg-amber-50"
                            onClick={() => openDisputeModal('completion_request')}
                          >
                            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                            {t("common.dispute")}
                          </Button>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-4 space-y-6">
                {/* Payment Action - Show when quote is accepted but not yet paid (CUSTOMER ONLY) */}
                {user?.role === "customer" && (booking.status === "quote_accepted" || booking.status === "payment_pending") && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-blue-900 mb-1">
                          {t("payment.requiredTitle")}
                        </h3>
                        <p className="text-xs text-blue-700">
                          {t("payment.requiredDescription")}
                        </p>
                      </div>
                      <Button
                        onClick={() => router.push(`/bookings/${booking._id}/payment`)}
                        className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                        size="sm"
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        {t("payment.payNow")}
                      </Button>
                    </div>
                  </div>
                )}

                {user?.role === "customer" && booking.vatDecision?.action === "rfq" && !booking.vatDecision?.reverseCharge && (
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4 space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-amber-900 mb-1">{t("vat.reviewRequiredTitle")}</h3>
                      <p className="text-xs text-amber-800">
                        {booking.vatDecision.explanation || t("vat.reviewRequiredFallback")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {booking.professional?._id && (
                        <StartChatButton
                          professionalId={booking.professional._id}
                          className="bg-white border-amber-200 hover:border-amber-300"
                        />
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-300 text-amber-800 hover:bg-amber-100"
                        onClick={handleProceedAtStandardVat}
                        disabled={proceedingAtStandardVat}
                      >
                        {proceedingAtStandardVat ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        )}
                        {t("vat.proceedStandard")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Professional: customer's answers triggered a VAT review */}
                {user?.role === "professional" && booking.vatDecision?.action === "rfq" && !booking.vatDecision?.reverseCharge && (
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-amber-900 mb-1">{t("vat.reviewRequestedTitle")}</h3>
                    <p className="text-xs text-amber-800">
                      {booking.vatDecision.explanation ||
                        t("vat.reviewRequestedFallback")}
                    </p>
                  </div>
                )}

                {/* Reduced VAT rate confirmed */}
                {booking.vatDecision?.action === "reduced_rate" && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-green-900 mb-1">
                          {t("vat.reducedApplied")}
                          {typeof booking.vatDecision.appliedRate === "number" ? ` (${booking.vatDecision.appliedRate}%)` : ""}
                        </h3>
                        <p className="text-xs text-green-800">
                          {booking.vatDecision.explanation || booking.vatDecision.matchedRuleText ||
                            t("vat.reducedFallback")}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* VAT answers provided by the customer (visible to professional/admin) */}
                {(user?.role === "professional" || user?.role === "admin") &&
                  Array.isArray(booking.vatDecision?.answers) &&
                  booking.vatDecision.answers.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">{t("vat.customerAnswers")}</h3>
                    <dl className="space-y-1">
                      {booking.vatDecision.answers.map((answer) => (
                        <div key={answer.fieldName} className="flex justify-between gap-4 text-xs">
                          <dt className="text-gray-600 capitalize">{answer.fieldName.replace(/[_-]+/g, " ")}</dt>
                          <dd className="font-medium text-gray-900 text-right">
                            {Array.isArray(answer.value)
                              ? answer.value.join(", ")
                              : typeof answer.value === "boolean"
                                ? answer.value ? t("common.yes") : t("common.no")
                                : String(answer.value ?? "—")}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {/* Professional: Quote Accepted - Waiting for Payment */}
                {user?.role === "professional" && (booking.status === "quote_accepted" || booking.status === "payment_pending") && (
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-amber-900 mb-1">
                          {t("quote.acceptedAwaitingPaymentTitle")}
                        </h3>
                        <p className="text-xs text-amber-700">
                          {t("quote.acceptedAwaitingPaymentDescription")}
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
                            {t("rfq.receivedTitle")}
                          </h3>
                          <p className="text-xs text-purple-700">
                            {t("rfq.receivedDescription")}
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
                            {t("rfq.acceptAndCreate")}
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
                                  toast.info(t("rfq.chatUnavailable"))
                                }
                              } else {
                                toast.info(t("rfq.customerUnavailable"))
                              }
                            }}
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            {t("rfq.chatForInfo")}
                          </Button>
                          <Button
                            onClick={() => setShowRejectionModal(true)}
                            disabled={respondingToRFQ}
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50"
                            size="sm"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            {t("common.reject")}
                          </Button>
                        </div>

                        {/* Fallback: Legacy simple quote form */}
                        <div className="pt-2 border-t border-purple-200">
                          <button
                            onClick={() => setShowQuoteForm(true)}
                            className="text-xs text-purple-600 hover:text-purple-800 underline"
                          >
                            {t("rfq.orSimpleQuote")}
                          </button>
                        </div>
                      </div>
                    ) : showQuoteForm ? (
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-purple-900">{t("quote.simpleTitle")}</h3>
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="quoteAmount" className="text-xs">{t("quote.amountLabel")}</Label>
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
                            <Label htmlFor="quoteDescription" className="text-xs">{t("quote.descriptionLabel")}</Label>
                            <Textarea
                              id="quoteDescription"
                              placeholder={t("quote.descriptionPlaceholder")}
                              value={quoteDescription}
                              onChange={(e) => setQuoteDescription(e.target.value)}
                              className="mt-1"
                              rows={3}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={handleSubmitQuote} disabled={submittingQuote} className="bg-purple-600 hover:bg-purple-700 text-white" size="sm">
                              {submittingQuote ? t("common.submitting") : t("quote.submit")}
                            </Button>
                            <Button onClick={() => setShowQuoteForm(false)} variant="outline" size="sm" disabled={submittingQuote}>
                              {t("common.cancel")}
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
                                ? t("rfq.deadlineRemaining", { hours: rfqDeadlineRemaining })
                                : t("rfq.deadlinePassed")}
                            </h3>
                            <p className="text-xs text-amber-700">
                              {t("rfq.deadline", {
                                date: rfqDeadlineDate ? rfqDeadlineDate.toLocaleDateString(intl) : "",
                                time: rfqDeadlineDate ? rfqDeadlineDate.toLocaleTimeString(intl) : "",
                              })}
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
                            <h3 className="text-sm font-semibold text-purple-900 mb-1">{t("quotation.createTitle")}</h3>
                            <p className="text-xs text-purple-700">{t("quotation.createDescription")}</p>
                          </div>
                          <Button onClick={() => setShowQuotationWizard(true)} className="bg-purple-600 hover:bg-purple-700 text-white shrink-0" size="sm">
                            <FileText className="h-4 w-4 mr-2" />
                            {t("quotation.openWizard")}
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
                          <h3 className="text-sm font-semibold text-purple-900 mb-1">{t("quotation.draftTitle")}</h3>
                          <p className="text-xs text-purple-700">{t("quotation.draftDescription")}</p>
                        </div>
                        <Button onClick={() => setShowQuotationWizard(true)} className="bg-purple-600 hover:bg-purple-700 text-white shrink-0" size="sm">
                          <FileText className="h-4 w-4 mr-2" />
                          {t("quotation.create")}
                        </Button>
                      </div>
                    </div>
                  )
                )}

                {/* Customer: New Quotation Display (when quoteVersions exist) */}
                {user?.role === "customer" && booking.status === "quoted" && hasQuotationVersions && currentVersion && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-green-900">{t("quotation.receivedTitle")}</h3>
                      {booking.quotationNumber && (
                        <Badge variant="outline" className="text-xs">{booking.quotationNumber}</Badge>
                      )}
                    </div>

                    <div className="bg-white rounded-lg p-4 space-y-3">
                      <div>
                        <p className="text-xs text-gray-500 font-medium">{t("quotation.scope")}</p>
                        <p className="text-sm text-gray-900">{currentVersion.scope}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium">{t("quotation.description")}</p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{currentVersion.description}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-gray-500 font-medium">{t("quotation.warranty")}</p>
                          <p className="text-sm">{currentVersion.warrantyDuration.value} {enumLabel("unit", currentVersion.warrantyDuration.unit)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium">{t("quotation.materials")}</p>
                          <p className="text-sm">{currentVersion.materialsIncluded ? t("quotation.materialsIncluded") : t("quotation.materialsNotIncluded")}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium">{t("quotation.prepTime")}</p>
                          <p className="text-sm">{currentVersion.preparationDuration.value} {enumLabel("unit", currentVersion.preparationDuration.unit)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium">{t("quotation.executionTime")}</p>
                          <p className="text-sm">{currentVersion.executionDuration.value} {enumLabel("unit", currentVersion.executionDuration.unit)}</p>
                        </div>
                      </div>
                      {currentVersion.materialsIncluded && currentVersion.materials && currentVersion.materials.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">{t("quotation.materialsList")}</p>
                          <ul className="text-sm space-y-0.5">
                            {currentVersion.materials.map((m, i) => (
                              <li key={i} className="text-gray-700">
                                {m.name}{m.quantity ? ` x${m.quantity}` : ''}{m.unit ? ` ${m.unit}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(booking.project?.minResources != null || booking.project?.minOverlapPercentage != null) && (
                        <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
                          <p className="text-xs text-blue-800">
                            <span className="font-semibold">{t("quotation.teamRequirement")}</span>{' '}
                            {booking.project?.minResources != null
                              ? booking.project?.resources?.length
                                ? t("quotation.teamRequiredOf", { min: booking.project.minResources, total: booking.project.resources.length })
                                : t("quotation.teamRequired", { count: booking.project.minResources })
                              : t("quotation.teamNoMinimum")}
                            {booking.project?.minOverlapPercentage != null
                              ? t("quotation.scheduleOverlap", { percent: booking.project.minOverlapPercentage })
                              : ''}
                          </p>
                        </div>
                      )}
                      {/* Milestones */}
                      {currentVersion.milestones && currentVersion.milestones.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">{t("quotation.paymentMilestones")}</p>
                          <div className="space-y-1.5">
                            {currentVersion.milestones.map((ms, i) => (
                              <div key={i} className="flex justify-between items-center text-sm bg-gray-50 rounded px-2 py-1">
                                <span className="text-gray-700">{ms.title}</span>
                                <span className="font-medium">
                                  {customerPricingReady
                                    ? formatMoney(currentVersionMilestoneGrossAmounts[i] ?? 0, booking.quote?.currency || 'EUR')
                                    : '...'}
                                </span>
                              </div>
                            ))}
                          </div>
                          {customerPricingReady && (
                            <p className="mt-1 text-[11px] text-gray-500">
                              {t("quotation.milestonesNote")}
                            </p>
                          )}
                        </div>
                      )}
                      {currentVersion.pricingLines && currentVersion.pricingLines.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-2">{t("quotation.pricingBreakdown")}</p>
                          <div className="rounded-md border overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                  <th className="text-left px-3 py-2 font-medium">{t("quotation.tableDescription")}</th>
                                  <th className="text-right px-3 py-2 font-medium">{t("quotation.tableNet")}</th>
                                  <th className="text-right px-3 py-2 font-medium">{t("quotation.tableVat")}</th>
                                  <th className="text-right px-3 py-2 font-medium">{t("quotation.tableTotal")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {currentVersion.pricingLines.map((line, index) => {
                                  const net = customerPricingReady ? customerPrice(line.price) : line.price
                                  const vatAmount = net * ((line.vatRate || 0) / 100)
                                  const total = net + vatAmount
                                  return (
                                    <tr key={index} className="border-t">
                                      <td className="px-3 py-2 text-gray-800">
                                        <div>{line.description}</div>
                                        <div className="text-[10px] text-gray-500">
                                          {line.vatLabel || t("quotation.vatRate", { rate: line.vatRate })}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-right">{customerPricingReady ? formatMoney(net, currentVersion.currency || 'EUR') : '...'}</td>
                                      <td className="px-3 py-2 text-right">{customerPricingReady ? formatMoney(vatAmount, currentVersion.currency || 'EUR') : '...'}</td>
                                      <td className="px-3 py-2 text-right font-medium">{customerPricingReady ? formatMoney(total, currentVersion.currency || 'EUR') : '...'}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-sm font-semibold text-gray-900">{t("quotation.totalInclVat")}</span>
                        <span className="text-2xl font-bold text-green-600">{customerPricingReady ? formatMoney(currentVersionQuoteTotals.total, booking.quote?.currency || 'EUR') : '...'}</span>
                      </div>
                      {customerPricingReady && currentVersionQuoteTotals.vatAmount > 0 && (
                        <p className="text-xs text-gray-500 text-right">
                          {t("quotation.netPlusVat", {
                            net: formatMoney(currentVersionQuoteTotals.netAmount, booking.quote?.currency || 'EUR'),
                            vat: formatMoney(currentVersionQuoteTotals.vatAmount, booking.quote?.currency || 'EUR'),
                          })}
                        </p>
                      )}
                      {customerPricingReady && loyalty && loyalty.percentage > 0 && (
                        <div className="flex items-center justify-between rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                          <div className="text-xs text-amber-800">
                            <span className="font-semibold">{t("loyalty.member", { level: loyalty.level })}</span> · {t("loyalty.discountApplied", { percentage: loyalty.percentage })}
                          </div>
                          <div className="text-xs font-semibold text-amber-900">
                            {t("quotation.youSave", { amount: formatMoney(currentVersionOriginalQuoteTotals.total - currentVersionQuoteTotals.total, booking.quote?.currency || 'EUR') })}
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-gray-500">
                        {t("quotation.validUntil", { date: formatValidUntilLabel(currentVersion?.validUntil, intl, t("common.notAvailable")) })}
                      </p>
                    </div>

                    {/* Version history accordion */}
                    {(booking.quoteVersions?.length || 0) > 1 && (
                      <div className="border rounded-lg">
                        <button
                          onClick={() => setVersionHistoryOpen(!versionHistoryOpen)}
                          className="flex items-center justify-between w-full p-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <span>{t("quotation.versionHistory", { count: booking.quoteVersions?.length ?? 0 })}</span>
                          {versionHistoryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {versionHistoryOpen && (
                          <div className="border-t p-3 space-y-2">
                            {booking.quoteVersions?.map((v, i) => (
                              <div key={i} className={`p-2 rounded text-sm ${v.version === booking.currentQuoteVersion ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">v{v.version}</span>
                                  <span className="text-xs text-gray-500">{formatDate(v.createdAt)}</span>
                                </div>
                                <p className="text-xs text-gray-600">{customerPricingReady ? formatMoney(calculateQuoteVersionVatTotals(v, customerPrice).total, booking.quote?.currency || 'EUR') : '...'}</p>
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
                        {t("quotation.acceptAndPay")}
                      </Button>
                      <Button
                        onClick={() => setShowQuoteRejectionModal(true)}
                        disabled={respondingToQuotation}
                        variant="outline"
                        className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                        size="sm"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        {t("quotation.rejectWithReason")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Professional: View submitted quotation (read-only) + Edit button */}
                {user?.role === "professional" && booking.status === "quoted" && hasQuotationVersions && currentVersion && !showQuotationWizard && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-blue-900">{t("quotation.yourQuotation", { version: currentVersion.version })}</h3>
                      <Button onClick={() => setShowQuotationWizard(true)} variant="outline" size="sm">
                        <FileText className="h-4 w-4 mr-2" />
                        {t("quotation.edit")}
                      </Button>
                    </div>
                    <div className="bg-white rounded-lg p-3 space-y-2 text-sm">
                      <p><span className="text-gray-500">{t("quotation.scopeLabel")}</span> {currentVersion.scope}</p>
                      <p>
                        <span className="text-gray-500">{t("quotation.netTotal")}</span>{' '}
                        <strong>{formatMoney(currentVersion.totalAmount, booking.quote?.currency || 'EUR')}</strong>
                      </p>
                      <p>
                        <span className="text-gray-500">{t("quotation.totalInclVatLabel")}</span>{' '}
                        <strong>{formatMoney(calculateQuoteVersionVatTotals(currentVersion).total, booking.quote?.currency || 'EUR')}</strong>
                      </p>
                      <p><span className="text-gray-500">{t("quotation.validUntilLabel")}</span> {formatValidUntilLabel(currentVersion?.validUntil, intl, t("common.notAvailable"))}</p>
                      <p className="text-xs text-gray-500">{t("quotation.waitingForCustomer")}</p>
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
                      <h3 className="text-sm font-semibold text-rose-900 mb-2">{t("quotation.rejectedByCustomer")}</h3>
                      {booking.customerRejectionReason && (
                        <div className="bg-white rounded-lg p-3 mb-3">
                          <p className="text-xs text-gray-500 mb-1">{t("quotation.customerFeedback")}</p>
                          <p className="text-sm text-gray-800">{booking.customerRejectionReason}</p>
                        </div>
                      )}
                      {!showQuotationWizard && (
                        <Button onClick={() => setShowQuotationWizard(true)} className="bg-purple-600 hover:bg-purple-700 text-white" size="sm">
                          <FileText className="h-4 w-4 mr-2" />
                          {t("quotation.reviseAndResubmit")}
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
                    <h3 className="text-sm font-semibold text-sky-900 mb-3">{t("milestones.title")}</h3>
                    {(() => {
                      const isCustomerView = user?.role === 'customer'
                      const displayAmounts = booking.milestonePayments!.map((milestone, index) =>
                        isCustomerView && customerPricingReady
                          ? bookingMilestoneGrossAmounts[index] ?? customerPrice(milestone.amount)
                          : milestone.amount
                      )
                      const displayTotal = displayAmounts.reduce((sum, amount) => sum + amount, 0)
                      const displayPaid = booking.milestonePayments!.reduce((sum, milestone, index) =>
                        milestone.status === 'paid' ? sum + (displayAmounts[index] || 0) : sum
                      , 0)
                      const displayCompleted = booking.milestonePayments!.reduce((sum, milestone, index) =>
                        (milestone.workStatus || 'pending') === 'completed' ? sum + (displayAmounts[index] || 0) : sum
                      , 0)
                      const paymentPct = displayTotal > 0 ? Math.round((displayPaid / displayTotal) * 100) : 0
                      const workPct = displayTotal > 0 ? Math.round((displayCompleted / displayTotal) * 100) : 0
                      const showAmounts = !isCustomerView || customerPricingReady
                      const amountLabel = isCustomerView ? t("milestones.basisInclVat") : t("milestones.basisNet")
                      return (
                        <div className="mb-4 space-y-3">
                          <div>
                            <div className="flex justify-between text-xs text-gray-600 mb-1">
                              <span>{t("milestones.workProgress")}</span>
                              <span>{workPct}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${workPct}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-xs text-gray-600 mb-1">
                              <span>{t("milestones.paymentProgress")}</span>
                              <span>{paymentPct}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div className="bg-sky-500 h-2 rounded-full transition-all" style={{ width: `${paymentPct}%` }} />
                            </div>
                          </div>
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>{t("milestones.completedAmount", {
                              amount: showAmounts ? formatMoney(displayCompleted, booking.quote?.currency || 'EUR') : '...',
                              basis: amountLabel,
                            })}</span>
                            <span>{t("milestones.paidAmount", {
                              amount: showAmounts ? formatMoney(displayPaid, booking.quote?.currency || 'EUR') : '...',
                              basis: amountLabel,
                            })}</span>
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
                          if (dueCondition === 'on_start') return t("milestones.due.onStart")
                          if (dueCondition === 'on_milestone_start') return t("milestones.due.onMilestoneStart")
                          if (dueCondition === 'on_milestone_completion') return t("milestones.due.onMilestoneCompletion")
                          if (dueCondition === 'custom_date' && ms.customDueDate) return t("milestones.due.onDate", { date: formatDate(ms.customDueDate) })
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
                                  <p className="text-xs text-gray-500">
                                    {user?.role === 'customer'
                                      ? (customerPricingReady ? formatMoney(bookingMilestoneGrossAmounts[i] ?? customerPrice(ms.amount), booking.quote?.currency || 'EUR') : '...')
                                      : formatMoney(ms.amount, booking.quote?.currency || 'EUR')}
                                    {user?.role === 'customer' ? ` ${t("milestones.basisInclVat")}` : ` ${t("milestones.basisNet")}`}
                                  </p>
                                  {dueLabel && !isPaid && (
                                    <p className="text-[11px] text-sky-700">{dueLabel}</p>
                                  )}
                                  {ms.startedAt && (
                                    <p className="text-[11px] text-gray-500">{t("milestones.startedAt", { date: formatDate(ms.startedAt) })}</p>
                                  )}
                                  {ms.completedAt && (
                                    <p className="text-[11px] text-gray-500">{t("milestones.completedAt", { date: formatDate(ms.completedAt) })}</p>
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
                                  {enumLabel("workStatus", workStatus)}
                                </Badge>
                                <Badge className={isPaid ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}>
                                  {isPaid ? t("milestones.paid") : t("milestones.unpaid")}
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
                                  {t("milestones.start")}
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
                                  {t("milestones.markComplete")}
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
                                  {t("milestones.pay")}
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
                    <h3 className="text-sm font-semibold text-green-900 mb-3">{t("quote.receivedTitle")}</h3>
                    <div className="bg-white rounded-lg p-4 mb-4 space-y-2">
                      {/* Original quote amount */}
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{t("quote.amountExclVat")}</span>
                        <span className={`text-2xl font-bold ${discountPreview && discountPreview.totalDiscount > 0 ? "text-gray-400 line-through text-lg" : "text-green-600"}`}>
                          {booking.quote.amount != null ? formatMoney(booking.quote.amount, booking.quote.currency || "€") : "—"}
                        </span>
                      </div>

                      {/* Discount breakdown */}
                      {loadingDiscountPreview && (
                        <div className="flex items-center gap-2 text-xs text-gray-500 pt-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {t("quote.checkingDiscounts")}
                        </div>
                      )}

                      {discountPreview && discountPreview.totalDiscount > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-dashed border-green-200">
                          {discountPreview.loyaltyDiscount.amount > 0 && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-green-700 flex items-center gap-1">
                                <Shield className="h-3.5 w-3.5" />
                                {t("loyalty.memberDiscount", { tier: discountPreview.loyaltyDiscount.tier, percentage: discountPreview.loyaltyDiscount.percentage })}
                              </span>
                              <span className="text-green-600 font-medium">
                                -{formatMoney(discountPreview.loyaltyDiscount.amount, booking.quote.currency || "€")}
                              </span>
                            </div>
                          )}
                          {discountPreview.repeatBuyerDiscount.amount > 0 && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-green-700 flex items-center gap-1">
                                <Star className="h-3.5 w-3.5" />
                                {t("loyalty.returningCustomer", { percentage: discountPreview.repeatBuyerDiscount.percentage })}
                              </span>
                              <span className="text-green-600 font-medium">
                                -{formatMoney(discountPreview.repeatBuyerDiscount.amount, booking.quote.currency || "€")}
                              </span>
                            </div>
                          )}
                          {discountPreview.pointsDiscount && discountPreview.pointsDiscount.discountAmount > 0 && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-green-700 flex items-center gap-1">
                                <Gift className="h-3.5 w-3.5" />
                                {t("loyalty.pointsRedeemedUpper", { points: discountPreview.pointsDiscount.pointsUsed })}
                              </span>
                              <span className="text-green-600 font-medium">
                                -{formatMoney(discountPreview.pointsDiscount.discountAmount, booking.quote.currency || "€")}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-2 border-t border-green-200">
                            <span className="text-sm font-semibold text-green-900">{t("quote.youPay")}</span>
                            <span className="text-2xl font-bold text-green-600">
                              {formatMoney(discountPreview.finalAmount, booking.quote.currency || "€")}
                            </span>
                          </div>
                          <p className="text-xs text-green-600 text-right">
                            {t("quote.youSaveBang", { amount: formatMoney(discountPreview.totalDiscount, booking.quote.currency || "€") })}
                          </p>
                        </div>
                      )}

                      {booking.quote.description && (
                        <div className="pt-2 border-t">
                          <p className="text-xs text-gray-600 mb-1">{t("quote.descriptionLabelShort")}</p>
                          <p className="text-sm text-gray-800">{booking.quote.description}</p>
                        </div>
                      )}
                      {booking.quote.submittedAt && (
                        <p className="text-xs text-gray-500 pt-2">
                          {t("quote.submitted", { date: formatDate(booking.quote.submittedAt) })}
                        </p>
                      )}
                    </div>

                    {loadingDiscountPreview && (
                      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <p className="text-xs text-blue-700">{t("loyalty.calculatingSavings")}</p>
                      </div>
                    )}

                    {discountPreview && (
                      <div className="mb-4 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-amber-900">
                            {t("loyalty.memberBenefits", { tier: discountPreview.loyaltyDiscount.tier })}
                          </p>
                          <Badge variant="outline" className="border-amber-300 bg-white text-amber-800">
                            {discountPreview.loyaltyDiscount.tier}
                          </Badge>
                        </div>

                        <div className="mt-3 space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-700">{t("loyalty.originalQuote")}</span>
                            <span className="font-medium text-gray-900">
                              {formatMoney(discountPreview.originalAmount, discountPreview.currency)}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-gray-700">
                              {t("loyalty.loyaltyDiscount", { percentage: discountPreview.loyaltyDiscount.percentage })}
                            </span>
                            <span className="font-medium text-green-700">
                              -{formatMoney(discountPreview.loyaltyDiscount.amount, discountPreview.currency)}
                            </span>
                          </div>

                          {discountPreview.repeatBuyerDiscount.amount > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-700">
                                {t("loyalty.returningCustomerDiscount", { percentage: discountPreview.repeatBuyerDiscount.percentage })}
                              </span>
                              <span className="font-medium text-green-700">
                                -{formatMoney(discountPreview.repeatBuyerDiscount.amount, discountPreview.currency)}
                              </span>
                            </div>
                          )}

                          {discountPreview.pointsDiscount && discountPreview.pointsDiscount.discountAmount > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-700">
                                {t("loyalty.pointsRedeemed", { points: discountPreview.pointsDiscount.pointsUsed })}
                              </span>
                              <span className="font-medium text-green-700">
                                -{formatMoney(discountPreview.pointsDiscount.discountAmount, discountPreview.currency)}
                              </span>
                            </div>
                          )}

                          <div className="flex justify-between border-t border-amber-200 pt-2">
                            <span className="font-semibold text-gray-900">{t("loyalty.youSave")}</span>
                            <span className="font-semibold text-green-700">
                              {formatMoney(discountPreview.totalDiscount, discountPreview.currency)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-semibold text-gray-900">{t("loyalty.youPay")}</span>
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
                      return (
                      <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3">
                        <p className="text-sm font-medium text-purple-900 mb-2 flex items-center gap-1">
                          <Gift className="h-4 w-4" />
                          {t("loyalty.useYourPoints")}
                        </p>
                        <p className="text-xs text-purple-700 mb-2">
                          {t("loyalty.pointsAvailable", { points: discountPreview.availablePoints ?? 0, value: formatMoney((discountPreview.availablePoints ?? 0) * conversionRate) })}
                          {discountPreview.pointsExpiry && (
                            <span> &middot; {t("loyalty.expires", { date: formatDate(discountPreview.pointsExpiry) })}</span>
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
                          <span className="text-xs text-purple-700">{t("loyalty.pointsToRedeem")}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-auto text-xs border-purple-300"
                            onClick={() => setPointsToRedeem(maxRedeem)}
                          >
                            {t("loyalty.useAll")}
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
                        {respondingToQuote ? t("common.processing") : t("quotation.acceptAndPay")}
                      </Button>
                      <Button
                        onClick={() => handleRespondToQuote("reject")}
                        disabled={respondingToQuote}
                        variant="outline"
                        className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                        size="sm"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        {t("common.reject")}
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
                          {t("work.readyToStartTitle")}
                        </h3>
                        <p className="text-xs text-blue-700">
                          {t("work.readyToStartDescription")}
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
                            {t("work.starting")}
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            {t("work.startWork")}
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
                          {t("completion.readyTitle")}
                        </h3>
                        <p className="text-xs text-green-700 mb-2">
                          {t("completion.readyDescription")}
                        </p>
                      </div>
                      <Button
                        onClick={() => setShowCompletionModal(true)}
                        className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                        size="sm"
                      >
                        <CheckCheck className="h-4 w-4 mr-2" />
                        {t("completion.confirmButton")}
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
                          {t("completion.awaitingCustomerTitle")}
                        </h3>
                        <p className="text-xs text-amber-700 mb-2">
                          {booking.extraCostTotal
                            ? t("completion.awaitingCustomerWithExtras", { amount: formatMoney(booking.extraCostTotal, booking.payment?.currency || 'EUR') })
                            : t("completion.awaitingCustomerDescription")}
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
                          {t("work.inProgressTitle")}
                        </h3>
                        <p className="text-xs text-teal-700 mb-2">
                          {t("work.inProgressDescription")}
                        </p>
                        <p className="text-xs text-teal-600 font-medium">
                          {t("work.escrowNote")}
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
                        {t("completion.professionalCompletedTitle")}
                      </h3>
                      <p className="text-xs text-teal-700">
                        {t("completion.professionalCompletedDescription")}
                      </p>
                    </div>

                    {booking.completionAttestation?.notes && (
                      <div className="bg-white/60 rounded p-2">
                        <p className="text-xs font-medium text-gray-700 mb-1">{t("completion.professionalNotes")}</p>
                        <p className="text-xs text-gray-600">{booking.completionAttestation.notes}</p>
                      </div>
                    )}

                    {booking.completionAttestation?.attachments && booking.completionAttestation.attachments.length > 0 && (
                      <div className="bg-white/60 rounded p-2 space-y-1">
                        <p className="text-xs font-medium text-gray-700 mb-1">{t("completion.attachments", { count: booking.completionAttestation.attachments.length })}</p>
                        <div className="flex flex-col gap-1">
                          {booking.completionAttestation.attachments.map((url, i) => (
                            <a
                              key={`${url}-${i}`}
                              href={url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-indigo-700 hover:bg-slate-100"
                            >
                              <span className="truncate pr-3">{getFileLabel(url, t("common.attachmentNumber", { number: i + 1 }))}</span>
                              <span className="font-medium">{t("common.open")}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {booking.extraCosts && booking.extraCosts.length > 0 && (
                      <div className="bg-white/60 rounded p-2 space-y-2">
                        <p className="text-xs font-semibold text-gray-700">{t("extraCosts.title")}</p>
                        {booking.extraCosts.map((cost, i) => {
                          const displayAmount = customerPricingReady ? commissionedExtraCost(cost, commissionPercent ?? 0) : null
                          const isPositive = displayAmount == null ? cost.amount >= 0 : displayAmount >= 0
                          return (
                            <div key={i} className="border-b border-gray-100 pb-1.5 last:border-0">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-medium text-gray-800">{cost.name}</span>
                                <span className={`text-xs font-semibold ${isPositive ? 'text-red-600' : 'text-green-600'}`}>
                                  {customerPricingReady
                                    ? `${displayAmount! >= 0 ? '+' : ''}${formatMoney(displayAmount!, booking.payment?.currency || 'EUR')}`
                                    : '...'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                <span className="capitalize">{enumLabel("extraCostType", cost.type)}</span>
                                {cost.type === 'unit_adjustment' && ` ${t("extraCosts.unitDetail", { estimated: cost.estimatedUnits ?? 0, actual: cost.actualUnits ?? 0 })}`}
                              </p>
                              <p className="text-xs text-gray-500 italic">{cost.justification}</p>
                            </div>
                          )
                        })}
                        {customerPricingReady ? (() => {
                          const currency = booking.payment?.currency || 'EUR'
                          const rawTotal = booking.extraCostTotal || 0
                          const subtotalInclCommission = extraCostCharge?.subtotalInclCommission
                            ?? commissionedExtraCostTotal(booking.extraCosts, rawTotal, commissionPercent ?? 0)
                          const { vat: vatAmount, vatRate, net: netCharge, total: displayedTotal } = extraCostAmounts
                          const computedLoyalty = rawTotal > 0
                            ? Math.max(0, +(subtotalInclCommission - netCharge).toFixed(2))
                            : 0
                          const persistedLoyaltyDiscount = booking.payment?.extraCostCustomerDiscount
                          const loyaltyDiscount = extraCostCharge
                            ? (extraCostCharge.loyaltyDiscountAmount ?? computedLoyalty)
                            : (typeof persistedLoyaltyDiscount === "number" ? persistedLoyaltyDiscount : computedLoyalty)
                          // Prefer the terms stored with the PaymentIntent: the
                          // customer's current tier may have changed since.
                          const loyaltyLevel = extraCostCharge?.loyaltyLevel || loyalty?.level || 'Loyalty'
                          const loyaltyPercentage = extraCostCharge?.loyaltyPercentage ?? loyalty?.percentage ?? 0
                          const showLoyalty = loyaltyDiscount > 0 && loyaltyPercentage > 0
                          return (
                            <div className="space-y-1 pt-1 border-t border-gray-200 text-xs">
                              {commissionPercent != null && rawTotal !== 0 && (
                                <div className="flex justify-between text-gray-600">
                                  <span>{t("extraCosts.subtotal", { percent: commissionPercent })}</span>
                                  <span>{subtotalInclCommission >= 0 ? '+' : ''}{formatMoney(subtotalInclCommission, currency)}</span>
                                </div>
                              )}
                              {showLoyalty && (
                                <div className="flex justify-between text-green-600">
                                  <span>{t("extraCosts.loyaltyLine", { level: loyaltyLevel, percentage: loyaltyPercentage })}</span>
                                  <span>−{formatMoney(loyaltyDiscount, currency)}</span>
                                </div>
                              )}
                              {vatAmount > 0 && (
                                <div className="flex justify-between text-gray-600">
                                  <span>{t("extraCosts.vat")}{vatRate > 0 ? ` (${vatRate}%)` : ''}</span>
                                  <span>+{formatMoney(vatAmount, currency)}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                                <span className="text-xs font-semibold text-gray-800">{t("extraCosts.total")}</span>
                                <span className={`text-sm font-bold ${displayedTotal >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {displayedTotal >= 0 ? '+' : ''}{formatMoney(displayedTotal, currency)}
                                </span>
                              </div>
                            </div>
                          )
                        })() : (
                          <div className="flex justify-between items-center pt-1 border-t border-gray-200 text-xs">
                            <span className="font-semibold text-gray-800">{t("extraCosts.total")}</span>
                            <span className="font-bold text-gray-400">...</span>
                          </div>
                        )}
                      </div>
                    )}

                    {Array.isArray(booking.milestonePayments) && booking.milestonePayments.length > 0 && booking.milestonePayments.some(m => m.status !== 'paid') && (
                      <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                        {t("completion.outstandingMilestones")}
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
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("common.processing")}</>
                        ) : (
                          <><CheckCheck className="h-4 w-4 mr-2" />{booking.extraCostTotal && booking.extraCostTotal > 0 ? t("completion.reviewPaymentAndComplete") : t("completion.confirmButton")}</>
                        )}
                      </Button>
                      <Button
                        onClick={() => openDisputeModal('extra_costs')}
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                        size="sm"
                      >
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        {t("common.dispute")}
                      </Button>
                    </div>

                    {(booking.extraCostTotal || 0) > 0 && extraCostClientSecret && (booking.payment?.extraCostAmount != null || customerPricingReady) && (
                      <div className="rounded-lg border border-teal-200 bg-white/80 p-3 space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-teal-900">{t("extraCosts.payBeforeConfirmTitle")}</p>
                          <p className="text-xs text-teal-700">
                            {t("extraCosts.payBeforeConfirmDescription")}
                          </p>
                        </div>
                        {extraCostPaymentCompleted && (
                          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                            {t("extraCosts.paymentSucceeded")}
                          </div>
                        )}
                        <StripeProvider>
                          <PaymentForm
                            clientSecret={extraCostClientSecret}
                            amount={extraCostAmounts.total}
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
                          {t("work.completedTitle")}
                        </h3>
                        <p className="text-xs text-emerald-700">
                          {t("work.completedDescription")}
                        </p>
                        {user?.role === "professional" && (
                          <p className="text-xs text-emerald-600 font-medium mt-2">
                            {t("work.payoutTimeline")}
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
                                {t("review.leaveReview")}
                              </Button>
                            )
                          }

                          if ((isCustomer && customerHasReviewed) || (isProfessional && professionalHasReviewed)) {
                            return (
                              <p className="text-xs text-emerald-600 font-medium mt-2 flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                {t("review.alreadyReviewed")}
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
                        <h3 className="text-sm font-semibold text-indigo-900">{t("warranty.title")}</h3>
                        {!hasWarrantyCoverage && (
                          <p className="text-xs text-gray-600 mt-1">
                            {t("warranty.noCoverage")}
                          </p>
                        )}
                        {hasWarrantyCoverage && (
                          <p className="text-xs text-gray-600 mt-1">
                            {t("warranty.coverage", {
                              duration: `${booking.warrantyCoverage?.duration?.value ?? 0} ${enumLabel("unit", booking.warrantyCoverage?.duration?.unit)}`,
                            })}
                            {warrantyEndsAtDate && (
                              <> · {t("warranty.expiresOn", { date: warrantyEndsAtDate.toLocaleDateString(intl) })}</>
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
                              ? t("warranty.activeClaimExists")
                              : isWarrantyExpired
                              ? t("warranty.periodExpired")
                              : undefined
                          }
                          onClick={() => setShowWarrantyClaimDialog(true)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          {t("warranty.openClaim")}
                        </Button>
                      )}
                    </div>

                    {loadingWarrantyClaim && (
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t("warranty.loadingClaim")}
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
                              {t("warranty.reasonLabel", { reason: enumLabel("warrantyReason", warrantyClaim.reason) })}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs bg-white">
                            {enumLabel("warrantyStatus", warrantyClaim.status)}
                          </Badge>
                        </div>

                        <p className="text-xs text-gray-700 whitespace-pre-line">
                          {warrantyClaim.description}
                        </p>

                        {Array.isArray(warrantyClaim.evidence) && warrantyClaim.evidence.length > 0 && (
                          <div className="text-xs">
                            <p className="font-medium text-gray-600 mb-1">{t("warranty.evidence")}</p>
                            <div className="flex flex-wrap gap-2">
                              {warrantyClaim.evidence.map((url, idx) => (
                                <a
                                  key={`${url}-${idx}`}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline text-indigo-600"
                                >
                                  {t("warranty.fileNumber", { number: idx + 1 })}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {warrantyClaim.proposal?.message && (
                          <div className="rounded border bg-white p-2">
                            <p className="text-xs font-medium text-gray-700 mb-1">{t("warranty.resolveProposal")}</p>
                            <p className="text-xs text-gray-700 whitespace-pre-line">{warrantyClaim.proposal.message}</p>
                            {(warrantyClaim.proposal.resolveByDate || warrantyClaim.proposal.proposedScheduleAt) && (
                              <p className="mt-1 text-[11px] text-gray-500">
                                {t("warranty.resolveDate", { date: formatDateTime(warrantyClaim.proposal.resolveByDate || warrantyClaim.proposal.proposedScheduleAt || "") })}
                              </p>
                            )}
                          </div>
                        )}

                        {warrantyClaim.escalation && (
                          <div className="rounded border border-amber-200 bg-amber-50 p-2">
                            <p className="text-xs font-medium text-amber-800">{t("warranty.escalatedToAdmin")}</p>
                            <p className="text-xs text-amber-700">
                              {warrantyClaim.escalation.reason}
                              {warrantyClaim.escalation.note ? ` · ${warrantyClaim.escalation.note}` : ""}
                            </p>
                          </div>
                        )}

                        {warrantyClaim.resolution?.summary && (
                          <div className="rounded border border-green-200 bg-green-50 p-2">
                            <p className="text-xs font-medium text-green-800">{t("warranty.resolution")}</p>
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
                                    {getFileLabel(attachment, t("warranty.resolutionAttachment", { number: index + 1 }))}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {user?.role === "professional" && warrantyClaim.status === "open" && (
                          <div className="space-y-2 rounded border bg-white p-3">
                            <Label className="text-xs">{t("warranty.resolveProposalLabel")}</Label>
                            <Textarea
                              value={warrantyProposalMessage}
                              onChange={(e) => setWarrantyProposalMessage(e.target.value)}
                              placeholder={t("warranty.resolveProposalPlaceholder")}
                              className="text-xs min-h-[90px]"
                            />
                            <Label className="text-xs">{t("warranty.resolveDateLabel")}</Label>
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
                                {t("warranty.sendProposal")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowDeclineReasonDialog(true)}
                                disabled={warrantyActionLoading}
                                className="border-rose-300 text-rose-700"
                              >
                                {t("warranty.declineClaim")}
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
                              {t("warranty.acceptProposal")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRespondToWarrantyProposal("decline")}
                              disabled={warrantyActionLoading}
                              className="border-rose-300 text-rose-700"
                            >
                              {t("warranty.declineAndEscalate")}
                            </Button>
                          </div>
                        )}

                        {user?.role === "professional" && warrantyClaim.status === "proposal_accepted" && (
                          <div className="space-y-2 rounded border bg-white p-3">
                            <Label className="text-xs">{t("warranty.resolutionSummaryLabel")}</Label>
                            <Textarea
                              value={warrantyResolutionSummary}
                              onChange={(e) => setWarrantyResolutionSummary(e.target.value)}
                              placeholder={t("warranty.resolutionSummaryPlaceholder")}
                              className="text-xs min-h-[80px]"
                            />
                            <div className="space-y-2">
                              <Label className="text-xs">{t("warranty.resolutionAttachments")}</Label>
                              <Input
                                type="file"
                                multiple
                                accept="image/*,video/*,.pdf"
                                onChange={(e) => {
                                  const { valid, rejected } = validateWarrantyFiles(e.target.files)
                                  setWarrantyResolutionFiles(valid)
                                  if (rejected.length > 0) {
                                    toast.error(formatWarrantyRejections(rejected))
                                  }
                                }}
                                className="text-xs"
                              />
                              {warrantyResolutionFiles.length > 0 && (
                                <p className="text-[11px] text-gray-500">{t("warranty.filesSelected", { count: warrantyResolutionFiles.length })}</p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              onClick={handleMarkWarrantyResolved}
                              disabled={warrantyActionLoading}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              {t("warranty.markResolved")}
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
                              {t("warranty.acceptResolution")}
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
                              {t("warranty.declineResolution")}
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
                      <DialogTitle>{t("warranty.openClaimTitle")}</DialogTitle>
                      <DialogDescription>
                        {t("warranty.openClaimDescription")}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="warranty-reason">{t("warranty.reason")}</Label>
                        <select
                          id="warranty-reason"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={warrantyClaimReason}
                          onChange={(e) => setWarrantyClaimReason(e.target.value)}
                        >
                          {WARRANTY_REASON_VALUES.map((value) => (
                            <option key={value} value={value}>{enumLabel("warrantyReason", value)}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="warranty-description">{t("warranty.issueDescription")}</Label>
                        <Textarea
                          id="warranty-description"
                          value={warrantyClaimDescription}
                          onChange={(e) => setWarrantyClaimDescription(e.target.value)}
                          placeholder={t("warranty.issueDescriptionPlaceholder")}
                          className="min-h-[120px]"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="warranty-files">{t("warranty.evidenceOptional")}</Label>
                        <Input
                          id="warranty-files"
                          type="file"
                          multiple
                          accept="image/*,video/*,.pdf"
                          onChange={(e) => {
                            const { valid, rejected } = validateWarrantyFiles(e.target.files)
                            setWarrantyEvidenceFiles(valid)
                            if (rejected.length > 0) {
                              toast.error(formatWarrantyRejections(rejected))
                            }
                          }}
                        />
                        {warrantyEvidenceFiles.length > 0 && (
                          <p className="text-xs text-gray-500">
                            {t("warranty.filesSelected", { count: warrantyEvidenceFiles.length })}
                          </p>
                        )}
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowWarrantyClaimDialog(false)}
                          disabled={openingWarrantyClaim}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button
                          onClick={handleOpenWarrantyClaim}
                          disabled={openingWarrantyClaim}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          {openingWarrantyClaim ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          {t("warranty.submitClaim")}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={showDeclineReasonDialog} onOpenChange={(open) => { setShowDeclineReasonDialog(open); if (!open) setDeclineReason("") }}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("warranty.declineTitle")}</DialogTitle>
                      <DialogDescription>
                        {t("warranty.declineDescription")}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="decline-reason">{t("warranty.reason")}</Label>
                        <Textarea
                          id="decline-reason"
                          value={declineReason}
                          onChange={(e) => setDeclineReason(e.target.value)}
                          placeholder={t("warranty.declineReasonPlaceholder")}
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
                          {t("common.cancel")}
                        </Button>
                        <Button
                          onClick={handleDeclineWarrantyClaim}
                          disabled={warrantyActionLoading || !declineReason.trim()}
                          className="bg-rose-600 hover:bg-rose-700 text-white"
                        >
                          {warrantyActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          {t("warranty.declineClaim")}
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
                        {t("info.requestedOn", { date: formatDateTime(booking.createdAt) })}
                      </span>
                    </div>
                  )}
                  {booking.rfqData?.preferredStartDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-indigo-500" />
                      <span>
                        {t("info.preferredStart", { date: formatDate(booking.rfqData.preferredStartDate) })}
                      </span>
                    </div>
                  )}
                  {booking.scheduledStartDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-emerald-500" />
                      <span>
                        {t("info.startDate", { date: formatDate(booking.scheduledStartDate) })}
                      </span>
                    </div>
                  )}
                  {(booking.scheduledExecutionEndDate || booking.scheduledEndDate) && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-blue-500" />
                      <span>
                        {t("info.completionDate", { date: formatDate(booking.scheduledExecutionEndDate || booking.scheduledEndDate || "") })}
                      </span>
                    </div>
                  )}
                  {booking.rfqData?.urgency && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-amber-500" />
                      <span>
                        {t("info.urgency", { urgency: enumLabel("urgency", booking.rfqData.urgency) })}
                      </span>
                    </div>
                  )}
                  {currencyRange && (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold">
                        €
                      </span>
                      <span>
                        {t("info.budget", { range: currencyRange })}
                      </span>
                    </div>
                  )}
                </section>

                {/* Description */}
                {booking.rfqData?.description && (
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-gray-900">
                      {t("info.requestDetails")}
                    </h2>
                    <p className="text-xs leading-relaxed text-gray-700 whitespace-pre-line">
                      {booking.rfqData.description}
                    </p>
                  </section>
                )}

                {(booking.status === "cancelled" || booking.status === "refunded") && (() => {
                  const cancelledAtRaw = booking.cancellation?.cancelledAt
                    || booking.statusHistory?.find((s) => s.status === 'cancelled')?.timestamp
                  const refundAmount = booking.cancellation?.refundAmount
                  const refundCurrency = booking.payment?.currency || 'EUR'
                  const reason = booking.payment?.refundReason || booking.cancellation?.reason
                  return (
                    <section className="space-y-2">
                      <h2 className="text-sm font-semibold text-gray-900">{t("cancellation.title")}</h2>
                      <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3 space-y-1 text-xs text-gray-700">
                        <div className="flex justify-between">
                          <span className="text-gray-500">{t("cancellation.date")}</span>
                          <span className="font-medium">{cancelledAtRaw ? formatDateTime(cancelledAtRaw) : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">{t("cancellation.refundAmount")}</span>
                          <span className="font-medium">{refundAmount != null ? formatMoney(refundAmount, refundCurrency) : '—'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-500 shrink-0">{t("cancellation.reason")}</span>
                          <span className="font-medium text-right break-words">{reason || '—'}</span>
                        </div>
                      </div>
                    </section>
                  )
                })()}

                {Array.isArray(booking.rfqData?.attachments) && booking.rfqData.attachments.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-gray-900">
                      {t("info.requestAttachments")}
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
                          <span className="truncate pr-3">{getFileLabel(attachment, t("common.attachmentNumber", { number: index + 1 }))}</span>
                          <span className="font-medium">{t("common.open")}</span>
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                {Array.isArray(booking.rfqData?.answers) && booking.rfqData.answers.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-gray-900">
                      {t("info.rfqAnswers")}
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
                              {getFileLabel(answer.answer, t("common.openAttachment"))}
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
                      {t("info.postBookingAnswers")}
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
                              {getFileLabel(answer.answer, t("common.openAttachment"))}
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
                          {t("info.customer")}
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
                          {t("info.serviceProvider")}
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
                                    <span>{t("info.vat", { number: booking.professional.businessInfo.vatNumber })}</span>
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
                          {t("info.customer")}
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
                            <span>{t("info.vat", { number: booking.customer.vatNumber })}</span>
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
                          {t("payment.breakdown")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1.5 text-xs text-gray-700">
                        <div className="flex justify-between">
                          <span className="text-gray-500">{t("payment.status")}</span>
                          <Badge variant="outline" className="text-[10px] h-5">{enumLabel("paymentStatus", booking.payment.status)}</Badge>
                        </div>
                        {booking.payment.amount != null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">{t("payment.netAmount")}</span>
                            <span>{formatMoney(booking.payment.amount, booking.payment.currency || 'EUR')}</span>
                          </div>
                        )}
                        {booking.payment.vatAmount != null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">{t("payment.vat", { rate: booking.payment.vatRate || 0 })}</span>
                            <span>{formatMoney(booking.payment.vatAmount, booking.payment.currency || 'EUR')}</span>
                          </div>
                        )}
                        {booking.payment.reverseCharge && (
                          <div className="rounded-md border border-blue-100 bg-blue-50 p-2 text-[11px] text-blue-800">
                            {t("payment.reverseCharge")}
                          </div>
                        )}
                        {booking.vatDecision?.explanation && (
                          <div className="rounded-md border border-emerald-100 bg-emerald-50 p-2 text-[11px] text-emerald-800">
                            {booking.vatDecision.explanation}
                          </div>
                        )}
                        {booking.payment.totalWithVat != null && (
                          <div className="flex justify-between font-medium">
                            <span>{t("payment.totalInclVat")}</span>
                            <span>{formatMoney(booking.payment.totalWithVat, booking.payment.currency || 'EUR')}</span>
                          </div>
                        )}
                        {booking.payment.discount && booking.payment.discount.totalDiscount != null && booking.payment.discount.totalDiscount > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>{t("payment.discount")}</span>
                            <span>-{formatMoney(booking.payment.discount.totalDiscount, booking.payment.currency || 'EUR')}</span>
                          </div>
                        )}
                        <div className="border-t border-gray-200 pt-1.5 mt-1.5 space-y-1">
                          {booking.payment.platformCommission != null && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">{t("payment.platformCommission")}</span>
                              <span>{formatMoney(booking.payment.platformCommission, booking.payment.currency || 'EUR')}</span>
                            </div>
                          )}
                          {booking.payment.stripeFeeAmount != null && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">{t("payment.stripeFee")}</span>
                              <span>{formatMoney(booking.payment.stripeFeeAmount, booking.payment.currency || 'EUR')}</span>
                            </div>
                          )}
                          {booking.payment.professionalPayout != null && (
                            <div className="flex justify-between font-medium">
                              <span>{t("payment.professionalPayout")}</span>
                              <span>{formatMoney(booking.payment.professionalPayout, booking.payment.currency || 'EUR')}</span>
                            </div>
                          )}
                        </div>
                        {booking.extraCostTotal != null && booking.extraCostTotal !== 0 && (
                          <div className="border-t border-gray-200 pt-1.5 mt-1.5">
                            <div className="flex justify-between font-medium">
                              <span>{t("extraCosts.titleShort")}</span>
                              <span className={booking.extraCostTotal >= 0 ? 'text-red-600' : 'text-green-600'}>
                                {booking.extraCostTotal >= 0 ? '+' : ''}{formatMoney(booking.extraCostTotal, booking.payment.currency || 'EUR')}
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

                  {(booking.payment?.invoiceUrl ||
                    booking.payment?.invoiceUblUrl ||
                    booking.payment?.supplierInvoiceUrl ||
                    booking.payment?.supplierInvoiceUblUrl ||
                    booking.payment?.creditNoteUrl ||
                    booking.payment?.creditNoteUblUrl) && (
                    <Card className="bg-slate-50/60 border border-slate-100">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-xs">
                          <FileText className="h-4 w-4 text-slate-600" />
                          {t("invoice.title")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs text-gray-700">
                        {viewerRole !== 'professional' && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-500">{t("invoice.number")}</span>
                              <span>{booking.payment.invoiceNumber || t("invoice.generated")}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {booking.payment.invoiceUrl && (
                                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                                  <a href={booking.payment.invoiceUrl} target="_blank" rel="noreferrer">{t("invoice.downloadPdf")}</a>
                                </Button>
                              )}
                              {booking.payment.invoiceUblUrl && (
                                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                                  <a href={booking.payment.invoiceUblUrl} target="_blank" rel="noreferrer">{t("invoice.downloadUbl")}</a>
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                        {viewerRole !== 'customer' &&
                          (booking.payment.supplierInvoiceUrl || booking.payment.supplierInvoiceUblUrl) && (
                          <div className="border-t border-gray-200 pt-2 space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-500">{t("invoice.selfBillNumber")}</span>
                              <span>{booking.payment.supplierInvoiceNumber || t("invoice.generated")}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {booking.payment.supplierInvoiceUrl && (
                                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                                  <a href={booking.payment.supplierInvoiceUrl} target="_blank" rel="noreferrer">{t("invoice.selfBillPdf")}</a>
                                </Button>
                              )}
                              {booking.payment.supplierInvoiceUblUrl && (
                                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                                  <a href={booking.payment.supplierInvoiceUblUrl} target="_blank" rel="noreferrer">{t("invoice.selfBillUbl")}</a>
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                        {viewerRole !== 'professional' && booking.payment.peppolDispatchStatus && booking.payment.peppolDispatchStatus !== 'skipped' && (
                          <p className="text-[11px] text-gray-500">
                            {t("invoice.peppolStatus", { status: booking.payment.peppolDispatchStatus })}
                          </p>
                        )}
                        {viewerRole !== 'professional' && (booking.payment.creditNoteUrl || booking.payment.creditNoteUblUrl) && (
                          <div className="border-t border-gray-200 pt-2 space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-500">{t("invoice.creditNoteNumber")}</span>
                              <span>{booking.payment.creditNoteNumber}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {booking.payment.creditNoteUrl && (
                                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                                  <a href={booking.payment.creditNoteUrl} target="_blank" rel="noreferrer">{t("invoice.creditNotePdf")}</a>
                                </Button>
                              )}
                              {booking.payment.creditNoteUblUrl && (
                                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                                  <a href={booking.payment.creditNoteUblUrl} target="_blank" rel="noreferrer">{t("invoice.creditNoteUbl")}</a>
                                </Button>
                              )}
                            </div>
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
              <DialogTitle>{t("rfq.rejectTitle")}</DialogTitle>
              <DialogDescription>{t("rfq.rejectDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder={t("rfq.rejectPlaceholder")}
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowRejectionModal(false)}>{t("common.cancel")}</Button>
                <Button
                  onClick={() => handleRespondToRFQ('rejected')}
                  disabled={respondingToRFQ || !rejectionReason.trim()}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {respondingToRFQ ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {t("rfq.rejectSubmit")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Quotation Rejection Modal (customer rejects quotation with reason) */}
        <Dialog open={showQuoteRejectionModal} onOpenChange={setShowQuoteRejectionModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("quotation.rejectTitle")}</DialogTitle>
              <DialogDescription>{t("quotation.rejectDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                value={quoteRejectionReason}
                onChange={e => setQuoteRejectionReason(e.target.value)}
                placeholder={t("quotation.rejectPlaceholder")}
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowQuoteRejectionModal(false)}>{t("common.cancel")}</Button>
                <Button
                  onClick={() => handleRespondToQuotation('rejected')}
                  disabled={respondingToQuotation || !quoteRejectionReason.trim()}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {respondingToQuotation ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {t("quotation.rejectSubmit")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Professional Completion Modal */}
        <Dialog open={showCompletionModal} onOpenChange={setShowCompletionModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("completion.dialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("completion.dialogDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="completion-notes">{t("completion.notesLabel")}</Label>
                <Textarea
                  id="completion-notes"
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder={t("completion.notesPlaceholder")}
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="completion-files">{t("completion.attachmentsLabel")}</Label>
                <p className="text-xs text-gray-500">{t("completion.attachmentsHint")}</p>
                <Input
                  id="completion-files"
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={(e) => setCompletionFiles(Array.from(e.target.files || []))}
                />
                {completionFiles.length > 0 && (
                  <p className="text-xs text-gray-500">{t("common.filesSelected", { count: completionFiles.length })}</p>
                )}
              </div>

              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">{t("extraCosts.label")}</Label>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => addExtraCost('unit_adjustment')} className="text-xs h-7">{t("extraCosts.addUnit")}</Button>
                    <Button size="sm" variant="outline" onClick={() => addExtraCost('condition')} className="text-xs h-7">{t("extraCosts.addCondition")}</Button>
                    <Button size="sm" variant="outline" onClick={() => addExtraCost('option')} className="text-xs h-7">{t("extraCosts.addOption")}</Button>
                    <Button size="sm" variant="outline" onClick={() => addExtraCost('other')} className="text-xs h-7">{t("extraCosts.addOther")}</Button>
                  </div>
                </div>

                {completionExtraCosts.map((cost, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs capitalize">{enumLabel("extraCostType", cost.type)}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => removeExtraCost(i)} className="text-red-500 h-6 text-xs">{t("common.remove")}</Button>
                    </div>

                    {cost.type === 'unit_adjustment' && (() => {
                      const projectPriceModel = (booking?.project as { priceModel?: string } | undefined)?.priceModel || ''
                      const unitLabel = projectPriceModel && !/^(rfq|fixed|total|unit)/i.test(projectPriceModel.trim())
                        ? projectPriceModel
                        : t("extraCosts.unitsFallback")
                      return (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">{t("extraCosts.estimatedUnits", { unit: unitLabel })}</Label>
                          <Input
                            type="number"
                            value={cost.estimatedUnits || ''}
                            disabled
                            className="h-8 text-sm bg-gray-100"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">{t("extraCosts.actualUnits", { unit: unitLabel })}</Label>
                          <Input type="number" value={cost.actualUnits || ''} onChange={(e) => updateExtraCost(i, 'actualUnits', parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">{t("extraCosts.unitPrice")}</Label>
                          <Input
                            type="number"
                            value={cost.unitPrice || ''}
                            disabled
                            className="h-8 text-sm bg-gray-100"
                          />
                        </div>
                      </div>
                      )
                    })()}

                    {cost.type === 'condition' && (
                      <div>
                        <Label className="text-xs">{t("extraCosts.conditionLabel")}</Label>
                        <Select
                          value={hasSelectedReferenceIndex(cost.referenceIndex) ? String(cost.referenceIndex) : undefined}
                          onValueChange={(value) => updateExtraCost(i, 'referenceIndex', parseInt(value, 10))}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder={projectConditions.length > 0 ? t("extraCosts.selectCondition") : t("extraCosts.noConditions")} />
                          </SelectTrigger>
                          <SelectContent>
                            {projectConditions.map(({ item: condition, originalIndex }) => {
                              const cost = Number(condition.additionalCost) || 0
                              const label = cost > 0 ? t("extraCosts.conditionCost", { amount: formatMoney(cost, completionCurrency) }) : t("extraCosts.noExtraCost")
                              return (
                                <SelectItem key={`condition-${originalIndex}`} value={String(originalIndex)}>
                                  {(condition.name || t("extraCosts.conditionFallback", { number: originalIndex + 1 }))} {label}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {cost.type === 'option' && (
                      <div>
                        <Label className="text-xs">{t("extraCosts.optionLabel")}</Label>
                        <Select
                          value={hasSelectedReferenceIndex(cost.referenceIndex) ? String(cost.referenceIndex) : undefined}
                          onValueChange={(value) => updateExtraCost(i, 'referenceIndex', parseInt(value, 10))}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder={projectOptions.length > 0 ? t("extraCosts.selectOption") : t("extraCosts.noOptions")} />
                          </SelectTrigger>
                          <SelectContent>
                            {projectOptions.map((option, optionIndex) => (
                              <SelectItem key={`option-${optionIndex}`} value={String(optionIndex)}>
                                {(option.name || t("extraCosts.optionFallback", { number: optionIndex + 1 }))}
                                {typeof option.price === 'number' ? ` ${t("extraCosts.conditionCost", { amount: formatMoney(option.price, completionCurrency) })}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {cost.type === 'other' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">{t("extraCosts.name")}</Label>
                          <Input value={cost.name} onChange={(e) => updateExtraCost(i, 'name', e.target.value)} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">{t("extraCosts.amount")}</Label>
                          <Input type="number" value={cost.amount || ''} onChange={(e) => updateExtraCost(i, 'amount', parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                        </div>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs">{t("extraCosts.justification")}</Label>
                      <Textarea value={cost.justification} onChange={(e) => updateExtraCost(i, 'justification', e.target.value)} placeholder={t("extraCosts.justificationPlaceholder")} className="min-h-[50px] text-sm" />
                    </div>

                    {(cost.type === 'unit_adjustment' || cost.type === 'condition' || cost.type === 'option') && (
                      <p className="text-xs text-gray-600">
                        {t("extraCosts.calculated", { amount: `${cost.amount >= 0 ? '+' : ''}${formatMoney(cost.amount, completionCurrency)}` })}
                      </p>
                    )}
                  </div>
                ))}

                {completionExtraCosts.length > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm font-semibold">{t("extraCosts.totalLabel")}</span>
                    <span className={`text-sm font-bold ${completionExtraCosts.reduce((s, c) => s + c.amount, 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatMoney(completionExtraCosts.reduce((s, c) => s + c.amount, 0), completionCurrency)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setShowCompletionModal(false)}>{t("common.cancel")}</Button>
                <Button
                  onClick={handleProfessionalComplete}
                  disabled={submittingCompletion || invalidCompletionExtraCosts}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {submittingCompletion ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCheck className="h-4 w-4 mr-2" />}
                  {t("completion.confirmButton")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Customer Dispute Modal */}
        <Dialog
          open={showDisputeModal}
          onOpenChange={(open) => {
            setShowDisputeModal(open)
            if (!open) {
              setDisputeStep('warning')
              setDisputeAttachments([])
              setDisputeReason("")
              setDisputeDescription("")
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("common.dispute")}</DialogTitle>
              <DialogDescription>
                {t("dispute.dialogDescription")}
              </DialogDescription>
            </DialogHeader>
            {disputeStep === 'warning' ? (
              <div className="space-y-4">
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">{t("dispute.triedChatTitle")}</p>
                    <p className="text-xs text-amber-800 mt-1">
                      {t("dispute.triedChatDescription")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowDisputeModal(false)}>{t("common.cancel")}</Button>
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => setDisputeStep('form')}
                  >
                    {t("dispute.continue")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dispute-reason">{t("dispute.reasonLabel")}</Label>
                  <Input
                    id="dispute-reason"
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder={t("dispute.reasonPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dispute-description">{t("dispute.descriptionLabel")}</Label>
                  <Textarea
                    id="dispute-description"
                    value={disputeDescription}
                    onChange={(e) => setDisputeDescription(e.target.value)}
                    placeholder={t("dispute.descriptionPlaceholder")}
                    className="min-h-[100px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dispute-files">{t("dispute.attachmentsLabel")}</Label>
                  <Input
                    id="dispute-files"
                    type="file"
                    multiple
                    accept="image/*,video/*,.pdf"
                    onChange={(e) => {
                      const fileList = e.target.files
                      if (!fileList) return
                      const arr = Array.from(fileList).slice(0, 10)
                      setDisputeAttachments(arr)
                    }}
                  />
                  {disputeAttachments.length > 0 && (
                    <p className="text-[11px] text-gray-500">{t("common.filesSelected", { count: disputeAttachments.length })}</p>
                  )}
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setDisputeStep('warning')}>{t("common.back")}</Button>
                  <Button
                    onClick={handleCustomerDispute}
                    disabled={submittingDispute || !disputeReason.trim()}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {submittingDispute ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
                    {t("dispute.submit")}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Customer Cancel Modal */}
        <Dialog open={showCancelModal} onOpenChange={(open) => { if (!open) resetCancelForm(); setShowCancelModal(open) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("cancel.title")}</DialogTitle>
              <DialogDescription>{t("cancel.description")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cancel-reason-category">{t("cancel.reasonLabel")}</Label>
                <Select value={cancelReasonCategory} onValueChange={setCancelReasonCategory}>
                  <SelectTrigger id="cancel-reason-category">
                    <SelectValue placeholder={t("cancel.selectReason")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CANCEL_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{enumLabel("cancelReason", r.value)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">{t("cancel.explanationLabel")}</Label>
                <Textarea
                  id="cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="min-h-[90px]"
                  placeholder={t("cancel.explanationPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cancel-attachment">{t("cancel.attachmentLabel")}</Label>
                <Input
                  id="cancel-attachment"
                  type="file"
                  multiple
                  accept="image/*,application/pdf,video/*"
                  disabled={uploadingCancelAttachment || cancelEvidence.length >= 10}
                  onChange={(e) => { handleCancelAttachmentUpload(e.target.files); e.target.value = "" }}
                />
                {uploadingCancelAttachment && (
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {t("common.uploading")}</p>
                )}
                {cancelEvidence.length > 0 && (
                  <div className="space-y-1">
                    {cancelEvidence.map((url, i) => (
                      <div key={url} className="flex items-center justify-between gap-2 text-xs">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                          {getFileLabel(url, t("common.attachmentNumber", { number: i + 1 }))}
                        </a>
                        <button
                          type="button"
                          className="text-rose-600 hover:text-rose-700"
                          onClick={() => setCancelEvidence((prev) => prev.filter((u) => u !== url))}
                        >
                          {t("common.remove")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { resetCancelForm(); setShowCancelModal(false) }} disabled={submittingCancel}>{t("common.back")}</Button>
                <Button
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                  onClick={handleCustomerCancel}
                  disabled={submittingCancel || uploadingCancelAttachment || !cancelReasonCategory}
                >
                  {submittingCancel ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {t("cancel.submit")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Customer Reschedule Modal */}
        <Dialog open={showRescheduleModal} onOpenChange={setShowRescheduleModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("reschedule.title")}</DialogTitle>
              <DialogDescription>{t("reschedule.description")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className={`grid gap-3 ${resolveBookingIsDaysMode(booking) ? '' : 'sm:grid-cols-2'}`}>
                <div className="space-y-2">
                  <Label htmlFor="customer-reschedule-date">{t("reschedule.newDate")}</Label>
                  <AvailabilityDatePicker
                    id="customer-reschedule-date"
                    projectId={booking?.project?._id}
                    excludeBookingId={booking?._id}
                    subprojectIndex={booking?.selectedSubprojectIndex}
                    value={rescheduleDate}
                    onChange={setRescheduleDate}
                    ariaLabel={t("reschedule.newDate")}
                  />
                </div>
                {!resolveBookingIsDaysMode(booking) && (
                  <div className="space-y-2">
                    <Label htmlFor="customer-reschedule-time">{t("reschedule.startTime")}</Label>
                    <Input
                      id="customer-reschedule-time"
                      type="time"
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-reschedule-reason">{t("reschedule.reason")}</Label>
                <Select value={rescheduleReason} onValueChange={setRescheduleReason}>
                  <SelectTrigger id="customer-reschedule-reason">
                    <SelectValue placeholder={t("cancel.selectReason")} />
                  </SelectTrigger>
                  <SelectContent>
                    {RESCHEDULE_REASONS.map((option) => (
                      <SelectItem key={option} value={option}>{enumLabel("rescheduleReason", RESCHEDULE_REASON_KEYS[option] ?? option)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-reschedule-description">{t("reschedule.descriptionLabel")}</Label>
                <Textarea
                  id="customer-reschedule-description"
                  value={rescheduleDescription}
                  onChange={(e) => setRescheduleDescription(e.target.value)}
                  className="min-h-[80px]"
                  placeholder={t("reschedule.descriptionPlaceholder")}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowRescheduleModal(false)} disabled={submittingReschedule}>{t("common.back")}</Button>
                <Button
                  onClick={handleCustomerReschedule}
                  disabled={
                    submittingReschedule ||
                    !rescheduleDate ||
                    !rescheduleReason ||
                    (!resolveBookingIsDaysMode(booking) && !rescheduleTime)
                  }
                >
                  {submittingReschedule ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {t("reschedule.sendRequest")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reschedule Refund (decline) Modal */}
        <Dialog open={showRescheduleRefundModal} onOpenChange={setShowRescheduleRefundModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("rescheduleRefund.title")}</DialogTitle>
              <DialogDescription>
                {t("rescheduleRefund.description")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reschedule-refund-note">{t("rescheduleRefund.noteLabel")}</Label>
                <Textarea
                  id="reschedule-refund-note"
                  value={rescheduleRefundNote}
                  onChange={(e) => setRescheduleRefundNote(e.target.value)}
                  className="min-h-[80px]"
                  placeholder={t("rescheduleRefund.notePlaceholder")}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowRescheduleRefundModal(false)} disabled={respondingReschedule}>{t("common.back")}</Button>
                <Button
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                  onClick={() => handleRespondReschedule('refund', { note: rescheduleRefundNote.trim() || undefined })}
                  disabled={respondingReschedule}
                >
                  {respondingReschedule ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {t("rescheduleRefund.submit")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
