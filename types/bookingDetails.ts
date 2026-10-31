/**
 * Additive booking/quotation details DTO mirroring the backend read contract.
 *
 * Every field is optional/tolerant because the backend owns the final shape and
 * legacy records legitimately omit historical snapshots. The UI must render a
 * "not recorded" value instead of filling these from live project/today's pricing.
 */

export type DetailViewerRole = "customer" | "professional" | "admin";

export type DetailsEntity =
  | "terms"
  | "quotation"
  | "payment"
  | "refund"
  | "schedule"
  | "post_booking"
  | "party";

export interface DetailsNotice {
  code: string;
  severity?: "info" | "warning";
  entity?: DetailsEntity | string;
}

export interface ActorDto {
  id?: string | null;
  role?: "customer" | "professional" | "admin" | "system" | "unknown" | string;
  name?: string | null;
  email?: string | null;
  source?: string;
  /** Present when the actor account has been anonymized by an admin or self-service. */
  deletedAt?: string | null;
  isAnonymized?: boolean;
}

export interface AttachmentDto {
  url?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  source?: string;
  signed?: boolean;
  unavailableReason?: string | null;
}

export interface VatBreakdownLine {
  description?: string;
  netAmount?: number;
  vatRate?: number;
  vatAmount?: number;
  totalAmount?: number;
  vatCountry?: string | null;
  vatLabel?: string | null;
}

export interface BookingOverviewSchedule {
  preferredStartDate?: string | null;
  preferredStartTime?: string | null;
  scheduledStartDate?: string | null;
  scheduledStartTime?: string | null;
  scheduledExecutionEndDate?: string | null;
  scheduledBufferStartDate?: string | null;
  scheduledBufferEndDate?: string | null;
  scheduledEndTime?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  timeZone?: string | null;
  timeZoneRecorded?: boolean;
  reschedulePending?: boolean;
}

export interface BookingOverviewDto {
  id?: string;
  bookingNumber?: string | null;
  bookingType?: "professional" | "project" | string;
  status?: string | null;
  statusBeforeDispute?: string | null;
  title?: string | null;
  projectTitle?: string | null;
  serviceType?: string | null;
  category?: string | null;
  service?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  schedule?: BookingOverviewSchedule | null;
  location?: {
    address?: string | null;
    city?: string | null;
    country?: string | null;
    postalCode?: string | null;
    coordinates?: [number, number] | number[] | null;
  } | null;
  counterpart?: {
    role?: string;
    name?: string | null;
    companyName?: string | null;
  } | null;
  quote?: {
    quotationNumber?: string | null;
    currentVersion?: number | null;
    acceptedVersion?: number | null;
    acceptedVersionSource?: string;
    status?: string;
    totalAmount?: number | null;
    currency?: string | null;
    validUntil?: string | null;
  } | null;
  payment?: {
    status?: string | null;
    totalWithVat?: number | null;
    netAmount?: number | null;
    vatAmount?: number | null;
    currency?: string | null;
    discountTotal?: number | null;
    refundedTotal?: number | null;
  } | null;
  extraCosts?: {
    total?: number | null;
    currency?: string | null;
    currencySource?: string;
    status?: string | null;
  } | null;
  warranty?: {
    duration?: { value?: number; unit?: "months" | "years" } | null;
    startsAt?: string | null;
    endsAt?: string | null;
    source?: string | null;
  } | null;
  flags?: {
    bookingSnapshotRecorded?: boolean;
    /** Older frontend fallback name; kept for cached responses. */
    termsSnapshotRecorded?: boolean;
    legacy?: boolean;
    quoteVersionsPresent?: boolean;
  } | null;
}

export interface PartyDto {
  id?: string | null;
  /** Present when the party account has been anonymized. */
  deletedAt?: string | null;
  isAnonymized?: boolean;
  name?: string | null;
  username?: string | null;
  customerType?: string | null;
  businessName?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  vatNumber?: string | null;
  website?: string | null;
  address?: {
    city?: string | null;
    country?: string | null;
    postalCode?: string | null;
  } | null;
  timeZone?: string | null;
}

export interface PartiesDto {
  customer?: PartyDto | null;
  professional?: PartyDto | null;
  recordedAt?: string | null;
  source?: "booking_snapshot" | "terms_snapshot" | "current_profile" | string;
  notices?: DetailsNotice[];
}

export interface SnapshotQuestion {
  questionId?: string | null;
  question: string;
  type?: string | null;
  options?: string[] | null;
  isRequired?: boolean | null;
  professionalAttachments?: AttachmentDto[] | null;
  answer?: string | null;
  answered?: boolean;
  source?: string | null;
}

export interface BookingSnapshotDto {
  authority?: "booking_snapshot" | "quotation" | "current_project_reference" | "none" | string;
  capturedAt?: string | null;
  capturedBySource?: string | null;
  immutable?: boolean;
  project?: {
    id?: string | null;
    title?: string | null;
    category?: string | null;
    service?: string | null;
    areaOfWork?: string | null;
    description?: string | null;
    termsConditions?: Array<{
      name?: string;
      description?: string | null;
      type?: string;
      additionalCost?: number | null;
      isCustom?: boolean;
    }> | null;
    customConfirmationMessage?: string | null;
    minResources?: number | null;
    minOverlapPercentage?: number | null;
    resourcesCount?: number | null;
  } | null;
  questions?: {
    rfq?: SnapshotQuestion[];
    postBooking?: SnapshotQuestion[];
    vat?: Array<{ fieldName?: string; question?: string | null; type?: string | null; answer?: unknown }>;
  } | null;
  schedule?: BookingOverviewSchedule | null;
  location?: {
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    country?: string | null;
    coordinates?: [number, number] | number[] | null;
  } | null;
  selectedSubprojectIndex?: number | null;
  selectedSubproject?: {
    name?: string;
    description?: string | null;
    projectType?: string[];
    customProjectType?: string | null;
    pricing?: {
      type?: string | null;
      amount?: number | null;
      priceRange?: { min?: number; max?: number } | null;
      minOrderQuantity?: number | null;
      unit?: string | null;
    } | null;
    included?: Array<{ name: string; description?: string | null; isCustom?: boolean }>;
    materialsIncluded?: boolean | null;
    materials?: Array<{ name: string; quantity?: string | number | null; unit?: string | null; description?: string | null }>;
    preparationDuration?: { value?: number; unit?: string } | null;
    executionDuration?: { value?: number; unit?: string; range?: { min?: number; max?: number } } | null;
    buffer?: { value?: number; unit?: string } | null;
    intakeDuration?: { value?: number; unit?: string; buffer?: number } | null;
    warrantyPeriod?: { value?: number; unit?: string } | null;
  } | null;
  selectedExtraOptions?: Array<{
    extraOptionId?: string;
    name?: string | null;
    description?: string | null;
    unitPrice?: number | null;
    quantity?: number | null;
    totalPrice?: number | null;
    bookedPrice?: number | null;
    priceSource?: string;
  }>;
  checkoutSnapshot?: {
    pricingType?: string;
    unitAmount?: number | null;
    quantity?: number | null;
    unit?: string | null;
    baseSubtotal?: number | null;
    extraOptionsTotal?: number | null;
    totalAmount?: number | null;
    currency?: string | null;
    selectedOptions?: Array<{
      extraOptionId?: string | null;
      name?: string;
      unitPrice?: number | null;
      quantity?: number | null;
      totalPrice?: number | null;
    }>;
    complete?: boolean;
  } | null;
  currentProjectReference?: {
    source?: string;
    mayHaveChangedSinceBooking?: boolean;
    project?: {
      id?: string;
      title?: string;
      category?: string | null;
      service?: string | null;
    } | null;
  } | null;
  notices?: DetailsNotice[];
}

export interface BookingWizardDto {
  rfq?: {
    serviceType?: string | null;
    description?: string | null;
    answers?: Array<{
      questionId?: string | null;
      question: string;
      answer: string | null;
      fieldType?: string | null;
      answerType?: string;
      source?: string;
    }>;
    preferredStartDate?: string | null;
    urgency?: string | null;
    budget?: { min?: number | null; max?: number | null; currency?: string | null } | null;
    attachments?: AttachmentDto[];
    additionalNotes?: string | null;
  } | null;
  rfqQuestions?: SnapshotQuestion[];
  selectedSubprojectIndex?: number | null;
  selectedExtraOptions?: Array<{ extraOptionId?: string; bookedPrice?: number; name?: string | null }>;
  estimatedUsage?: { quantity?: number | null; unit?: string | null; source?: string } | null;
  customerBlocks?: {
    dates?: Array<{ date?: string; reason?: string | null }>;
    windows?: Array<{ date?: string; startTime?: string; endTime?: string; reason?: string | null }>;
  } | null;
  vatDecision?: {
    action?: string | null;
    country?: string | null;
    standardRate?: number | null;
    appliedRate?: number | null;
    reducedRate?: number | null;
    reverseCharge?: boolean | null;
    vatLabel?: string | null;
    propertyNature?: string | null;
    explanation?: string | null;
    answers?: Array<{ fieldName?: string; value?: unknown }>;
  } | null;
  serviceLocation?: {
    address?: string | null;
    city?: string | null;
    country?: string | null;
    postalCode?: string | null;
  } | null;
  paymentAtCheckout?: boolean;
  scheduleSelection?: {
    startDate?: string | null;
    startTime?: string | null;
    executionEndDate?: string | null;
    bufferEndDate?: string | null;
    timeZone?: string | null;
  } | null;
}

export interface QuotationVersionDto {
  version: number;
  quotationNumber?: string | null;
  scope?: string | null;
  description?: string | null;
  warrantyDuration?: { value?: number; unit?: string } | null;
  materialsIncluded?: boolean | null;
  materials?: Array<{ name?: string; quantity?: number | string | null; unit?: string | null; description?: string | null }>;
  pricingLines?: Array<{
    description?: string;
    price?: number | null;
    quantity?: number | null;
    unit?: string | null;
    vatRate?: number | null;
    vatCountry?: string | null;
    vatLabel?: string | null;
  }>;
  totalAmount?: number | null;
  currency?: string | null;
  milestones?: Array<{
    title?: string;
    amount?: number | null;
    description?: string | null;
    dueCondition?: string;
    customDueDate?: string | null;
    order?: number;
    status?: string;
  }>;
  preparationDuration?: { value?: number; unit?: string } | null;
  executionDuration?: { value?: number; unit?: string } | null;
  bufferDuration?: { value?: number; unit?: string } | null;
  validUntil?: string | null;
  createdAt?: string | null;
  changeNote?: string | null;
  createdBy?: ActorDto | null;
  actorRecorded?: boolean;
  customerPricing?: {
    commissionPercent?: number | null;
    amountBeforeDiscounts?: number | null;
    vatAmount?: number | null;
    vatRate?: number | null;
    totalWithVat?: number | null;
    vatBreakdown?: VatBreakdownLine[];
    capturedAt?: string | null;
  } | null;
  customerTotals?: {
    commissionPercent?: number | null;
    professionalNetAmount?: number | null;
    customerNetAmount?: number | null;
    amountBeforeDiscounts?: number | null;
    vatAmount?: number | null;
    vatRate?: number | null;
    totalWithVat?: number | null;
    totalAmount?: number | null;
    currency?: string | null;
    recordedAt?: string | null;
    discount?: {
      loyaltyAmount?: number | null;
      repeatBuyerAmount?: number | null;
      pointsDiscountAmount?: number | null;
      codeDiscountAmount?: number | null;
      totalDiscount?: number | null;
    } | null;
  } | null;
  customerTotalsRecorded?: boolean;
  serviceLocation?: {
    country?: string | null;
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
  } | null;
  serviceLocationRecorded?: boolean;
  termsAndConditions?: string | null;
  termsRecorded?: boolean;
  accepted?: boolean;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}

export interface QuotationDetailsDto {
  quotationNumber?: string | null;
  status?: string | null;
  currentVersion?: number | null;
  acceptedVersion?: {
    version?: number;
    quotationNumber?: string | null;
    source?: string;
    acceptedAt?: string | null;
  } | null;
  currency?: string | null;
  totalAmountProfessional?: number | null;
  versions?: QuotationVersionDto[];
  history?: ActivityItem[];
  rfqHistory?: ActivityItem[];
  notices?: DetailsNotice[];
}

export interface PaymentDiscountDto {
  loyaltyTier?: string | null;
  loyaltyPercentage?: number | null;
  loyaltyAmount?: number | null;
  repeatBuyerPercentage?: number | null;
  repeatBuyerAmount?: number | null;
  pointsRedeemed?: number | null;
  pointsDiscountAmount?: number | null;
  codeDiscountAmount?: number | null;
  codeLabel?: string | null;
  totalDiscount?: number | null;
  originalAmount?: number | null;
}

export interface RoleInvoiceDto {
  invoiceNumber?: string | null;
  invoiceUrl?: string | null;
  invoiceUblUrl?: string | null;
  invoiceGeneratedAt?: string | null;
  creditNoteNumber?: string | null;
  creditNoteUrl?: string | null;
  creditNoteUblUrl?: string | null;
  creditNoteGeneratedAt?: string | null;
  creditNoteRelatedInvoiceNumber?: string | null;
  peppolDispatchStatus?: string | null;
  peppolDispatchReference?: string | null;
  peppolDispatchedAt?: string | null;
  supplierInvoiceNumber?: string | null;
  supplierInvoiceUrl?: string | null;
  supplierInvoiceUblUrl?: string | null;
  supplierInvoiceGeneratedAt?: string | null;
  supplierCreditNoteNumber?: string | null;
  supplierCreditNoteUrl?: string | null;
  supplierCreditNoteUblUrl?: string | null;
  supplierCreditNoteGeneratedAt?: string | null;
  supplierCreditNoteRelatedInvoiceNumber?: string | null;
  supplierPeppolDispatchStatus?: string | null;
  supplierPeppolDispatchReference?: string | null;
  supplierPeppolDispatchedAt?: string | null;
  invoiceArtifactHistory?: Array<{
    side?: "customer" | "supplier" | string;
    documentType?: "invoice" | "credit_note" | string;
    invoiceNumber?: string | null;
    invoiceUrl?: string | null;
    invoiceUblUrl?: string | null;
    generatedAt?: string | null;
    relatedInvoiceNumber?: string | null;
    replacedAt?: string | null;
  }>;
  manualArtifactClaims?: Array<{
    side?: "customer" | "supplier" | string;
    documentType?: "invoice" | "credit_note" | string;
    invoiceNumber?: string | null;
    createdAt?: string | null;
  }>;
}

export interface PaymentTransferDto {
  status?: "pending" | "succeeded" | "failed" | string | null;
  currency?: string | null;
  amount?: number | null;
  attemptedAt?: string | null;
}

export interface PaymentRecordDto {
  paymentId?: string | null;
  kind?: string;
  status?: string | null;
  method?: string | null;
  currency?: string | null;
  currencySource?: string;
  amount?: number | null;
  netAmount?: number | null;
  vatAmount?: number | null;
  vatRate?: number | null;
  totalWithVat?: number | null;
  reverseCharge?: boolean | null;
  vatBreakdown?: VatBreakdownLine[];
  platformCommission?: number | null;
  professionalPayout?: number | null;
  stripeFeeAmount?: number | null;
  originalCurrency?: string | null;
  fxRate?: number | null;
  fxProvider?: string | null;
  transfer?: PaymentTransferDto | null;
  discount?: PaymentDiscountDto | null;
  timestamps?: {
    authorizedAt?: string | null;
    capturedAt?: string | null;
    paidAt?: string | null;
    transferredAt?: string | null;
    refundedAt?: string | null;
    failedAt?: string | null;
    canceledAt?: string | null;
    disputeOpenedAt?: string | null;
  } | null;
  invoice?: RoleInvoiceDto | null;
  refundAmount?: number | null;
  refundReason?: string | null;
  refundedAt?: string | null;
  authorizedAt?: string | null;
  capturedAt?: string | null;
  paidAt?: string | null;
  transferredAt?: string | null;
  failedAt?: string | null;
  canceledAt?: string | null;
  disputeOpenedAt?: string | null;
}

export interface MilestonePaymentDto {
  index?: number;
  title?: string;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  workStatus?: string | null;
  dueCondition?: string | null;
  customDueDate?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  paidAt?: string | null;
  customerChargeTotalWithVat?: number | null;
  paymentRowPresent?: boolean;
}

export interface ExtraCostPaymentDto {
  status?: string | null;
  currency?: string | null;
  currencySource?: "payment" | "quote" | "not_recorded";
  customerNetChargeAmount?: number | null;
  vatAmount?: number | null;
  vatRate?: number | null;
  customerChargeAmount?: number | null;
  customerDiscount?: number | null;
  loyaltyTier?: string | null;
  loyaltyPercentage?: number | null;
  platformCommission?: number | null;
  professionalPayout?: number | null;
  professionalNetAmount?: number | null;
  paidAt?: string | null;
  failedAt?: string | null;
  stripeFeeAmount?: number | null;
  transferStatus?: string | null;
  completeBreakdownRecorded?: boolean;
}

export interface ExtraCostsDetailsDto {
  status?: string | null;
  totalProfessionalAmount?: number | null;
  currency?: string | null;
  currencySource?: string;
  items?: Array<{
    type?: string;
    name?: string;
    justification?: string;
    professionalAmount?: number | null;
    unitPrice?: number | null;
    estimatedUnits?: number | null;
    actualUnits?: number | null;
    referenceIndex?: number | null;
    customerCharge?: {
      amount?: number | null;
      vatAmount?: number | null;
      discount?: number | null;
      totalAmount?: number | null;
      currency?: string | null;
      recorded?: boolean;
    } | null;
  }>;
  payment?: ExtraCostPaymentDto | null;
  confirmation?: {
    confirmedAt?: string | null;
    confirmedBy?: ActorDto | null;
    notes?: string | null;
    attachments?: AttachmentDto[];
  } | null;
  dispute?: {
    raisedAt?: string | null;
    raisedBy?: ActorDto | null;
    type?: string | null;
    status?: string | null;
    reason?: string | null;
    description?: string | null;
  } | null;
  notices?: DetailsNotice[];
}

export interface RefundDto {
  id: string;
  amount?: number | null;
  currency?: string | null;
  currencySource?: string;
  refundedAt?: string | null;
  source?: string | null;
  status?: string | null;
  justification?: string | null;
  justificationRecorded?: boolean;
  vatAmount?: number | null;
  netAmount?: number | null;
  vatRate?: number | null;
  vatSplitRecorded?: boolean;
  kind?: "booking" | "extra_cost" | string;
  cancellationRequestId?: string | null;
  /** Admin + payments.read only; renderers must not display these. */
  internalNotes?: string | null;
  providerRefundId?: string | null;
  noticeCodes?: string[];
}

export interface PaymentsDetailsDto {
  records?: PaymentRecordDto[];
  base?: PaymentRecordDto | null;
  milestones?: MilestonePaymentDto[];
  extraCost?: ExtraCostPaymentDto | null;
  refunds?: RefundDto[];
  checkout?: BookingSnapshotDto["checkoutSnapshot"];
  byCurrency?: Array<{
    currency?: string;
    recordedCharged?: number | null;
    recordedRefunded?: number | null;
    recordedNet?: number | null;
    derivedFromRecords?: boolean;
    complete?: boolean;
  }>;
  notices?: DetailsNotice[];
}

export interface PostBookingDetailsDto {
  questions?: SnapshotQuestion[];
  answers?: Array<{
    questionId?: string | null;
    question?: string;
    answer?: string | null;
    answerType?: string;
    fieldType?: string | null;
  }>;
  submittedAt?: string | null;
  submittedBy?: ActorDto | null;
  timestampRecorded?: boolean;
  complete?: boolean;
  notices?: DetailsNotice[];
}

export interface RescheduleHistoryDto {
  id?: string;
  requestedAt?: string | null;
  requestedBy?: ActorDto | null;
  actorRecorded?: boolean;
  reason?: string | null;
  description?: string | null;
  note?: string | null;
  status?: string | null;
  respondedAt?: string | null;
  respondedBy?: ActorDto | null;
  responseNote?: string | null;
  previousSchedule?: BookingOverviewSchedule | null;
  proposedSchedule?: BookingOverviewSchedule | null;
  timeZone?: string | null;
}

export interface CancellationRequestDto {
  id?: string;
  status?: string | null;
  reasonCategory?: string | null;
  reason?: string | null;
  evidence?: AttachmentDto[];
  requestedBy?: ActorDto | null;
  requestedRole?: string | null;
  createdAt?: string | null;
  responseDeadline?: string | null;
  professionalDecision?: string | null;
  professionalNote?: string | null;
  counterOfferAmount?: number | null;
  professionalRespondedAt?: string | null;
  customerDecision?: string | null;
  customerRespondedAt?: string | null;
  escalatedAt?: string | null;
  escalationReason?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: ActorDto | null;
  denyReason?: string | null;
  refundAmount?: number | null;
  refundedAt?: string | null;
  currency?: string | null;
  currencyRecorded?: boolean;
}

export interface WarrantyClaimSummaryDto {
  id?: string;
  claimNumber?: string | null;
  status?: string | null;
  reason?: string | null;
  openedAt?: string | null;
  warrantyEndsAt?: string | null;
}

export interface ActivityItemAmount {
  kind?: string;
  amount?: number | null;
  currency?: string | null;
  recorded?: boolean;
}

/** Backend sends one amount object; fallback/legacy clients may send rows. */
export interface ActivityAmountsObject {
  amount?: number | null;
  currency?: string | null;
  netAmount?: number | null;
  vatAmount?: number | null;
  totalAmount?: number | null;
}

export interface ActivityItem {
  id: string;
  type: string;
  category?: string;
  occurredAt?: string | null;
  timestampRecorded?: boolean;
  actor?: ActorDto | null;
  actorRecorded?: boolean;
  titleKey?: string;
  titleEn?: string;
  titleParams?: Record<string, string | number | boolean>;
  description?: string | null;
  descriptionSource?: string;
  descriptionLocale?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  amounts?: ActivityAmountsObject | ActivityItemAmount[] | null;
  amountLines?: ActivityItemAmount[] | null;
  attachments?: AttachmentDto[];
  references?: {
    quotationNumber?: string | null;
    version?: number | null;
    claimNumber?: string | null;
    cancellationRequestId?: string | null;
    paymentId?: string | null;
    refundId?: string | null;
    disputeType?: string | null;
    milestoneIndex?: number | null;
    statusHistoryIndex?: number | null;
    refundRef?: string | null;
    providerRefundId?: string | null;
    refundKind?: "booking" | "extra_cost" | null;
    stage?: "professional_response" | "customer_response" | "final" | string | null;
  } | null;
  metadata?: {
    statusFrom?: string | null;
    statusTo?: string | null;
    previousSchedule?: BookingOverviewSchedule | null;
    proposedSchedule?: BookingOverviewSchedule | null;
    quotationNumber?: string | null;
    version?: number | null;
    reasonCategory?: string | null;
    claimId?: string | null;
    claimNumber?: string | null;
    disputeId?: string | null;
    disputeType?: string | null;
    refundSource?: string | null;
    refundId?: string | null;
    refundRef?: string | null;
    refundKind?: "booking" | "extra_cost" | null;
    providerRefundId?: string | null;
    paymentId?: string | null;
    paymentIndex?: number | null;
    cancellationRequestId?: string | null;
    milestoneIndex?: number | null;
    milestoneTitle?: string | null;
    timeZone?: string | null;
    stage?: string | null;
    legacyQuote?: boolean;
    answerCount?: number | null;
    resolveByDate?: string | null;
    items?: unknown;
  } | null;
  source?: string;
  visibility?: "participants" | "admin" | string;
  legacyDerived?: boolean;
  noteCodes?: string[];
  dataQuality?: {
    legacyDerived?: boolean;
    actorRecorded?: boolean;
    timestampRecorded?: boolean;
    noteCodes?: string[];
  } | null;
}

export interface BookingActivityDto {
  order?: "asc";
  items?: ActivityItem[];
  generatedAt?: string | null;
  complete?: boolean;
  dataQuality?: {
    undatedEvents?: number;
    actorMissingEvents?: number;
    legacyDerivedEvents?: number;
    notes?: string[];
  } | null;
}

/**
 * Shape of the existing `GET /api/bookings/:id` booking document (subset used by
 * read-only detail panes). This is intentionally structure-tolerant: the backend
 * populates some fields live and legacy records omit others.
 */
export interface RawBookingRecord {
  _id: string;
  bookingNumber?: string | null;
  bookingType?: "professional" | "project" | string;
  status?: string | null;
  title?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  rfqData?: {
    serviceType?: string | null;
    description?: string | null;
    answers?: Array<{ questionId?: string; question?: string; answer?: string; fieldType?: string }>;
    attachments?: string[];
    preferredStartDate?: string | null;
    urgency?: string | null;
    budget?: { min?: number; max?: number; currency?: string } | null;
    additionalNotes?: string | null;
  } | null;
  vatDecision?: {
    action?: string;
    country?: string;
    standardRate?: number;
    appliedRate?: number;
    reducedRate?: number;
    reverseCharge?: boolean;
    vatLabel?: string;
    propertyNature?: string;
    explanation?: string;
    matchedRuleText?: string;
    answers?: Array<{ fieldName: string; value: unknown }>;
  } | null;
  checkoutSnapshot?: BookingSnapshotDto["checkoutSnapshot"] | null;
  selectedExtraOptions?: Array<{ extraOptionId?: string; bookedPrice?: number }>;
  selectedSubprojectIndex?: number | null;
  quote?: {
    amount?: number;
    currency?: string;
    description?: string;
    breakdown?: Array<{ item?: string; amount?: number; quantity?: number; unitPrice?: number; totalPrice?: number }>;
    validUntil?: string;
    termsAndConditions?: string;
    estimatedDuration?: string;
    submittedAt?: string;
    submittedBy?: unknown;
  } | null;
  quotationNumber?: string | null;
  quoteVersions?: QuotationVersionDto[];
  currentQuoteVersion?: number | null;
  rfqResponse?: { action?: "accepted" | "rejected"; respondedAt?: string; rejectionReason?: string } | null;
  rfqDeadline?: string | null;
  customerRejectionReason?: string | null;
  milestonePayments?: MilestonePaymentDto[];
  payment?: (PaymentRecordDto & {
    paymentId?: string;
    extraCostCustomerNetAmount?: number;
    extraCostLoyaltyTier?: string;
    extraCostLoyaltyPercentage?: number;
    extraCostCustomerDiscount?: number;
    extraCostStatus?: string;
    extraCostPaymentSucceeded?: boolean;
    extraCostPaidAt?: string;
    refundAmount?: number;
    refundReason?: string;
    extraCostAmount?: number;
    extraCostVatAmount?: number;
    transferStatus?: string | null;
    transferAmount?: number | null;
    transferCurrency?: string | null;
    transferAttemptedAt?: string | null;
  }) | null;
  completionAttestation?: {
    confirmedAt?: string;
    confirmedBy?: unknown;
    attachments?: string[];
    notes?: string;
  } | null;
  extraCosts?: Array<{
    type?: string;
    name?: string;
    justification?: string;
    amount?: number;
    estimatedUnits?: number;
    actualUnits?: number;
    unitPrice?: number;
    referenceIndex?: number;
  }>;
  extraCostStatus?: string | null;
  extraCostTotal?: number | null;
  warrantyCoverage?: {
    duration?: { value?: number; unit?: "months" | "years" };
    startsAt?: string;
    endsAt?: string;
    source?: string;
  } | null;
  postBookingData?: Array<{ questionId?: string; question?: string; answer?: string; fieldType?: string; options?: string[] }>;
  postBookingSubmittedAt?: string | null;
  postBookingSubmittedBy?: unknown;
  project?: {
    _id?: string;
    title?: string;
    category?: string;
    service?: string;
    description?: string;
    timeMode?: string;
    executionDuration?: { value?: number; unit?: string };
    rfqQuestions?: SnapshotQuestion[];
    postBookingQuestions?: SnapshotQuestion[];
    extraOptions?: Array<{ _id?: string; id?: string; name?: string; price?: number; description?: string }>;
    termsConditions?: Array<{ name?: string; description?: string; additionalCost?: number; type?: string }>;
    subprojects?: Array<{
      name?: string;
      description?: string;
      pricing?: {
        type?: string;
        amount?: number;
        priceRange?: { min?: number; max?: number };
        minOrderQuantity?: number;
        unit?: string;
      };
      professionalInputs?: Array<{ fieldName?: string; value?: unknown }>;
      included?: Array<string | { name?: string; description?: string }>;
      materialsIncluded?: boolean;
      materials?: Array<{ name?: string; quantity?: number | string; unit?: string; description?: string }>;
      preparationDuration?: { value?: number; unit?: string };
      executionDuration?: { value?: number; unit?: string };
      buffer?: { value?: number; unit?: string };
      warrantyPeriod?: { value?: number; unit?: string };
    }>;
    minResources?: number | null;
    minOverlapPercentage?: number | null;
    resources?: string[];
  } | null;
  professional?: {
    _id?: string;
    deletedAt?: string | null;
    isAnonymized?: boolean;
    name?: string;
    email?: string;
    phone?: string;
    username?: string;
    businessInfo?: {
      companyName?: string;
      kvkNumber?: string;
      vatNumber?: string;
      country?: string;
      website?: string;
      timezone?: string;
    };
    location?: { city?: string; country?: string; postalCode?: string };
    role?: string;
    createdAt?: string;
  } | null;
  customer?: {
    _id?: string;
    deletedAt?: string | null;
    isAnonymized?: boolean;
    name?: string;
    username?: string;
    email?: string;
    phone?: string;
    customerType?: string;
    businessName?: string;
    vatNumber?: string;
    location?: { city?: string; country?: string; postalCode?: string };
    timezone?: string;
  } | null;
  location?: {
    address?: string;
    city?: string;
    country?: string;
    postalCode?: string;
    coordinates?: [number, number] | number[];
  } | null;
  scheduledStartDate?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  scheduledExecutionEndDate?: string | null;
  scheduledEndDate?: string | null;
  scheduledBufferStartDate?: string | null;
  scheduledBufferEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  scheduleTimeZone?: string | null;
  customerBlocks?: {
    dates?: Array<{ date?: string; reason?: string }>;
    windows?: Array<{ date?: string; startTime?: string; endTime?: string; reason?: string }>;
  } | null;
  rescheduleRequest?: {
    status?: string;
    requestedBy?: unknown;
    requestedAt?: string;
    reason?: string;
    description?: string;
    note?: string;
    proposedSchedule?: BookingOverviewSchedule;
    previousSchedule?: BookingOverviewSchedule;
  } | null;
  rescheduleHistory?: RescheduleHistoryDto[];
  cancellationRequests?: CancellationRequestDto[];
  cancellation?: {
    cancelledBy?: unknown;
    reason?: string;
    cancelledAt?: string;
    refundAmount?: number;
  } | null;
  dispute?: {
    raisedBy?: unknown;
    resolvedBy?: unknown;
    reason?: string;
    description?: string;
    raisedAt?: string;
    resolvedAt?: string;
    resolution?: string;
    type?: string;
    attachments?: string[];
    resolutionAttachments?: string[];
  } | null;
  statusHistory?: Array<{ status?: string; timestamp?: string; updatedBy?: unknown; note?: string }>;
  customerReview?: unknown;
  professionalReview?: unknown;
}

export interface BookingDetailsDto {
  viewerRole?: DetailViewerRole;
  booking?: BookingOverviewDto;
  parties?: PartiesDto;
  bookingSnapshot?: BookingSnapshotDto | null;
  wizard?: BookingWizardDto | null;
  quotation?: QuotationDetailsDto | null;
  payments?: PaymentsDetailsDto | null;
  extraCosts?: ExtraCostsDetailsDto | null;
  postBooking?: PostBookingDetailsDto | null;
  reschedules?: RescheduleHistoryDto[];
  cancellations?: CancellationRequestDto[];
  warrantyClaims?: WarrantyClaimSummaryDto[];
  activity?: BookingActivityDto | null;
  links?: {
    self?: string;
    details?: string;
    activity?: string;
    booking?: string;
    quotationNumber?: string | null;
    claimNumbers?: string[];
    cancellationRequestIds?: string[];
  } | null;
  adminLinks?: {
    booking?: string;
    disputes?: string;
    warrantyClaims?: string;
    cancellationRequests?: string;
    payments?: string;
  } | null;
  internal?: {
    notes?: string | null;
    diagnostics?: Record<string, unknown>;
    auditRef?: { bookingId?: string } | null;
  } | null;
  meta?: {
    generatedAt?: string | null;
    legacy?: boolean;
    notices?: DetailsNotice[];
    counts?: { versions?: number; activity?: number; refunds?: number; warrantyClaims?: number };
    dataQuality?: {
      bookingSnapshotRecorded?: boolean;
      bookingSnapshotCapturedAt?: string | null;
      quoteCustomerTotalsRecorded?: boolean;
      quoteActorRecorded?: boolean;
      quoteServiceLocationRecorded?: boolean;
      extraCostCustomerChargeRecorded?: boolean;
      refundVatRecorded?: boolean;
      activityActorRecorded?: boolean;
      activityComplete?: boolean;
    } | null;
  } | null;
}
