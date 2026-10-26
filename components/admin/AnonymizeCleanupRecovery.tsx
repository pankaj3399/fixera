"use client"

import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AnonymizeRecoveryRecord } from "@/lib/adminAnonymize"
import type {
  AnonymizeRecoveryListMeta,
  AnonymizeRecoverySync,
} from "@/hooks/useAnonymizeRecovery"

function roleLabel(role: string | null | undefined): string {
  if (!role) return "account"
  return role.charAt(0).toLowerCase() + role.slice(1).replace(/_/g, " ")
}

function accessSentence(record: AnonymizeRecoveryRecord): string {
  return record.accessDisabled === false
    ? " The server has not confirmed that account access is disabled; check the preview before acting."
    : " Account access is disabled."
}

function cleanupSummary(record: AnonymizeRecoveryRecord): string {
  if (record.state === "status_unknown") {
    return "The cleanup counts are unknown until the authoritative preview is checked."
  }
  const files = record.cleanup.pendingFiles
  const calendar = record.cleanup.pendingCalendarReleases
  return `${files} file${files === 1 ? "" : "s"} and ${calendar} calendar task${calendar === 1 ? "" : "s"} still require a retry.`
}

export function recoveryCardCopy(record: AnonymizeRecoveryRecord): {
  title: string
  body: string
  tone: "unknown" | "pending" | "removed"
} {
  const account = record.role ? `this ${roleLabel(record.role)} account` : "this account"
  if (record.state === "status_unknown") {
    return {
      title: `Anonymization outcome needs a status check for ${account}.`,
      body: `The request outcome is unknown. The account may be locked, partially cleaned up, or unchanged. Check the authoritative preview before retrying; do not repeat the request blindly. ${cleanupSummary(record)}`,
      tone: "unknown",
    }
  }
  if (record.legacyAnonymized) {
    return {
      title: `Recovery still pending for a previously redacted ${record.role ? `${roleLabel(record.role)} ` : ""}account.`,
      body: `${accessSentence(record)} The identity was redacted by an older flow, but the current database and file cleanup may not be complete. ${cleanupSummary(record)} Check the authoritative preview before treating the operation as complete.`,
      tone: "pending",
    }
  }
  if (record.state === "already_anonymized" || record.identityRemoved) {
    return {
      title: `Cleanup still pending for an anonymized ${record.role ? `${roleLabel(record.role)} ` : ""}account.`,
      body: `The account identity has already been removed.${accessSentence(record)} ${cleanupSummary(record)} Retained financial records are unchanged.`,
      tone: "removed",
    }
  }
  return {
    title: `Recovery still pending for a locked ${record.role ? `${roleLabel(record.role)} ` : ""}account.`,
    body: `${accessSentence(record)} ${
      record.needsRedaction === true
        ? "Identity redaction is still required and has not been completed."
        : "The identity redaction is not proven complete."
    } ${cleanupSummary(record)} Check the authoritative preview and retry only from the confirmed recovery flow.`,
    tone: "pending",
  }
}

/**
 * Ordinary admin lists intentionally hide anonymized rows. A partial external
 * cleanup must not disappear with the row, so the list keeps a small recovery
 * card until the confirmed retry finishes. The record contains no name, email
 * or avatar.
 *
 * The server list is the cross-browser source of truth. When it has not loaded,
 * the section still renders a bounded loading or unavailable status even with
 * zero local records, so "not loaded" can never look like "nothing pending".
 */
export function AnonymizeCleanupRecovery({
  entries,
  onResume,
  onRetry,
  onLoadMore,
  loadingMore = false,
  loadMoreError = null,
  listMeta = null,
  sync = "idle",
}: {
  entries: AnonymizeRecoveryRecord[]
  onResume: (entry: AnonymizeRecoveryRecord) => void
  onRetry?: () => void
  onLoadMore?: () => void
  loadingMore?: boolean
  loadMoreError?: string | null
  listMeta?: AnonymizeRecoveryListMeta | null
  sync?: AnonymizeRecoverySync
}) {
  const showStatus = sync === "loading" || sync === "unavailable"
  const serverShown = entries.filter((entry) => entry.source === "server").length
  const sessionShown = entries.filter((entry) => entry.source === "session").length
  const hasMore = Boolean(
    listMeta?.paged && listMeta.page < listMeta.totalPages,
  )
  const showLimitNotice = Boolean(listMeta && listMeta.total > serverShown)
  const showSessionNotice =
    sync === "synced" && sessionShown > 0 && entries.length > 0
  if (
    !showStatus &&
    entries.length === 0 &&
    !showLimitNotice &&
    !loadMoreError
  ) {
    return null
  }
  return (
    <section
      aria-label="Pending anonymization cleanup"
      className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950"
    >
      {sync === "loading" && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-amber-950"
        >
          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading the server recovery list. Pending cleanup may exist in another
          browser or session.
        </p>
      )}
      {sync === "unavailable" && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-amber-950"
        >
          <p>
            The server recovery list could not be loaded
            {entries.length > 0
              ? ". The entries below come from this browser session only."
              : ", so pending cleanup from another browser or session may not appear here."}{" "}
            Retry the list before assuming that no cleanup is pending or before
            retrying an account.
          </p>
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
              onClick={onRetry}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry loading
            </Button>
          )}
        </div>
      )}
      {showLimitNotice && listMeta && (
        <div className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-amber-950">
          <p>
            Showing {serverShown} of {listMeta.total} accounts from the server
            that still need cleanup.
            {hasMore
              ? " Load more to reach the older pending accounts."
              : listMeta.paged
                ? " Reload the list to refresh the authoritative count for the remaining accounts."
                : " The server recovery list does not expose further paging, so later entries are not shown."}
          </p>
          {listMeta.paged && hasMore && onLoadMore && !loadMoreError && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${loadingMore ? "animate-spin" : ""}`}
              />
              {loadingMore ? "Loading more…" : "Load more"}
            </Button>
          )}
          {loadMoreError && (
            <p role="alert" className="mt-2 text-rose-800">
              The next recovery page could not be loaded: {loadMoreError}
            </p>
          )}
          {loadMoreError && onLoadMore && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry loading more
            </Button>
          )}
        </div>
      )}
      {showSessionNotice && (
        <p className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-amber-950">
          {sessionShown === 1
            ? "1 session-only recovery record is also shown. It is not included in the server total"
            : `${sessionShown} session-only recovery records are also shown. They are not included in the server total`}
          {listMeta ? ` of ${listMeta.total}` : ""}. Session-only records are kept
          when an execute outcome was not observed or the server list is
          incomplete.
        </p>
      )}
      {entries.map((entry) => {
        const copy = recoveryCardCopy(entry)
        return (
          <div
            key={entry.targetId}
            role="alert"
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2">
              {copy.tone === "unknown" ? (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              <div className="text-sm">
                <p className="font-semibold">{copy.title}</p>
                <p className="mt-0.5 text-xs">{copy.body}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
              onClick={() => onResume(entry)}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Check status and resume
            </Button>
          </div>
        )
      })}
    </section>
  )
}
