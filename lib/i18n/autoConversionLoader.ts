import { parseAutoConversionResponse, type AutoConversionConfig } from "./autoConversion";

/**
 * Per-isolate cache for the public auto-conversion config, used by the edge
 * middleware on every request. A fresh value is reused for `ttlMs`; when a
 * refresh fails or times out, the last good value (or "not configured") is
 * kept for `failureTtlMs` so a backend outage never blocks page rendering and
 * never flips visitors between behaviours on every request.
 */
export interface AutoConversionLoaderOptions {
  url: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  failureTtlMs?: number;
  timeoutMs?: number;
}

export function createAutoConversionLoader({
  url,
  fetchImpl = (...args) => fetch(...args),
  now = Date.now,
  ttlMs = 5 * 60 * 1000,
  failureTtlMs = 60 * 1000,
  timeoutMs = 1500,
}: AutoConversionLoaderOptions): () => Promise<AutoConversionConfig | null> {
  let value: AutoConversionConfig | null = null;
  let expiresAt = 0;
  let inflight: Promise<AutoConversionConfig | null> | null = null;

  const refresh = async (): Promise<AutoConversionConfig | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`auto-conversion config HTTP ${res.status}`);
      value = parseAutoConversionResponse(await res.json());
      expiresAt = now() + ttlMs;
    } catch {
      // Keep the previous value; retry after the short failure window.
      expiresAt = now() + failureTtlMs;
    } finally {
      clearTimeout(timer);
    }
    return value;
  };

  return async () => {
    if (now() < expiresAt) return value;
    inflight ??= refresh().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

/** Shared loader for middleware; without a backend URL the roll-out is off. */
export const loadAutoConversionConfig: () => Promise<AutoConversionConfig | null> = backendUrl
  ? createAutoConversionLoader({ url: `${backendUrl}/api/public/auto-conversion` })
  : async () => null;
