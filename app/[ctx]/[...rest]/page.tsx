import { notFound } from "next/navigation";
import { routeContext } from "@/lib/server/routeContext";

/**
 * Any path no route matches (including `/nl/login`, a private page under a language
 * prefix, and direct requests for internal `/<ctx>/...` paths): the localized 404.
 */
export default async function UnknownPage({ params }: { params: Promise<{ ctx: string; rest: string[] }> }) {
  await routeContext(params);
  notFound();
}
