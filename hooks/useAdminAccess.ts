'use client';

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  canAccessAdminPage,
  canReadAdminArea,
  canWriteAdminArea,
  hasAdminPermission,
  resolveAdminAreaLevel,
  type AdminAccessArea,
  type AdminPermission,
} from '@/lib/adminRbac';

export function useAdminAccess() {
  const { user, isAuthenticated } = useAuth();
  const isAdmin = isAuthenticated && user?.role === 'admin';
  // Do not invent 'super' — missing role means incomplete session payload
  const adminRole = user?.adminRole;
  const permissions = user?.adminPermissions;
  const supportAccess = useMemo(
    () => (isAdmin ? resolveAdminAreaLevel(user, 'support') : 'none'),
    [isAdmin, user],
  );

  const can = useMemo(() => {
    return (permission: AdminPermission) => {
      if (!isAdmin) return false;
      // Support reads are area-level (`support: read`) and therefore absent
      // from the write-only `support.tickets` permission pack.
      if (permission === 'support.tickets') {
        return canReadAdminArea(user, 'support');
      }
      // Fail closed: missing permissions payload must not grant all access.
      // Explicit super may keep a legacy fallback until /me refreshes the pack.
      if (!permissions) {
        return user?.adminRole === 'super';
      }
      return hasAdminPermission(permissions, permission);
    };
  }, [isAdmin, permissions, user]);

  const canAccessPath = (pathname: string) => canAccessAdminPage(user, pathname);
  const canReadArea = (area: AdminAccessArea) => isAdmin && canReadAdminArea(user, area);
  const canWriteArea = (area: AdminAccessArea) => {
    if (!isAdmin) return false;
    if (canWriteAdminArea(user, area)) return true;
    const hasEffectiveLevels =
      (user?.adminAccessLevels && Object.keys(user.adminAccessLevels).length > 0) ||
      (user?.adminPermissionLevels && Object.keys(user.adminPermissionLevels).length > 0);
    // Legacy accounts without a levels matrix keep the permission-pack behavior.
    if (!hasEffectiveLevels && area === 'campaigns') return can('campaigns.manage');
    return false;
  };

  return {
    isAdmin,
    adminRole,
    permissions: permissions || [],
    supportAccess,
    canWriteSupport: isAdmin && supportAccess === 'write',
    canReadArea,
    canWriteArea,
    can,
    canAccessPath,
  };
}
