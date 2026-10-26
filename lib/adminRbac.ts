export const ADMIN_ROLES = [
  'super',
  'care',
  'marketing',
  'quality',
  'finance',
  'operations',
  'content_creator',
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export const ADMIN_ACCESS_LEVELS = ['write', 'read', 'none'] as const;
export type AdminAccessLevel = (typeof ADMIN_ACCESS_LEVELS)[number];
export const ADMIN_ACCESS_AREA_KEYS = [
  'staff', 'platform', 'maintenance', 'user_delete', 'bookings', 'disputes', 'cancellations',
  'chat', 'support', 'chat_reports', 'customers', 'warranty', 'professionals_approve',
  'professionals_manage', 'projects', 'services', 'cms', 'campaigns', 'discounts', 'loyalty',
  'referrals', 'backlinks', 'favorites', 'reviews', 'payments', 'kpi', 'audit', 'email_logs',
] as const;
export type AdminAccessArea = (typeof ADMIN_ACCESS_AREA_KEYS)[number];
export type AdminPermissionLevels = Partial<Record<AdminAccessArea, AdminAccessLevel>>;
export const ADMIN_ACCESS_AREA_LABELS: Record<AdminAccessArea, string> = {
  staff: 'Staff & roles',
  platform: 'Platform / site settings',
  maintenance: 'Maintenance jobs',
  user_delete: 'User delete',
  bookings: 'Bookings',
  disputes: 'Disputes',
  cancellations: 'Cancellations',
  chat: 'Support chat',
  support: 'Support tickets',
  chat_reports: 'Chat reports',
  customers: 'Customers',
  warranty: 'Warranty claims',
  professionals_approve: 'Professional approvals',
  professionals_manage: 'Professional management',
  projects: 'Project approvals',
  services: 'Services',
  cms: 'CMS',
  campaigns: 'Email campaigns',
  discounts: 'Discount codes',
  loyalty: 'Loyalty & points',
  referrals: 'Referrals',
  backlinks: 'Backlinks',
  favorites: 'Favorites',
  reviews: 'Review moderation',
  payments: 'Payments',
  kpi: 'KPI dashboard',
  audit: 'Audit logs',
  email_logs: 'Email logs',
};

export type AdminPermission =
  | 'staff.manage'
  | 'dashboard.overview'
  | 'professionals.approve'
  | 'professionals.manage'
  | 'customers.manage'
  | 'bookings.read'
  | 'bookings.write'
  | 'disputes.manage'
  | 'cancellations.manage'
  | 'chat.support'
  | 'chat.reports'
  | 'support.tickets'
  | 'payments.manage'
  | 'kpi.read'
  | 'audit.read'
  | 'email_logs.read'
  | 'cms.manage'
  | 'campaigns.manage'
  | 'discounts.manage'
  | 'loyalty.manage'
  | 'referrals.manage'
  | 'backlinks.manage'
  | 'reviews.moderate'
  | 'favorites.manage'
  | 'services.manage'
  | 'projects.approve'
  | 'warranty.manage'
  | 'settings.platform'
  | 'settings.site'
  | 'maintenance.run'
  | 'users.delete';

/** Path → permission for client-side route gating (keep aligned with server routePermissions). */
export const ADMIN_PAGE_PERMISSIONS: Array<{ prefix: string; permission: AdminPermission }> = [
  { prefix: '/admin/staff', permission: 'staff.manage' },
  { prefix: '/admin/professionals/manage', permission: 'professionals.manage' },
  { prefix: '/admin/professionals', permission: 'professionals.approve' },
  { prefix: '/admin/customers', permission: 'customers.manage' },
  { prefix: '/admin/bookings', permission: 'bookings.read' },
  { prefix: '/admin/disputes', permission: 'disputes.manage' },
  { prefix: '/admin/cancellation-requests', permission: 'cancellations.manage' },
  { prefix: '/admin/chat-reports', permission: 'chat.reports' },
  { prefix: '/admin/chat', permission: 'chat.support' },
  { prefix: '/admin/support', permission: 'support.tickets' },
  { prefix: '/admin/payments', permission: 'payments.manage' },
  { prefix: '/admin/kpi', permission: 'kpi.read' },
  { prefix: '/admin/audit-logs', permission: 'audit.read' },
  { prefix: '/admin/cms', permission: 'cms.manage' },
  { prefix: '/admin/campaigns', permission: 'campaigns.manage' },
  { prefix: '/admin/discount-codes', permission: 'discounts.manage' },
  { prefix: '/admin/loyalty', permission: 'loyalty.manage' },
  { prefix: '/admin/professional-levels', permission: 'loyalty.manage' },
  { prefix: '/admin/referral', permission: 'referrals.manage' },
  { prefix: '/admin/backlinks', permission: 'backlinks.manage' },
  { prefix: '/admin/favorites', permission: 'favorites.manage' },
  { prefix: '/admin/reviews', permission: 'reviews.moderate' },
  { prefix: '/admin/services', permission: 'services.manage' },
  { prefix: '/admin/projects', permission: 'projects.approve' },
  { prefix: '/admin/warranty-claims', permission: 'warranty.manage' },
  { prefix: '/admin/settings', permission: 'settings.platform' },
  { prefix: '/admin/site-announcements', permission: 'cms.manage' },
];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super: 'Super admin',
  care: 'Customer care',
  marketing: 'Marketing',
  quality: 'Quality',
  finance: 'Finance',
  operations: 'Operations',
  content_creator: 'Content Creator',
};

/** Human-readable admin areas each role can open (keep aligned with server ROLE_PERMISSIONS). */
export const ADMIN_ROLE_ACCESS: Record<AdminRole, string[]> = {
  super: [
    'Everything below',
    'Staff & roles',
    'Platform / site settings',
    'Maintenance jobs',
    'User delete',
  ],
  care: [
    'Bookings',
    'Disputes',
    'Cancellations',
    'Support chat',
    'Support tickets',
    'Chat reports',
    'Customers',
    'Warranty claims',
  ],
  marketing: [
    'CMS',
    'Email campaigns',
    'Discount codes',
    'Loyalty & points',
    'Referrals',
    'Backlinks',
    'Favorites',
  ],
  quality: [
    'Professional approvals',
    'Professional management',
    'Project approvals',
    'Review moderation',
    'Chat reports',
    'Warranty claims',
    'Services',
  ],
  finance: [
    'Payments',
    'KPI dashboard',
    'Audit logs',
    'Email logs',
    'Bookings (read only)',
  ],
  operations: [
    'Bookings',
    'Customers',
    'Professional management',
    'Project approvals',
    'Services',
    'Warranty claims',
  ],
  content_creator: [
    'CMS',
    'Email campaigns',
  ],
};

/** Area → roles matrix derived from ADMIN_ROLE_ACCESS (single source of truth). */
export const ADMIN_ACCESS_MATRIX: Array<{ area: string; roles: AdminRole[] }> = (() => {
  const byArea = new Map<string, Set<AdminRole>>();
  for (const role of ADMIN_ROLES) {
    for (const area of ADMIN_ROLE_ACCESS[role]) {
      if (area === 'Everything below') continue;
      if (!byArea.has(area)) byArea.set(area, new Set<AdminRole>(['super']));
      byArea.get(area)!.add(role);
    }
  }
  return Array.from(byArea.entries()).map(([area, roles]) => ({
    area,
    roles: ADMIN_ROLES.filter((r) => roles.has(r)),
  }));
})();

export function permissionForAdminPage(pathname: string): AdminPermission | null {
  const match = ADMIN_PAGE_PERMISSIONS.find(
    (rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)
  );
  return match?.permission ?? null;
}

export function hasAdminPermission(
  permissions: AdminPermission[] | undefined | null,
  permission: AdminPermission
): boolean {
  return Boolean(permissions?.includes(permission));
}

/** The subset of `/me` needed to resolve effective area access client-side. */
export interface AdminAccessUser {
  role?: string | null;
  adminRole?: AdminRole | string | null;
  adminPermissions?: AdminPermission[] | null;
  /** Effective matrix from `/me` (authoritative read/write/none). */
  adminAccessLevels?: Partial<Record<string, AdminAccessLevel>> | null;
  /** Legacy/explicit persisted matrix. */
  adminPermissionLevels?: Partial<Record<string, AdminAccessLevel>> | null;
  supportAccessLevel?: AdminAccessLevel | null;
}

/**
 * Effective access level for an admin area, mirroring the server:
 * - an explicit `adminPermissionLevels` override wins (including `none`);
 * - when the levels payload is absent (legacy accounts), the permission pack
 *   is authoritative, then the documented role pack;
 * - super admins always have write;
 * - anything unknown fails closed.
 *
 * The server remains authoritative for every request. This only keeps page
 * gates and write controls aligned with the read/write split it enforces.
 */
export function resolveAdminAreaLevel(
  user: AdminAccessUser | null | undefined,
  area: AdminAccessArea
): AdminAccessLevel {
  if (!user || user.role !== 'admin') return 'none';
  if (user.adminRole === 'super') return 'write';

  // `/me` now returns the effective area matrix from the same resolver the
  // server authorizes with. Prefer it; it already includes role defaults,
  // configured role access and explicit overrides.
  const effective = user.adminAccessLevels;
  const effectiveLevel = effective?.[area];
  if (
    effectiveLevel === 'write' ||
    effectiveLevel === 'read' ||
    effectiveLevel === 'none'
  ) {
    return effectiveLevel;
  }
  if (effective && Object.keys(effective).length > 0) return 'none';

  const levels = user.adminPermissionLevels;
  const explicit = levels?.[area];
  if (explicit === 'write' || explicit === 'read' || explicit === 'none') {
    return explicit;
  }
  // A populated levels matrix is the complete effective matrix: a missing
  // area means no access, not the role default or the legacy support level.
  if (levels && Object.keys(levels).length > 0) return 'none';

  // Legacy field, consulted only after the explicit matrix has had its say.
  if (area === 'support' && user.supportAccessLevel) {
    return user.supportAccessLevel;
  }

  // Legacy account without an explicit matrix. The permissions payload is
  // derived from its effective role/levels server-side, so respect it.
  if (Array.isArray(user.adminPermissions)) {
    if (area === 'support') {
      return hasAdminPermission(user.adminPermissions, 'support.tickets')
        ? 'write'
        : 'none';
    }
    return 'none';
  }

  // Very old payloads have neither field; fall back to the known role pack.
  if (user.adminRole === 'care' && area === 'support') return 'write';
  return 'none';
}

export function canReadAdminArea(
  user: AdminAccessUser | null | undefined,
  area: AdminAccessArea
): boolean {
  return resolveAdminAreaLevel(user, area) !== 'none';
}

export function canWriteAdminArea(
  user: AdminAccessUser | null | undefined,
  area: AdminAccessArea
): boolean {
  return resolveAdminAreaLevel(user, area) === 'write';
}

/**
 * The server authorizes both anonymization and hard deletion by the effective
 * `user_delete` write level. Keep the UI aligned with that same check and, when
 * the permission pack is present, require the documented `users.delete` entry
 * as well. A missing pack falls back to the effective area matrix because that
 * is what the server enforces for legacy accounts.
 */
export function canManageUserDeletion(
  user: AdminAccessUser | null | undefined
): boolean {
  if (!user || user.role !== 'admin') return false;
  if (!canWriteAdminArea(user, 'user_delete')) return false;
  if (Array.isArray(user.adminPermissions)) {
    return hasAdminPermission(user.adminPermissions, 'users.delete');
  }
  return true;
}
