export type ApiErrorBody = {
  success?: boolean;
  msg?: string;
  message?: string;
  error?: string;
  field?: 'email' | 'phone' | 'name' | string;
};

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

/**
 * Browser/transport failures (offline, DNS, CORS) reject `fetch` with a
 * runtime-generated TypeError such as "Failed to fetch" / "NetworkError…" /
 * "Load failed". Those are not backend `msg` values, so callers should show
 * their translated fallback instead of the raw runtime text.
 */
export function isTransportError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  return /failed to fetch|fetch failed|networkerror|load failed|network request failed|internet connection appears to be offline/i.test(
    error.message,
  );
}

export function messageFromApiBody(body: ApiErrorBody | null | undefined, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  return (
    asTrimmedString(body.msg) ||
    asTrimmedString(body.message) ||
    asTrimmedString(body.error) ||
    fallback
  );
}

export async function readJsonResponse<T = ApiErrorBody>(res: Response): Promise<T & ApiErrorBody> {
  const text = await res.text();
  if (!text.trim()) {
    return {} as T & ApiErrorBody;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Invalid server response (${res.status})`);
    }
    return parsed as T & ApiErrorBody;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Invalid server response')) {
      throw err;
    }
    throw new Error(`Invalid server response (${res.status})`);
  }
}
