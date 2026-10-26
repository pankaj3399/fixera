"use client"

import { useEffect, useId, useRef, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserX,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  anonymizeCanAttempt,
  anonymizeConfirmationError,
  anonymizeRecoveryFromError,
  cleanupHasPending,
  executeAnonymizeAccount,
  isAmbiguousAnonymizeError,
  isAnonymizationComplete,
  isFullyAnonymizedResult,
  reconcileAnonymizePreview,
  requestAnonymizePreview,
  shouldCheckAnonymizeStatus,
  type AnonymizeBlocker,
  type AnonymizeCleanup,
  type AnonymizeExecutionData,
  type AnonymizeImpact,
  type AnonymizePreviewData,
  type AnonymizeRecoveryRecord,
  type AnonymizeRequestError,
} from "@/lib/adminAnonymize"
import { isAnonymizedIdentity } from "@/lib/anonymizedUsers"
import { cn } from "@/lib/utils"

export interface AnonymizeAccountTarget {
  id: string
  name?: string | null
  email?: string | null
  role?: string | null
}

interface AnonymizeAccountDialogProps {
  open: boolean
  target: AnonymizeAccountTarget | null
  onOpenChange: (open: boolean) => void
  /** Called after the database identity has been removed, including partial file cleanup. */
  onAnonymized: (result: AnonymizeExecutionData) => void
  /** Called when the preview shows the account was already anonymized. */
  onAlreadyAnonymized?: (targetId: string) => void
  /** Called when an authoritative preview proves no recovery/cleanup is needed. */
  onRecoveryResolved?: (targetId: string) => void
  /** Called when an anonymized or tombstoned account still needs a cleanup retry. */
  onRecoveryRequired?: (recovery: AnonymizeRecoveryRecord) => void
  /**
   * Stable element to focus after close when the trigger was removed with the
   * anonymized row. Radix restores a connected trigger normally.
   */
  focusFallbackId?: string
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value)
}

function roleLabel(role: string | null | undefined): string {
  if (!role) return "Account"
  return role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, " ")
}

function statusCopy(preview: AnonymizePreviewData): {
  title: string
  tone: "info" | "warning" | "danger" | "success"
  text: string
} {
  switch (preview.status) {
    case "eligible":
      return {
        title: "Ready to anonymize",
        tone: "info",
        text: "The account has no blocking records. Personal data will be removed when you confirm.",
      }
    case "blocked":
      return {
        title: "Anonymization blocked",
        tone: "danger",
        text: "Resolve the blockers below before trying again. A preview success is not a reservation; the server rechecks these conditions when you confirm.",
      }
    case "already_anonymized":
      return {
        title: "Already anonymized",
        tone: "info",
        text: "The account identity has already been anonymized. No further identity changes are needed.",
      }
    case "recovery_required": {
      const identityRemoved =
        preview.target.identityRemoved === true ||
        preview.target.legacyAnonymized === true
      return {
        title: "Cleanup needs recovery",
        tone: "warning",
        text: identityRemoved
          ? "The account identity was already removed, but the database or file cleanup did not finish. The server checks blockers again; retry only when none remain."
          : "The account is locked, but identity redaction is not proven complete. The server checks blockers again; retry only when none remain.",
      }
    }
  }
}

function toneClasses(tone: "info" | "warning" | "danger" | "success"): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-900"
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-950"
    case "danger":
      return "border-rose-200 bg-rose-50 text-rose-950"
    default:
      return "border-sky-200 bg-sky-50 text-sky-950"
  }
}

function ErrorNotice({
  error,
  id,
  onCheckStatus,
  onRetryPreview,
  checking,
}: {
  error: AnonymizeRequestError
  id?: string
  onCheckStatus?: () => void
  onRetryPreview?: () => void
  checking?: boolean
}) {
  const ambiguous = isAmbiguousAnonymizeError(error)
  return (
    <div
      id={id}
      role="alert"
      className={cn(
        "rounded-xl border px-3 py-2.5 text-sm",
        ambiguous || shouldCheckAnonymizeStatus(error)
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-rose-200 bg-rose-50 text-rose-950",
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 space-y-1.5">
          <p>{error.message}</p>
          {ambiguous && (
            <p className="text-xs">
              We could not confirm whether the request reached the server. Do not
              retry blindly. Check the current account status first; the anonymize
              request is idempotent once the state is clear.
            </p>
          )}
          {error.code && (
            <p className="font-mono text-[10px] opacity-70">{error.code}</p>
          )}
          {onCheckStatus && shouldCheckAnonymizeStatus(error) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCheckStatus}
              disabled={checking}
              className="mt-1 bg-white"
            >
              {checking ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Check account status
            </Button>
          )}
          {onRetryPreview && !ambiguous && !shouldCheckAnonymizeStatus(error) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetryPreview}
              disabled={checking}
              className="mt-1 bg-white"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry preview
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function BlockerList({ blockers }: { blockers: AnonymizeBlocker[] }) {
  if (blockers.length === 0) return null
  return (
    <ul className="space-y-2" aria-label="Anonymization blockers">
      {blockers.map((blocker) => (
        <li
          key={`${blocker.code}-${blocker.count ?? ""}`}
          className="flex items-start gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-rose-950"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
          <span>
            <span className="font-medium">{blocker.message}</span>
            {blocker.count !== undefined && (
              <span className="ml-1 text-xs text-rose-700">
                ({formatCount(blocker.count)})
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

function CleanupNotice({
  cleanup,
  result = false,
}: {
  cleanup: AnonymizeCleanup
  result?: boolean
}) {
  const pending = cleanupHasPending(cleanup)
  if (!pending && !result) return null
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 text-xs",
        pending
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-slate-200 bg-slate-50 text-slate-700",
      )}
    >
      <div className="flex items-start gap-2">
        {pending ? (
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        )}
        <div className="space-y-1">
          <p className="font-medium">
            {pending
              ? "File cleanup is incomplete."
              : "Owned file cleanup completed."}
          </p>
          <p>
            Deleted {formatCount(cleanup.deletedFiles)} · files pending{" "}
            {formatCount(cleanup.pendingFiles)} · calendar tasks pending{" "}
            {formatCount(cleanup.pendingCalendarReleases)} · failed{" "}
            {formatCount(cleanup.failedFiles)}
          </p>
          {cleanup.completedAt && (
            <p>Completed at {new Date(cleanup.completedAt).toLocaleString("en-GB")}.</p>
          )}
          {cleanup.lastError && (
            <p className="font-mono text-[10px] opacity-80">{cleanup.lastError}</p>
          )}
          {pending && (
            <p>
              The database identity may already be removed. Do not claim full
              success until the pending files are retried successfully.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string
  value: number
  detail?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
        {formatCount(value)}
        {detail ? <span className="ml-1 text-[10px] font-normal text-slate-500">{detail}</span> : null}
      </dd>
    </div>
  )
}

export function AnonymizeImpactSummary({ impact }: { impact: AnonymizeImpact }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">
        Retained financial and service records
      </h3>
      <p className="mt-0.5 text-xs text-slate-600">
        These records stay in place for settlement, contract history and the
        counterparty. Party names and contact details are redacted, but the
        amounts, booking numbers, invoice numbers and refund facts remain.
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat
          label="Bookings"
          value={impact.bookings.total}
          detail={impact.bookings.active > 0 ? `${formatCount(impact.bookings.active)} active` : undefined}
        />
        <Stat label="Payments" value={impact.payments.total} />
        <Stat label="Invoice records" value={impact.payments.invoiceRecords} />
        <Stat label="Refunds" value={impact.refunds.total} detail={impact.refunds.pending > 0 ? `${formatCount(impact.refunds.pending)} pending` : undefined} />
        <Stat label="Disputes" value={impact.disputes.total} detail={impact.disputes.active > 0 ? `${formatCount(impact.disputes.active)} active` : undefined} />
        <Stat label="Warranty claims" value={impact.warrantyClaims.total} detail={impact.warrantyClaims.active > 0 ? `${formatCount(impact.warrantyClaims.active)} active` : undefined} />
        <Stat label="Cancellation requests" value={impact.cancellationRequests.total} detail={impact.cancellationRequests.active > 0 ? `${formatCount(impact.cancellationRequests.active)} active` : undefined} />
        <Stat label="Support tickets" value={impact.supportTickets} />
        <Stat label="Chat messages" value={impact.chatMessages} />
        <Stat label="Meetings" value={impact.meetings} />
        <Stat label="Projects" value={impact.projects} />
        <Stat label="Marketing records" value={impact.marketingSubscribers} />
        <Stat label="Notifications" value={impact.notifications} />
        <Stat label="Email logs" value={impact.emailLogs} />
      </dl>
    </div>
  )
}

function RetainedCategories({
  categories,
}: {
  categories: AnonymizePreviewData["retained"]
}) {
  return (
    <section aria-labelledby="anonymize-retained-title" className="space-y-2">
      <h3 id="anonymize-retained-title" className="text-sm font-semibold text-slate-900">
        What is retained
      </h3>
      {categories.length === 0 ? (
        <p className="text-xs text-slate-600">
          The server did not return retained categories. Do not assume that
          financial records were deleted.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {categories.map((category) => (
            <li
              key={category.category}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            >
              <p className="font-medium text-slate-900">{category.label}</p>
              <p className="mt-0.5 text-slate-600">{category.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ExecutionResult({
  result,
  onRetryCleanup,
  onClose,
  busy,
  statusCheckRequired,
}: {
  result: AnonymizeExecutionData
  onRetryCleanup: () => void
  onClose: () => void
  busy: boolean
  statusCheckRequired: boolean
}) {
  const pending = cleanupHasPending(result.cleanup)
  const full = isFullyAnonymizedResult(result)
  const complete = isAnonymizationComplete(result)
  const alreadyComplete = result.outcome === "already_anonymized" && complete
  const partial = !complete
  const redacted = result.redacted
  return (
    <div className="space-y-3">
      <div
        role="status"
        className={cn(
          "rounded-xl border px-3 py-3",
          complete
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : "border-amber-300 bg-amber-50 text-amber-950",
        )}
      >
        <div className="flex items-start gap-2">
          {complete ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          )}
          <div className="space-y-1">
            <p className="font-semibold">
              {full
                ? "Account anonymized"
                : alreadyComplete
                  ? "Account was already anonymized"
                  : "Identity removed, but cleanup is incomplete"}
            </p>
            <p className="text-sm">
              {full
                ? "Personal data has been removed from active use and every login path is blocked. Retained financial records are unchanged."
                : alreadyComplete
                  ? "No further identity changes were made. The account was already fully anonymized and no cleanup is pending."
                  : "The account is locked and the database identity has been removed, but at least one owned file or calendar cleanup task could not be completed. The account is not fully cleaned up yet."}
            </p>
          </div>
        </div>
      </div>

      <CleanupNotice cleanup={result.cleanup} result />

      {redacted && (
        <section aria-labelledby="anonymize-redacted-title" className="space-y-1.5">
          <h3 id="anonymize-redacted-title" className="text-sm font-semibold text-slate-900">
            Redacted records
          </h3>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
            {redacted.profile && <li>Profile and contact details</li>}
            {typeof redacted.supportTickets === "number" && (
              <li>{formatCount(redacted.supportTickets)} support tickets</li>
            )}
            {typeof redacted.chatMessages === "number" && (
              <li>{formatCount(redacted.chatMessages)} chat messages</li>
            )}
            {typeof redacted.meetings === "number" && (
              <li>{formatCount(redacted.meetings)} meetings</li>
            )}
            {typeof redacted.bookingRecords === "number" && (
              <li>{formatCount(redacted.bookingRecords)} booking party records</li>
            )}
            {typeof redacted.projects === "number" && (
              <li>{formatCount(redacted.projects)} projects</li>
            )}
            {typeof redacted.marketingSubscribers === "number" && (
              <li>{formatCount(redacted.marketingSubscribers)} marketing records</li>
            )}
            {typeof redacted.notifications === "number" && (
              <li>{formatCount(redacted.notifications)} notifications</li>
            )}
            {typeof redacted.emailLogs === "number" && (
              <li>{formatCount(redacted.emailLogs)} email log records</li>
            )}
            {typeof redacted.s3Objects === "number" && (
              <li>{formatCount(redacted.s3Objects)} owned files</li>
            )}
          </ul>
        </section>
      )}

      {result.warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {partial && pending && (
        <p className="text-xs text-slate-600">
          A retry reuses the same confirmation and is idempotent. It only retries
          the pending file cleanup; retained financial records are not rewritten.
        </p>
      )}

      <DialogFooter className="gap-2 pt-1">
        {partial && pending && (
          <Button
            type="button"
            variant="outline"
            onClick={onRetryCleanup}
            disabled={busy || statusCheckRequired}
            className="border-amber-300 text-amber-900 hover:bg-amber-50"
          >
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Retry cleanup
          </Button>
        )}
        <Button type="button" onClick={onClose} disabled={busy}>
          Done
        </Button>
      </DialogFooter>
    </div>
  )
}

export interface AnonymizeDialogBodyProps {
  target: AnonymizeAccountTarget | null
  preview: AnonymizePreviewData | null
  loading: boolean
  previewError: AnonymizeRequestError | null
  actionError: AnonymizeRequestError | null
  result: AnonymizeExecutionData | null
  confirmation: string
  onConfirmationChange: (value: string) => void
  executing: boolean
  checking: boolean
  onRetryPreview: () => void
  onCheckStatus: () => void
  onExecute: () => void
  onClose: () => void
  statusCheckRequired?: boolean
}

export function AnonymizeDialogBody({
  target,
  preview,
  loading,
  previewError,
  actionError,
  result,
  confirmation,
  onConfirmationChange,
  executing,
  checking,
  onRetryPreview,
  onCheckStatus,
  onExecute,
  onClose,
  statusCheckRequired = false,
}: AnonymizeDialogBodyProps) {
  const uid = useId().replace(/:/g, "")
  const inputId = `${uid}-confirm`
  const helpId = `${uid}-confirm-help`
  const errorId = `${uid}-confirm-error`
  const generatedErrorId = `${uid}-action-error`
  const previewErrorId = `${uid}-preview-error`
  const canAttempt = !statusCheckRequired && anonymizeCanAttempt(preview)
  const confirmationError = canAttempt
    ? anonymizeConfirmationError(preview, confirmation)
    : null
  const canRetryResult = Boolean(
    result && cleanupHasPending(result.cleanup) && !isFullyAnonymizedResult(result),
  )
  const targetRecord = preview?.target
  const targetIsDeleted =
    Boolean(targetRecord && isAnonymizedIdentity(targetRecord)) ||
    targetRecord?.legacyAnonymized === true ||
    Boolean(result?.target && isAnonymizedIdentity(result.target))
  const displayName = targetIsDeleted
    ? "Deleted user"
    : targetRecord?.name || target?.name || "This account"
  const displayEmail = targetIsDeleted ? null : targetRecord?.email || target?.email || null
  const displayRole = roleLabel(targetRecord?.role || target?.role)
  const displayAccountStatus = targetRecord?.accountStatus
  const executeLabel =
    preview?.status === "recovery_required"
      ? "Retry anonymization"
      : preview?.status === "already_anonymized"
        ? "Retry cleanup"
        : "Anonymize account"
  const showExecuteButton =
    canAttempt || preview?.status === "blocked" || statusCheckRequired
  const identityAlreadyRemoved =
    preview?.alreadyAnonymized === true ||
    preview?.status === "already_anonymized" ||
    preview?.target.identityRemoved === true ||
    preview?.target.legacyAnonymized === true

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <UserX className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
            {displayEmail && (
              <p className="truncate text-xs text-slate-600">{displayEmail}</p>
            )}
            <p className="mt-0.5 text-[11px] text-slate-600">
              {displayRole}
              {displayAccountStatus ? ` · Account ${displayAccountStatus}` : ""}
            </p>
          </div>
        </div>
      </div>

      {loading && !preview ? (
        <div role="status" className="space-y-3" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading the authoritative preview…
          </p>
          <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : previewError && !preview ? (
        <div className="space-y-3">
          <ErrorNotice
            id={previewErrorId}
            error={previewError}
            onRetryPreview={onRetryPreview}
            checking={checking}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="button" onClick={onRetryPreview} disabled={checking}>
              {checking ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Retry preview
            </Button>
          </DialogFooter>
        </div>
      ) : preview ? (
        <>
          {result ? (
            <ExecutionResult
              result={result}
              onRetryCleanup={onExecute}
              onClose={onClose}
              busy={executing}
              statusCheckRequired={statusCheckRequired}
            />
          ) : (
            <>
              {(() => {
                const copy = statusCopy(preview)
                return (
                  <div className={cn("rounded-xl border px-3 py-2.5 text-sm", toneClasses(copy.tone))}>
                    <p className="font-semibold">{copy.title}</p>
                    <p className="mt-0.5 text-xs">{copy.text}</p>
                  </div>
                )
              })()}

              {preview.blockers.length > 0 && (
                <BlockerList blockers={preview.blockers} />
              )}

              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-950">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div>
                    <p className="font-semibold">
                      {identityAlreadyRemoved
                        ? "This account is already anonymized"
                        : "This cannot be undone"}
                    </p>
                    <p className="mt-0.5 text-xs">
                      {identityAlreadyRemoved
                        ? "The profile, contact details, addresses, avatar, owned support and chat content, and target-owned files were already removed from active use. Completing cleanup does not restore the account or change retained financial records."
                        : "The profile, contact details, addresses, avatar, owned support and chat content, and target-owned files will be removed from active use. The account cannot sign in again."}
                    </p>
                  </div>
                </div>
              </div>

              <AnonymizeImpactSummary impact={preview.impact} />
              <RetainedCategories categories={preview.retained} />

              <CleanupNotice cleanup={preview.cleanup} />

              {preview.warnings.length > 0 && (
                <section aria-labelledby={`${uid}-warnings-title`} className="space-y-1.5">
                  <h3 id={`${uid}-warnings-title`} className="text-sm font-semibold text-slate-900">
                    What this operation does not change
                  </h3>
                  <ul className="space-y-1 text-xs text-slate-600">
                    {preview.warnings.map((warning) => (
                      <li key={warning} className="flex items-start gap-1.5">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {canAttempt ? (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <Label htmlFor={inputId} className="text-sm font-medium text-slate-900">
                    Type <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">{preview.confirmation.requiredText}</code> to confirm
                  </Label>
                  <Input
                    id={inputId}
                    value={confirmation}
                    onChange={(event) => onConfirmationChange(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    disabled={executing || checking}
                    aria-describedby={[
                      helpId,
                      confirmationError ? errorId : null,
                      actionError ? generatedErrorId : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-invalid={confirmation.length > 0 && Boolean(confirmationError)}
                    className="font-mono"
                  />
                  <p id={helpId} className="text-[11px] text-slate-500">
                    The phrase is case-sensitive. The action runs only when you press
                    the button; pressing Enter in this field does nothing.
                  </p>
                  {confirmationError && confirmation.length > 0 && (
                    <p id={errorId} role="alert" className="text-xs font-medium text-rose-700">
                      {confirmationError}
                    </p>
                  )}
                </div>
              ) : (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {statusCheckRequired
                    ? "Check the account status before trying again. A previous request may already have reached the server."
                    : preview.status === "blocked"
                      ? "The confirmation field is disabled while blockers remain."
                      : "This account does not need a new anonymization request."}
                </p>
              )}

              {actionError && (
                <ErrorNotice
                  id={generatedErrorId}
                  error={actionError}
                  onCheckStatus={onCheckStatus}
                  onRetryPreview={onRetryPreview}
                  checking={checking}
                />
              )}

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={executing || checking}
                >
                  Cancel
                </Button>
                {showExecuteButton && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={onExecute}
                    disabled={!canAttempt || !confirmation || Boolean(confirmationError) || executing || checking}
                    aria-disabled={!canAttempt || !confirmation || Boolean(confirmationError) || executing || checking}
                  >
                    {executing ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Anonymizing…
                      </>
                    ) : (
                      executeLabel
                    )}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}

          {result && actionError && (
            <ErrorNotice
              id={generatedErrorId}
              error={actionError}
              onCheckStatus={onCheckStatus}
              onRetryPreview={onRetryPreview}
              checking={checking}
            />
          )}

          {canRetryResult && result && (
            <p className="text-xs text-slate-600">
              Retrying cleanup does not change the retained financial records.
            </p>
          )}

          {checking && (
            <p role="status" className="flex items-center gap-2 text-xs text-slate-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Checking the account status…
            </p>
          )}
        </>
      ) : null}
    </div>
  )
}

export function AnonymizeAccountDialog({
  open,
  target,
  onOpenChange,
  onAnonymized,
  onAlreadyAnonymized,
  onRecoveryResolved,
  onRecoveryRequired,
  focusFallbackId,
}: AnonymizeAccountDialogProps) {
  const [preview, setPreview] = useState<AnonymizePreviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewError, setPreviewError] = useState<AnonymizeRequestError | null>(null)
  const [actionError, setActionError] = useState<AnonymizeRequestError | null>(null)
  const [confirmation, setConfirmation] = useState("")
  const [executing, setExecuting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<AnonymizeExecutionData | null>(null)
  const [statusCheckRequired, setStatusCheckRequired] = useState(false)

  const previewAbortRef = useRef<AbortController | null>(null)
  const previewRequestIdRef = useRef(0)
  const targetIdRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const executingRef = useRef(false)
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const targetId = target?.id || null

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      previewAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    targetIdRef.current = targetId
  }, [targetId])

  // Radix restores focus to the trigger. After a successful anonymization the
  // trigger row is gone, so restore focus to a stable list control instead of
  // letting the browser fall back to BODY.
  useEffect(() => {
    if (typeof document === "undefined") return
    if (open) {
      const active = document.activeElement
      triggerRef.current = active instanceof HTMLElement ? active : null
      return
    }
    const trigger = triggerRef.current
    const timer = window.setTimeout(() => {
      if (trigger?.isConnected) {
        trigger.focus()
        return
      }
      if (focusFallbackId) {
        const fallback = document.getElementById(focusFallbackId)
        fallback?.focus()
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, focusFallbackId])

  const loadPreview = async (options: { clearConfirmation?: boolean } = {}) => {
    if (!targetId) return
    previewAbortRef.current?.abort()
    const controller = new AbortController()
    previewAbortRef.current = controller
    const requestId = ++previewRequestIdRef.current
    setLoading(true)
    setChecking(true)
    setPreviewError(null)
    setActionError(null)
    setStatusCheckRequired(false)
    if (options.clearConfirmation) setConfirmation("")
    try {
      const response = await requestAnonymizePreview({
        userId: targetId,
        signal: controller.signal,
      })
      if (!mountedRef.current || controller.signal.aborted || requestId !== previewRequestIdRef.current) {
        return
      }
      if (targetIdRef.current !== targetId) return
      if (!response.ok) {
        if (response.error.kind === "canceled") return
        setPreview(null)
        setPreviewError(response.error)
        return
      }
      setPreview(response.data)
      setResult(null)
      const reconciliation = reconcileAnonymizePreview(response.data)
      if (reconciliation.kind === "recovery") {
        onRecoveryRequired?.(reconciliation.record)
      } else if (
        response.data.status === "already_anonymized" &&
        !cleanupHasPending(response.data.cleanup)
      ) {
        onAlreadyAnonymized?.(targetId)
        onRecoveryResolved?.(targetId)
      } else {
        // An eligible account, a blocked account with no tombstone, or a fully
        // complete already-anonymized account proves the earlier ambiguous
        // outcome did not leave cleanup work behind.
        onRecoveryResolved?.(targetId)
      }
    } finally {
      if (mountedRef.current && requestId === previewRequestIdRef.current) {
        setLoading(false)
        setChecking(false)
      }
    }
  }

  useEffect(() => {
    if (!open || !targetId) {
      previewAbortRef.current?.abort()
      previewAbortRef.current = null
      previewRequestIdRef.current += 1
      setPreview(null)
      setLoading(false)
      setPreviewError(null)
      setActionError(null)
      setConfirmation("")
      setExecuting(false)
      executingRef.current = false
      setChecking(false)
      setResult(null)
      setStatusCheckRequired(false)
      return
    }
    setPreview(null)
    setResult(null)
    setConfirmation("")
    setActionError(null)
    setPreviewError(null)
    setStatusCheckRequired(false)
    // A response for the previous target is ignored by targetIdRef. Release the
    // UI pending state so the new target can be inspected instead of waiting
    // for the superseded request to settle.
    executingRef.current = false
    setExecuting(false)
    void loadPreview()
    return () => {
      previewAbortRef.current?.abort()
    }
    // loadPreview intentionally reads onAlreadyAnonymized from the render that
    // opened the dialog. The target id and open state are the request keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetId])

  const execute = async () => {
    if (!targetId || !preview || executingRef.current) return
    if (isFullyAnonymizedResult(result)) return
    const canRetryResult = Boolean(
      result && cleanupHasPending(result.cleanup) && !isFullyAnonymizedResult(result),
    )
    if (!result) {
      const validation = anonymizeConfirmationError(preview, confirmation)
      if (validation || !anonymizeCanAttempt(preview)) {
        setActionError({
          kind: "http",
          message: validation || "This account is not available for anonymization.",
          blockers: preview.blockers,
        })
        return
      }
    } else if (!canRetryResult) {
      return
    }

    executingRef.current = true
    setExecuting(true)
    setActionError(null)
    try {
      const response = await executeAnonymizeAccount({
        userId: targetId,
        confirmation,
      })
      if (!mountedRef.current || targetIdRef.current !== targetId) return
      if (!response.ok) {
        setActionError(response.error)
        if (response.error.code === "ANONYMIZE_BLOCKED" && response.error.blockers.length > 0) {
          setPreview((current) =>
            current
              ? {
                  ...current,
                  status: "blocked",
                  eligible: false,
                  blockers: response.error.blockers,
                }
              : current,
          )
        }
        if (shouldCheckAnonymizeStatus(response.error)) {
          setStatusCheckRequired(true)
          onRecoveryRequired?.(
            anonymizeRecoveryFromError(response.error, {
              targetId,
              role: preview?.target.role || target?.role || null,
              identityRemoved: Boolean(
                preview?.target.identityRemoved ||
                  preview?.alreadyAnonymized ||
                  preview?.target.legacyAnonymized,
              ),
              legacyAnonymized: preview?.target.legacyAnonymized === true,
              accessDisabled: preview?.target.accessDisabled,
              needsRedaction: preview?.target.needsRedaction,
              cleanup: preview?.cleanup,
            }),
          )
        }
        return
      }
      setResult(response.data)
      setStatusCheckRequired(false)
      if (
        response.data.outcome === "anonymized" ||
        response.data.outcome === "partially_completed" ||
        response.data.outcome === "already_anonymized"
      ) {
        onAnonymized(response.data)
      }
    } finally {
      executingRef.current = false
      if (mountedRef.current) setExecuting(false)
    }
  }

  const checkStatus = async () => {
    if (checking) return
    await loadPreview({ clearConfirmation: true })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (executing || executingRef.current)) return
    onOpenChange(nextOpen)
  }

  if (!target) return null

  const hasAttempt = Boolean(preview && !result && statusCheckRequired)
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto p-4 sm:p-6"
        showCloseButton={!executing}
        closeLabel="Close anonymization dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          titleRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="text-left outline-none">
            Anonymize account
          </DialogTitle>
          <DialogDescription className="text-left text-sm text-slate-600">
            Remove personal data from active use while keeping the financial and
            service records that must remain available.
          </DialogDescription>
        </DialogHeader>

        {hasAttempt && (
          <p className="sr-only" aria-live="polite">
            Check the account status before retrying.
          </p>
        )}

        <AnonymizeDialogBody
          target={target}
          preview={preview}
          loading={loading}
          previewError={previewError}
          actionError={actionError}
          result={result}
          confirmation={confirmation}
          onConfirmationChange={setConfirmation}
          executing={executing}
          checking={checking}
          onRetryPreview={() => void loadPreview()}
          onCheckStatus={() => void checkStatus()}
          onExecute={() => void execute()}
          onClose={() => handleOpenChange(false)}
          statusCheckRequired={statusCheckRequired}
        />
      </DialogContent>
    </Dialog>
  )
}
