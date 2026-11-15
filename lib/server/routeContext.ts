import { cache } from "react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { parseRouteContext, type RouteContext } from "@/lib/routeContext";

export type RouteContextParams = Promise<{ ctx: string }>;

interface RouteContextStore {
  current?: RouteContext;
  ready: Promise<RouteContext>;
  resolve: (context: RouteContext) => void;
}

const store = cache((): RouteContextStore => {
  let resolve: (context: RouteContext) => void = () => {};
  const ready = new Promise<RouteContext>((done) => {
    resolve = done;
  });
  return { ready, resolve };
});

/**
 * Reads the route context from `params` (see lib/routeContext.ts), makes its
 * locale the next-intl request locale and remembers it for this render.
 *
 * Call it first in every server layout, page and `generateMetadata` under
 * `app/[ctx]`: Next may render a page without its layouts (client navigation)
 * and metadata separately, and next-intl would otherwise read request headers,
 * which makes the route dynamic.
 */
export async function routeContext(params: RouteContextParams): Promise<RouteContext> {
  const { ctx } = await params;
  const context = parseRouteContext(ctx);
  if (!context) notFound();
  setRequestLocale(context.locale);
  const current = store();
  current.current = context;
  current.resolve(context);
  return context;
}

/** The context `routeContext()` set for this render, if any. */
export function currentRouteContext(): RouteContext | undefined {
  return store().current;
}

const ROUTE_CONTEXT_WAIT_MS = 2_000;

/**
 * For code without params (`not-found.tsx`): the context of this render, once the
 * `[ctx]` layout has read it. When Next renders a 404 it resolves the not-found
 * metadata alongside the layouts' metadata, so the layout may not have run yet.
 * Resolves to undefined if no layout provides one in time, so a render never hangs.
 */
export async function awaitRouteContext(): Promise<RouteContext | undefined> {
  const current = store();
  if (current.current) return current.current;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((done) => {
    timer = setTimeout(() => done(undefined), ROUTE_CONTEXT_WAIT_MS);
  });
  try {
    return await Promise.race([current.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
