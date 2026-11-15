import type { Metadata } from 'next';
import { noindexMetadata } from '@/lib/seo/metadata';
import { routeContext, type RouteContextParams } from '@/lib/server/routeContext';

export const metadata: Metadata = noindexMetadata(
  '/admin/accept-invite',
  'Accept admin invite'
);

export default async function AdminAcceptInviteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: RouteContextParams;
}) {
  await routeContext(params);
  return children;
}
