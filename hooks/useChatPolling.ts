import { useEffect, useRef } from "react";

export const useChatPolling = (
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean,
  deps: ReadonlyArray<unknown> = []
) => {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return;
    }

    const run = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      void callbackRef.current();
    };

    run();

    const id = window.setInterval(run, intervalMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        run();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs, ...deps]);
};
