/**
 * Admin email-log helpers (pure; shared by the page and its tests).
 * Wire contract: GET /api/admin/email-logs — see backend handlers/Admin/emailLogs.ts.
 */

export const EMAIL_LOG_STATUSES = ['sent', 'failed', 'skipped'] as const
export type EmailLogStatus = (typeof EMAIL_LOG_STATUSES)[number]
export const EMAIL_LOGS_PAGE_SIZE = 25

export interface EmailLog {
  _id: string
  to: string
  subject: string
  template: string
  status: EmailLogStatus
  errorMessage?: string
  relatedBooking?: string
  relatedUser?: string
  actorId?: string
  createdAt: string
}

export interface EmailLogFilters {
  template: string
  status: 'all' | EmailLogStatus
  to: string
  relatedBooking: string
  from: string
  until: string
}

export interface EmailLogPage {
  logs: EmailLog[]
  page: number
  totalPages: number
  total: number
}

export const EMPTY_EMAIL_LOG_FILTERS: EmailLogFilters = {
  template: '',
  status: 'all',
  to: '',
  relatedBooking: '',
  from: '',
  until: '',
}

/** Free-text filters (debounced by the page). */
export const EMAIL_LOG_TEXT_FILTERS = ['template', 'to', 'relatedBooking'] as const satisfies ReadonlyArray<keyof EmailLogFilters>

export const sameEmailLogFilters = (a: EmailLogFilters, b: EmailLogFilters) =>
  (Object.keys(EMPTY_EMAIL_LOG_FILTERS) as Array<keyof EmailLogFilters>).every((key) => a[key] === b[key])

const OBJECT_ID = /^[a-f0-9]{24}$/i
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export const isEmailLogStatus = (value: unknown): value is EmailLogStatus =>
  typeof value === 'string' && (EMAIL_LOG_STATUSES as readonly string[]).includes(value)

/** True when the booking filter is a complete id the backend will apply. */
export const isBookingIdFilter = (value: string) => OBJECT_ID.test(value.trim())

/**
 * Build the query string. Filters the backend would silently ignore (recipient
 * under 2 chars, partial booking ids, malformed dates) are omitted, so the
 * page never claims a filter is active when it is not.
 */
export function buildEmailLogQuery(filters: EmailLogFilters, page: number, limit = EMAIL_LOGS_PAGE_SIZE): string {
  const params = new URLSearchParams()
  const template = filters.template.trim()
  if (template) params.set('template', template)
  if (filters.status !== 'all' && isEmailLogStatus(filters.status)) params.set('status', filters.status)
  const to = filters.to.trim()
  if (to.length >= 2) params.set('to', to)
  if (isBookingIdFilter(filters.relatedBooking)) params.set('relatedBooking', filters.relatedBooking.trim())
  if (ISO_DAY.test(filters.from)) params.set('from', filters.from)
  if (ISO_DAY.test(filters.until)) params.set('until', filters.until)
  params.set('page', String(Math.max(1, Math.floor(page) || 1)))
  params.set('limit', String(limit))
  return params.toString()
}

const idText = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value) return value
  if (value && typeof value === 'object' && '_id' in value) return idText((value as { _id: unknown })._id)
  return undefined
}

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)

/** Normalize one wire row; rows without an id or timestamp are dropped. */
export function normalizeEmailLog(raw: unknown): EmailLog | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = idText(row._id)
  const createdAt = text(row.createdAt)
  if (!id || !createdAt || Number.isNaN(new Date(createdAt).getTime())) return null
  return {
    _id: id,
    to: text(row.to, '—'),
    subject: text(row.subject),
    template: text(row.template, 'unknown'),
    status: isEmailLogStatus(row.status) ? row.status : 'failed',
    errorMessage: text(row.errorMessage) || undefined,
    relatedBooking: idText(row.relatedBooking),
    relatedUser: idText(row.relatedUser),
    actorId: idText(row.actorId),
    createdAt,
  }
}

/** Parse the list envelope; throws on a non-success body so the page can show the API message. */
export function parseEmailLogsResponse(json: unknown): EmailLogPage {
  const body = (json && typeof json === 'object' ? json : {}) as {
    success?: unknown
    data?: { logs?: unknown; pagination?: { page?: unknown; totalPages?: unknown; total?: unknown } }
  }
  if (body.success !== true || !body.data) throw new Error('Invalid email log response')
  const logs = Array.isArray(body.data.logs)
    ? body.data.logs.map(normalizeEmailLog).filter((log): log is EmailLog => log !== null)
    : []
  const pagination = body.data.pagination || {}
  const positive = (value: unknown, fallback: number) => {
    const n = Number(value)
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
  }
  const total = Number(pagination.total)
  return {
    logs,
    page: positive(pagination.page, 1),
    totalPages: positive(pagination.totalPages, 1),
    total: Number.isFinite(total) && total >= 0 ? total : logs.length,
  }
}
