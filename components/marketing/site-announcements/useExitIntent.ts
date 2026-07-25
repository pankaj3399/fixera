"use client";

import { useEffect, useState } from "react";

/**
 * Arms after `armAfterMs`, then fires once on desktop mouse-leave-top
 * or mobile upward-scroll near the top. Resets when `enabled` becomes false.
 */
export function useExitIntent(enabled: boolean, armAfterMs: number): boolean {
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setTriggered(false);
      return;
    }
    if (triggered) return;

    let armed = false;
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, Math.max(0, armAfterMs));

    let lastScrollY = window.scrollY;

    const onMouseOut = (event: MouseEvent) => {
      if (!armed) return;
      if (event.clientY <= 0) setTriggered(true);
    };

    const onScroll = () => {
      if (!armed) return;
      if (window.innerWidth >= 768) return;
      const y = window.scrollY;
      const scrollingUp = y < lastScrollY;
      lastScrollY = y;
      if (scrollingUp && y < 80) setTriggered(true);
    };

    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.clearTimeout(armTimer);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("scroll", onScroll);
    };
  }, [enabled, armAfterMs, triggered]);

  return triggered;
}
