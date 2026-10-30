import { classifyApiError, getErrorMessage, messageFromApiBody } from "@/lib/apiErrors"
import { getAuthToken } from "@/lib/utils"

export type AnonymizeStatus =
  | "eligible"
  | "blocked"
  | "already_anonymized"
  | "recovery_required"

export type AnonymizeTargetRole = "customer" | "professional" | "visitor" | "employee" | string

export interface AnonymizeTargetDto {
  id: string
  role: AnonymizeTargetRole
  name: string | null
  email: string | null
  accountStatus: string | null
  professionalStatus?: string | null
  deletedAt: string | null
  isAnonymized: boolean
  identityRemoved?: boolean
  legacyAnonymized?: boolean
  /** The handler sends this on preview targets; false is meaningful. */
  accessDisabled?: boolean
  /** The handler sends this on preview targets; false is meaningful. */
  needsRedaction?: boolean
  anonymizedAt?: string | null
}

export interface AnonymizeBlocker {
  code: string
  message: string
  count?: number
}

export interface AnonymizeImpact {
  bookings: { total: number; active: number; asCustomer: number; asProfessional: number }
  payments: { total: number; invoiceRecords: number; pendingObligations: number }
  refunds: { total: number; pending: number }
  disputes: { total: number; active: number }
  warrantyClaims: { total: number; active: number }
  cancellationRequests: { total: number; active: number }
  supportTickets: number
  chatMessages: number
  meetings: number
  projects: number
  marketingSubscribers: number
  notifications: number
  emailLogs: number
}

export interface AnonymizeRetainedCategory {
  category: string
  label: string
  reason: string
}

export interface AnonymizeCleanup {
  pendingFiles: number
  pendingCalendarReleases: number
  deletedFiles: number
  failedFiles: number
  completedAt: string | null
  lastError: string | null
}

export interface AnonymizeRecovery {
  targetId?: string
  tombstoned?: boolean
  fullyAnonymized?: boolean
  retryable?: boolean
  previewPath?: string
}

export interface AnonymizeRecoveryListCounts {
  partialCleanup: number
  recoveryInProgress: number
  recoveryRequired: number
}

export interface AnonymizeRecoveryListData {
  accounts: AnonymizeRecoveryRecord[]
  total: number
  counts: AnonymizeRecoveryListCounts
  page: number
  limit: number
  /** `null` when an older server response does not expose paging. */
  totalPages: number | null
}

export interface AnonymizePreviewData {
  target: AnonymizeTargetDto
  status: AnonymizeStatus
  eligible: boolean
  alreadyAnonymized: boolean
  recoveryRequired: boolean
  fullyAnonymized: boolean
  blockers: AnonymizeBlocker[]
  impact: AnonymizeImpact
  retained: AnonymizeRetainedCategory[]
  cleanup: AnonymizeCleanup
  confirmation: { requiredText: string }
  warnings: string[]
}

export type AnonymizeOutcome = "anonymized" | "partially_completed" | "already_anonymized"

export interface AnonymizeExecutionData {
  outcome: AnonymizeOutcome
  fullyAnonymized: boolean
  target: AnonymizeTargetDto
  redacted?: {
    profile?: boolean
    supportTickets?: number
    chatMessages?: number
    meetings?: number
    bookingRecords?: number
    projects?: number
    marketingSubscribers?: number
    notifications?: number
    emailLogs?: number
    s3Objects?: number
  }
  cleanup: AnonymizeCleanup
  warnings: string[]
}

export type AnonymizeErrorKind =
  | "http"
  | "network"
  | "timeout"
  | "canceled"
  | "invalid_response"
  | "unknown"

export interface AnonymizeRequestError {
  kind: AnonymizeErrorKind
  message: string
  status?: number
  code?: string
  blockers: AnonymizeBlocker[]
  retryAfterSeconds?: number
  recovery?: AnonymizeRecovery
  /**
   * Set only for failures after the execute PUT was sent. It distinguishes a
   * preview read failure (safe to retry immediately) from an unknown write
   * outcome (check the authoritative preview first).
   */
  postExecution?: boolean
}

export type AnonymizeResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AnonymizeRequestError }

/** Minimal, non-identifying recovery state that is safe to persist. */
export type AnonymizeRecoveryState =
  | "already_anonymized"
  | "recovery_required"
  | "status_unknown"

export interface AnonymizeRecoveryRecord {
  targetId: string
  role: string | null
  state: AnonymizeRecoveryState
  /** True only when the server confirmed the identity redaction. */
  identityRemoved: boolean
  /** True for the older flow that already replaced the account identity. */
  legacyAnonymized?: boolean
  /** True when the server confirms the account is locked out. */
  accessDisabled?: boolean
  /** True when the server says identity redaction still has to run. */
  needsRedaction?: boolean
  cleanup: AnonymizeCleanup
  source: "server" | "session"
}

interface RequestOptions {
  userId: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  token?: string | null
}

interface ExecuteOptions extends RequestOptions {
  confirmation: string
  /** Test/override hook for the bounded execute request. */
  timeoutMs?: number
}

/**
 * The execute endpoint must never leave the dialog pending indefinitely. The
 * request is bounded, but it is not aborted when the dialog closes: an abort
 * would not roll back a server commit and could be mistaken for one.
 */
export const ANONYMIZE_EXECUTE_TIMEOUT_MS = 45_000

/**
 * The recovery list is a read, but a hung read must not leave the only
 * discoverability surface looking like a successful empty result.
 */
export const ANONYMIZE_RECOVERY_TIMEOUT_MS = 10_000

/** The recovery route is page-based and caps this limit at 100. */
export const ANONYMIZE_RECOVERY_LIST_LIMIT = 100

/**
 * Only these failures prove the execute did not apply. Everything else after a
 * PUT is ambiguous until the authoritative preview is read again.
 */
const KNOWN_NOT_APPLIED_ANONYMIZE_CODES = new Set([
  "INVALID_CONFIRMATION",
  "VALIDATION",
  "AUTH_REQUIRED",
  "ADMIN_PERMISSION_DENIED",
  "ADMIN_TARGET",
  "SELF_TARGET",
  "NOT_FOUND",
  "ANONYMIZE_BLOCKED",
])

const KNOWN_NOT_APPLIED_ANONYMIZE_STATUSES = new Set([400, 401, 403, 404, 409])

const AMBIGUOUS_HTTP_STATUSES = new Set([408, 502, 503, 504])

export function emptyAnonymizeCleanup(): AnonymizeCleanup {
  return {
    pendingFiles: 0,
    pendingCalendarReleases: 0,
    deletedFiles: 0,
    failedFiles: 0,
    completedAt: null,
    lastError: null,
  }
}

export function anonymizeRecoveryRecord(input: {
  targetId: string
  role?: string | null
  state: AnonymizeRecoveryState
  identityRemoved: boolean
  legacyAnonymized?: boolean
  accessDisabled?: boolean
  needsRedaction?: boolean
  cleanup?: AnonymizeCleanup | null
  source?: "server" | "session"
}): AnonymizeRecoveryRecord {
  return {
    targetId: input.targetId,
    role: input.role ?? null,
    state: input.state,
    identityRemoved: input.identityRemoved,
    ...(input.legacyAnonymized ? { legacyAnonymized: true } : {}),
    ...(typeof input.accessDisabled === "boolean"
      ? { accessDisabled: input.accessDisabled }
      : {}),
    ...(typeof input.needsRedaction === "boolean"
      ? { needsRedaction: input.needsRedaction }
      : {}),
    cleanup: input.cleanup ?? emptyAnonymizeCleanup(),
    source: input.source ?? "session",
  }
}

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || ""

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function finiteCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined
}

function parseBlockers(value: unknown): AnonymizeBlocker[] {
  if (!Array.isArray(value)) return []
  const blockers: AnonymizeBlocker[] = []
  for (const entry of value) {
    const record = recordOf(entry)
    const code = textOf(record?.code)
    if (!record || !code) continue
    blockers.push({
      code,
      message: textOf(record.message) || code,
      ...(finiteCount(record.count) !== undefined ? { count: finiteCount(record.count) } : {}),
    })
  }
  return blockers
}

function parseRecovery(value: unknown): AnonymizeRecovery | undefined {
  const record = recordOf(value)
  if (!record) return undefined
  const recognized =
    textOf(record.targetId) ||
    typeof record.tombstoned === "boolean" ||
    typeof record.fullyAnonymized === "boolean" ||
    typeof record.retryable === "boolean" ||
    textOf(record.previewPath)
  if (!recognized) return undefined
  return {
    ...(textOf(record.targetId) ? { targetId: textOf(record.targetId) as string } : {}),
    ...(typeof record.tombstoned === "boolean" ? { tombstoned: record.tombstoned } : {}),
    ...(typeof record.fullyAnonymized === "boolean"
      ? { fullyAnonymized: record.fullyAnonymized }
      : {}),
    ...(typeof record.retryable === "boolean" ? { retryable: record.retryable } : {}),
    ...(textOf(record.previewPath) ? { previewPath: textOf(record.previewPath) as string } : {}),
  }
}

function parseCleanup(value: unknown): AnonymizeCleanup {
  const record = recordOf(value)
  return {
    pendingFiles: finiteCount(record?.pendingFiles) ?? 0,
    pendingCalendarReleases: finiteCount(record?.pendingCalendarReleases) ?? 0,
    deletedFiles: finiteCount(record?.deletedFiles) ?? 0,
    failedFiles: finiteCount(record?.failedFiles) ?? 0,
    completedAt: textOf(record?.completedAt),
    lastError: textOf(record?.lastError),
  }
}

function parseTarget(value: unknown): AnonymizeTargetDto | null {
  const record = recordOf(value)
  const id = textOf(record?.id)
  if (!record || !id) return null
  return {
    id,
    role: textOf(record.role) || "unknown",
    name: textOf(record.name),
    email: textOf(record.email),
    accountStatus: textOf(record.accountStatus),
    professionalStatus: textOf(record.professionalStatus),
    deletedAt: textOf(record.deletedAt),
    isAnonymized: record.isAnonymized === true || Boolean(textOf(record.deletedAt)),
    ...(typeof record.identityRemoved === "boolean" ? { identityRemoved: record.identityRemoved } : {}),
    ...(record.legacyAnonymized === true ? { legacyAnonymized: true } : {}),
    ...(typeof record.accessDisabled === "boolean"
      ? { accessDisabled: record.accessDisabled }
      : {}),
    ...(typeof record.needsRedaction === "boolean"
      ? { needsRedaction: record.needsRedaction }
      : {}),
    anonymizedAt: textOf(record.anonymizedAt),
  }
}

function parseImpact(value: unknown): AnonymizeImpact | null {
  const record = recordOf(value)
  if (!record) return null
  const bookings = recordOf(record.bookings)
  const payments = recordOf(record.payments)
  const refunds = recordOf(record.refunds)
  const disputes = recordOf(record.disputes)
  const warrantyClaims = recordOf(record.warrantyClaims)
  const cancellationRequests = recordOf(record.cancellationRequests)
  if (
    !bookings ||
    !payments ||
    !refunds ||
    !disputes ||
    !warrantyClaims ||
    !cancellationRequests
  ) {
    return null
  }
  return {
    bookings: {
      total: finiteCount(bookings.total) ?? 0,
      active: finiteCount(bookings.active) ?? 0,
      asCustomer: finiteCount(bookings.asCustomer) ?? 0,
      asProfessional: finiteCount(bookings.asProfessional) ?? 0,
    },
    payments: {
      total: finiteCount(payments.total) ?? 0,
      invoiceRecords: finiteCount(payments.invoiceRecords) ?? 0,
      pendingObligations: finiteCount(payments.pendingObligations) ?? 0,
    },
    refunds: {
      total: finiteCount(refunds.total) ?? 0,
      pending: finiteCount(refunds.pending) ?? 0,
    },
    disputes: {
      total: finiteCount(disputes.total) ?? 0,
      active: finiteCount(disputes.active) ?? 0,
    },
    warrantyClaims: {
      total: finiteCount(warrantyClaims.total) ?? 0,
      active: finiteCount(warrantyClaims.active) ?? 0,
    },
    cancellationRequests: {
      total: finiteCount(cancellationRequests.total) ?? 0,
      active: finiteCount(cancellationRequests.active) ?? 0,
    },
    supportTickets: finiteCount(record.supportTickets) ?? 0,
    chatMessages: finiteCount(record.chatMessages) ?? 0,
    meetings: finiteCount(record.meetings) ?? 0,
    projects: finiteCount(record.projects) ?? 0,
    marketingSubscribers: finiteCount(record.marketingSubscribers) ?? 0,
    notifications: finiteCount(record.notifications) ?? 0,
    emailLogs: finiteCount(record.emailLogs) ?? 0,
  }
}

function parseRetained(value: unknown): AnonymizeRetainedCategory[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const record = recordOf(entry)
    const category = textOf(record?.category)
    const label = textOf(record?.label)
    const reason = textOf(record?.reason)
    return category && label && reason ? [{ category, label, reason }] : []
  })
}

function parseWarnings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => textOf(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}

function parsePreview(value: unknown): AnonymizePreviewData | null {
  const record = recordOf(value)
  const target = parseTarget(record?.target)
  const impact = parseImpact(record?.impact)
  const status = textOf(record?.status) as AnonymizeStatus | null
  const allowedStatuses: AnonymizeStatus[] = [
    "eligible",
    "blocked",
    "already_anonymized",
    "recovery_required",
  ]
  const confirmation = recordOf(record?.confirmation)
  const requiredText = textOf(confirmation?.requiredText)
  if (
    !record ||
    !target ||
    !impact ||
    !status ||
    !allowedStatuses.includes(status) ||
    !requiredText
  ) {
    return null
  }
  return {
    target,
    status,
    eligible: record.eligible === true,
    alreadyAnonymized: record.alreadyAnonymized === true,
    recoveryRequired: record.recoveryRequired === true,
    fullyAnonymized: record.fullyAnonymized === true,
    blockers: parseBlockers(record.blockers),
    impact,
    retained: parseRetained(record.retained),
    cleanup: parseCleanup(record.cleanup),
    confirmation: { requiredText },
    warnings: parseWarnings(record.warnings),
  }
}

function parseExecution(value: unknown): AnonymizeExecutionData | null {
  const record = recordOf(value)
  const target = parseTarget(record?.target)
  const outcome = textOf(record?.outcome) as AnonymizeOutcome | null
  const allowedOutcomes: AnonymizeOutcome[] = [
    "anonymized",
    "partially_completed",
    "already_anonymized",
  ]
  if (!record || !target || !outcome || !allowedOutcomes.includes(outcome)) return null
  return {
    outcome,
    fullyAnonymized: record.fullyAnonymized === true,
    target,
    ...(recordOf(record.redacted) ? { redacted: record.redacted as AnonymizeExecutionData["redacted"] } : {}),
    cleanup: parseCleanup(record.cleanup),
    warnings: parseWarnings(record.warnings),
  }
}

const RECOVERY_STATES = new Set([
  "partial_cleanup",
  "recovery_in_progress",
  "recovery_required",
])

function recoveryStateFromServer(value: unknown): AnonymizeRecoveryState | null {
  const state = textOf(value)
  if (!state || !RECOVERY_STATES.has(state)) return null
  return state === "partial_cleanup" ? "already_anonymized" : "recovery_required"
}

function parseRecoveryList(value: unknown): AnonymizeRecoveryListData | null {
  const record = recordOf(value)
  const rawAccounts = record?.accounts
  if (!record || !Array.isArray(rawAccounts)) return null
  const accounts: AnonymizeRecoveryRecord[] = []
  for (const entry of rawAccounts) {
    const item = recordOf(entry)
    const targetId = textOf(item?.targetId)
    const state = recoveryStateFromServer(item?.state)
    if (!item || !targetId || !state) continue
    const pendingFiles = finiteCount(item.pendingFiles) ?? 0
    const pendingCalendarReleases = finiteCount(item.pendingCalendarReleases) ?? 0
    accounts.push({
      targetId,
      role: textOf(item.role),
      state,
      identityRemoved: item.identityRemoved === true,
      ...(item.legacyAnonymized === true ? { legacyAnonymized: true } : {}),
      ...(typeof item.accessDisabled === "boolean"
        ? { accessDisabled: item.accessDisabled }
        : {}),
      ...(typeof item.needsRedaction === "boolean"
        ? { needsRedaction: item.needsRedaction }
        : {}),
      cleanup: {
        pendingFiles,
        pendingCalendarReleases,
        deletedFiles: 0,
        failedFiles: pendingFiles,
        completedAt: textOf(item.completedAt),
        lastError: textOf(item.lastError),
      },
      source: "server",
    })
  }
  const counts = recordOf(record.counts)
  const page = finiteCount(record.page) ?? 1
  const limit = finiteCount(record.limit) ?? accounts.length
  const rawTotalPages = finiteCount(record.totalPages)
  return {
    accounts,
    total: finiteCount(record.total) ?? accounts.length,
    counts: {
      partialCleanup: finiteCount(counts?.partialCleanup) ?? 0,
      recoveryInProgress: finiteCount(counts?.recoveryInProgress) ?? 0,
      recoveryRequired: finiteCount(counts?.recoveryRequired) ?? 0,
    },
    page: Math.max(1, page),
    limit: Math.max(0, limit),
    totalPages: rawTotalPages === undefined ? null : Math.max(0, rawTotalPages),
  }
}

function errorFromResponse(
  status: number,
  body: unknown,
  fallback: string,
  postExecution = false,
): AnonymizeRequestError {
  const record = recordOf(body)
  const data = recordOf(record?.data)
  const nestedError = recordOf(record?.error)
  const code =
    textOf(record?.code) ||
    textOf(data?.code) ||
    textOf(nestedError?.code) ||
    undefined
  const blockers = parseBlockers(data?.blockers ?? record?.blockers)
  const retryAfter = finiteCount(data?.retryAfterSeconds)
  const recovery =
    parseRecovery(data?.recovery ?? record?.recovery) ??
    parseRecovery(data)
  return {
    kind: "http",
    status,
    message: messageFromApiBody(body, fallback),
    ...(code ? { code } : {}),
    blockers,
    ...(retryAfter !== undefined ? { retryAfterSeconds: retryAfter } : {}),
    ...(recovery ? { recovery } : {}),
    ...(postExecution ? { postExecution: true } : {}),
  }
}

function transportError(
  error: unknown,
  fallback: string,
  postExecution = false,
): AnonymizeRequestError {
  const classified = classifyApiError(error)
  const kind: AnonymizeErrorKind =
    classified.kind === "canceled"
      ? "canceled"
      : classified.kind === "timeout"
        ? "timeout"
        : classified.kind === "network"
          ? "network"
          : classified.kind === "invalidResponse"
            ? "invalid_response"
            : "unknown"
  return {
    kind,
    message: getErrorMessage(error, fallback),
    blockers: [],
    ...(postExecution ? { postExecution: true } : {}),
  }
}

function boundedTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal
  clear: () => void
} {
  const duration = Math.max(1, timeoutMs)
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(duration), clear: () => {} }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new DOMException("The operation timed out", "TimeoutError"))
  }, duration)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

function signalWithTimeout(external: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal
  clear: () => void
} {
  const timeout = boundedTimeoutSignal(timeoutMs)
  if (!external) return timeout
  if (external.aborted) {
    timeout.clear()
    return { signal: external, clear: () => {} }
  }
  const controller = new AbortController()
  const abortFromExternal = () => controller.abort(external.reason)
  const abortFromTimeout = () => controller.abort(timeout.signal.reason)
  external.addEventListener("abort", abortFromExternal, { once: true })
  timeout.signal.addEventListener("abort", abortFromTimeout, { once: true })
  return {
    signal: controller.signal,
    clear: () => {
      external.removeEventListener("abort", abortFromExternal)
      timeout.signal.removeEventListener("abort", abortFromTimeout)
      timeout.clear()
    },
  }
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function requestHeaders(token: string | null, json: boolean): Record<string, string> {
  return {
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export function anonymizePreviewUrl(userId: string): string {
  return `${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/anonymize/preview`
}

export function anonymizeExecuteUrl(userId: string): string {
  return `${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/anonymize`
}

export function anonymizeRecoveryListUrl(options: {
  page?: number
  limit?: number
} = {}): string {
  const params = new URLSearchParams()
  if (options.page) params.set("page", String(options.page))
  if (options.limit) params.set("limit", String(options.limit))
  const query = params.toString()
  return `${API_BASE}/api/admin/users/anonymization/recovery${query ? `?${query}` : ""}`
}

/**
 * Cross-browser source of truth for tombstoned or partially cleaned accounts.
 * The server route is permission gated by effective `users.delete` write.
 */
export async function requestAnonymizeRecoveryList(input: {
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  token?: string | null
  page?: number
  limit?: number
  /** Test/override hook for the bounded recovery-list request. */
  timeoutMs?: number
} = {}): Promise<AnonymizeResult<AnonymizeRecoveryListData>> {
  const fetchImpl = input.fetchImpl || fetch
  const token = input.token !== undefined ? input.token : getAuthToken()
  const timeout = signalWithTimeout(
    input.signal,
    input.timeoutMs ?? ANONYMIZE_RECOVERY_TIMEOUT_MS,
  )
  try {
    const response = await fetchImpl(anonymizeRecoveryListUrl({
      page: input.page,
      limit: input.limit,
    }), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: requestHeaders(token, false),
      signal: timeout.signal,
    })
    const body = await readBody(response)
    if (!response.ok) {
      return {
        ok: false,
        error: errorFromResponse(response.status, body, "Could not load recoverable anonymizations."),
      }
    }
    const record = recordOf(body)
    if (record?.success !== true) {
      return {
        ok: false,
        error: errorFromResponse(response.status, body, "Could not load recoverable anonymizations."),
      }
    }
    const data = parseRecoveryList(record.data)
    if (!data) {
      return {
        ok: false,
        error: {
          kind: "invalid_response",
          status: response.status,
          message: "The server returned an unexpected recovery list.",
          blockers: [],
        },
      }
    }
    return { ok: true, data }
  } catch (error) {
    return {
      ok: false,
      error: transportError(error, "Could not load recoverable anonymizations."),
    }
  } finally {
    timeout.clear()
  }
}

export async function requestAnonymizePreview(
  input: RequestOptions,
): Promise<AnonymizeResult<AnonymizePreviewData>> {
  const fetchImpl = input.fetchImpl || fetch
  const token = input.token !== undefined ? input.token : getAuthToken()
  try {
    const response = await fetchImpl(anonymizePreviewUrl(input.userId), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: requestHeaders(token, false),
      signal: input.signal,
    })
    const body = await readBody(response)
    if (!response.ok) {
      return {
        ok: false,
        error: errorFromResponse(response.status, body, "Could not load the anonymization preview."),
      }
    }
    const record = recordOf(body)
    if (record?.success !== true) {
      return {
        ok: false,
        error: errorFromResponse(response.status, body, "Could not load the anonymization preview."),
      }
    }
    const data = parsePreview(record.data)
    if (!data) {
      return {
        ok: false,
        error: {
          kind: "invalid_response",
          status: response.status,
          message: "The server returned an unexpected anonymization preview.",
          blockers: [],
        },
      }
    }
    if (data.target.id !== input.userId) {
      return {
        ok: false,
        error: {
          kind: "invalid_response",
          status: response.status,
          message: "The preview belongs to a different account. Close the dialog and refresh the list.",
          blockers: [],
        },
      }
    }
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: transportError(error, "Could not load the anonymization preview.") }
  }
}

export async function executeAnonymizeAccount(
  input: ExecuteOptions,
): Promise<AnonymizeResult<AnonymizeExecutionData>> {
  const fetchImpl = input.fetchImpl || fetch
  const token = input.token !== undefined ? input.token : getAuthToken()
  const timeout = input.signal
    ? null
    : boundedTimeoutSignal(input.timeoutMs ?? ANONYMIZE_EXECUTE_TIMEOUT_MS)
  try {
    const response = await fetchImpl(anonymizeExecuteUrl(input.userId), {
      method: "PUT",
      credentials: "include",
      headers: requestHeaders(token, true),
      body: JSON.stringify({ confirm: input.confirmation }),
      signal: input.signal ?? timeout?.signal,
    })
    const body = await readBody(response)
    if (!response.ok) {
      return {
        ok: false,
        error: errorFromResponse(
          response.status,
          body,
          "Could not anonymize this account.",
          true,
        ),
      }
    }
    const record = recordOf(body)
    if (record?.success !== true) {
      return {
        ok: false,
        error: errorFromResponse(
          response.status,
          body,
          "Could not anonymize this account.",
          true,
        ),
      }
    }
    const data = parseExecution(record.data)
    if (!data) {
      return {
        ok: false,
        error: {
          kind: "invalid_response",
          status: response.status,
          message: "The server returned an unexpected anonymization result. Check the account status before retrying.",
          blockers: [],
          postExecution: true,
        },
      }
    }
    if (data.target.id !== input.userId) {
      return {
        ok: false,
        error: {
          kind: "invalid_response",
          status: response.status,
          message: "The server returned a result for a different account. Refresh the list before retrying.",
          blockers: [],
          postExecution: true,
        },
      }
    }
    return { ok: true, data }
  } catch (error) {
    return {
      ok: false,
      error: transportError(error, "Could not anonymize this account.", true),
    }
  } finally {
    timeout?.clear()
  }
}

export function cleanupHasPending(cleanup: AnonymizeCleanup | null | undefined): boolean {
  return Boolean(
    cleanup &&
      (cleanup.pendingFiles > 0 ||
        cleanup.pendingCalendarReleases > 0 ||
        cleanup.failedFiles > 0 ||
        cleanup.lastError),
  )
}

export function anonymizeCanAttempt(preview: AnonymizePreviewData | null): boolean {
  if (!preview || preview.blockers.length > 0) return false
  if (preview.status === "eligible" || preview.status === "recovery_required") return true
  if (preview.status === "already_anonymized") return cleanupHasPending(preview.cleanup)
  return false
}

export function anonymizeConfirmationError(
  preview: AnonymizePreviewData | null,
  value: string,
): string | null {
  if (!preview) return "Load the preview before confirming."
  if (!anonymizeCanAttempt(preview)) return "This account is not available for anonymization."
  if (!preview.confirmation.requiredText) return "The server did not provide a confirmation phrase."
  if (value !== preview.confirmation.requiredText) {
    return `Type ${preview.confirmation.requiredText} exactly to confirm.`
  }
  return null
}

export function isAmbiguousAnonymizeError(error: AnonymizeRequestError | null): boolean {
  if (!error || error.postExecution !== true) return false
  if (
    error.kind === "network" ||
    error.kind === "timeout" ||
    error.kind === "invalid_response"
  ) {
    return true
  }
  if (error.kind === "canceled") return false
  if (error.status !== undefined && AMBIGUOUS_HTTP_STATUSES.has(error.status)) return true
  if (error.status !== undefined && error.status >= 500) return true
  if (error.code && !KNOWN_NOT_APPLIED_ANONYMIZE_CODES.has(error.code)) return true
  if (error.status !== undefined && !KNOWN_NOT_APPLIED_ANONYMIZE_STATUSES.has(error.status)) {
    return true
  }
  return false
}

export function shouldCheckAnonymizeStatus(error: AnonymizeRequestError | null): boolean {
  if (!error) return false
  return (
    isAmbiguousAnonymizeError(error) ||
    error.code === "ANONYMIZATION_IN_PROGRESS" ||
    error.code === "ANONYMIZE_INCOMPLETE"
  )
}

export function anonymizeRecoveryFromError(
  error: AnonymizeRequestError,
  fallback: {
    targetId: string
    role?: string | null
    identityRemoved?: boolean
    legacyAnonymized?: boolean
    accessDisabled?: boolean
    needsRedaction?: boolean
    cleanup?: AnonymizeCleanup | null
  },
): AnonymizeRecoveryRecord {
  const tombstoned =
    error.recovery?.tombstoned === true || error.code === "ANONYMIZE_INCOMPLETE"
  return anonymizeRecoveryRecord({
    targetId: error.recovery?.targetId || fallback.targetId,
    role: fallback.role,
    state: tombstoned ? "recovery_required" : "status_unknown",
    identityRemoved: fallback.identityRemoved === true,
    legacyAnonymized: fallback.legacyAnonymized,
    accessDisabled: fallback.accessDisabled,
    needsRedaction: fallback.needsRedaction,
    cleanup: fallback.cleanup,
    source: "session",
  })
}

export type AnonymizeRecoveryReconciliation =
  | { kind: "clear" }
  | { kind: "recovery"; record: AnonymizeRecoveryRecord }

/**
 * Decide what an authoritative preview proves about a recovery record.
 *
 * `eligible`, a non-anonymized `blocked` account, and a fully cleaned
 * `already_anonymized` account prove that no recovery card is needed. A real
 * tombstone or partial state is kept with the exact authoritative flags; a
 * `status_unknown` record is never turned into a full-identity-removal claim
 * from the preview status alone.
 */
export function reconcileAnonymizePreview(
  preview: AnonymizePreviewData,
): AnonymizeRecoveryReconciliation {
  const target = preview.target
  const identityRemoved =
    target.identityRemoved === true ||
    target.legacyAnonymized === true ||
    preview.alreadyAnonymized === true
  const anonymizationStarted =
    target.isAnonymized === true ||
    Boolean(target.deletedAt) ||
    target.accessDisabled === true ||
    identityRemoved

  if (preview.status === "eligible") return { kind: "clear" }
  if (preview.status === "blocked" && !anonymizationStarted) {
    return { kind: "clear" }
  }
  if (
    preview.status === "already_anonymized" &&
    !cleanupHasPending(preview.cleanup) &&
    target.needsRedaction !== true
  ) {
    return { kind: "clear" }
  }

  return {
    kind: "recovery",
    record: anonymizeRecoveryRecord({
      targetId: target.id,
      role: target.role,
      state:
        preview.status === "already_anonymized"
          ? "already_anonymized"
          : "recovery_required",
      identityRemoved,
      legacyAnonymized: target.legacyAnonymized === true,
      accessDisabled: target.accessDisabled,
      needsRedaction: target.needsRedaction,
      cleanup: preview.cleanup,
      source: "session",
    }),
  }
}

/**
 * Merge a freshly inspected record into one already on the recovery card.
 * A server-sourced record keeps its server provenance, an omitted fresh boolean
 * does not erase a known explicit false, and cleanup counts from the fresh
 * record are used exactly (including zero), so the rendered count and source
 * label cannot be silently downgraded.
 */
export function mergeAnonymizeRecoveryRecord(
  existing: AnonymizeRecoveryRecord | null | undefined,
  incoming: AnonymizeRecoveryRecord,
): AnonymizeRecoveryRecord {
  const uncertain = incoming.state === "status_unknown"
  const keepKnownRemoval =
    uncertain && existing?.identityRemoved === true
  const keepKnownLegacy =
    uncertain && existing?.legacyAnonymized === true
  return {
    targetId: incoming.targetId,
    role: incoming.role ?? existing?.role ?? null,
    state: incoming.state,
    identityRemoved: keepKnownRemoval || incoming.identityRemoved === true,
    ...(keepKnownLegacy || incoming.legacyAnonymized === true
      ? { legacyAnonymized: true }
      : {}),
    ...(uncertain && typeof existing?.accessDisabled === "boolean"
      ? { accessDisabled: existing.accessDisabled }
      : typeof incoming.accessDisabled === "boolean"
        ? { accessDisabled: incoming.accessDisabled }
        : typeof existing?.accessDisabled === "boolean"
          ? { accessDisabled: existing.accessDisabled }
          : {}),
    ...(uncertain && typeof existing?.needsRedaction === "boolean"
      ? { needsRedaction: existing.needsRedaction }
      : typeof incoming.needsRedaction === "boolean"
        ? { needsRedaction: incoming.needsRedaction }
        : typeof existing?.needsRedaction === "boolean"
          ? { needsRedaction: existing.needsRedaction }
          : {}),
    cleanup: incoming.cleanup,
    source: existing?.source === "server" ? "server" : incoming.source,
  }
}

/**
 * Replace an existing record in place so the card keeps the server's stable
 * order, or append a new record. Returns a new array for React state.
 */
export function upsertAnonymizeRecoveryRecord(
  records: AnonymizeRecoveryRecord[],
  incoming: AnonymizeRecoveryRecord,
): AnonymizeRecoveryRecord[] {
  const index = records.findIndex((entry) => entry.targetId === incoming.targetId)
  if (index === -1) return [...records, incoming]
  const next = records.slice()
  next[index] = mergeAnonymizeRecoveryRecord(records[index], incoming)
  return next
}

export function anonymizeResultAnnouncement(result: AnonymizeExecutionData): string {
  if (isFullyAnonymizedResult(result)) {
    return "Account anonymized. The row was removed from this list. Retained financial records are unchanged."
  }
  if (isAnonymizationComplete(result)) {
    return "Account was already anonymized. The row was removed from this list."
  }
  return "Account access is disabled. Identity redaction completed, but file or calendar cleanup is still pending. Resume cleanup from the recovery card."
}

export function isAnonymizationComplete(result: AnonymizeExecutionData | null): boolean {
  return Boolean(
    result &&
      result.fullyAnonymized &&
      !cleanupHasPending(result.cleanup),
  )
}

export function isFullyAnonymizedResult(result: AnonymizeExecutionData | null): boolean {
  return Boolean(
    isAnonymizationComplete(result) &&
      result?.outcome === "anonymized",
  )
}

export function anonymizeRefreshFailureMessage(result: AnonymizeExecutionData): string {
  if (isFullyAnonymizedResult(result)) {
    return "The account was anonymized, but the list could not be refreshed. The row has been removed; reload the page to confirm the current state."
  }
  if (result.outcome === "already_anonymized") {
    return "The account was already anonymized, but the list could not be refreshed. The row has been removed; reload the page to confirm the current state."
  }
  return "The account identity was removed, but file or calendar cleanup is still pending and the list could not be refreshed. The row has been removed; check the account status before treating the operation as complete."
}
