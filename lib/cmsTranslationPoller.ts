import { cmsTranslationInFlight, type CmsTranslationStatus } from "@/lib/cms";

/**
 * Polls `GET /api/admin/cms/:id/translations` while a background translation
 * run is queued, running or has a pending locale (contract v2 §2).
 *
 * - one request at a time: the next poll is scheduled only after the previous
 *   one finished, and `start`/`stop` abort the request in flight;
 * - stops for good on a 4xx (the doc is gone or access was revoked);
 * - gives up after `maxAttempts` polls (~2 min at 2 s), reporting a timeout;
 * - does not poll while the tab is hidden and polls right away when it is
 *   visible again (hidden time does not count toward the timeout).
 *
 * Pure (timers and visibility are injected) so it can be tested without a DOM.
 */

export const CMS_TRANSLATION_POLL_INTERVAL_MS = 2_000;
export const CMS_TRANSLATION_POLL_MAX_ATTEMPTS = 60;

export interface CmsVisibilitySource {
  isHidden(): boolean;
  /** Calls `listener` on every visibility change; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export interface CmsPollTimers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface CmsTranslationPollerOptions {
  fetchStatus(signal: AbortSignal): Promise<CmsTranslationStatus>;
  /** Every status the poller fetched. */
  onStatus(status: CmsTranslationStatus): void;
  /**
   * Nothing is pending any more. `observedWork` is true when this poll cycle
   * saw (or was started for) a run, i.e. the server may have written new text.
   */
  onSettled(status: CmsTranslationStatus, info: { observedWork: boolean }): void;
  /** Still in flight after `maxAttempts` polls; `last` is the last status seen. */
  onTimeout(last: CmsTranslationStatus | undefined): void;
  /** A 4xx: polling stopped and will not resume until `start` is called again. */
  onFatal(error: unknown): void;
  intervalMs?: number;
  maxAttempts?: number;
  timers?: CmsPollTimers;
  visibility?: CmsVisibilitySource;
}

export interface CmsTranslationPoller {
  /**
   * (Re)starts polling. With an `initial` status that is not in flight nothing
   * is polled; without one the status is fetched right away. `expectWork`
   * marks a cycle started by a save/retry that queued work.
   */
  start(initial?: CmsTranslationStatus, options?: { expectWork?: boolean }): void;
  /** Stops polling and aborts a request in flight. `start` may resume it. */
  stop(): void;
  /** `stop` plus dropping the visibility listener (component unmount). */
  dispose(): void;
  isActive(): boolean;
}

const defaultTimers: CmsPollTimers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** The browser's page visibility, or undefined outside a browser. */
export function documentVisibility(): CmsVisibilitySource | undefined {
  if (typeof document === "undefined") return undefined;
  return {
    isHidden: () => document.visibilityState === "hidden",
    subscribe(listener) {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}

function isClientError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}

export function createCmsTranslationPoller(options: CmsTranslationPollerOptions): CmsTranslationPoller {
  const interval = options.intervalMs ?? CMS_TRANSLATION_POLL_INTERVAL_MS;
  const maxAttempts = options.maxAttempts ?? CMS_TRANSLATION_POLL_MAX_ATTEMPTS;
  const timers = options.timers ?? defaultTimers;
  const visibility = options.visibility;

  let active = false;
  let generation = 0;
  let attempts = 0;
  let observedWork = false;
  let last: CmsTranslationStatus | undefined;
  let timer: unknown = null;
  let controller: AbortController | null = null;
  let waitingForVisible = false;

  const clearTimer = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };

  const finish = () => {
    active = false;
    clearTimer();
    controller = null;
    waitingForVisible = false;
  };

  const schedule = (ms: number) => {
    clearTimer();
    timer = timers.set(() => {
      timer = null;
      tick();
    }, ms);
  };

  const afterAttempt = (gen: number) => {
    if (gen !== generation || !active) return;
    if (attempts >= maxAttempts) {
      finish();
      options.onTimeout(last);
      return;
    }
    schedule(interval);
  };

  function tick() {
    if (!active || controller) return;
    if (visibility?.isHidden()) {
      waitingForVisible = true;
      return;
    }
    const gen = generation;
    const request = new AbortController();
    controller = request;
    let pending: Promise<CmsTranslationStatus>;
    try {
      pending = options.fetchStatus(request.signal);
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (status) => {
        if (gen !== generation) return;
        controller = null;
        attempts += 1;
        last = status;
        options.onStatus(status);
        if (!cmsTranslationInFlight(status)) {
          const info = { observedWork };
          finish();
          options.onSettled(status, info);
          return;
        }
        observedWork = true;
        afterAttempt(gen);
      },
      (error) => {
        if (gen !== generation) return;
        controller = null;
        if (isClientError(error)) {
          finish();
          options.onFatal(error);
          return;
        }
        // Network errors and 5xx are transient: keep polling until the timeout.
        attempts += 1;
        afterAttempt(gen);
      }
    );
  }

  const stop = () => {
    generation += 1;
    controller?.abort();
    finish();
  };

  const unsubscribe = visibility?.subscribe(() => {
    if (!active || !waitingForVisible || controller || visibility.isHidden()) return;
    waitingForVisible = false;
    tick();
  });

  return {
    start(initial, startOptions = {}) {
      stop();
      attempts = 0;
      last = initial;
      observedWork = startOptions.expectWork === true || cmsTranslationInFlight(initial);
      if (initial && !cmsTranslationInFlight(initial)) return;
      active = true;
      if (initial) schedule(interval);
      else tick();
    },
    stop,
    dispose() {
      stop();
      unsubscribe?.();
    },
    isActive: () => active,
  };
}
