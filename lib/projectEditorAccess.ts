/**
 * Access and load-state rules for the project wizard (`/projects/create`).
 *
 * Kept free of React so the route guard, the editor gate and the draft load
 * sequencing can be exercised directly by the node test suite.
 */

export const STRIPE_SETUP_PATH = '/professional/stripe/setup'
export const PROJECT_MANAGE_PATH = '/professional/projects/manage'

type StripeState = { accountId?: string | null; onboardingCompleted?: boolean | null } | null | undefined

export type ProjectEditorUser = {
  role?: string | null
  professionalStatus?: string | null
  stripe?: StripeState
} | null | undefined

/**
 * Where a professional must go before they may open the wizard, or null.
 *
 * Mirrors the backend contract (`POST /api/projects/draft`): Stripe setup is
 * required to create a new project only. Editing an existing project
 * (`?id=`) needs approval, which the wizard page itself enforces.
 *
 * The target is the Stripe setup page, not onboarding step 3: the onboarding
 * page sends every professional who finished onboarding straight to the
 * dashboard, and only such professionals reach this check.
 */
export function projectWizardStripeRedirect(
  user: ProjectEditorUser,
  pathname: string,
  search: string,
): string | null {
  if (user?.role !== 'professional') return null
  if (!pathname.startsWith('/projects/create')) return null
  if (new URLSearchParams(search).get('id')) return null
  if (user.stripe?.accountId && user.stripe?.onboardingCompleted) return null
  return STRIPE_SETUP_PATH
}

export type ProjectLoadErrorKind = 'unauthorized' | 'forbidden' | 'not_found' | 'failed'

export type ProjectLoadState =
  | { status: 'idle' }
  | { status: 'loading'; projectId: string }
  | { status: 'loaded'; projectId: string }
  | { status: 'error'; projectId: string; kind: ProjectLoadErrorKind; message?: string }

export type ProjectEditorView =
  | 'checking-access'
  | 'blocked'
  | 'loading-project'
  | 'load-error'
  | 'ready'

/**
 * What the wizard may show. The form only renders once access is settled
 * and, when editing, the requested project has loaded: a blank form for an
 * existing id is never editable (its Save Draft would create a new project).
 */
export function resolveProjectEditorView(input: {
  authLoading: boolean
  user: ProjectEditorUser
  projectId: string | null
  load: ProjectLoadState
}): ProjectEditorView {
  const { authLoading, user, projectId, load } = input
  if (authLoading) return 'checking-access'
  if (!user || user.role !== 'professional' || user.professionalStatus !== 'approved') return 'blocked'
  // A new project needs Stripe; the page redirects to setup, so the blank form
  // never shows (also after a query-only navigation that drops `?id=`).
  if (!projectId) return projectWizardStripeRedirect(user, '/projects/create', '') ? 'blocked' : 'ready'
  if (load.status === 'idle' || load.projectId !== projectId) return 'loading-project'
  if (load.status === 'loading') return 'loading-project'
  if (load.status === 'error') return 'load-error'
  return 'ready'
}

export type ProjectLoadResult =
  | { ok: true; project: Record<string, unknown> & { _id?: string } }
  | { ok: false; kind: ProjectLoadErrorKind; status?: number; body?: unknown; error?: unknown }

export function classifyProjectLoadStatus(status: number): ProjectLoadErrorKind {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  return 'failed'
}

/** GET the professional's own project with both the cookie and the bearer token. */
export async function fetchProjectForEditor(options: {
  apiBase: string
  projectId: string
  token: string | null
  fetchImpl?: typeof fetch
}): Promise<ProjectLoadResult> {
  const { apiBase, projectId, token, fetchImpl = fetch } = options
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const response = await fetchImpl(`${apiBase}/api/projects/${encodeURIComponent(projectId)}`, {
      credentials: 'include',
      headers,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      return { ok: false, kind: classifyProjectLoadStatus(response.status), status: response.status, body }
    }
    const project = await response.json()
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      return { ok: false, kind: 'failed', status: response.status, body: project }
    }
    return { ok: true, project }
  } catch (error) {
    return { ok: false, kind: 'failed', error }
  }
}

/**
 * Latest-wins sequencing for the draft load. A response is applied only if no
 * newer load started and the requester was not torn down meanwhile (StrictMode
 * remount, id change, unmount), so a stale or duplicate response can never
 * overwrite the state of the current load.
 */
export function createLatestLoadGuard() {
  let current = 0
  return {
    begin(): () => boolean {
      const ticket = ++current
      return () => ticket === current
    },
    invalidate() {
      current += 1
    },
  }
}
