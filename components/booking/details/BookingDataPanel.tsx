"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import {
  durationLabel,
  formatCalendarDate,
  formatInstant,
  isStandardVatQuestionLabel,
  mergeQuestionAnswers,
  vatAnswerFieldLabelKey,
  vatAnswerValueKey,
  recordedScheduleTimeZone,
} from "@/lib/bookingDetails"
import type {
  BookingDetailsDto,
  RawBookingRecord,
  SnapshotQuestion,
} from "@/types/bookingDetails"
import {
  AnswerValue,
  AttachmentLinks,
  DetailCard,
  DetailField,
  DurationText,
  EnumText,
  MoneyText,
  NotRecorded,
  NoticeList,
  ProvenanceBadge,
  ScheduleSummary,
  StatusText,
  TimeZoneNote,
  useDetailDisplayTimeZone,
  useDetailT,
} from "./DetailPrimitives"

interface BookingPanelProps {
  booking: RawBookingRecord
  details: BookingDetailsDto | null
}

export function QuestionAnswerList({
  questions,
  answers,
  sourceLabel,
  emptyAnsweredLabel,
}: {
  questions: SnapshotQuestion[]
  answers: Array<{
    questionId?: string | null
    question?: string | null
    answer?: unknown
    fieldType?: string | null
    answerType?: string | null
    options?: string[] | null
  }>
  sourceLabel?: string
  emptyAnsweredLabel: string
}) {
  const dt = useDetailT()
  const rows = mergeQuestionAnswers(questions, answers)
  if (rows.length === 0) return <NotRecorded />
  return (
    <ol className="space-y-2">
      {rows.map((row) => {
        const sourceTone =
          row.questionSource === "booking_snapshot" || row.questionSource === "post_booking_submission"
            ? "emerald"
            : row.labelSource === "recorded_answer"
              ? "blue"
              : "amber"
        const sourceText =
          row.questionSource === "post_booking_submission"
            ? dt("booking.recordedSubmissionData", "recorded at submission")
            : row.labelSource === "recorded_answer"
              ? dt("booking.recordedAnswerWording", "recorded answer wording")
              : row.questionSource === "booking_snapshot"
                ? dt("booking.snapshotData", "recorded booking snapshot")
                : row.questionSource === "live_project"
                  ? sourceLabel || dt("booking.liveProjectData", "current project (live)")
                  : sourceLabel || dt("booking.questionSourceNotRecorded", "question source not recorded")
        return (
          <li key={row.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs font-medium text-gray-900">
                {row.label || dt("booking.questionLabelMissing", "Question label not recorded")}
                {row.isRequired ? <span className="ml-1 text-rose-500">*</span> : null}
              </p>
              <div className="flex flex-wrap gap-1">
                {row.type ? (
                  <ProvenanceBadge><EnumText prefix="details.enums.questionType" value={row.type} /></ProvenanceBadge>
                ) : null}
                {sourceText ? <ProvenanceBadge tone={sourceTone}>{sourceText}</ProvenanceBadge> : null}
              </div>
            </div>
            {row.options.length > 0 ? (
              <p className="mt-1 text-[11px] text-gray-500">{dt("booking.options", "Options: {options}", { options: row.options.join(" · ") })}</p>
            ) : null}
            <div className="mt-1.5 text-xs text-gray-800">
              {row.hasAnswer ? (
                <AnswerValue value={row.answer} />
              ) : (
                <span className="italic text-gray-500">{emptyAnsweredLabel}</span>
              )}
            </div>
            {row.professionalAttachments.length > 0 ? (
              <div className="mt-2">
                <AttachmentLinks attachments={row.professionalAttachments} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

export function BookingPanel({ booking, details }: BookingPanelProps) {
  const t = useTranslations("bookings")
  const dt = useDetailT()
  const { formatMoney } = useCurrency()
  const { intl } = useFormatLocale()
  const displayTimeZone = useDetailDisplayTimeZone(
    recordedScheduleTimeZone(details, booking.scheduleTimeZone)
  )

  const snapshot = details?.bookingSnapshot
  const wizard = details?.wizard
  const snapshotRecorded = Boolean(snapshot?.immutable || snapshot?.capturedAt)
  const project = snapshot?.project
  const subproject = snapshot?.selectedSubproject
  const selectedIndex = snapshot?.selectedSubprojectIndex ?? wizard?.selectedSubprojectIndex ?? booking.selectedSubprojectIndex
  const liveSubproject =
    !subproject && booking.project?.subprojects && selectedIndex != null
      ? booking.project.subprojects[selectedIndex]
      : !subproject && booking.project?.subprojects?.length === 1
      ? booking.project.subprojects[0]
      : null
  const snapshotCurrency = snapshot?.checkoutSnapshot?.currency || null
  // The checkout card may legitimately fall back to the raw booking checkout
  // subdocument, which is the same recorded checkout record. It never borrows
  // the legacy quote/base-payment currency.
  const checkoutCurrency = snapshot?.checkoutSnapshot?.currency || booking.checkoutSnapshot?.currency || null
  const location = snapshotRecorded
    ? snapshot?.location
    : wizard?.serviceLocation || booking.location
  const scheduleSelection = wizard?.scheduleSelection
  const schedule = snapshotRecorded
    ? snapshot?.schedule
    : scheduleSelection
    ? {
        scheduledStartDate: scheduleSelection.startDate,
        scheduledStartTime: scheduleSelection.startTime,
        scheduledExecutionEndDate: scheduleSelection.executionEndDate,
        scheduledBufferEndDate: scheduleSelection.bufferEndDate,
        timeZone: scheduleSelection.timeZone,
        timeZoneRecorded: Boolean(scheduleSelection.timeZone),
      }
    : null
  const recordedScheduleZone =
    schedule?.timeZoneRecorded === false
      ? null
      : schedule?.timeZone || recordedScheduleTimeZone(details, booking.scheduleTimeZone)
  const postBooking = details?.postBooking
  const liveProjectQuestions = useMemo(() => {
    const rfq = booking.project?.rfqQuestions || []
    const post = booking.project?.postBookingQuestions || []
    return { rfq, post }
  }, [booking.project?.rfqQuestions, booking.project?.postBookingQuestions])

  const rfqQuestions = wizard?.rfqQuestions || snapshot?.questions?.rfq || []
  const effectiveRfqQuestions = rfqQuestions.length > 0 ? rfqQuestions : liveProjectQuestions.rfq
  const rfqQuestionSource = effectiveRfqQuestions.some((question) => question.source === "live_project")
    ? dt("booking.liveProjectData", "current project (live)")
    : effectiveRfqQuestions.some((question) => question.source === "booking_snapshot")
    ? dt("booking.snapshotData", "recorded booking snapshot")
    : !rfqQuestions.length && liveProjectQuestions.rfq.length > 0
    ? dt("booking.liveProjectData", "current project (live)")
    : null
  const rfqAnswers = wizard?.rfq?.answers || booking.rfqData?.answers || []
  const postBookingQuestions = postBooking?.questions || snapshot?.questions?.postBooking || []
  const effectivePostBookingQuestions =
    postBookingQuestions.length > 0 ? postBookingQuestions : liveProjectQuestions.post
  const postBookingHasRecordedSnapshot = effectivePostBookingQuestions.some(
    (question) => question.source === "booking_snapshot"
  )
  const postBookingHasSubmissionSnapshot = effectivePostBookingQuestions.some(
    (question) => question.source === "post_booking_submission"
  )
  const postBookingQuestionsAreLater =
    snapshotRecorded
    && !postBookingHasRecordedSnapshot
    && !postBookingHasSubmissionSnapshot
    && effectivePostBookingQuestions.some((question) => question.source === "live_project")
  const postBookingQuestionSource = postBookingHasSubmissionSnapshot
    ? dt("booking.recordedSubmissionData", "recorded at submission")
    : postBookingHasRecordedSnapshot
      ? dt("booking.snapshotData", "recorded booking snapshot")
      : effectivePostBookingQuestions.some((question) => question.source === "live_project")
        ? postBookingQuestionsAreLater
          ? dt("booking.laterProjectData", "current project (later post-booking questions)")
          : dt("booking.liveProjectData", "current project (live)")
        : null
  const postBookingAnswers = postBooking?.answers || booking.postBookingData || []
  const vatAnswers = wizard?.vatDecision?.answers || booking.vatDecision?.answers || []
  const terms = project?.termsConditions || []
  const selectedOptions = snapshot?.selectedExtraOptions || []
  const checkoutOptions = snapshot?.checkoutSnapshot?.selectedOptions || booking.checkoutSnapshot?.selectedOptions || []
  const extraOptions =
    selectedOptions.length > 0
      ? selectedOptions
      : (booking.selectedExtraOptions || []).map((option) => ({
          extraOptionId: option.extraOptionId,
          bookedPrice: option.bookedPrice,
          name:
            booking.project?.extraOptions?.find(
              (candidate) => (candidate._id || candidate.id) === option.extraOptionId
            )?.name || null,
          priceSource: "live_project_lookup",
        }))

  return (
    <div className="space-y-4">
      <DetailCard
        title={
          <span className="flex flex-wrap items-center gap-2">
            {dt("booking.snapshotTitle", "Booked package & terms")}
            <ProvenanceBadge tone={snapshotRecorded ? "emerald" : "amber"}>
              {snapshotRecorded ? dt("booking.recorded", "recorded snapshot") : dt("booking.legacyMissing", "not recorded (legacy)")}
            </ProvenanceBadge>
          </span>
        }
        description={
          snapshot?.capturedAt
            ? dt("booking.capturedAt", "Captured at booking: {date}", {
                date: formatInstant(snapshot.capturedAt, intl, displayTimeZone.timeZone) || snapshot.capturedAt,
              })
            : dt("booking.noCapturedAt", "No booking-time capture was recorded for this legacy booking.")
        }
      >
        <NoticeList notices={snapshot?.notices} />
        <TimeZoneNote timeZone={displayTimeZone.timeZone} recorded={displayTimeZone.recorded} />
        {snapshotRecorded ? (
          <>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailField label={dt("fields.projectTitle", "Project")} empty={!project?.title}>{project?.title}</DetailField>
              <DetailField label={dt("fields.category", "Category")} empty={!project?.category}>{project?.category}</DetailField>
              <DetailField label={dt("fields.service", "Service")} empty={!project?.service}>{project?.service}</DetailField>
              <DetailField label={dt("fields.areaOfWork", "Area of work")} empty={!project?.areaOfWork}>{project?.areaOfWork}</DetailField>
              <DetailField label={dt("fields.selectedSubproject", "Selected package")} empty={!subproject?.name}>{subproject?.name}</DetailField>
              <DetailField label={dt("fields.capturedSource", "Capture source")} empty={!snapshot?.capturedBySource}>
                <EnumText prefix="details.enums.captureSource" value={snapshot?.capturedBySource} />
              </DetailField>
            </dl>
            {project?.description ? (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("fields.projectDescription", "Project description at booking")}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{project.description}</p>
              </div>
            ) : null}
            {subproject ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold text-gray-900">{subproject.name}</p>
                {subproject.description ? <p className="mt-1 text-xs text-gray-700 whitespace-pre-wrap">{subproject.description}</p> : null}
                <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <DetailField label={dt("fields.pricingType", "Pricing")} empty={!subproject.pricing?.type}><EnumText prefix="details.enums.pricingType" value={subproject.pricing?.type} /></DetailField>
                  <DetailField label={dt("fields.basePrice", "Base amount")} empty={subproject.pricing?.amount == null}>
                    <MoneyText amount={subproject.pricing?.amount} currency={snapshotCurrency} formatMoney={formatMoney} />
                  </DetailField>
                  <DetailField
                    label={dt("fields.priceRange", "Price range")}
                    empty={subproject.pricing?.priceRange?.min == null && subproject.pricing?.priceRange?.max == null}
                  >
                    {subproject.pricing?.priceRange &&
                    (subproject.pricing.priceRange.min != null || subproject.pricing.priceRange.max != null) ? (
                      <span>
                        {subproject.pricing.priceRange.min != null ? (
                          <MoneyText amount={subproject.pricing.priceRange.min} currency={snapshotCurrency} formatMoney={formatMoney} />
                        ) : (
                          dt("notRecorded", "Not recorded")
                        )}
                        {" – "}
                        {subproject.pricing.priceRange.max != null ? (
                          <MoneyText amount={subproject.pricing.priceRange.max} currency={snapshotCurrency} formatMoney={formatMoney} />
                        ) : (
                          dt("notRecorded", "Not recorded")
                        )}
                      </span>
                    ) : null}
                  </DetailField>
                  <DetailField label={dt("fields.minOrderQuantity", "Minimum order quantity")} empty={subproject.pricing?.minOrderQuantity == null}>
                    {subproject.pricing?.minOrderQuantity}
                  </DetailField>
                  <DetailField label={dt("fields.preparationDuration", "Preparation duration")} empty={!durationLabel(subproject.preparationDuration)}>
                    <DurationText duration={subproject.preparationDuration} />
                  </DetailField>
                  <DetailField label={dt("fields.executionDuration", "Execution duration")} empty={!durationLabel(subproject.executionDuration)}>
                    <DurationText duration={subproject.executionDuration} />
                  </DetailField>
                  <DetailField label={dt("fields.bufferDuration", "Buffer")} empty={!durationLabel(subproject.buffer)}>
                    <DurationText duration={subproject.buffer} />
                  </DetailField>
                  <DetailField label={dt("fields.warrantyPeriod", "Warranty period")} empty={!durationLabel(subproject.warrantyPeriod)}>
                    <DurationText duration={subproject.warrantyPeriod} />
                  </DetailField>
                  <DetailField label={dt("fields.materialsIncluded", "Materials included")}>
                    {subproject.materialsIncluded == null ? <NotRecorded /> : subproject.materialsIncluded ? t("common.yes") : t("common.no")}
                  </DetailField>
                  <DetailField label={dt("fields.projectType", "Project type")} empty={!subproject.projectType?.length && !subproject.customProjectType}>
                    {[
                      ...(subproject.projectType || []),
                      subproject.customProjectType || null,
                    ].filter(Boolean).join(", ")}
                  </DetailField>
                  <DetailField label={dt("fields.intakeDuration", "Intake duration")} empty={!durationLabel(subproject.intakeDuration)}>
                    <DurationText duration={subproject.intakeDuration} />
                  </DetailField>
                </dl>
                {Array.isArray(subproject.included) && subproject.included.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("booking.included", "Included")}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-gray-700">
                      {subproject.included.map((item, index) => (
                        <li key={`${item.name}-${index}`}>
                          <span className="font-medium">{item.name}</span>
                          {item.description ? ` — ${item.description}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {Array.isArray(subproject.materials) && subproject.materials.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("fields.materialsList", "Materials")}</p>
                    <ul className="mt-1 space-y-1 text-xs text-gray-700">
                      {subproject.materials.map((material, index) => (
                        <li key={`${material.name}-${index}`}>
                          {material.name}
                          {material.quantity != null ? ` × ${material.quantity}` : ""}
                          {material.unit ? ` ${material.unit}` : ""}
                          {material.description ? ` — ${material.description}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {dt("booking.subprojectNotRecorded", "The selected package details were not recorded at booking time.")}
              </div>
            )}
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <DetailField label={dt("fields.minResources", "Minimum team members")} empty={project?.minResources == null}>
                {project?.minResources}
              </DetailField>
              <DetailField label={dt("fields.minOverlap", "Minimum overlap")} empty={project?.minOverlapPercentage == null}>
                {project?.minOverlapPercentage != null ? `${project.minOverlapPercentage}%` : null}
              </DetailField>
              <DetailField label={dt("fields.resourcesCount", "Team size")} empty={project?.resourcesCount == null}>
                {project?.resourcesCount}
              </DetailField>
            </dl>
            {project?.customConfirmationMessage ? (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("fields.confirmationMessage", "Confirmation message at booking")}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{project.customConfirmationMessage}</p>
              </div>
            ) : null}
            {terms.length > 0 ? (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("booking.terms", "Terms & conditions at booking")}</p>
                <ul className="mt-1 space-y-1.5 text-xs text-gray-700">
                  {terms.map((term, index) => (
                    <li key={`${term.name}-${index}`} className="rounded border border-slate-200 bg-slate-50 p-2">
                      <span className="font-medium">{term.name}</span>
                      {term.type ? <span className="ml-2 text-[10px] uppercase text-gray-500"><EnumText prefix="details.enums.conditionType" value={term.type} /></span> : null}
                      {term.description ? <p className="mt-0.5 whitespace-pre-wrap">{term.description}</p> : null}
                      {term.additionalCost != null ? (
                        <p className="mt-0.5 text-[11px] text-gray-600">
                          {dt("booking.additionalCostLabel", "Additional cost:")}{" "}
                          <MoneyText amount={term.additionalCost} currency={snapshotCurrency} formatMoney={formatMoney} />
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                {dt("booking.termsMissing", "No project terms/conditions were recorded in this booking snapshot.")}
              </p>
            )}
            {selectedOptions.length > 0 ? (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("booking.selectedOptions", "Selected extra options at booking")}</p>
                <ul className="mt-1 space-y-1 text-xs text-gray-700">
                  {selectedOptions.map((option, index) => (
                    <li key={`${option.extraOptionId}-${index}`} className="flex flex-wrap justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                      <span>
                        {option.name || option.extraOptionId}
                        {option.quantity != null && option.quantity !== 1 ? ` × ${option.quantity}` : ""}
                      </span>
                      <span className="tabular-nums">
                        <MoneyText amount={option.bookedPrice ?? option.totalPrice} currency={snapshotCurrency} formatMoney={formatMoney} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-3">
            {!(snapshot?.notices && snapshot.notices.length > 0) ? (
              <NoticeList notices={[{ code: "TERMS_SNAPSHOT_NOT_RECORDED", severity: "warning", entity: "terms" }]} />
            ) : null}
            {liveSubproject || booking.project ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900">{dt("booking.liveProjectReference", "Current project reference (live)")}</p>
                <p className="mt-0.5 text-[11px] text-amber-800">
                  {dt("booking.liveProjectWarning", "This is today's project data, not the original booking terms.")}
                </p>
                <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <DetailField label={dt("fields.projectTitle", "Project")} empty={!booking.project?.title}>{booking.project?.title}</DetailField>
                  <DetailField label={dt("fields.selectedSubproject", "Selected package")} empty={!liveSubproject?.name}>{liveSubproject?.name}</DetailField>
                  <DetailField label={dt("fields.pricingType", "Pricing")} empty={!liveSubproject?.pricing?.type}><EnumText prefix="details.enums.pricingType" value={liveSubproject?.pricing?.type} /></DetailField>
                  <DetailField label={dt("fields.basePrice", "Base amount")} empty={liveSubproject?.pricing?.amount == null}>
                    <MoneyText amount={liveSubproject?.pricing?.amount} currency={null} formatMoney={formatMoney} />
                  </DetailField>
                </dl>
              </div>
            ) : null}
            <p className="text-xs text-gray-500">
              {dt("booking.legacyExplanation", "Recorded package terms are unavailable; no values were reconstructed from the current project.")}
            </p>
          </div>
        )}
      </DetailCard>

      <DetailCard
        title={dt("booking.checkoutTitle", "Checkout snapshot (booking-time professional amounts)")}
        description={dt("booking.checkoutNote", "Stored at checkout before commission, VAT and discounts.")}
      >
        {snapshot?.checkoutSnapshot || booking.checkoutSnapshot ? (
          <>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailField label={dt("fields.pricingType", "Pricing")} empty={!(snapshot?.checkoutSnapshot?.pricingType || booking.checkoutSnapshot?.pricingType)}>
                <EnumText prefix="details.enums.pricingType" value={snapshot?.checkoutSnapshot?.pricingType || booking.checkoutSnapshot?.pricingType} />
              </DetailField>
              <DetailField label={dt("fields.unitPrice", "Unit price")} empty={(snapshot?.checkoutSnapshot?.unitAmount ?? booking.checkoutSnapshot?.unitAmount) == null}>
                <MoneyText amount={snapshot?.checkoutSnapshot?.unitAmount ?? booking.checkoutSnapshot?.unitAmount} currency={checkoutCurrency} formatMoney={formatMoney} />
              </DetailField>
              <DetailField label={dt("fields.quantity", "Quantity")} empty={(snapshot?.checkoutSnapshot?.quantity ?? booking.checkoutSnapshot?.quantity) == null}>
                {snapshot?.checkoutSnapshot?.quantity ?? booking.checkoutSnapshot?.quantity}
                {(snapshot?.checkoutSnapshot?.unit || booking.checkoutSnapshot?.unit) ? (
                  <>
                    {" "}
                    <EnumText prefix="unit" value={snapshot?.checkoutSnapshot?.unit || booking.checkoutSnapshot?.unit} />
                  </>
                ) : null}
              </DetailField>
              <DetailField label={dt("fields.baseSubtotal", "Base subtotal")} empty={(snapshot?.checkoutSnapshot?.baseSubtotal ?? booking.checkoutSnapshot?.baseSubtotal) == null}>
                <MoneyText amount={snapshot?.checkoutSnapshot?.baseSubtotal ?? booking.checkoutSnapshot?.baseSubtotal} currency={checkoutCurrency} formatMoney={formatMoney} />
              </DetailField>
              <DetailField label={dt("fields.extraOptionsTotal", "Extra options total")} empty={(snapshot?.checkoutSnapshot?.extraOptionsTotal ?? booking.checkoutSnapshot?.extraOptionsTotal) == null}>
                <MoneyText amount={snapshot?.checkoutSnapshot?.extraOptionsTotal ?? booking.checkoutSnapshot?.extraOptionsTotal} currency={checkoutCurrency} formatMoney={formatMoney} />
              </DetailField>
              <DetailField label={dt("fields.totalAmount", "Total amount")} empty={(snapshot?.checkoutSnapshot?.totalAmount ?? booking.checkoutSnapshot?.totalAmount) == null}>
                <MoneyText amount={snapshot?.checkoutSnapshot?.totalAmount ?? booking.checkoutSnapshot?.totalAmount} currency={checkoutCurrency} formatMoney={formatMoney} />
              </DetailField>
              <DetailField label={dt("fields.currency", "Currency")} empty={!checkoutCurrency}>{checkoutCurrency}</DetailField>
            </dl>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <DetailField label={dt("fields.estimatedUsage", "Estimated usage")} empty={wizard?.estimatedUsage?.quantity == null && booking.checkoutSnapshot?.quantity == null}>
                {(() => {
                  const quantity = wizard?.estimatedUsage?.quantity ?? booking.checkoutSnapshot?.quantity
                  const unit = wizard?.estimatedUsage?.unit || booking.checkoutSnapshot?.unit
                  return quantity != null ? (
                    <>
                      {quantity}
                      {unit ? <> <EnumText prefix="unit" value={unit} /></> : null}
                    </>
                  ) : null
                })()}
              </DetailField>
              <DetailField label={dt("fields.usageSource", "Usage source")} empty={!wizard?.estimatedUsage?.source}>
                <EnumText prefix="details.enums.usageSource" value={wizard?.estimatedUsage?.source} />
              </DetailField>
              <DetailField label={dt("fields.paymentAtCheckout", "Paid at checkout")}>
                {wizard?.paymentAtCheckout == null ? <NotRecorded /> : wizard.paymentAtCheckout ? t("common.yes") : t("common.no")}
              </DetailField>
            </dl>
            {checkoutOptions.length > 0 ? (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("booking.checkoutOptions", "Options at checkout")}</p>
                <ul className="mt-1 space-y-1 text-xs text-gray-700">
                  {checkoutOptions.map((option, index) => (
                    <li key={`${option.name}-${index}`} className="flex flex-wrap justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                      <span>
                        {option.name}
                        {option.quantity != null && option.quantity !== 1 ? ` × ${option.quantity}` : ""}
                        {option.unitPrice != null ? (
                          <span className="ml-2 text-[10px] text-gray-500">
                            @ <MoneyText amount={option.unitPrice} currency={checkoutCurrency} formatMoney={formatMoney} />
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular-nums">
                        <MoneyText amount={option.totalPrice ?? option.unitPrice} currency={checkoutCurrency} formatMoney={formatMoney} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {snapshot?.checkoutSnapshot?.complete === false || booking.checkoutSnapshot?.complete === false ? (
              <NoticeList notices={[{ code: "CHECKOUT_SNAPSHOT_INCOMPLETE", severity: "warning", entity: "payment" }]} />
            ) : null}
          </>
        ) : (
          <NotRecorded />
        )}
        {extraOptions.length > 0 ? (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("booking.selectedOptions", "Selected extra options at booking")}</p>
            <ul className="mt-1 space-y-1 text-xs text-gray-700">
              {extraOptions.map((option, index) => (
                <li key={`${option.extraOptionId}-${index}`} className="flex flex-wrap justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <span>
                    {option.name || option.extraOptionId}
                    {"priceSource" in option && option.priceSource === "live_project_lookup" ? (
                      <span className="ml-2 text-[10px] text-amber-700">{dt("booking.liveNameLookup", "name from current project")}</span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">
                    <MoneyText amount={"bookedPrice" in option ? option.bookedPrice : undefined} currency={checkoutCurrency} formatMoney={formatMoney} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DetailCard>

      <DetailCard
        title={dt("booking.scheduleLocationTitle", "Booking schedule & service address")}
        description={dt("booking.scheduleLocationNote", "Values captured with the booking or quotation when available.")}
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label={dt("fields.preferredStart", "Preferred start")} empty={!schedule?.preferredStartDate && !booking.rfqData?.preferredStartDate}>
            {formatCalendarDate(schedule?.preferredStartDate || booking.rfqData?.preferredStartDate, intl) ||
              schedule?.preferredStartDate ||
              booking.rfqData?.preferredStartDate}
          </DetailField>
          <DetailField label={dt("fields.preferredStartTime", "Preferred start time")} empty={!schedule?.preferredStartTime}>
            {schedule?.preferredStartTime}
          </DetailField>
          <DetailField label={dt("fields.scheduledStart", "Scheduled start")} empty={!schedule?.scheduledStartDate && !booking.scheduledStartDate}>
            {formatCalendarDate(schedule?.scheduledStartDate || booking.scheduledStartDate, intl) ||
              schedule?.scheduledStartDate ||
              booking.scheduledStartDate}
            {schedule?.scheduledStartTime || booking.scheduledStartTime ? ` ${schedule?.scheduledStartTime || booking.scheduledStartTime}` : ""}
          </DetailField>
          <DetailField label={dt("fields.scheduledExecutionEnd", "Scheduled execution end")} empty={!schedule?.scheduledExecutionEndDate && !booking.scheduledExecutionEndDate}>
            {formatCalendarDate(schedule?.scheduledExecutionEndDate || booking.scheduledExecutionEndDate, intl) ||
              schedule?.scheduledExecutionEndDate ||
              booking.scheduledExecutionEndDate}
          </DetailField>
          <DetailField label={dt("fields.timeZone", "Schedule time zone")} empty={!recordedScheduleZone}>
            {recordedScheduleZone}
          </DetailField>
          <DetailField label={dt("fields.address", "Address")} empty={!location?.address}>{location?.address}</DetailField>
          <DetailField label={dt("fields.city", "City")} empty={!location?.city}>{location?.city}</DetailField>
          <DetailField label={dt("fields.postalCode", "Postal code")} empty={!location?.postalCode}>{location?.postalCode}</DetailField>
          <DetailField label={dt("fields.country", "Country")} empty={!location?.country}>{location?.country}</DetailField>
        </dl>
        {schedule?.timeZoneRecorded === false || (!recordedScheduleZone && (booking.scheduledStartTime || schedule?.scheduledStartTime)) ? (
          <NoticeList notices={[{ code: "SCHEDULE_TIMEZONE_NOT_RECORDED", severity: "info", entity: "schedule" }]} />
        ) : null}
      </DetailCard>

      {(() => {
        const reschedules = details?.reschedules || booking.rescheduleHistory || []
        if (reschedules.length === 0) return null
        return (
          <DetailCard
            title={dt("booking.reschedulesTitle", "Schedule changes")}
            description={dt("booking.reschedulesDescription", "Every recorded reschedule request, including declined requests and the original/new schedule.")}
          >
            <ol className="space-y-2">
              {reschedules.map((entry, index) => (
                <li key={entry.id || `reschedule-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-900">
                      {dt("booking.rescheduleRequestedAt", "Requested {date}", {
                        date: formatInstant(entry.requestedAt, intl, displayTimeZone.timeZone) || dt("activity.dateNotRecorded", "date not recorded"),
                      })}
                    </p>
                    <StatusText value={entry.status} />
                  </div>
                  <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <DetailField label={dt("booking.requestedBy", "Requested by")} empty={!entry.requestedBy?.name && entry.actorRecorded !== false}>
                      {entry.requestedBy?.name || (entry.actorRecorded === false ? dt("fields.actorNotRecorded", "actor not recorded") : null)}
                    </DetailField>
                    <DetailField label={dt("booking.rescheduleReason", "Reason")} empty={!entry.reason}>
                      {entry.reason}
                    </DetailField>
                    <DetailField label={dt("booking.respondedBy", "Responded by")} empty={!entry.respondedBy?.name && !entry.respondedAt}>
                      {entry.respondedBy?.name || null}
                    </DetailField>
                    <DetailField label={dt("booking.respondedAt", "Responded at")} empty={!entry.respondedAt}>
                      {formatInstant(entry.respondedAt, intl, displayTimeZone.timeZone)}
                    </DetailField>
                  </dl>
                  {entry.description || entry.responseNote ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-gray-700">{entry.responseNote || entry.description}</p>
                  ) : null}
                  {entry.previousSchedule || entry.proposedSchedule ? (
                    <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("activity.previousSchedule", "Original schedule")}</dt>
                        <dd className="mt-0.5 text-gray-800"><ScheduleSummary schedule={entry.previousSchedule} intl={intl} timeZone={entry.timeZone} /></dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("activity.proposedSchedule", "New schedule")}</dt>
                        <dd className="mt-0.5 text-gray-800"><ScheduleSummary schedule={entry.proposedSchedule} intl={intl} timeZone={entry.timeZone} /></dd>
                      </div>
                    </dl>
                  ) : null}
                </li>
              ))}
            </ol>
          </DetailCard>
        )
      })()}

      <DetailCard
        title={dt("booking.rfqTitle", "Request (RFQ) wizard data")}
        description={dt("booking.rfqDescription", "Every stored question and answer, including files and unanswered questions.")}
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label={dt("fields.serviceType", "Service type")} empty={!wizard?.rfq?.serviceType && !booking.rfqData?.serviceType}>
            {wizard?.rfq?.serviceType || booking.rfqData?.serviceType}
          </DetailField>
          <DetailField label={dt("fields.urgency", "Urgency")} empty={!wizard?.rfq?.urgency && !booking.rfqData?.urgency}>
            <EnumText prefix="urgency" value={wizard?.rfq?.urgency || booking.rfqData?.urgency} />
          </DetailField>
          <DetailField label={dt("fields.preferredStart", "Preferred start")} empty={!wizard?.rfq?.preferredStartDate && !booking.rfqData?.preferredStartDate}>
            {formatCalendarDate(wizard?.rfq?.preferredStartDate || booking.rfqData?.preferredStartDate, intl) ||
              wizard?.rfq?.preferredStartDate ||
              booking.rfqData?.preferredStartDate}
          </DetailField>
          <DetailField label={dt("fields.budget", "Budget")} empty={!wizard?.rfq?.budget && !booking.rfqData?.budget}>
            {(wizard?.rfq?.budget || booking.rfqData?.budget) ? (
              <span>
                {(() => {
                  const budget = wizard?.rfq?.budget || booking.rfqData?.budget
                  if (!budget) return null
                  const budgetCurrency = budget.currency || null
                  if (budget.min != null && budget.max != null) {
                    return (
                      <span>
                        <MoneyText amount={budget.min} currency={budgetCurrency} formatMoney={formatMoney} /> –{" "}
                        <MoneyText amount={budget.max} currency={budgetCurrency} formatMoney={formatMoney} />
                      </span>
                    )
                  }
                  const one = budget.min ?? budget.max
                  return one != null ? (
                    <MoneyText amount={one} currency={budgetCurrency} formatMoney={formatMoney} />
                  ) : null
                })()}
              </span>
            ) : null}
          </DetailField>
        </dl>
        {wizard?.rfq?.description || booking.rfqData?.description ? (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("booking.requestDescription", "Request description")}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{wizard?.rfq?.description || booking.rfqData?.description}</p>
          </div>
        ) : null}
        {wizard?.rfq?.additionalNotes || booking.rfqData?.additionalNotes ? (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("booking.additionalNotes", "Additional notes")}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{wizard?.rfq?.additionalNotes || booking.rfqData?.additionalNotes}</p>
          </div>
        ) : null}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("booking.rfqQuestions", "RFQ questions & answers")}</p>
          {effectiveRfqQuestions.length > 0 ? (
            <div className="mt-2">
              <QuestionAnswerList
                questions={effectiveRfqQuestions}
                answers={rfqAnswers}
                sourceLabel={rfqQuestionSource || undefined}
                emptyAnsweredLabel={dt("booking.unanswered", "Not answered")}
              />
            </div>
          ) : rfqAnswers.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {rfqAnswers.map((answer, index) => (
                <li key={`${answer.question}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-xs font-medium text-gray-900">{answer.question}</p>
                  <div className="mt-1 text-xs text-gray-800">
                    <AnswerValue value={answer.answer} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-1"><NotRecorded /></div>
          )}
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("booking.rfqAttachments", "RFQ attachments")}</p>
          <div className="mt-1">
            {wizard?.rfq?.attachments && wizard.rfq.attachments.length > 0 ? (
              <AttachmentLinks attachments={wizard.rfq.attachments} />
            ) : booking.rfqData?.attachments && booking.rfqData.attachments.length > 0 ? (
              <NoticeList notices={[{ code: "ATTACHMENT_UNAVAILABLE", severity: "info", entity: "booking_snapshot" }]} />
            ) : (
              <NotRecorded />
            )}
          </div>
        </div>
        {booking.customerBlocks && ((booking.customerBlocks.dates?.length || 0) > 0 || (booking.customerBlocks.windows?.length || 0) > 0) ? (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("booking.customerBlocks", "Customer availability blocks")}</p>
            <ul className="mt-1 space-y-1 text-xs text-gray-700">
              {(booking.customerBlocks.dates || []).map((block, index) => (
                <li key={`date-${block.date}-${index}`}>
                  {formatCalendarDate(block.date, intl) || block.date}
                  {block.reason ? ` — ${block.reason}` : ""}
                </li>
              ))}
              {(booking.customerBlocks.windows || []).map((block, index) => (
                <li key={`window-${block.date}-${index}`}>
                  {formatCalendarDate(block.date, intl) || block.date} · {block.startTime}–{block.endTime}
                  {block.reason ? ` — ${block.reason}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DetailCard>

      <DetailCard
        title={dt("booking.vatTitle", "VAT questionnaire & decision")}
        description={dt("booking.vatNote", "Stored answers and decision; current VAT settings are not applied retrospectively.")}
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label={dt("fields.vatAction", "Decision")} empty={!(wizard?.vatDecision?.action || booking.vatDecision?.action)}>
            <EnumText prefix="details.enums.vatAction" value={wizard?.vatDecision?.action || booking.vatDecision?.action} />
          </DetailField>
          <DetailField label={dt("fields.vatCountry", "Country")} empty={!(wizard?.vatDecision?.country || booking.vatDecision?.country)}>
            {wizard?.vatDecision?.country || booking.vatDecision?.country}
          </DetailField>
          <DetailField label={dt("fields.vatAppliedRate", "Applied rate")} empty={(wizard?.vatDecision?.appliedRate ?? booking.vatDecision?.appliedRate) == null}>
            {wizard?.vatDecision?.appliedRate ?? booking.vatDecision?.appliedRate}%
          </DetailField>
          <DetailField label={dt("fields.reverseCharge", "Reverse charge")}>
            {wizard?.vatDecision?.reverseCharge ?? booking.vatDecision?.reverseCharge ? (
              t("common.yes")
            ) : wizard?.vatDecision?.reverseCharge === false || booking.vatDecision?.reverseCharge === false ? (
              t("common.no")
            ) : (
              <NotRecorded />
            )}
          </DetailField>
          <DetailField label={dt("fields.propertyNature", "Property nature")} empty={!(wizard?.vatDecision?.propertyNature || booking.vatDecision?.propertyNature)}>
            <EnumText prefix="details.enums.propertyNature" value={wizard?.vatDecision?.propertyNature || booking.vatDecision?.propertyNature} />
          </DetailField>
          <DetailField label={dt("fields.vatLabel", "VAT label")} empty={!(wizard?.vatDecision?.vatLabel || booking.vatDecision?.vatLabel)}>
            {wizard?.vatDecision?.vatLabel || booking.vatDecision?.vatLabel}
          </DetailField>
        </dl>
        {wizard?.vatDecision?.explanation || booking.vatDecision?.explanation ? (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("fields.explanation", "Explanation")}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">{wizard?.vatDecision?.explanation || booking.vatDecision?.explanation}</p>
          </div>
        ) : null}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("booking.vatAnswers", "Customer VAT answers")}</p>
          {vatAnswers.length > 0 ? (
            <dl className="mt-2 space-y-1.5">
              {vatAnswers.map((answer, index) => {
                const fieldName =
                  "fieldName" in answer ? (answer.fieldName as string | undefined) : undefined
                const question =
                  "question" in answer ? (answer.question as string | null | undefined) : undefined
                const value = "value" in answer ? answer.value : (answer as { answer?: unknown }).answer
                const standardFieldKey = vatAnswerFieldLabelKey(fieldName)
                const useStandardLabel =
                  Boolean(standardFieldKey) &&
                  (!question || isStandardVatQuestionLabel(fieldName, question)) &&
                  (t.has as unknown as (k: string) => boolean)(standardFieldKey as string)
                const label =
                  (useStandardLabel
                    ? (t as unknown as (k: string) => string)(standardFieldKey as string)
                    : question) ||
                  standardFieldKey ||
                  fieldName?.replace(/[_-]+/g, " ") ||
                  dt("fields.unknown", "Unknown")
                const knownValueKey = vatAnswerValueKey(value)
                return (
                  <div key={`${fieldName || question || index}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                    <dt className="font-medium text-gray-800">{label}</dt>
                    <dd className="mt-0.5 text-gray-700">
                      {knownValueKey && (t.has as unknown as (k: string) => boolean)(knownValueKey) ? (
                        (t as unknown as (k: string) => string)(knownValueKey)
                      ) : (
                        <AnswerValue value={value} enumPrefix="details.enums.vatAnswerValue" />
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          ) : (
            <div className="mt-1"><NotRecorded /></div>
          )}
        </div>
      </DetailCard>

      <DetailCard
        title={dt("booking.postBookingTitle", "Post-booking questions & answers")}
        description={
          postBooking?.submittedAt
            ? dt("booking.postBookingSubmittedAt", "Submitted at {date}", {
                date: formatInstant(postBooking.submittedAt, intl, displayTimeZone.timeZone) || postBooking.submittedAt,
              })
            : postBooking?.complete
              ? dt("booking.postBookingCompleteTimestampMissing", "Marked complete; the submission time was not recorded.")
              : (details?.meta?.legacy ?? details?.booking?.flags?.legacy)
                ? dt("booking.postBookingLegacyNotSubmitted", "Legacy booking: no post-booking submission was recorded.")
                : dt("booking.postBookingNotSubmitted", "Not submitted yet.")
        }
      >
        <NoticeList notices={postBooking?.notices} />
        {postBookingQuestionsAreLater ? (
          <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            {dt("booking.laterProjectNotice", "These post-booking questions were added to the project after the booking snapshot, which recorded none. They are not part of the original booking snapshot; their wording and your answers are recorded together at submission.")}
          </p>
        ) : null}
        {postBooking?.submittedBy ? (
          <p className="text-xs text-gray-600">
            {dt("booking.submittedBy", "Submitted by {name}", {
              name: postBooking.submittedBy.name || dt("fields.actorNotRecorded", "actor not recorded"),
            })}
          </p>
        ) : null}
        {effectivePostBookingQuestions.length > 0 ? (
          <QuestionAnswerList
            questions={effectivePostBookingQuestions}
            answers={postBookingAnswers}
            sourceLabel={postBookingQuestionSource || undefined}
            emptyAnsweredLabel={dt("booking.unanswered", "Not answered")}
          />
        ) : postBookingAnswers.length > 0 ? (
          <ul className="space-y-1.5">
            {postBookingAnswers.map((answer, index) => (
              <li key={`${answer.questionId}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs font-medium text-gray-900">{answer.question}</p>
                <div className="mt-1 text-xs text-gray-800"><AnswerValue value={answer.answer} /></div>
              </li>
            ))}
          </ul>
        ) : (
          <NotRecorded />
        )}
      </DetailCard>
    </div>
  )
}
