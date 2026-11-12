"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarClock, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react";
import { ApiRequestError } from "@/lib/apiErrors";
import { useErrorMessage } from "@/lib/i18n/useErrorMessage";
import { useFormatLocale } from "@/lib/i18n/useFormatLocale";
import {
  cancelSupportMeeting,
  createSupportItem,
  listSupportItems,
  type SupportItem,
  type SupportLocale,
  type SupportPagination,
  SUPPORT_MAX_PAGE,
  type SupportSlot,
} from "@/lib/support";
import type { SupportReasonOption } from "@/lib/support/reasons";
import { supportReasonKey } from "@/lib/support/reasons";
import {
  formatSupportDateTime,
  resolveSupportTimeZone,
} from "@/lib/support/dates";
import {
  canCancelSupportMeeting,
  supportMeetingJoinUrl,
  supportMeetingPhase,
  supportMeetingSubmitOutcome,
} from "@/lib/support/meetingState";
import SupportRequestFields, {
  type SupportFieldErrors,
} from "@/components/support/SupportRequestFields";
import SupportSlotPicker from "@/components/support/SupportSlotPicker";
import SupportReplySection from "@/components/support/SupportReplySection";
import {
  SupportAttachmentLink,
  SupportCard,
  SupportEmailNotice,
  SupportEmptyState,
  SupportErrorBanner,
  SupportLoading,
  SupportStatusPill,
} from "@/components/support/supportUi";

const PAGE_SIZE = 10;

interface MeetingFieldErrors extends SupportFieldErrors {
  slot?: string;
}

function mergeItems(current: SupportItem[], next: SupportItem[]): SupportItem[] {
  const seen = new Set(current.map((item) => `${item.kind}:${item._id || item.id}`));
  return [
    ...current,
    ...next.filter((item) => !seen.has(`${item.kind}:${item._id || item.id}`)),
  ];
}

function appLocale(value: string): SupportLocale {
  return value === "nl" || value === "fr" ? value : "en";
}

export default function SupportMeetingsPanel({
  reasonOptions,
  adminSuppliesLink = true,
  canCreate = true,
}: {
  reasonOptions: SupportReasonOption[];
  adminSuppliesLink?: boolean;
  /** New meetings remain professional-only; history and owner actions stay. */
  canCreate?: boolean;
}) {
  const t = useTranslations("support");
  const locale = useLocale();
  const getErrorText = useErrorMessage();
  const viewerTimeZone = useMemo(
    () => resolveSupportTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone),
    [],
  );
  const [items, setItems] = useState<SupportItem[] | null>(null);
  const [pagination, setPagination] = useState<SupportPagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [reason, setReason] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SupportSlot | null>(null);
  const [slotRefreshKey, setSlotRefreshKey] = useState(0);
  const [errors, setErrors] = useState<MeetingFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [acknowledgements, setAcknowledgements] = useState<
    Record<string, boolean | null>
  >({});
  // Items confirmed on submit (assigned admin's default link): their email is
  // the confirmation with time + link, not the "link follows" acknowledgement.
  const [confirmedOnSubmit, setConfirmedOnSubmit] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const controller = new AbortController();
    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    setLoadError(null);
    listSupportItems({
      kind: "meeting",
      page,
      limit: PAGE_SIZE,
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems((current) =>
          page === 1 ? result.items : mergeItems(current || [], result.items),
        );
        setPagination(result.pagination);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadError(getErrorText(error, t("meeting.loadFailed")));
        setItems((current) => current ?? []);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setLoadingMore(false);
      });
    return () => controller.abort();
  }, [page, reloadKey, getErrorText, t]);

  const retry = () => {
    if (page !== 1) setPage(1);
    setReloadKey((value) => value + 1);
  };

  const resetForm = () => {
    setReason("");
    setSubject("");
    setDescription("");
    setBookingId("");
    setAttachment(null);
    setAttachmentError(null);
    setSelectedSlot(null);
    setErrors({});
  };

  const focusFirstInvalid = (nextErrors: MeetingFieldErrors) => {
    const order: Array<keyof MeetingFieldErrors> = [
      "reason",
      "subject",
      "description",
      "attachment",
      "slot",
    ];
    const first = order.find((field) => nextErrors[field]);
    if (!first) return;
    const id = first === "slot" ? "meeting-slot-selected" : `meeting-${first}`;
    document.getElementById(id)?.focus();
  };

  const submit = async () => {
    if (saving) return;
    const nextErrors: MeetingFieldErrors = {};
    if (!reason) nextErrors.reason = t("form.reasonRequired");
    if (!subject.trim()) nextErrors.subject = t("form.subjectRequired");
    if (!description.trim()) nextErrors.description = t("form.descriptionRequired");
    if (attachmentError) nextErrors.attachment = attachmentError;
    if (!selectedSlot) nextErrors.slot = t("meeting.slotRequired");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalid(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const { item, emailSent } = await createSupportItem({
        kind: "meeting",
        reason,
        subject,
        description,
        bookingId: bookingId || undefined,
        locale: appLocale(locale),
        attachment,
        scheduledAt: selectedSlot?.start,
        timeZone: viewerTimeZone,
      });
      const itemKey = item._id || item.id;
      setItems((current) => [item, ...(current || [])]);
      setPagination((current) =>
        current
          ? {
              ...current,
              total: current.total + 1,
              totalPages: Math.max(1, Math.ceil((current.total + 1) / current.limit)),
            }
          : current,
      );
      setAcknowledgements((current) => ({ ...current, [itemKey]: emailSent }));
      const confirmed = supportMeetingSubmitOutcome(item.meeting) === "confirmed";
      setConfirmedOnSubmit((current) => ({ ...current, [itemKey]: confirmed }));
      resetForm();
      setSlotRefreshKey((value) => value + 1);
      // A page-one list request started before creation would otherwise
      // overwrite the prepended item with a stale snapshot.
      retry();
      const number = item.ticketNumber;
      if (confirmed) {
        toast.success(
          number
            ? t("meeting.createdConfirmed", { ticketNumber: number })
            : t("meeting.createdConfirmedGeneric"),
        );
        if (emailSent === false) toast.warning(t("meeting.confirmedEmailFailed"));
      } else {
        toast.success(
          number
            ? t("meeting.created", { ticketNumber: number })
            : t("meeting.createdGeneric"),
        );
        if (emailSent === false) {
          toast.warning(
            number
              ? t("meeting.ackFailed", { ticketNumber: number })
              : t("meeting.ackFailedGeneric"),
          );
        }
      }
    } catch (error) {
      const code = error instanceof ApiRequestError ? error.code : undefined;
      const status = error instanceof ApiRequestError ? error.status : undefined;
      if (code === "SLOT_UNAVAILABLE" || status === 409) {
        setSelectedSlot(null);
        setSlotRefreshKey((value) => value + 1);
        setErrors((current) => ({ ...current, slot: t("meeting.slotTaken") }));
        toast.error(t("meeting.slotTaken"));
      } else {
        toast.error(getErrorText(error, t("meeting.createFailed")));
      }
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (next: SupportItem) => {
    setItems((current) =>
      current
        ? current.map((item) =>
            (item.kind === next.kind && (item._id || item.id) === (next._id || next.id))
              ? next
              : item,
          )
        : current,
    );
  };

  return (
    <div className="space-y-5">
      {canCreate ? (
        <SupportCard>
          <form
            className="space-y-4 p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            noValidate
          >
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
                {t("meeting.new")}
              </h2>
              <p className="mt-1 text-xs text-indigo-500">{t("meeting.newHint")}</p>
            </div>

            <SupportRequestFields
              idPrefix="meeting"
              reasonOptions={reasonOptions}
              reason={reason}
              subject={subject}
              description={description}
              bookingId={bookingId}
              attachment={attachment}
              attachmentError={attachmentError}
              errors={errors}
              disabled={saving}
              onReasonChange={(value) => {
                setReason(value);
                setErrors((current) => ({ ...current, reason: undefined }));
              }}
              onSubjectChange={(value) => {
                setSubject(value);
                setErrors((current) => ({ ...current, subject: undefined }));
              }}
              onDescriptionChange={(value) => {
                setDescription(value);
                setErrors((current) => ({ ...current, description: undefined }));
              }}
              onBookingChange={setBookingId}
              onAttachmentChange={(file) => {
                setAttachment(file);
                setErrors((current) => ({ ...current, attachment: undefined }));
              }}
              onAttachmentError={setAttachmentError}
            />

            <div className="space-y-1.5">
              <SupportSlotPicker
                idPrefix="meeting"
                timeZone={viewerTimeZone}
                refreshKey={slotRefreshKey}
                selected={selectedSlot}
                disabled={saving}
                onSelect={(slot) => {
                  setSelectedSlot(slot);
                  setErrors((current) => ({ ...current, slot: undefined }));
                }}
              />
              {errors.slot && (
                <p role="alert" className="text-xs text-rose-600">
                  {errors.slot}
                </p>
              )}
            </div>

            {adminSuppliesLink && (
              <p className="text-[11px] text-indigo-400">{t("meeting.reservedNote")}</p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:shadow-lg hover:shadow-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 size={14} aria-hidden className="animate-spin" />
                ) : (
                  <CalendarClock size={14} aria-hidden />
                )}
                {saving ? t("meeting.scheduling") : t("meeting.schedule")}
              </button>
            </div>
          </form>
        </SupportCard>
      ) : (
        <p className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-xs text-indigo-800">
          {t("meeting.historyHint")}
        </p>
      )}

      <section aria-labelledby="meetings-list-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="meetings-list-title"
            className="text-sm font-semibold uppercase tracking-wide text-indigo-700"
          >
            {canCreate ? t("meeting.listTitle") : t("meeting.historyTitle")}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={retry}
              disabled={loading || loadingMore}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-600 transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={11}
                aria-hidden
                className={loading || loadingMore ? "animate-spin" : undefined}
              />
              {t("meeting.refreshList")}
            </button>
            {pagination && pagination.total > 0 && (
              <span className="text-xs text-indigo-400">
                {t("meeting.totalCount", { count: pagination.total })}
              </span>
            )}
          </div>
        </div>

        {loadError && <SupportErrorBanner message={loadError} onRetry={retry} />}

        {items === null && loading ? (
          <SupportLoading label={t("common.loading")} />
        ) : items && items.length === 0 ? (
          <SupportEmptyState>{t("meeting.empty")}</SupportEmptyState>
        ) : (
          <div className="space-y-3">
            {(items || []).map((item) => (
              <MeetingCard
                key={`${item.kind}:${item._id || item.id}`}
                item={item}
                viewerTimeZone={viewerTimeZone}
                emailSent={acknowledgements[item._id || item.id] ?? null}
                confirmedOnSubmit={confirmedOnSubmit[item._id || item.id] === true}
                onUpdated={updateItem}
                onSlotsChanged={() => setSlotRefreshKey((value) => value + 1)}
              />
            ))}
          </div>
        )}

        {pagination && page < Math.min(pagination.totalPages, SUPPORT_MAX_PAGE) && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setPage((value) => value + 1)}
              disabled={loadingMore}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore && <Loader2 size={14} aria-hidden className="animate-spin" />}
              {loadingMore ? t("common.loading") : t("meeting.loadMore")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function MeetingCard({
  item,
  viewerTimeZone,
  emailSent,
  confirmedOnSubmit = false,
  onUpdated,
  onSlotsChanged,
}: {
  item: SupportItem;
  viewerTimeZone: string;
  emailSent: boolean | null;
  confirmedOnSubmit?: boolean;
  onUpdated: (item: SupportItem) => void;
  onSlotsChanged: () => void;
}) {
  const t = useTranslations("support");
  const getErrorText = useErrorMessage();
  const { intl } = useFormatLocale();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const meeting = item.meeting;
  const status = meeting?.status || item.status;
  const legacy = item.kind === "meeting" && (Boolean(meeting?.legacy) || !item.ticketNumber);
  const phase = supportMeetingPhase(meeting);
  const reasonKey = supportReasonKey(item.reason);
  const reasonLabel = reasonKey
    ? t(`reason.${reasonKey}`)
    : item.reasonLabel || "";
  const safeLink = supportMeetingJoinUrl(meeting);
  const canCancel = canCancelSupportMeeting({ meeting });

  const cancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      const { item: updated, emailSent: cancelEmailSent } = await cancelSupportMeeting(
        item._id || item.id,
      );
      onUpdated(updated);
      setConfirmCancel(false);
      onSlotsChanged();
      toast.success(t("meeting.cancelled"));
      if (cancelEmailSent === false) toast.warning(t("meeting.cancelEmailFailed"));
    } catch (error) {
      toast.error(getErrorText(error, t("meeting.cancelFailed")));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <SupportCard>
      <article className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {item.ticketNumber ? (
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-700">
                  {item.ticketNumber}
                </span>
              ) : (
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {t("common.legacy")}
                </span>
              )}
              <SupportStatusPill
                status={status}
                label={phase === "awaiting_link" ? t("status.awaitingLink") : undefined}
              />
            </div>
            <h3 className="break-words text-base font-semibold text-indigo-950">
              {item.subject}
            </h3>
          </div>
          <time
            dateTime={item.createdAt}
            className="shrink-0 text-[11px] text-indigo-400"
          >
            {new Intl.DateTimeFormat(intl, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(item.createdAt))}
          </time>
        </div>

        {(reasonLabel || item.booking) && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {reasonLabel && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                {reasonLabel}
              </span>
            )}
            {item.booking && (
              <span className="max-w-full truncate rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                {item.booking.label}
              </span>
            )}
          </div>
        )}

        {item.description && (
          <p className="whitespace-pre-wrap break-words text-sm text-indigo-800/85">
            {item.description}
          </p>
        )}

        {meeting && (
          <div className="space-y-1.5 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 text-xs text-indigo-800">
            {meeting.scheduledAt ? (
              <>
                <p className="font-semibold">
                  {t(
                    phase === "cancelled" || phase === "declined" || phase === "completed"
                      ? "meeting.wasWhen"
                      : phase === "awaiting_link"
                        ? "meeting.reservedWhen"
                        : "meeting.when",
                    {
                      date: formatSupportDateTime(meeting.scheduledAt, viewerTimeZone, intl),
                    },
                  )}
                </p>
                <p className="text-indigo-500">
                  {t("common.timeZone", { timeZone: viewerTimeZone })}
                </p>
                {meeting.timeZone && meeting.timeZone !== viewerTimeZone && (
                  <p className="text-indigo-500">
                    {t("meeting.savedTimeZone", { timeZone: meeting.timeZone })}
                  </p>
                )}
              </>
            ) : phase === "cancelled" ||
              phase === "declined" ||
              phase === "completed" ? (
              <p className="font-medium">{t("meeting.noScheduledTime")}</p>
            ) : (
              <p className="font-medium">{t("meeting.noReservedTime")}</p>
            )}
            <p className="text-indigo-500">
              {t("meeting.duration", { minutes: meeting.durationMinutes })}
            </p>
            {meeting.assignedAdminName && (
              <p className="text-indigo-500">
                {t("meeting.assignedTo", { name: meeting.assignedAdminName })}
              </p>
            )}
            {phase === "awaiting_link" ? (
              <p className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800">
                {t("meeting.awaitingLink")}
              </p>
            ) : null}
            {phase === "confirmed" && safeLink ? (
              <a
                href={safeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                <ExternalLink size={13} aria-hidden />
                {t("meeting.link")}
              </a>
            ) : phase === "legacy" ? (
              <p className="text-amber-700">{t("meeting.legacyNoLink")}</p>
            ) : phase === "missing_link" ? (
              <p className="text-rose-700">{t("meeting.linkMissing")}</p>
            ) : phase === "awaiting_link" ? (
              <p className="text-indigo-500">{t("meeting.linkPending")}</p>
            ) : (
              <p className="text-indigo-500">{t("meeting.noLink")}</p>
            )}
            {meeting.cancellationReason && (
              <p className="text-rose-700">
                {t("meeting.cancellationReason", {
                  reason: meeting.cancellationReason,
                })}
              </p>
            )}
          </div>
        )}

        {legacy && meeting?.preferredTimes && (
          <p className="text-xs text-indigo-600">
            {t("meeting.legacyPreferred", { times: meeting.preferredTimes })}
          </p>
        )}
        {legacy && meeting?.adminResponse && (
          <p className="rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
            {t("meeting.legacyResponse", { response: meeting.adminResponse })}
          </p>
        )}

        <SupportAttachmentLink attachment={item.attachment} />
        <SupportEmailNotice
          emailSent={emailSent}
          sentLabel={
            confirmedOnSubmit ? t("meeting.confirmedEmailSent") : t("meeting.ackEmailSent")
          }
          failedLabel={
            confirmedOnSubmit ? t("meeting.confirmedEmailFailed") : t("meeting.ackEmailFailed")
          }
        />

        {legacy ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            {t("meeting.legacyReadOnly")}
          </p>
        ) : (
          <SupportReplySection item={item} onUpdated={onUpdated} />
        )}

        {canCancel && (
          <div className="border-t border-indigo-100 pt-3">
            {confirmCancel ? (
              <div
                role="alertdialog"
                aria-label={t("meeting.cancelConfirm")}
                className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-xs text-rose-800">{t("meeting.cancelConfirm")}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void cancel()}
                    disabled={cancelling}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-60"
                  >
                    {cancelling ? (
                      <Loader2 size={12} aria-hidden className="animate-spin" />
                    ) : (
                      <XCircle size={12} aria-hidden />
                    )}
                    {t("meeting.cancelYes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(false)}
                    disabled={cancelling}
                    className="inline-flex min-h-9 items-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-60"
                  >
                    {t("meeting.cancelNo")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                <XCircle size={13} aria-hidden />
                {t("meeting.cancel")}
              </button>
            )}
          </div>
        )}
      </article>
    </SupportCard>
  );
}
