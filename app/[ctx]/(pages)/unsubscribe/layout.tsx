import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";
import { routeContext, type RouteContextParams } from "@/lib/server/routeContext";

/** Marketing unsubscribe confirmation. Token-driven and personal, so never indexed. */
export function generateMetadata(): Metadata {
  return noindexMetadata("/unsubscribe", "Unsubscribe");
}

export default async function UnsubscribeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: RouteContextParams;
}) {
  await routeContext(params);
  return children;
}
