import {
  AUTO_CONVERSION_UNCONFIGURED,
  AUTO_CONVERSION_UNKNOWN,
  parseAutoConversionState,
  type AutoConversionState,
} from "./autoConversion";

/**
 * Per-isolate cache for the public auto-conversion config, used by the edge
 * middleware on every request.
 *
 * - A fresh answer is reused for `ttlMs`.
 * - When a refresh fails, times out or returns an unusable body, the last
 *   authoritative answer is kept and retried after `failureTtlMs`. Without
 *   any earlier answer the state is `unknown` — never "unconfigured" — so the
 *   middleware does not grant every visitor their geo country on an outage.
 * - HTTP 404 means the backend has no auto-conversion endpoint (feature not
 *   deployed there), which is an authoritative "not configured".
 * - The first fetch of an isolate gets a longer timeout (`firstTimeoutMs`),
 *   since a serverless backend cold start often exceeds the steady-state one.
 */
export interface AutoConversionLoaderOptions {
  url: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  failureTtlMs?: number;
  timeoutMs?: number;
  firstTimeoutMs?: number;
}

export function createAutoConversionLoader({
  url,
  fetchImpl = (...args) => fetch(...args),
  now = Date.now,
  ttlMs = 5 * 60 * 1000,
  failureTtlMs = 60 * 1000,
  timeoutMs = 1500,
  firstTimeoutMs = 3000,
}: AutoConversionLoaderOptions): () => Promise<AutoConversionState> {
  let state: AutoConversionState = AUTO_CONVERSION_UNKNOWN;
  let expiresAt = 0;
  let inflight: Promise<AutoConversionState> | null = null;

  const refresh = async (): Promise<AutoConversionState> => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      state.status === "unknown" ? firstTimeoutMs : timeoutMs,
    );
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      let next: AutoConversionState | null;
      if (res.status === 404) {
        next = AUTO_CONVERSION_UNCONFIGURED;
      } else {
        if (!res.ok) throw new Error(`auto-conversion config HTTP ${res.status}`);
        next = parseAutoConversionState(await res.json());
      }
      if (!next) throw new Error("auto-conversion config: unusable body");
      state = next;
      expiresAt = now() + ttlMs;
    } catch {
      // Keep the previous answer (or unknown); retry after the failure window.
      expiresAt = now() + failureTtlMs;
    } finally {
      clearTimeout(timer);
    }
    return state;
  };

  return async () => {
    if (now() < expiresAt) return state;
    inflight ??= refresh().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

/**
 * Shared loader for middleware. Without a backend URL there is no roll-out
 * config to honour, which is the authoritative "not configured".
 */
export const loadAutoConversionState: () => Promise<AutoConversionState> = backendUrl
  ? createAutoConversionLoader({ url: `${backendUrl}/api/public/auto-conversion` })
  : async () => AUTO_CONVERSION_UNCONFIGURED;
