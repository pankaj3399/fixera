"use client";

import { useEffect, useState } from "react";
import {
  isKeyedFlagOn,
  raiseKeyedFlag,
  syncKeyedFlag,
  type KeyedFlag,
} from "@/lib/marketing/siteAnnouncements/revealState";

/**
 * Reveal `true` after `delayMs` while `key` is set. The reveal is scoped to
 * the key: it is already `false` in the render where the key changes (no
 * one-frame flash and no impression for a page the reveal never reached).
 */
export function useDelayedReveal(key: string | null, delayMs: number): boolean {
  const [state, setState] = useState<KeyedFlag>({ key, on: false });
  const current = syncKeyedFlag(state, key);
  // Adjust state while rendering (React re-renders before committing).
  if (current !== state) setState(current);

  useEffect(() => {
    if (!key) return;
    const timer = window.setTimeout(
      () => setState((prev) => raiseKeyedFlag(prev, key)),
      Math.max(0, delayMs),
    );
    return () => window.clearTimeout(timer);
  }, [key, delayMs]);

  return isKeyedFlagOn(current, key);
}
