/**
 * Client route guard configuration (used by AuthContext).
 *
 * Every route entry matches whole path segments only: `/professional` covers
 * `/professional` and `/professional/...` but never `/professionals`, and
 * `/admin` never covers a hypothetical `/administrator`.
 */

export const ROUTE_CONFIG = {
  // Public routes - accessible to everyone
  PUBLIC: [
    '/',
    '/about',
    '/privacy-policy',
    '/professionals',
    '/services',
    '/search',
    '/categories',
  ],

  // Auth routes - only accessible when NOT authenticated
  AUTH: [
    '/login',
    '/register',
    '/join',
    '/forgot-password',
    '/reset-password',
    '/signup',
    '/admin/accept-invite',
  ],

  // Protected routes - require authentication (any role)
  PROTECTED: [
    '/dashboard',
    '/profile',
    '/bookings',
    '/chat',
    '/support',
  ],

  // Role-based routes - require specific roles
  // Note: /professional covers /professional/earnings, /professional/projects/*, etc.
  ROLE_BASED: {
    admin: ['/admin'],
    professional: ['/professional', '/projects/create', '/professional/onboarding'],
    employee: ['/professional'],
  } as Record<string, string[]>,
} as const

/** True when `pathname` is `route` itself or a path below it (segment boundary). */
export const matchesRoute = (pathname: string, route: string): boolean => {
  if (route === '/') return pathname === '/'
  return pathname === route || pathname.startsWith(`${route}/`)
}

const PROFESSIONAL_PROFILE_PATH = /^\/professional\/[a-f0-9]{24}$/

export const isPublicRoute = (pathname: string): boolean => {
  if (ROUTE_CONFIG.PUBLIC.some((route) => matchesRoute(pathname, route))) return true

  // /projects/[id] is public for viewing (but NOT /projects/create)
  if (pathname.startsWith('/projects/') && !matchesRoute(pathname, '/projects/create')) {
    return true
  }

  // /professional/<objectId> is a public profile page, unlike
  // /professional/projects, /professional/onboarding, etc.
  return PROFESSIONAL_PROFILE_PATH.test(pathname)
}

export const isAuthRoute = (pathname: string): boolean =>
  ROUTE_CONFIG.AUTH.some((route) => matchesRoute(pathname, route))

export const isProtectedRoute = (pathname: string): boolean =>
  ROUTE_CONFIG.PROTECTED.some((route) => matchesRoute(pathname, route))

export const isProfessionalOnboardingRoute = (pathname: string): boolean =>
  matchesRoute(pathname, '/professional/onboarding') || matchesRoute(pathname, '/professional/stripe')

/** Returns all roles that have access to this route ([] = not role-restricted). */
export const getAllowedRoles = (pathname: string): string[] => {
  // /professional/[objectId] is a public profile page — not role-restricted
  if (PROFESSIONAL_PROFILE_PATH.test(pathname)) return []

  const allowedRoles: string[] = []
  for (const [role, routes] of Object.entries(ROUTE_CONFIG.ROLE_BASED)) {
    if (routes.some((route) => matchesRoute(pathname, route))) {
      allowedRoles.push(role)
    }
  }
  return allowedRoles
}

/** Check if a user's role has access to the route. */
export const hasRoleAccess = (userRole: string, pathname: string): boolean => {
  // Admin has access to everything
  if (userRole === 'admin') return true
  const allowedRoles = getAllowedRoles(pathname)
  // If no role restrictions, anyone authenticated can access
  if (allowedRoles.length === 0) return true
  return allowedRoles.includes(userRole)
}
