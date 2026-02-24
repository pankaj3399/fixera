import { useEffect, useRef } from "react";

export const useChatPolling = (
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean,
  deps: ReadonlyArray<unknown> = []
) => {
  const callbackRef = useRef(callback);
  const isRunningRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return;
    }

    const run = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      try {
        await callbackRef.current();
      } finally {
        isRunningRef.current = false;
      }
    };

    void run();

    const id = window.setInterval(() => void run(), intervalMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void run();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs, ...deps]);
};
