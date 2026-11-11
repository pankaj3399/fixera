/**
 * Client helpers for the super-admin "Reset dashboards" feature.
 *
 * A reset moves a booking dashboard's "counting since" baseline forward. It
 * never deletes records. Every admin sees the baseline on the dashboards it
 * affects; only a super admin can change it.
 */

export const DASHBOARD_BASELINE_KEYS = ['disputes', 'warrantyClaims', 'cancellations', 'bookingKpis'] as const

export type DashboardBaselineKey = (typeof DASHBOARD_BASELINE_KEYS)[number]

export const DASHBOARD_BASELINE_NOTE_MAX_LENGTH = 500

/** Query parameter that turns the baseline off for one request. */
export const HISTORY_QUERY_KEY = 'history'
export const HISTORY_ALL_VALUE = 'all'

export interface DashboardBaselineView {
  key: DashboardBaselineKey
  /** ISO timestamp, or null when the dashboard has never been reset. */
  resetAt: string | null
  resetBy: { id: string; name: string } | null
  note: string
  canUndo: boolean
}

export interface DashboardBaselineHistoryEvent {
  dashboardKey: DashboardBaselineKey
  action: 'reset' | 'undo'
  resetAt: string | null
  previousResetAt: string | null
  actorName: string
  note: string
  batchId: string | null
  createdAt: string | null
}

export interface DashboardBaselineSnapshot {
  dashboards: DashboardBaselineView[]
  history: DashboardBaselineHistoryEvent[]
  generatedAt: string | null
}

/** Per-response baseline echo that every affected list and KPI endpoint returns. */
export interface DashboardBaselineInfo {
  key: DashboardBaselineKey
  resetAt: string | null
  showAll: boolean
  applied: boolean
}

export const isDashboardBaselineKey = (value: unknown): value is DashboardBaselineKey =>
  typeof value === 'string' && (DASHBOARD_BASELINE_KEYS as readonly string[]).includes(value)

/** Only a super admin may view or change the reset controls. Mirrors the server's `/platform-settings` rule. */
export const canManageDashboardBaselines = (user: { adminRole?: string | null } | null | undefined): boolean =>
  user?.adminRole === 'super'

/** True when the URL asks for the full history (`?history=all`). */
export const isShowAllHistory = (search: string | URLSearchParams | null | undefined): boolean => {
  if (!search) return false
  const params = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search
  return params.get(HISTORY_QUERY_KEY)?.trim().toLowerCase() === HISTORY_ALL_VALUE
}

/**
 * Build the href that toggles show-all for the current page. Other query
 * parameters (filters, pagination, ranges) are kept.
 */
export const buildHistoryToggleHref = (
  pathname: string,
  search: string | URLSearchParams | null | undefined,
  showAll: boolean,
): string => {
  const params = new URLSearchParams(
    typeof search === 'string' ? (search.startsWith('?') ? search.slice(1) : search) : (search?.toString() ?? ''),
  )
  if (showAll) {
    params.delete(HISTORY_QUERY_KEY)
  } else {
    params.set(HISTORY_QUERY_KEY, HISTORY_ALL_VALUE)
  }
  // Pagination belongs to the old result set; start again on page 1.
  params.delete('page')
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

/**
 * `history=all` for a backend request URL. Empty when the baseline applies.
 * Use it when building query strings: `?${params}&${historyQuery(showAll)}`.
 */
export const historyQuery = (showAll: boolean): string => (showAll ? `${HISTORY_QUERY_KEY}=${HISTORY_ALL_VALUE}` : '')

/** Format an ISO timestamp for display in the admin's locale. Invalid input returns ''. */
export const formatBaselineDate = (iso: string | null | undefined, locale: string): string => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  } catch {
    return date.toISOString()
  }
}

/** Check a parsed GET/POST response body and return a typed snapshot, or null when the shape is wrong. */
export const parseDashboardBaselineSnapshot = (body: unknown): DashboardBaselineSnapshot | null => {
  if (!body || typeof body !== 'object') return null
  const data = (body as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null
  const { dashboards, history, generatedAt } = data as Record<string, unknown>
  if (!Array.isArray(dashboards)) return null

  const views: DashboardBaselineView[] = []
  for (const raw of dashboards) {
    if (!raw || typeof raw !== 'object') return null
    const row = raw as Record<string, unknown>
    if (!isDashboardBaselineKey(row.key)) continue
    const resetBy = row.resetBy && typeof row.resetBy === 'object'
      ? {
          id: String((row.resetBy as Record<string, unknown>).id ?? ''),
          name: String((row.resetBy as Record<string, unknown>).name ?? ''),
        }
      : null
    views.push({
      key: row.key,
      resetAt: typeof row.resetAt === 'string' ? row.resetAt : null,
      resetBy,
      note: typeof row.note === 'string' ? row.note : '',
      canUndo: row.canUndo === true,
    })
  }

  const events: DashboardBaselineHistoryEvent[] = []
  if (Array.isArray(history)) {
    for (const raw of history) {
      if (!raw || typeof raw !== 'object') continue
      const row = raw as Record<string, unknown>
      if (!isDashboardBaselineKey(row.dashboardKey)) continue
      events.push({
        dashboardKey: row.dashboardKey,
        action: row.action === 'undo' ? 'undo' : 'reset',
        resetAt: typeof row.resetAt === 'string' ? row.resetAt : null,
        previousResetAt: typeof row.previousResetAt === 'string' ? row.previousResetAt : null,
        actorName: typeof row.actorName === 'string' ? row.actorName : '',
        note: typeof row.note === 'string' ? row.note : '',
        batchId: typeof row.batchId === 'string' ? row.batchId : null,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : null,
      })
    }
  }

  return {
    dashboards: views,
    history: events,
    generatedAt: typeof generatedAt === 'string' ? generatedAt : null,
  }
}

/** Parse the `baseline` echo on a list or KPI response. Returns null when absent or malformed. */
export const parseDashboardBaselineInfo = (value: unknown): DashboardBaselineInfo | null => {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (!isDashboardBaselineKey(row.key)) return null
  return {
    key: row.key,
    resetAt: typeof row.resetAt === 'string' ? row.resetAt : null,
    showAll: row.showAll === true,
    applied: row.applied === true,
  }
}

/** Backend path for a reset: one dashboard, or every dashboard when `target` is 'all'. */
export const resetRequestPath = (target: DashboardBaselineKey | 'all'): string =>
  target === 'all'
    ? '/api/admin/platform-settings/dashboard-baselines/reset-all'
    : `/api/admin/platform-settings/dashboard-baselines/${target}/reset`

export const undoRequestPath = (key: DashboardBaselineKey): string =>
  `/api/admin/platform-settings/dashboard-baselines/${key}/undo`

export const DASHBOARD_BASELINES_PATH = '/api/admin/platform-settings/dashboard-baselines'

/** Trim and cap the optional note the way the server does. */
export const normalizeResetNote = (value: string): string =>
  value.trim().slice(0, DASHBOARD_BASELINE_NOTE_MAX_LENGTH)

/** Keys a reset request will touch, in display order. */
export const keysForReset = (target: DashboardBaselineKey | 'all'): DashboardBaselineKey[] =>
  target === 'all' ? [...DASHBOARD_BASELINE_KEYS] : [target]
