import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
const require = createRequire(import.meta.url)
const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime')
const { canAccessAdminPage, permissionForAdminPage } = await import('@/lib/adminRbac')

const pageUrl = new URL('../app/(pages)/admin/page.tsx', import.meta.url)

test('/admin has a page that hands off to the role-aware admin dashboard', async () => {
  assert.ok(existsSync(pageUrl), '/admin must not 404 (Settings "Dashboard" button, login redirect default)')
  const source = readFileSync(pageUrl, 'utf8')
  assert.match(source, /const ADMIN_HOME_PATH = '\/dashboard'/)
  assert.match(source, /router\.replace\(ADMIN_HOME_PATH\)/)
  // Only the default export: Next rejects other page exports.
  assert.doesNotMatch(source, /^export (const|function|let)/m)

  const { default: AdminIndexPage } = await import('@/app/(pages)/admin/page')
  // Effects do not run in server rendering; the redirect is asserted from source above.
  const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
  const html = renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router }, React.createElement(AdminIndexPage)))
  assert.match(html, /Opening the admin dashboard/)
})

test('/admin stays inside the admin gate and needs no extra permission', () => {
  const layout = readFileSync(new URL('../app/(pages)/admin/layout.tsx', import.meta.url), 'utf8')
  assert.match(layout, /<AdminAccessGate>\{children\}<\/AdminAccessGate>/)
  assert.equal(permissionForAdminPage('/admin'), null)
  assert.equal(canAccessAdminPage({ role: 'admin', adminRole: 'support', adminPermissions: ['disputes.manage'] }, '/admin'), true)
  assert.equal(canAccessAdminPage({ role: 'customer' }, '/admin'), false)
  assert.equal(canAccessAdminPage(null, '/admin'), false)
  // Settings' Dashboard button target now exists.
  const settings = readFileSync(new URL('../app/(pages)/admin/settings/page.tsx', import.meta.url), 'utf8')
  assert.match(settings, /router\.push\('\/admin'\)/)
})
