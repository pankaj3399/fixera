import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getAllowedRoles,
  hasRoleAccess,
  isAuthRoute,
  isProfessionalOnboardingRoute,
  isProtectedRoute,
  isPublicRoute,
  matchesRoute,
} from '../lib/auth/routeAccess.ts'

// Mirrors AuthContext's boot check: does an anonymous visitor get sent to /login?
const redirectsAnonymousToLogin = (pathname) => {
  if (isAuthRoute(pathname)) return false
  const roleRestricted = getAllowedRoles(pathname).length > 0
  const needsProtection = roleRestricted || isProtectedRoute(pathname) || !isPublicRoute(pathname)
  if (!needsProtection) return false
  return isProtectedRoute(pathname) || roleRestricted
}

test('route entries match whole path segments only', () => {
  assert.equal(matchesRoute('/professional', '/professional'), true)
  assert.equal(matchesRoute('/professional/earnings', '/professional'), true)
  assert.equal(matchesRoute('/professionals', '/professional'), false)
  assert.equal(matchesRoute('/administrator', '/admin'), false)
  assert.equal(matchesRoute('/dashboards', '/dashboard'), false)
  assert.equal(matchesRoute('/profiles', '/profile'), false)
  assert.equal(matchesRoute('/anything', '/'), false)
  assert.equal(matchesRoute('/', '/'), true)
})

test('/professionals and its sub-pages are public, not professional-only', () => {
  for (const path of ['/professionals', '/professionals/68fd0b7a1c2e3d4f5a6b768a']) {
    assert.deepEqual(getAllowedRoles(path), [], path)
    assert.equal(isPublicRoute(path), true, path)
    assert.equal(isProtectedRoute(path), false, path)
    assert.equal(redirectsAnonymousToLogin(path), false, path)
  }
})

test('public professional profiles stay public; professional workspace stays restricted', () => {
  assert.equal(redirectsAnonymousToLogin('/professional/68fd0b7a1c2e3d4f5a6b768a'), false)
  assert.deepEqual(getAllowedRoles('/professional'), ['professional', 'employee'])
  assert.deepEqual(getAllowedRoles('/professional/projects/abc'), ['professional', 'employee'])
  assert.deepEqual(getAllowedRoles('/projects/create'), ['professional'])
  assert.equal(redirectsAnonymousToLogin('/professional/earnings'), true)
  assert.equal(hasRoleAccess('customer', '/professional/earnings'), false)
  assert.equal(hasRoleAccess('customer', '/professionals'), true)
})

test('other guard prefixes do not leak to look-alike paths', () => {
  assert.deepEqual(getAllowedRoles('/administrator'), [])
  assert.deepEqual(getAllowedRoles('/admin/kpi'), ['admin'])
  assert.equal(isProtectedRoute('/dashboard/bookings'), true)
  assert.equal(isProtectedRoute('/dashboards'), false)
  assert.equal(isProtectedRoute('/support'), true)
  assert.equal(isProtectedRoute('/supporters'), false)
  assert.equal(isAuthRoute('/admin/accept-invite'), true)
  assert.equal(isAuthRoute('/login-help'), false)
  assert.equal(isProfessionalOnboardingRoute('/professional/onboarding'), true)
  assert.equal(isProfessionalOnboardingRoute('/professional/stripe/setup'), true)
  assert.equal(isProfessionalOnboardingRoute('/professionals'), false)
})

test('public pages and project detail pages need no login; the project wizard does', () => {
  for (const path of ['/', '/about', '/search', '/categories/interior', '/services/painting', '/projects/6a84c91f']) {
    assert.equal(redirectsAnonymousToLogin(path), false, path)
  }
  assert.equal(redirectsAnonymousToLogin('/projects/create'), true)
  assert.equal(redirectsAnonymousToLogin('/dashboard'), true)
})
