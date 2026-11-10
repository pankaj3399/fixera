"use client";

import { useEffect, useState } from "react";
import {
  isKeyedFlagOn,
  raiseKeyedFlag,
  syncKeyedFlag,
  type KeyedFlag,
} from "@/lib/marketing/siteAnnouncements/revealState";

/**
 * Arms after `armAfterMs`, then fires once on desktop mouse-leave-top
 * or mobile upward-scroll near the top. Resets when `enabled` becomes false
 * or when the optional page-view key changes; the reset is visible in the
 * same render as the change, so a trigger from the previous page never
 * carries over (no flash, no impression before this page's exit gesture).
 */
export function useExitIntent(
  enabled: boolean,
  armAfterMs: number,
  resetKey: string | null = null,
): boolean {
  const key = enabled ? `exit:${resetKey ?? ""}` : null;
  const [state, setState] = useState<KeyedFlag>({ key, on: false });
  const current = syncKeyedFlag(state, key);
  // Adjust state while rendering (React re-renders before committing).
  if (current !== state) setState(current);

  useEffect(() => {
    if (!key) return;
    const trigger = () => setState((prev) => raiseKeyedFlag(prev, key));

    let armed = false;
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, Math.max(0, armAfterMs));

    let lastScrollY = window.scrollY;

    const onMouseOut = (event: MouseEvent) => {
      if (!armed) return;
      if (event.clientY <= 0 && event.relatedTarget === null) {
        trigger();
      }
    };

    const onScroll = () => {
      if (!armed) return;
      if (window.innerWidth >= 768) return;
      const y = window.scrollY;
      const scrollingUp = y < lastScrollY;
      lastScrollY = y;
      if (scrollingUp && y < 80) trigger();
    };

    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.clearTimeout(armTimer);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("scroll", onScroll);
    };
  }, [key, armAfterMs]);

  return isKeyedFlagOn(current, key);
}
