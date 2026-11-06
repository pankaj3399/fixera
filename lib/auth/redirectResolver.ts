/**
 * Shared post-auth redirect resolver (login page + AuthContext).
 *
 * Priority: professional onboarding gate first, then explicit safe intent
 * (checkout / private-workflow `?redirect=` or stored `redirectAfterAuth`),
 * then a role default (customers -> `/`, professionals/admins/employees ->
 * `/dashboard`).
 */

export type PostAuthRole = 'admin' | 'visitor' | 'customer' | 'professional' | 'employee' | string;

const SAFE_REDIRECT_BASE = 'http://fixera.local';

/**
 * Same-origin relative path only. Rejects protocol-relative (`//evil`),
 * backslash tricks (`/\evil`, `\evil`), control characters, overlong
 * values, and anything that parses to a foreign origin — not just a
 * `startsWith('/')` check.
 */
export function isSafeRedirectPath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  // Validate the exact string the caller will navigate to (never a trimmed
  // copy): leading whitespace then fails the `startsWith('/')` check.
  const candidate = value;
  if (candidate.length === 0 || candidate.length > 2048) return false;
  if (/[\0-\x1f\x7f]/.test(candidate)) return false;
  if (!candidate.startsWith('/')) return false;
  if (candidate.startsWith('//')) return false;
  if (candidate.includes('\\')) return false;
  let parsed: URL;
  try {
    parsed = new URL(candidate, SAFE_REDIRECT_BASE);
  } catch {
    return false;
  }
  if (parsed.origin !== SAFE_REDIRECT_BASE) return false;
  if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) return false;
  // Reject scheme-like first segments (`/javascript:…`) — no legitimate
  // in-app route uses a colon before the first slash.
  const firstSegment = parsed.pathname.slice(1).split('/')[0] ?? '';
  if (firstSegment.includes(':')) return false;
  return true;
}

export function defaultPathForRole(role: PostAuthRole | null | undefined): string {
  if (role === 'customer') return '/';
  return '/dashboard';
}

export function resolvePostAuthRedirect(options: {
  role: PostAuthRole | null | undefined;
  /** Explicit intent: `?redirect=` param or stored `redirectAfterAuth`. */
  explicitRedirect?: unknown;
  /** When set (professional onboarding incomplete), this wins over explicit intent and the role default. */
  onboardingPath?: string | null;
}): string {
  const { role, explicitRedirect, onboardingPath } = options;
  if (onboardingPath) {
    if (isSafeRedirectPath(explicitRedirect)) {
      const separator = onboardingPath.includes('?') ? '&' : '?';
      return `${onboardingPath}${separator}redirect=${encodeURIComponent(explicitRedirect)}`;
    }
    return onboardingPath;
  }
  if (typeof explicitRedirect === 'string' && isSafeRedirectPath(explicitRedirect)) {
    return explicitRedirect;
  }
  return defaultPathForRole(role);
}

const ONBOARDING_PATH = '/professional/onboarding';

/** True when a safe path points back into the onboarding wizard itself. */
function isOnboardingPath(path: string): boolean {
  const { pathname } = new URL(path, SAFE_REDIRECT_BASE);
  const normalized = pathname.replace(/\/+$/, '').toLowerCase();
  return normalized === ONBOARDING_PATH || normalized.startsWith(`${ONBOARDING_PATH}/`);
}

function isCompletionDestination(value: unknown): value is string {
  return isSafeRedirectPath(value) && !isOnboardingPath(value);
}

/**
 * Professional onboarding completion consumes only a validated workflow path.
 * The onboarding wizard itself is never a completion destination (a signed-out
 * visit to it is stored as the post-login intent), so it falls back to the
 * pending-verification dashboard.
 */
export function completedOnboardingRedirect(explicitRedirect: unknown, storage?: Pick<Storage, 'getItem' | 'removeItem'>): string {
  const saved = storage?.getItem('redirectAfterAuth');
  const path = isCompletionDestination(explicitRedirect) ? explicitRedirect : isCompletionDestination(saved) ? saved : null;
  if (path || isSafeRedirectPath(saved)) storage?.removeItem('redirectAfterAuth');
  return path || '/dashboard?verification=pending';
}
