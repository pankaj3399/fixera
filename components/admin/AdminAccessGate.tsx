'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { AdminShell } from '@/components/admin/navigation/AdminShell';

const PUBLIC_ADMIN_PATHS = ['/admin/accept-invite'];

export default function AdminAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, isAuthenticated } = useAuth();
  const { isAdmin, canAccessPath } = useAdminAccess();

  const isPublicAdminPath = PUBLIC_ADMIN_PATHS.some(
    (path) => pathname === path || pathname?.startsWith(`${path}/`)
  );

  useEffect(() => {
    if (isPublicAdminPath) return;
    if (loading) return;
    if (!isAuthenticated || !isAdmin) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname || '/admin')}`);
      return;
    }
    if (!canAccessPath(pathname || '')) {
      router.replace('/dashboard');
    }
  }, [loading, isAuthenticated, isAdmin, canAccessPath, pathname, router, isPublicAdminPath]);

  if (isPublicAdminPath) {
    return <>{children}</>;
  }

  if (loading || !isAuthenticated || !isAdmin || !canAccessPath(pathname || '')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-gray-500">
        Checking admin access…
      </div>
    );
  }

  // Admitted: only now is the admin menu rendered, so it never shows links
  // before access is known. Onboarding (accept-invite) stays outside it.
  return <AdminShell>{children}</AdminShell>;
}
