import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
const require = createRequire(import.meta.url)
const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime')
const nav = await import('@/lib/admin/navigation')
const { createAdminNavBadgeStore, createHttpBadgeFetcher, adminNavBadgeIdentity } = await import('@/lib/admin/navigationBadgeStore')
const { AdminNavigationMenu } = await import('@/components/admin/navigation/AdminNavigationMenu')
const { canAccessAdminPage, permissionForAdminPage } = await import('@/lib/adminRbac')

const {
  ADMIN_NAVIGATION, resolveActiveAdminNav, visibleAdminNavigation, itemBadgeDisplay, groupBadgeDisplay,
  parseAdminNavBadgeCounts, visibleBadgeKeys,
} = nav

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
const pageFile = (href) => new URL(`../app/(pages)${href}/page.tsx`, import.meta.url)

// Literal labels and order from the restructuring document.
const DOCX = [
  ['Marketplace', ['KPI Dashboard', 'Payments', 'Bookings', 'Warranty Claims', 'Favorites']],
  ['Users', ['Professional Approval', 'Professional Management', 'Customer Management']],
  ['Services', ['Service Configuration', 'Project Approval']],
  ['Support & Moderation', ['Cancellation Requests', 'Dispute Management', 'Support Tickets', 'Reported Chats', 'Review Moderation']],
  ['Marketing & Content', ['CMS', 'Email Campaigns', 'Discount Codes', 'Loyalty & Points', 'Referrals', 'Backlinks']],
  ['Settings', ['Staff & Roles', 'Platform Settings', 'Background Checks', 'Audit Logs', 'Email Logs']],
]
const DOCX_BADGED = ['Reported Chats', 'Cancellation Requests', 'Dispute Management', 'Support Tickets', 'Review Moderation', 'Project Approval', 'Professional Approval']

// Server role packs (fixera-server utils/adminRbac/rolePermissions.ts) as /me returns them.
const PERMISSION_AREA = {
  'staff.manage': ['staff', 'write'], 'dashboard.overview': ['platform', 'read'], 'professionals.approve': ['professionals_approve', 'write'],
  'professionals.manage': ['professionals_manage', 'write'], 'customers.manage': ['customers', 'write'], 'bookings.read': ['bookings', 'read'],
  'bookings.write': ['bookings', 'write'], 'disputes.manage': ['disputes', 'write'], 'cancellations.manage': ['cancellations', 'write'],
  'chat.support': ['chat', 'write'], 'chat.reports': ['chat_reports', 'read'], 'support.tickets': ['support', 'write'],
  'payments.manage': ['payments', 'write'], 'kpi.read': ['kpi', 'read'], 'audit.read': ['audit', 'read'], 'email_logs.read': ['email_logs', 'read'],
  'cms.manage': ['cms', 'write'], 'campaigns.manage': ['campaigns', 'write'], 'discounts.manage': ['discounts', 'write'],
  'loyalty.manage': ['loyalty', 'write'], 'referrals.manage': ['referrals', 'write'], 'backlinks.manage': ['backlinks', 'write'],
  'reviews.moderate': ['reviews', 'write'], 'favorites.manage': ['favorites', 'write'], 'services.manage': ['services', 'write'],
  'projects.approve': ['projects', 'write'], 'warranty.manage': ['warranty', 'write'], 'settings.platform': ['platform', 'write'],
  'settings.site': ['platform', 'write'], 'maintenance.run': ['maintenance', 'write'], 'users.delete': ['user_delete', 'write'],
}
const ROLE_PACKS = {
  super: Object.keys(PERMISSION_AREA),
  care: ['dashboard.overview', 'bookings.read', 'bookings.write', 'disputes.manage', 'cancellations.manage', 'chat.support', 'chat.reports', 'support.tickets', 'customers.manage', 'warranty.manage'],
  marketing: ['dashboard.overview', 'cms.manage', 'campaigns.manage', 'discounts.manage', 'loyalty.manage', 'referrals.manage', 'backlinks.manage', 'favorites.manage'],
  quality: ['dashboard.overview', 'professionals.approve', 'professionals.manage', 'projects.approve', 'reviews.moderate', 'chat.reports', 'warranty.manage', 'services.manage'],
  finance: ['dashboard.overview', 'payments.manage', 'kpi.read', 'audit.read', 'email_logs.read', 'bookings.read'],
  operations: ['dashboard.overview', 'bookings.read', 'bookings.write', 'customers.manage', 'professionals.manage', 'services.manage', 'projects.approve', 'warranty.manage'],
  content_creator: ['dashboard.overview', 'cms.manage', 'campaigns.manage'],
}
const adminUser = (adminRole) => {
  const levels = {}
  for (const permission of ROLE_PACKS[adminRole]) {
    const [area, level] = PERMISSION_AREA[permission]
    if (level === 'write' || !levels[area]) levels[area] = level
  }
  return { _id: `u-${adminRole}`, role: 'admin', adminRole, adminPermissions: [...ROLE_PACKS[adminRole]], adminAccessLevels: levels }
}
const labelsOf = (groups) => groups.map((g) => [g.label, g.items.map((i) => i.label)])

const ready = (counts) => ({ identity: 'x', status: 'ready', counts })
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
const render = (props) => renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router }, React.createElement(AdminNavigationMenu, props)))
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
/** Opening <a> tag for an href (attribute order independent). */
const anchor = (html, href) => (html.match(/<a\b[^>]*>/g) || []).find((tag) => tag.includes(`href="${href}"`)) || ''

test('menu is exactly the document: 6 groups, 26 items, literal labels and order', () => {
  assert.deepEqual(labelsOf(ADMIN_NAVIGATION), DOCX)
  assert.equal(ADMIN_NAVIGATION.flatMap((g) => g.items).length, 26)
  const ids = ADMIN_NAVIGATION.flatMap((g) => g.items.flatMap((i) => [i.id, ...(i.children || []).map((c) => c.id)]))
  assert.equal(new Set(ids).size, ids.length, 'ids are unique')
})

test('every item and nested link targets an existing admin page with a page permission', () => {
  const expected = {
    'KPI Dashboard': ['/admin/kpi', 'kpi.read'], Payments: ['/admin/payments', 'payments.manage'], Bookings: ['/admin/bookings', 'bookings.read'],
    'Warranty Claims': ['/admin/warranty-claims', 'warranty.manage'], Favorites: ['/admin/favorites', 'favorites.manage'],
    'Professional Approval': ['/admin/professionals', 'professionals.approve'], 'Professional Management': ['/admin/professionals/manage', 'professionals.manage'],
    'Customer Management': ['/admin/customers', 'customers.manage'], 'Service Configuration': ['/admin/services', 'services.manage'],
    'Project Approval': ['/admin/projects/approval', 'projects.approve'], 'Cancellation Requests': ['/admin/cancellation-requests', 'cancellations.manage'],
    'Dispute Management': ['/admin/disputes', 'disputes.manage'], 'Support Tickets': ['/admin/support', 'support.tickets'],
    'Reported Chats': ['/admin/chat-reports', 'chat.reports'], 'Review Moderation': ['/admin/reviews', 'reviews.moderate'],
    CMS: ['/admin/cms', 'cms.manage'], 'Email Campaigns': ['/admin/campaigns', 'campaigns.manage'], 'Discount Codes': ['/admin/discount-codes', 'discounts.manage'],
    'Loyalty & Points': ['/admin/loyalty/config', 'loyalty.manage'], Referrals: ['/admin/referral', 'referrals.manage'], Backlinks: ['/admin/backlinks', 'backlinks.manage'],
    'Staff & Roles': ['/admin/staff', 'staff.manage'], 'Platform Settings': ['/admin/settings', 'settings.platform'],
    'Background Checks': ['/admin/background-checks', 'maintenance.run'], 'Audit Logs': ['/admin/audit-logs', 'audit.read'], 'Email Logs': ['/admin/email-logs', 'email_logs.read'],
  }
  for (const item of ADMIN_NAVIGATION.flatMap((g) => g.items)) {
    assert.deepEqual([item.href, permissionForAdminPage(item.href)], expected[item.label], item.label)
    assert.ok(existsSync(pageFile(item.href)), `${item.href} has a page`)
    for (const child of item.children || []) {
      assert.ok(existsSync(pageFile(child.href)), `${child.href} has a page`)
      assert.equal(permissionForAdminPage(child.href), permissionForAdminPage(item.href), `${child.href} shares its parent's permission`)
    }
  }
  // Nested pages the document does not list stay reachable under their parent, not as menu items.
  const children = Object.fromEntries(ADMIN_NAVIGATION.flatMap((g) => g.items).map((i) => [i.label, (i.children || []).map((c) => c.href)]))
  assert.deepEqual(children.CMS, ['/admin/cms/social', '/admin/site-announcements'])
  assert.deepEqual(children['Email Campaigns'], ['/admin/campaigns/subscribers', '/admin/campaigns/leads'])
  assert.deepEqual(children['Loyalty & Points'], ['/admin/professional-levels/config'])
  // Onboarding is not navigation.
  assert.ok(!JSON.stringify(ADMIN_NAVIGATION).includes('accept-invite'))
})

test('only the seven document items carry counters; only Users, Services and Support & Moderation sum them', () => {
  const badged = ADMIN_NAVIGATION.flatMap((g) => g.items).filter((i) => i.badge).map((i) => i.label)
  assert.deepEqual([...badged].sort(), [...DOCX_BADGED].sort())
  assert.deepEqual(new Set(ADMIN_NAVIGATION.flatMap((g) => g.items).flatMap((i) => (i.badge ? [i.badge] : []))), new Set(nav.ADMIN_NAV_BADGE_KEYS))
  assert.deepEqual(ADMIN_NAVIGATION.filter((g) => g.categoryCount).map((g) => g.label), ['Users', 'Services', 'Support & Moderation'])
})

test('active state: one destination per route, nested routes included, no double highlight', () => {
  const cases = {
    '/admin/professionals': ['professional-approval', null],
    '/admin/professionals?status=approved': ['professional-approval', null],
    '/admin/professionals/manage': ['professional-management', null],
    '/admin/professionals/manage/': ['professional-management', null],
    '/admin/bookings/6ae9': ['bookings', null],
    '/admin/projects/approval': ['project-approval', null],
    '/admin/cms': ['cms', null],
    '/admin/cms/new': ['cms', null],
    '/admin/cms/abc/edit': ['cms', null],
    '/admin/cms/social': ['cms', 'cms-social'],
    '/admin/site-announcements': ['cms', 'site-announcements'],
    '/admin/campaigns/leads': ['email-campaigns', 'campaign-leads'],
    '/admin/campaigns/subscribers': ['email-campaigns', 'campaign-subscribers'],
    '/admin/loyalty/config': ['loyalty-points', null],
    '/admin/professional-levels/config': ['loyalty-points', 'professional-levels'],
    '/admin/chat-reports': ['reported-chats', null],
    '/admin/chat': [null, null],
    '/admin/support': ['support-tickets', null],
    '/admin/background-checks': ['background-checks', null],
    '/admin/accept-invite': [null, null],
    '/admin': [null, null],
    '/dashboard': [null, null],
    '/admin/professionalsX': [null, null],
  }
  for (const [path, [itemId, childId]] of Object.entries(cases)) {
    assert.deepEqual(resolveActiveAdminNav(path), { itemId, childId }, path)
  }
  const html = render({ groups: ADMIN_NAVIGATION, active: resolveActiveAdminNav('/admin/professionals/manage'), badges: { identity: null, status: 'idle', counts: null } })
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1)
  assert.match(anchor(html, '/admin/professionals/manage'), /aria-current="page"/)
  assert.doesNotMatch(anchor(html, '/admin/professionals'), /aria-current/)
})

test('role visibility: items and empty groups the admin cannot open are hidden', () => {
  assert.deepEqual(labelsOf(visibleAdminNavigation(adminUser('super'))), DOCX)
  assert.deepEqual(labelsOf(visibleAdminNavigation(adminUser('care'))), [
    ['Marketplace', ['Bookings', 'Warranty Claims']],
    ['Users', ['Customer Management']],
    ['Support & Moderation', ['Cancellation Requests', 'Dispute Management', 'Support Tickets', 'Reported Chats']],
  ])
  assert.deepEqual(labelsOf(visibleAdminNavigation(adminUser('finance'))), [
    ['Marketplace', ['KPI Dashboard', 'Payments', 'Bookings']],
    ['Settings', ['Audit Logs', 'Email Logs']],
  ])
  assert.deepEqual(labelsOf(visibleAdminNavigation(adminUser('quality'))), [
    ['Marketplace', ['Warranty Claims']],
    ['Users', ['Professional Approval', 'Professional Management']],
    ['Services', ['Service Configuration', 'Project Approval']],
    ['Support & Moderation', ['Reported Chats', 'Review Moderation']],
  ])
  assert.deepEqual(labelsOf(visibleAdminNavigation(adminUser('marketing'))), [
    ['Marketplace', ['Favorites']],
    ['Marketing & Content', ['CMS', 'Email Campaigns', 'Discount Codes', 'Loyalty & Points', 'Referrals', 'Backlinks']],
  ])
  assert.deepEqual(labelsOf(visibleAdminNavigation(adminUser('operations'))), [
    ['Marketplace', ['Bookings', 'Warranty Claims']],
    ['Users', ['Professional Management', 'Customer Management']],
    ['Services', ['Service Configuration', 'Project Approval']],
  ])
  assert.deepEqual(labelsOf(visibleAdminNavigation(adminUser('content_creator'))), [['Marketing & Content', ['CMS', 'Email Campaigns']]])
  // Settings tools (incl. Background Checks) are super-only by role pack.
  for (const role of ['care', 'marketing', 'quality', 'finance', 'operations', 'content_creator']) {
    assert.equal(canAccessAdminPage(adminUser(role), '/admin/background-checks'), false, role)
  }
  // An explicit override that removes read access hides the item even with the pack entry.
  const care = adminUser('care')
  care.adminAccessLevels = { ...care.adminAccessLevels, support: 'none' }
  assert.ok(!visibleAdminNavigation(care).flatMap((g) => g.items).some((i) => i.label === 'Support Tickets'))
  // Non-admins and signed-out users get no menu.
  assert.deepEqual(visibleAdminNavigation({ role: 'customer' }), [])
  assert.deepEqual(visibleAdminNavigation({ role: 'professional' }), [])
  assert.deepEqual(visibleAdminNavigation(null), [])
  // No badge request when no badge item is visible.
  assert.deepEqual(visibleBadgeKeys(visibleAdminNavigation(adminUser('finance'))), [])
  assert.deepEqual(visibleBadgeKeys(visibleAdminNavigation(adminUser('care'))), ['cancellationRequests', 'disputes', 'supportTickets', 'chatReports'])
})

test('category totals are the sum of the visible children only', () => {
  const counts = { professionalApprovals: 2, projectApprovals: 3, cancellationRequests: 4, disputes: 1, supportTickets: 6, chatReports: 2, reviewModeration: 0 }
  const superGroups = Object.fromEntries(visibleAdminNavigation(adminUser('super')).map((g) => [g.label, g]))
  assert.deepEqual(groupBadgeDisplay(superGroups.Users, ready(counts)), { kind: 'count', value: 2 })
  assert.deepEqual(groupBadgeDisplay(superGroups.Services, ready(counts)), { kind: 'count', value: 3 })
  assert.deepEqual(groupBadgeDisplay(superGroups['Support & Moderation'], ready(counts)), { kind: 'count', value: 13 })
  for (const label of ['Marketplace', 'Marketing & Content', 'Settings']) assert.equal(groupBadgeDisplay(superGroups[label], ready(counts)), null, label)
  // Care cannot see Review Moderation: even if a value arrived, it is not summed.
  const careGroups = Object.fromEntries(visibleAdminNavigation(adminUser('care')).map((g) => [g.label, g]))
  assert.deepEqual(groupBadgeDisplay(careGroups['Support & Moderation'], ready({ ...counts, reviewModeration: 50 })), { kind: 'count', value: 13 })
  // Users is visible to care, but with no counter child it has no category counter.
  assert.equal(groupBadgeDisplay(careGroups.Users, ready(counts)), null)
  // Empty datasets: real zeros.
  const zeros = Object.fromEntries(nav.ADMIN_NAV_BADGE_KEYS.map((k) => [k, 0]))
  assert.deepEqual(groupBadgeDisplay(superGroups['Support & Moderation'], ready(zeros)), { kind: 'count', value: 0 })
})

test('badge states: nothing before load, absent = unauthorized, null/failure = unknown (never a false 0)', () => {
  const item = ADMIN_NAVIGATION[3].items[0]
  const group = ADMIN_NAVIGATION[3]
  assert.equal(itemBadgeDisplay(item, { identity: 'x', status: 'idle', counts: null }), null)
  assert.equal(itemBadgeDisplay(item, { identity: 'x', status: 'loading', counts: null }), null)
  assert.deepEqual(itemBadgeDisplay(item, ready({ cancellationRequests: 0 })), { kind: 'count', value: 0 })
  assert.equal(itemBadgeDisplay(item, ready({})), null)
  assert.deepEqual(itemBadgeDisplay(item, ready({ cancellationRequests: null })), { kind: 'unknown' })
  assert.deepEqual(itemBadgeDisplay(item, { identity: 'x', status: 'error', counts: null }), { kind: 'unknown' })
  assert.deepEqual(groupBadgeDisplay(group, ready({ cancellationRequests: 2, disputes: null, supportTickets: 1, chatReports: 0, reviewModeration: 0 })), { kind: 'unknown' })
  assert.deepEqual(groupBadgeDisplay(group, { identity: 'x', status: 'error', counts: null }), { kind: 'unknown' })
  assert.equal(itemBadgeDisplay(ADMIN_NAVIGATION[0].items[0], ready({ cancellationRequests: 3 })), null, 'unbadged item')
  assert.deepEqual(parseAdminNavBadgeCounts({ disputes: 2, chatReports: -1, supportTickets: 1.5, reviewModeration: '3', projectApprovals: null, bogus: 9 }),
    { disputes: 2, chatReports: null, supportTickets: null, reviewModeration: null, projectApprovals: null })
  assert.deepEqual(parseAdminNavBadgeCounts(null), {})
})

test('rendered menu: semantic nav, document order, item and category counters, nested links under the open section', () => {
  const counts = { professionalApprovals: 2, projectApprovals: 0, cancellationRequests: 4, disputes: 1, supportTickets: 6, chatReports: 2, reviewModeration: 0 }
  const html = render({ groups: visibleAdminNavigation(adminUser('super')), active: resolveActiveAdminNav('/admin/site-announcements'), badges: ready(counts) })
  assert.match(html, /^<nav aria-label="Admin"/)
  const headings = [...html.matchAll(/<h2 id="admin-nav-([a-z-]+)"/g)].map((m) => m[1])
  assert.deepEqual(headings, ['marketplace', 'users', 'services', 'support-moderation', 'marketing-content', 'settings'])
  const t = text(html)
  assert.ok(t.indexOf('KPI Dashboard') < t.indexOf('Payments') && t.indexOf('Audit Logs') < t.indexOf('Email Logs'))
  // Category counters: Users 2, Services 0, Support & Moderation 13; none on the other three.
  const heading = (id) => html.match(new RegExp(`<h2 id="admin-nav-${id}"[\\s\\S]*?</h2>`))[0]
  assert.match(heading('users'), /data-admin-nav-badge="2"/)
  assert.match(heading('services'), /data-admin-nav-badge="0"/)
  assert.match(heading('support-moderation'), /data-admin-nav-badge="13"[\s\S]*\(13 open tasks\)/)
  for (const id of ['marketplace', 'marketing-content', 'settings']) assert.doesNotMatch(heading(id), /data-admin-nav-badge/)
  assert.equal((html.match(/data-admin-nav-badge=/g) || []).length, 7 + 3)
  assert.match(html, /Cancellation Requests<\/span><span aria-hidden="true"[^>]*data-admin-nav-badge="4"/)
  // Nested links appear under the open CMS section only; the child is the current page.
  assert.match(anchor(html, '/admin/site-announcements'), /aria-current="page"/)
  assert.doesNotMatch(anchor(html, '/admin/cms'), /aria-current/)
  assert.ok(anchor(html, '/admin/cms/social'))
  assert.doesNotMatch(html, /href="\/admin\/campaigns\/leads"/)
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1)
  // Failure: unknown, not 0.
  const failed = render({ groups: visibleAdminNavigation(adminUser('care')), active: resolveActiveAdminNav('/admin/disputes'), badges: { identity: 'x', status: 'error', counts: null } })
  assert.equal((failed.match(/data-admin-nav-badge="unknown"/g) || []).length, 4 + 1)
  assert.doesNotMatch(failed, /data-admin-nav-badge="0"/)
  assert.match(failed, /count unavailable/)
})

const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('badge store: stale responses are ignored and a role switch clears the old counts', async () => {
  const calls = []
  const store = createAdminNavBadgeStore((signal) => {
    const d = deferred()
    calls.push({ ...d, signal })
    return d.promise
  })
  assert.deepEqual(store.getSnapshot(), { identity: null, status: 'idle', counts: null })
  await store.refresh()
  assert.equal(calls.length, 0, 'no identity, no request')

  store.setIdentity('super-a')
  const first = store.refresh()
  assert.equal(store.getSnapshot().status, 'loading')
  const second = store.refresh()
  assert.equal(calls[0].signal.aborted, true, 'the superseded request is aborted')
  calls[1].resolve({ disputes: 2 })
  await second
  calls[0].resolve({ disputes: 99 })
  await first
  assert.deepEqual(store.getSnapshot(), { identity: 'super-a', status: 'ready', counts: { disputes: 2 } })

  // Role switch: counts are dropped at once and a late answer for the old role is ignored.
  const late = store.refresh()
  store.setIdentity('care-b')
  assert.deepEqual(store.getSnapshot(), { identity: 'care-b', status: 'idle', counts: null })
  calls[2].resolve({ disputes: 5, reviewModeration: 1 })
  await late
  assert.deepEqual(store.getSnapshot(), { identity: 'care-b', status: 'idle', counts: null })

  // Failure is unknown; a later success replaces it.
  const failing = store.refresh()
  calls[3].reject(new Error('offline'))
  await failing
  assert.deepEqual(store.getSnapshot(), { identity: 'care-b', status: 'error', counts: null })
  const recovering = store.refresh()
  calls[4].resolve({ supportTickets: 0 })
  await recovering
  assert.deepEqual(store.getSnapshot().counts, { supportTickets: 0 })

  // Sign-out / unmount: nothing for anyone.
  const pending = store.refresh()
  store.setIdentity(null)
  calls[5].resolve({ supportTickets: 3 })
  await pending
  assert.deepEqual(store.getSnapshot(), { identity: null, status: 'idle', counts: null })
  store.dispose()
})

test('badge fetcher: one authenticated GET, no role sent by the client, failures throw', async () => {
  const requests = []
  const ok = createHttpBadgeFetcher('http://api.test', async (url, init) => {
    requests.push({ url, init })
    return { ok: true, status: 200, json: async () => ({ success: true, data: { counts: { disputes: 1, chatReports: 0 } } }) }
  })
  const signal = new AbortController().signal
  assert.deepEqual(await ok(signal), { disputes: 1, chatReports: 0 })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'http://api.test/api/admin/navigation/badges')
  assert.equal(requests[0].init.credentials, 'include')
  assert.equal(requests[0].init.cache, 'no-store')
  assert.equal(requests[0].init.signal, signal)
  assert.equal(requests[0].init.method, undefined)
  const denied = createHttpBadgeFetcher('http://api.test', async () => ({ ok: false, status: 403, json: async () => ({ success: false }) }))
  await assert.rejects(() => denied(signal))
  await assert.rejects(() => createHttpBadgeFetcher(undefined, async () => ({}))(signal))
})

test('badge identity changes with user, role or access; non-admins have none', () => {
  const care = adminUser('care')
  const id = adminNavBadgeIdentity(care)
  assert.ok(id)
  assert.equal(adminNavBadgeIdentity({ ...care }), id)
  assert.notEqual(adminNavBadgeIdentity({ ...care, adminRole: 'quality' }), id)
  assert.notEqual(adminNavBadgeIdentity({ ...care, adminAccessLevels: { ...care.adminAccessLevels, support: 'read' } }), id)
  assert.notEqual(adminNavBadgeIdentity({ ...care, _id: 'other' }), id)
  assert.equal(adminNavBadgeIdentity({ _id: 'c', role: 'customer' }), null)
  assert.equal(adminNavBadgeIdentity(null), null)
})

test('shared shell: rendered by the admin gate after admission, onboarding excluded, content column can shrink', () => {
  const gate = read('components/admin/AdminAccessGate.tsx')
  const publicReturn = gate.indexOf('if (isPublicAdminPath) {\n    return <>{children}</>;')
  const checking = gate.indexOf('Checking admin access…')
  const shell = gate.indexOf('return <AdminShell>{children}</AdminShell>;')
  assert.ok(publicReturn > -1 && checking > publicReturn && shell > checking, 'menu only after the access check, never on accept-invite')
  assert.match(read('app/(pages)/admin/layout.tsx'), /<AdminAccessGate>\{children\}<\/AdminAccessGate>/)
  const shellSource = read('components/admin/navigation/AdminShell.tsx')
  assert.match(shellSource, /<div className="min-w-0 flex-1">\{children\}<\/div>/)
  assert.match(shellSource, /aria-expanded=\{mobileOpen\}/)
  assert.match(shellSource, /event\.key === 'Escape'/)
  assert.match(shellSource, /visibleAdminNavigation\(user\)/)
  assert.match(shellSource, /useAdminNavigationBadges\(\{ user, enabled: hasBadges, pathname \}\)/)
  const hook = read('hooks/useAdminNavigationBadges.ts')
  assert.match(hook, /addEventListener\('focus'/)
  assert.match(hook, /visibilitychange/)
  assert.match(hook, /setInterval\(/)
  assert.match(hook, /\[store, identity, pathname\]/, 'refresh on navigation')
  assert.match(hook, /return \(\) => store\.setIdentity\(null\)/, 'unmount drops counts and ignores late answers')
})

test('/dashboard admin view uses the same menu; customer and professional dashboards are untouched', () => {
  const source = read('app/(pages)/dashboard/page.tsx')
  const adminStart = source.indexOf("if (user?.role === 'admin') {\n    return (")
  const proStart = source.indexOf('// Professional dashboard')
  const shellOpen = source.indexOf('<AdminShell>')
  const shellClose = source.lastIndexOf('</AdminShell>')
  assert.ok(adminStart > -1 && shellOpen > adminStart && shellClose < proStart, 'shell only around the admin view')
  assert.equal(source.split('<AdminShell>').length, 2)
  assert.ok(source.indexOf('<CustomerDashboard />') < adminStart)
  assert.match(source, /const adminDirectory = user\?\.role === 'admin' \? visibleAdminNavigation\(user\) : \[\]/)
  assert.match(source, /adminDirectory\.map\(\(group\) =>/)
  assert.doesNotMatch(source, /ADMIN_TOOL_LABELS/)
})

test('Background Checks reuses the existing maintenance checks, behind maintenance.run, run only on click', () => {
  assert.equal(permissionForAdminPage('/admin/background-checks'), 'maintenance.run')
  assert.equal(canAccessAdminPage(adminUser('super'), '/admin/background-checks'), true)
  const page = read('app/(pages)/admin/background-checks/page.tsx')
  assert.match(page, /<RequireAdminPermission permission="maintenance\.run">/)
  assert.match(page, /<BackgroundChecksPanel /)
  assert.doesNotMatch(page, /useEffect|fetch\(/, 'opening the page runs nothing')
  const panel = read('components/admin/BackgroundChecksPanel.tsx')
  const endpoints = [...panel.matchAll(/"(run-[a-z-]+)"/g)].map((m) => m[1])
  assert.deepEqual(endpoints, ['run-warranty-checks', 'run-rfq-checks', 'run-notification-reminders', 'run-completion-auto-accept'])
  assert.match(panel, /can\("maintenance\.run"\)/)
  assert.match(panel, /if \(!canRunMaintenance\) return null/)
  assert.match(panel, /method: 'POST'/)
  assert.doesNotMatch(panel, /useEffect/, 'no automatic job execution')
  for (const type of ['warranty', 'rfq', 'notif', 'autoaccept']) assert.match(panel, new RegExp(`onClick=\\{\\(\\) => runSchedulerCheck\\('${type}'\\)\\}`))
  // The dashboard keeps its Run Automated Checks card, same permission, still refreshing its stats.
  const dashboard = read('app/(pages)/dashboard/page.tsx')
  assert.match(dashboard, /const canRunMaintenance = can\('maintenance\.run'\)/)
  assert.match(dashboard, /\{canRunMaintenance && <BackgroundChecksPanel onCompleted=\{fetchAdminData\} \/>\}/)
  assert.doesNotMatch(dashboard, /run-warranty-checks/)
})
