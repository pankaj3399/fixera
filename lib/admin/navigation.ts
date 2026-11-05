import { canAccessAdminPage, type AdminAccessUser } from '@/lib/adminRbac'

/**
 * Admin navigation, exactly as the "Restructuring admin panel" document
 * orders it: six groups, 26 items, literal labels. Destinations are the
 * existing admin pages (URLs unchanged); RBAC stays in `lib/adminRbac.ts`.
 *
 * Nested pages that the document does not list are not menu items. They stay
 * reachable as `children` of their parent item (shown under it while that
 * section is open) and through their existing in-page links.
 */

/** Badge keys returned by GET /api/admin/navigation/badges. */
export const ADMIN_NAV_BADGE_KEYS = [
  'professionalApprovals',
  'projectApprovals',
  'cancellationRequests',
  'disputes',
  'supportTickets',
  'chatReports',
  'reviewModeration',
] as const
export type AdminNavBadgeKey = (typeof ADMIN_NAV_BADGE_KEYS)[number]

export interface AdminNavLink {
  id: string
  label: string
  href: string
  /** Additional route prefixes that belong to this destination. */
  match?: readonly string[]
}

export interface AdminNavItem extends AdminNavLink {
  /** Only the seven document-listed items carry a pending/open counter. */
  badge?: AdminNavBadgeKey
  children?: readonly AdminNavLink[]
}

export interface AdminNavGroup {
  id: string
  label: string
  /** The category shows the sum of its children's counters (Users, Services, Support & Moderation). */
  categoryCount: boolean
  items: readonly AdminNavItem[]
}

export const ADMIN_NAVIGATION: readonly AdminNavGroup[] = [
  {
    id: 'marketplace',
    label: 'Marketplace',
    categoryCount: false,
    items: [
      { id: 'kpi', label: 'KPI Dashboard', href: '/admin/kpi' },
      { id: 'payments', label: 'Payments', href: '/admin/payments' },
      { id: 'bookings', label: 'Bookings', href: '/admin/bookings' },
      { id: 'warranty-claims', label: 'Warranty Claims', href: '/admin/warranty-claims' },
      { id: 'favorites', label: 'Favorites', href: '/admin/favorites' },
    ],
  },
  {
    id: 'users',
    label: 'Users',
    categoryCount: true,
    items: [
      { id: 'professional-approval', label: 'Professional Approval', href: '/admin/professionals', badge: 'professionalApprovals' },
      { id: 'professional-management', label: 'Professional Management', href: '/admin/professionals/manage' },
      { id: 'customer-management', label: 'Customer Management', href: '/admin/customers' },
    ],
  },
  {
    id: 'services',
    label: 'Services',
    categoryCount: true,
    items: [
      { id: 'service-configuration', label: 'Service Configuration', href: '/admin/services' },
      { id: 'project-approval', label: 'Project Approval', href: '/admin/projects/approval', match: ['/admin/projects'], badge: 'projectApprovals' },
    ],
  },
  {
    id: 'support-moderation',
    label: 'Support & Moderation',
    categoryCount: true,
    items: [
      { id: 'cancellation-requests', label: 'Cancellation Requests', href: '/admin/cancellation-requests', badge: 'cancellationRequests' },
      { id: 'dispute-management', label: 'Dispute Management', href: '/admin/disputes', badge: 'disputes' },
      { id: 'support-tickets', label: 'Support Tickets', href: '/admin/support', badge: 'supportTickets' },
      { id: 'reported-chats', label: 'Reported Chats', href: '/admin/chat-reports', badge: 'chatReports' },
      { id: 'review-moderation', label: 'Review Moderation', href: '/admin/reviews', badge: 'reviewModeration' },
    ],
  },
  {
    id: 'marketing-content',
    label: 'Marketing & Content',
    categoryCount: false,
    items: [
      {
        id: 'cms',
        label: 'CMS',
        href: '/admin/cms',
        children: [
          { id: 'cms-social', label: 'Social links', href: '/admin/cms/social' },
          { id: 'site-announcements', label: 'Site announcements', href: '/admin/site-announcements' },
        ],
      },
      {
        id: 'email-campaigns',
        label: 'Email Campaigns',
        href: '/admin/campaigns',
        children: [
          { id: 'campaign-subscribers', label: 'Subscribers', href: '/admin/campaigns/subscribers' },
          { id: 'campaign-leads', label: 'Leads', href: '/admin/campaigns/leads' },
        ],
      },
      { id: 'discount-codes', label: 'Discount Codes', href: '/admin/discount-codes' },
      {
        id: 'loyalty-points',
        label: 'Loyalty & Points',
        href: '/admin/loyalty/config',
        match: ['/admin/loyalty'],
        children: [
          { id: 'professional-levels', label: 'Professional levels', href: '/admin/professional-levels/config', match: ['/admin/professional-levels'] },
        ],
      },
      { id: 'referrals', label: 'Referrals', href: '/admin/referral' },
      { id: 'backlinks', label: 'Backlinks', href: '/admin/backlinks' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    categoryCount: false,
    items: [
      { id: 'staff-roles', label: 'Staff & Roles', href: '/admin/staff' },
      { id: 'platform-settings', label: 'Platform Settings', href: '/admin/settings' },
      { id: 'background-checks', label: 'Background Checks', href: '/admin/background-checks' },
      { id: 'audit-logs', label: 'Audit Logs', href: '/admin/audit-logs' },
      { id: 'email-logs', label: 'Email Logs', href: '/admin/email-logs' },
    ],
  },
]

/** Admin home: `/admin` opens the role-aware `/dashboard` admin view. */
export const ADMIN_HOME_HREF = '/admin'
export const ADMIN_HOME_PATHS = ['/admin', '/dashboard'] as const

const normalizePath = (pathname: string | null | undefined): string => {
  const path = (pathname || '').split(/[?#]/)[0] || ''
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

const ownsPath = (prefix: string, path: string) => path === prefix || path.startsWith(`${prefix}/`)

export interface AdminNavActive {
  itemId: string | null
  childId: string | null
}

/**
 * The single destination the current route belongs to. The most specific
 * (longest) matching prefix wins, so `/admin/professionals/manage` is only
 * Professional Management, never also Professional Approval, and
 * `/admin/chat` is not Reported Chats (`/admin/chat-reports`).
 */
export function resolveActiveAdminNav(
  pathname: string | null | undefined,
  groups: readonly AdminNavGroup[] = ADMIN_NAVIGATION,
): AdminNavActive {
  const path = normalizePath(pathname)
  let best: { length: number; itemId: string; childId: string | null } | null = null
  const consider = (prefixes: readonly string[], itemId: string, childId: string | null) => {
    for (const prefix of prefixes) {
      if (ownsPath(prefix, path) && (!best || prefix.length > best.length)) {
        best = { length: prefix.length, itemId, childId }
      }
    }
  }
  for (const group of groups) {
    for (const item of group.items) {
      consider([item.href, ...(item.match || [])], item.id, null)
      for (const child of item.children || []) {
        consider([child.href, ...(child.match || [])], item.id, child.id)
      }
    }
  }
  const found = best as { itemId: string; childId: string | null } | null
  return { itemId: found?.itemId ?? null, childId: found?.childId ?? null }
}

/**
 * The menu this admin may open: items (and nested links) whose page gate
 * admits them, and no empty group. Uses the same client gate as
 * `AdminAccessGate`; the server stays authoritative for every request.
 */
export function visibleAdminNavigation(
  user: AdminAccessUser | null | undefined,
  groups: readonly AdminNavGroup[] = ADMIN_NAVIGATION,
): AdminNavGroup[] {
  if (!user || user.role !== 'admin') return []
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => canAccessAdminPage(user, item.href))
        .map((item) =>
          item.children
            ? { ...item, children: item.children.filter((child) => canAccessAdminPage(user, child.href)) }
            : item,
        ),
    }))
    .filter((group) => group.items.length > 0)
}

export type AdminNavBadgeCounts = Partial<Record<AdminNavBadgeKey, number | null>>

export type AdminNavBadgeStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface AdminNavBadgeSnapshot {
  /** Whose counts these are (user + role/access signature). */
  identity: string | null
  status: AdminNavBadgeStatus
  counts: AdminNavBadgeCounts | null
}

export type AdminNavBadgeDisplay = { kind: 'count'; value: number } | { kind: 'unknown' } | null

/**
 * - not loaded yet: nothing (never a premature 0);
 * - loaded, key absent: the server did not authorize this queue, no badge;
 * - loaded, `null`, or the request failed: unknown, never a false 0.
 */
export function itemBadgeDisplay(item: AdminNavItem, snapshot: AdminNavBadgeSnapshot): AdminNavBadgeDisplay {
  if (!item.badge) return null
  if (snapshot.status === 'error') return { kind: 'unknown' }
  if (snapshot.status !== 'ready' || !snapshot.counts) return null
  if (!(item.badge in snapshot.counts)) return null
  const value = snapshot.counts[item.badge]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? { kind: 'count', value }
    : { kind: 'unknown' }
}

/** Sum of the badges of the children this admin actually sees; unknown if any is unknown. */
export function groupBadgeDisplay(group: AdminNavGroup, snapshot: AdminNavBadgeSnapshot): AdminNavBadgeDisplay {
  if (!group.categoryCount) return null
  const children = group.items.map((item) => itemBadgeDisplay(item, snapshot)).filter((d) => d !== null)
  if (children.length === 0) return null
  let sum = 0
  for (const child of children) {
    if (child.kind !== 'count') return { kind: 'unknown' }
    sum += child.value
  }
  return { kind: 'count', value: sum }
}

/** Badge keys among the visible items: no request is needed when this is empty. */
export function visibleBadgeKeys(groups: readonly AdminNavGroup[]): AdminNavBadgeKey[] {
  return groups.flatMap((group) => group.items.flatMap((item) => (item.badge ? [item.badge] : [])))
}

/** Keep only known keys; anything that is not a non-negative count is unknown. */
export function parseAdminNavBadgeCounts(raw: unknown): AdminNavBadgeCounts {
  const counts: AdminNavBadgeCounts = {}
  if (!raw || typeof raw !== 'object') return counts
  for (const key of ADMIN_NAV_BADGE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue
    const value = (raw as Record<string, unknown>)[key]
    counts[key] = typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
  }
  return counts
}
