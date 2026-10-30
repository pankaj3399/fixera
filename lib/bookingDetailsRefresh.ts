export type BookingDetailsRefreshResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: "http" | "invalid" | "network" }

/**
 * Load the authoritative booking details after a successful mutation. A
 * non-OK response, an invalid body or a network failure is returned as a
 * failure so the page can show a retriable notice instead of silently keeping
 * stale data. The caller keeps its optimistic state until a retry succeeds.
 */
export async function requestBookingDetailsRefresh(input: {
  url: string
  headers?: Record<string, string>
  fetchImpl?: typeof fetch
}): Promise<BookingDetailsRefreshResult> {
  const fetchImpl = input.fetchImpl || fetch
  try {
    const response = await fetchImpl(input.url, {
      credentials: "include",
      headers: input.headers || {},
    })
    if (!response.ok) return { ok: false, reason: "http" }
    const data = (await response.json()) as { success?: boolean; booking?: unknown } | null
    if (!data || data.success !== true || !data.booking) {
      return { ok: false, reason: "invalid" }
    }
    return { ok: true, data }
  } catch {
    return { ok: false, reason: "network" }
  }
}
