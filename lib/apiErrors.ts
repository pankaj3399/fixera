export type ApiErrorBody = {
  success?: boolean;
  msg?: string;
  message?: string;
  error?: string | { message?: string; code?: string };
  code?: string;
  field?: 'email' | 'phone' | 'name' | string;
  /** Stable catalog key of the message (sent with an explicit Accept-Language). */
  messageKey?: string;
  /** English source copy when `msg`/`message` was localized by the API. */
  messageEn?: string;
  status?: number;
  statusCode?: number;
};

/**
 * How a failure should be presented. Business/validation failures keep their
 * specific server copy; transport, auth, access and server failures use a
 * short, human fallback instead of raw runtime/provider text.
 */
export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'canceled'
  | 'auth'
  | 'signInRequired'
  | 'forbidden'
  | 'notFound'
  | 'validation'
  | 'conflict'
  | 'rateLimited'
  | 'payloadTooLarge'
  | 'server'
  | 'unavailable'
  | 'invalidResponse'
  | 'unknown';

export type ErrorMessages = Partial<Record<ApiErrorKind, string>>;

type ErrorDetails = {
  message?: string;
  /** English source of a localized server message (classification only). */
  sourceMessage?: string;
  status?: number;
  code?: string;
  kind?: ApiErrorKind;
};

export class ApiRequestError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;
  /**
   * Safe copy supplied by the API. `message` may be a locally generated
   * fallback (contextual, localized or technical) and is never presented as
   * server copy unless it is explicitly carried here.
   */
  readonly serverMessage?: string;
  /**
   * English source of `serverMessage` when the API localized it (nl/fr).
   * Used for classification and stable matching, never displayed.
   */
  readonly serverMessageEn?: string;

  constructor(
    message: string,
    options: {
      kind?: ApiErrorKind;
      status?: number;
      code?: string;
      serverMessage?: string;
      serverMessageEn?: string;
    } = {},
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.kind = options.kind ?? 'unknown';
    this.status = options.status;
    this.code = options.code;
    this.serverMessage = options.serverMessage;
    this.serverMessageEn = options.serverMessageEn;
  }
}

const DEFAULT_MESSAGES: Record<ApiErrorKind, string> = {
  network: 'You appear to be offline. Check your internet connection and try again.',
  timeout: 'This is taking longer than expected. Please try again.',
  canceled: 'The request was canceled. Please try again.',
  auth: 'Your session has expired. Please sign in again.',
  signInRequired: 'Please sign in to continue.',
  forbidden: 'You do not have permission to do this.',
  notFound: 'We could not find that item. It may have been removed.',
  validation: 'Please check the information you entered and try again.',
  conflict: 'That action conflicts with the current state. Refresh the page and try again.',
  rateLimited: 'Too many attempts. Please wait a moment and try again.',
  payloadTooLarge: 'That file is too large. Please choose a smaller file.',
  server: 'Something went wrong on our side. Please try again.',
  unavailable: 'This service is temporarily unavailable. Please try again shortly.',
  invalidResponse: 'We could not complete that request. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

const NETWORK_MESSAGE_RE =
  /failed to fetch|fetch failed|networkerror|network error|load failed|network request failed|internet connection appears to be offline|connection refused|connection reset/i;
const TECHNICAL_MESSAGE_RES: RegExp[] = [
  // Runtime/stack noise.
  /\b(?:typeerror|referenceerror|syntaxerror|rangeerror|evalerror|urierror|unhandledrejection|uncaught exception)\b/i,
  /\bat\s+(?:async\s+)?[\w.$]+\s*\(/,
  /\b(?:stack trace|stacktrace|exception thrown|node_modules|webpack|source map)\b/i,
  /\bcannot read propert(?:y|ies) of (?:undefined|null)\b/i,
  /\bis not a function\b/i,
  /\bunexpected token\b[^\n]*\bjson\b/i,
  /\bjson at position \d+\b/i,
  /\b(?:jwt|csrf|cors|invalid_grant|invalid_client|unauthorized_client)\b/i,
  // Database / infrastructure noise.
  /\b(?:mongodb|mongoose|mongoservererror|e11000|duplicate key|objectid|cast to objectid|sql|postgres|postgresql|mysql|prisma|sequelize|redis|elasticsearch|knex)\b/i,
  /\b(?:econnrefused|econnreset|enotfound|eai_again|etimedout|epipe|socket hang up|tls|ssl certificate)\b/i,
  /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i,
  /\b(?:api[\s_-]?key|secret[\s_-]?key|bearer\s|authorization header|private key)\b/i,
  /\/api\//i,
  /\b(?:next_public_[a-z0-9_]+|process\.env|\.env\b)/i,
  /\b(?:endpoint|backend|http client|request id|correlation id)\b/i,
  /\b(?:failed|error|exception)\b[^\n]{0,40}\b(?:stripe|brevo|twilio|firebase|cloudinary|odoo|openai|sendgrid|mollie|paypal)\b/i,
  /\b(?:stripe|brevo|twilio|firebase|cloudinary|odoo|openai|sendgrid|mollie|paypal)\b[^\n]{0,40}\b(?:api|sdk|exception|stack|error code)\b/i,
  /\b(?:stripe|brevo|twilio|firebase|cloudinary|odoo|openai|sendgrid|mollie|paypal)(?:[A-Z]\w*)?(?:error|exception)\b/i,
  /\brequest failed with status code\s*\d{3}\b/i,
  // HTTP/runtime status strings that we replace with a readable fallback.
  /\b(?:request|upload|save|load|fetch|operation|response|render|sync|translate|delete|create|update)\b[^\n]{0,60}\(\d{3}\)\s*$/i,
  /\bhttp\s*[:/]?\s*\d{3}\b/i,
  /\binvalid server response\b/i,
  /\b(?:request returned no body|empty response data|unexpected response|malformed response)\b/i,
  // Browser body/JSON parser runtime text.
  /\bunexpected end of (?:json|data|input)\b/i,
  /\bjson\.parse:\s*unexpected\b/i,
  /\b(?:body (?:stream )?(?:is )?unusable|body (?:stream )?already read)\b/i,
  /\b(?:request|response) body (?:has already been|is already) read\b/i,
  /\bis not valid json\b/i,
  // HTML documents/pages returned instead of an API envelope.
  /^\s*<!doctype\b/i,
  /^\s*<(?:html|head|body|title|pre|div|p|h[1-6]|table|script|style|section|main)\b[^>]*>/i,
  /<\/?(?:html|head|body|div|span|p|pre|h[1-6]|table|thead|tbody|tr|td|script|style|section|main|title)\b[^>]*>/i,
  /^(?:bad request|unauthorized|forbidden|not found|conflict|too many requests|internal server error|bad gateway|service unavailable|gateway timeout)\.?$/i,
  /^internal server error\b/i,
  /^\d{3}\s*[:\-]\s*/,
  /^\d{3}\s+(?:bad request|unauthorized|forbidden|not found|conflict|too many requests|internal server error|bad gateway|service unavailable|gateway timeout)\b/i,
  // Mongoose built-in validator text (schema paths/enums), never user copy.
  /\bPath `[^`]*`/,
  /`[^`]*` is not a valid enum value\b/i,
  /\bvalidator failed for path\b/i,
  // Object/stringification accidents.
  /^\s*(?:undefined|null|nan|\[object object\])\s*$/i,
  /^\s*[{[][\s\S]*[}\]]\s*$/,
];

/**
 * Generic category copy produced by the backend's shared error handler. These
 * strings carry no business detail, so public pages use their localized
 * category message instead. Specific validation/business copy is not listed
 * here and keeps being shown verbatim.
 */
const GENERIC_SERVER_MESSAGE_KINDS = new Map<string, ApiErrorKind>(
  (
    [
      ['Please sign in to continue.', 'signInRequired'],
      ['Your session has expired. Please sign in again.', 'auth'],
      ['Your session is invalid. Please sign in again.', 'auth'],
      ['Your account is no longer available. Please sign in again.', 'auth'],
      ['You do not have permission to do that.', 'forbidden'],
      ['The requested item could not be found.', 'notFound'],
      ['This request conflicts with the current state. Refresh and try again.', 'conflict'],
      ['Too many requests. Please wait a moment and try again.', 'rateLimited'],
      ['The request is too large. Reduce the amount of data and try again.', 'payloadTooLarge'],
      ['The service is temporarily unavailable. Please try again in a moment.', 'unavailable'],
      ['The service took too long to respond. Please try again.', 'timeout'],
      ['The payment service is temporarily unavailable. Please try again.', 'unavailable'],
      ['We could not verify your session. Please try again.', 'server'],
      ["We couldn't verify your session. Please try again.", 'server'],
    ] as Array<[string, ApiErrorKind]>
  ).map(([message, kind]) => [normalizeServerMessage(message), kind]),
);

const GENERIC_SERVER_MESSAGES = new Set([
  ...GENERIC_SERVER_MESSAGE_KINDS.keys(),
  ...[
    'The request could not be processed. Check the details and try again.',
    'Some fields are invalid. Check the highlighted fields and try again.',
    'One of the values has an invalid format. Check your input and try again.',
    'The request body is not valid JSON.',
    'The request uses an unsupported content encoding.',
    'The request was interrupted. Please try again.',
  ].map(normalizeServerMessage),
]);

const SIGN_IN_REQUIRED_MESSAGES = new Set(
  ['Please sign in to continue.'].map(normalizeServerMessage),
);

const PARSER_MESSAGE_RES: RegExp[] = [
  /\bunexpected end of (?:json|data|input)\b/i,
  /\bjson\.parse:\s*unexpected\b/i,
  /\b(?:body (?:stream )?(?:is )?unusable|body (?:stream )?already read)\b/i,
  /\b(?:request|response) body (?:has already been|is already) read\b/i,
  /\bis not valid json\b/i,
];

/** Stable API codes that need no extra detail from the server. */
const CODE_KINDS: Record<string, ApiErrorKind> = {
  AUTH_REQUIRED: 'auth',
  SESSION_EXPIRED: 'auth',
  UNAUTHENTICATED: 'auth',
  TOKEN_EXPIRED: 'auth',
  FORBIDDEN: 'forbidden',
  ACCESS_DENIED: 'forbidden',
  PERMISSION_DENIED: 'forbidden',
  NOT_FOUND: 'notFound',
  VALIDATION: 'validation',
  VALIDATION_FAILED: 'validation',
  VALIDATION_ERROR: 'validation',
  INVALID_INPUT: 'validation',
  CONFLICT: 'conflict',
  ALREADY_EXISTS: 'conflict',
  STATE_CONFLICT: 'conflict',
  RATE_LIMITED: 'rateLimited',
  TOO_MANY_REQUESTS: 'rateLimited',
  PAYLOAD_TOO_LARGE: 'payloadTooLarge',
  FILE_TOO_LARGE: 'payloadTooLarge',
  INTERNAL: 'server',
  INTERNAL_ERROR: 'server',
  SERVER_ERROR: 'server',
  UNAVAILABLE: 'unavailable',
  UPSTREAM_UNAVAILABLE: 'unavailable',
  SERVICE_UNAVAILABLE: 'unavailable',
};

const GENERIC_AUTH_MESSAGE_RE =
  /^(?:unauthorized|not authenticated|authentication required|auth required|session expired|token expired|invalid token|invalid jwt|forbidden|access denied|not found|bad request|conflict|internal server error|server error|error)\.?$/i;

function normalizeServerMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function asFiniteStatus(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 400 && n <= 599 ? n : undefined;
}

function bodyDetails(body: unknown): { message?: string; sourceMessage?: string; code?: string; status?: number } {
  const record = asRecord(body);
  if (!record) return {};

  const errorRecord = asRecord(record.error);
  const dataRecord = asRecord(record.data);
  const code =
    asTrimmedString(record.code) ||
    asTrimmedString(errorRecord?.code) ||
    asTrimmedString(dataRecord?.code);

  let message =
    asTrimmedString(record.msg) ||
    asTrimmedString(record.message) ||
    asTrimmedString(record.error) ||
    asTrimmedString(errorRecord?.message) ||
    asTrimmedString(errorRecord?.msg) ||
    asTrimmedString(dataRecord?.msg) ||
    asTrimmedString(dataRecord?.message);

  if (!message && Array.isArray(record.errors)) {
    message = record.errors
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        const item = asRecord(entry);
        return asTrimmedString(item?.message) || asTrimmedString(item?.msg);
      })
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 3)
      .join(' ');
  }

  // The API localizes `msg`/`message` by Accept-Language and then carries the
  // English copy in `messageEn`; classification keeps working on English.
  const sourceMessage = message ? asTrimmedString(record.messageEn) : undefined;

  return {
    message,
    ...(sourceMessage ? { sourceMessage } : {}),
    code,
    status: asFiniteStatus(record.status) ?? asFiniteStatus(record.statusCode),
  };
}

function detailsFrom(error: unknown): ErrorDetails {
  if (error instanceof ApiRequestError) {
    return {
      message: error.serverMessage,
      sourceMessage: error.serverMessageEn,
      status: error.status,
      code: error.code,
      // A default-constructed 'unknown' kind means "no explicit kind": let the
      // generic server-message fallback infer one from the message instead.
      kind: error.kind === 'unknown' ? undefined : error.kind,
    };
  }

  if (typeof error === 'string') {
    return { message: error.trim() || undefined };
  }

  if (error instanceof Error) {
    const record = error as Error & {
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
      response?: unknown;
      isAxiosError?: unknown;
    };
    const response = asRecord(record.response);
    const body = response?.data;
    const bodyInfo = bodyDetails(body);
    return {
      // The envelope message is more specific than Axios' "Request failed with
      // status code …" wrapper, and is sanitized by the caller either way.
      message: bodyInfo.message ?? asTrimmedString(record.message),
      sourceMessage: bodyInfo.message ? bodyInfo.sourceMessage : undefined,
      status: asFiniteStatus(record.status) ?? asFiniteStatus(record.statusCode) ?? asFiniteStatus(response?.status) ?? bodyInfo.status,
      code: typeof record.code === 'string' ? record.code : bodyInfo.code,
    };
  }

  const record = asRecord(error);
  if (!record) return {};

  const response = asRecord(record.response);
  const body = response?.data ?? record.data ?? error;
  const bodyInfo = bodyDetails(body);
  const nested = bodyDetails(record);
  return {
    message: response ? bodyInfo.message ?? nested.message : nested.message ?? bodyInfo.message,
    sourceMessage: response
      ? (bodyInfo.message ? bodyInfo.sourceMessage : nested.sourceMessage)
      : (nested.message ? nested.sourceMessage : bodyInfo.sourceMessage),
    status:
      asFiniteStatus(record.status) ??
      asFiniteStatus(record.statusCode) ??
      asFiniteStatus(response?.status) ??
      bodyInfo.status,
    code: nested.code ?? bodyInfo.code,
  };
}

function statusKind(status: number): ApiErrorKind {
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 409) return 'conflict';
  if (status === 413) return 'payloadTooLarge';
  if (status === 422) return 'validation';
  if (status === 429) return 'rateLimited';
  if (status === 502 || status === 503) return 'unavailable';
  if (status >= 500) return 'server';
  if (status === 400) return 'validation';
  return 'unknown';
}

function codeKind(code?: string): ApiErrorKind | undefined {
  return code ? CODE_KINDS[code.trim().toUpperCase()] : undefined;
}

function inferredStatusFromMessage(message?: string): number | undefined {
  if (!message) return undefined;
  const match =
    /\b(?:status(?:\s+code)?|http)\s*[:=]?\s*(\d{3})\b/i.exec(message) ??
    /\((\d{3})\)\s*$/.exec(message) ??
    /^\s*(\d{3})\s*[:\-]\s*/.exec(message);
  return match ? asFiniteStatus(match[1]) : undefined;
}

/**
 * Server messages are shown when they are readable and user-actionable.
 * Raw runtime, database, provider, stack and HTTP implementation text is not.
 */
export function safeUserMessage(message: unknown): string | undefined {
  const trimmed = asTrimmedString(message);
  if (!trimmed) return undefined;
  if (trimmed.length > 500) return undefined;
  if (GENERIC_AUTH_MESSAGE_RE.test(trimmed)) return undefined;
  if (GENERIC_SERVER_MESSAGES.has(normalizeServerMessage(trimmed))) return undefined;
  if (TECHNICAL_MESSAGE_RES.some((pattern) => pattern.test(trimmed))) return undefined;
  return trimmed;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'CanceledError') return true;
  const code = asRecord(error)?.code;
  return typeof code === 'string' && code.toUpperCase() === 'ERR_CANCELED';
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'TimeoutError') return true;
  const record = asRecord(error);
  const code = typeof record?.code === 'string' ? record.code.toUpperCase() : '';
  return code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ERR_TIMEOUT';
}

function isNetworkError(error: unknown, message?: string): boolean {
  if (error instanceof TypeError && message && NETWORK_MESSAGE_RE.test(message)) return true;
  const record = asRecord(error);
  if (record?.isAxiosError === true && !asFiniteStatus(record.status) && !asFiniteStatus(asRecord(record.response)?.status)) {
    return true;
  }
  const code = typeof record?.code === 'string' ? record.code.toUpperCase() : '';
  if (code === 'ERR_NETWORK' || code === 'ERR_CONNECTION_REFUSED' || code === 'ERR_CONNECTION_RESET') {
    return true;
  }
  // Message-only matches come from real runtime Errors. Server copy (plain
  // bodies, ApiRequestError.serverMessage, plain strings) has no transport
  // provenance and must keep its own kind.
  if (!(error instanceof Error) || error instanceof ApiRequestError) return false;
  return Boolean(message && NETWORK_MESSAGE_RE.test(message));
}

/**
 * Browser/transport failures (offline, DNS, CORS) reject `fetch` with a
 * runtime-generated TypeError such as "Failed to fetch" / "NetworkError…" /
 * "Load failed". Those are not backend `msg` values, so callers should show
 * their translated fallback instead of the raw runtime text.
 */
export function isTransportError(error: unknown): boolean {
  // A plain string has no transport provenance; it may be a backend/business
  // message that merely mentions a network word.
  if (typeof error === 'string') return false;
  const details = detailsFrom(error);
  return isNetworkError(error, details.sourceMessage ?? details.message);
}

export type ClassifiedApiError = {
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  /** Safe server copy, only present when it is suitable to show. */
  message?: string;
};

function isParserError(error: unknown, message?: string): boolean {
  if (error instanceof SyntaxError) return true;
  return Boolean(message && PARSER_MESSAGE_RES.some((pattern) => pattern.test(message)));
}

function authSubkind(kind: ApiErrorKind, message?: string): ApiErrorKind {
  if (kind !== 'auth' || !message) return kind;
  return SIGN_IN_REQUIRED_MESSAGES.has(normalizeServerMessage(message)) ? 'signInRequired' : kind;
}

function genericServerMessageKind(message?: string): ApiErrorKind | undefined {
  if (!message) return undefined;
  return GENERIC_SERVER_MESSAGE_KINDS.get(normalizeServerMessage(message));
}

export function classifyApiError(error: unknown): ClassifiedApiError {
  const details = detailsFrom(error);
  // Classify on the English source copy; show the (possibly localized) copy.
  const source = details.sourceMessage ?? details.message;
  const safeMessage = details.sourceMessage
    ? safeUserMessage(details.sourceMessage) && safeUserMessage(details.message)
    : safeUserMessage(details.message);
  const status = details.status ?? inferredStatusFromMessage(source);

  if (isAbortError(error)) return { kind: 'canceled', status, code: details.code };
  if (isTimeoutError(error) || (status === 408 || status === 504)) {
    return { kind: 'timeout', status, code: details.code };
  }

  // A truncated/empty/HTML body or an already-consumed stream is a malformed
  // response, not server copy and not a raw browser parser error.
  if (isParserError(error, source)) {
    return { kind: 'invalidResponse', status, code: details.code };
  }

  // The backend contract makes the HTTP status authoritative; the code is a
  // hint. A conflicting code must not turn a 5xx into business copy or a 413
  // into a plain validation failure.
  const byStatus = status ? statusKind(status) : undefined;
  const byCode = codeKind(details.code);

  if (byStatus && byStatus !== 'unknown') {
    return {
      kind: authSubkind(byStatus, source),
      status,
      code: details.code,
      message: safeMessage,
    };
  }

  if (byCode) {
    return {
      kind: authSubkind(byCode, source),
      status,
      code: details.code,
      message: safeMessage,
    };
  }

  if (isNetworkError(error, source)) {
    return { kind: 'network', status, code: details.code };
  }

  return {
    kind: details.kind ?? byStatus ?? genericServerMessageKind(source) ?? 'unknown',
    status,
    code: details.code,
    message: safeMessage,
  };
}

function messageForKind(
  kind: ApiErrorKind,
  safeMessage: string | undefined,
  fallback: string | undefined,
  messages: ErrorMessages | undefined,
): string {
  // These failures must never expose arbitrary server/runtime internals.
  if (
    kind === 'network' ||
    kind === 'timeout' ||
    kind === 'canceled' ||
    kind === 'signInRequired' ||
    kind === 'server' ||
    kind === 'unavailable' ||
    kind === 'invalidResponse'
  ) {
    return messages?.[kind] || DEFAULT_MESSAGES[kind];
  }

  if (safeMessage) {
    return safeMessage;
  }

  if (kind === 'validation' || kind === 'unknown') {
    return fallback || messages?.[kind] || DEFAULT_MESSAGES[kind];
  }

  return messages?.[kind] || DEFAULT_MESSAGES[kind];
}

/**
 * Single interpretation point for anything shown to a user:
 * `Error`/`TypeError`/Axios failures, API envelopes/strings/unknown values.
 *
 * Safe server validation and business-rule copy is preserved. Raw transport,
 * HTTP, stack, database and provider text falls back to a readable message
 * (localized by the caller when needed).
 */
export function getErrorMessage(
  error: unknown,
  fallback: string,
  messages?: ErrorMessages,
): string {
  const classified = classifyApiError(error);
  return messageForKind(classified.kind, classified.message, fallback, messages);
}

export function messageFromApiBody(body: unknown, fallback: string): string {
  return getErrorMessage(body, fallback);
}

/**
 * Builds a request error from an API envelope without ever treating the
 * caller's local fallback as server copy. The fallback is kept on `message`
 * for logging/legacy callers only; `getErrorMessage` uses the localized/
 * contextual copy unless the envelope carries safe specific detail.
 */
export function apiErrorFromBody(
  body: unknown,
  fallback: string,
  options: { status?: number; kind?: ApiErrorKind } = {},
): ApiRequestError {
  const details = bodyDetails(body);
  return new ApiRequestError(fallback, {
    kind: options.kind,
    status: options.status ?? details.status,
    code: details.code,
    serverMessage: details.message,
    serverMessageEn: details.sourceMessage,
  });
}

/**
 * XHR upload failures carry the server's actionable multer/validation body.
 * Parse it defensively: malformed/non-JSON responses keep the status so the
 * caller still gets a localized status-aware fallback.
 */
export function apiErrorFromUploadResponse(status: number, responseText: string): ApiRequestError {
  const text = typeof responseText === 'string' ? responseText.trim() : '';
  if (text) {
    try {
      return apiErrorFromBody(JSON.parse(text), 'The upload failed. Please try again.', { status });
    } catch {
      // Fall through to the status-only error below.
    }
  }
  return new ApiRequestError('The upload failed. Please try again.', { status });
}

export async function readJsonResponse<T = ApiErrorBody>(res: Response): Promise<T & ApiErrorBody> {
  const text = await res.text();
  if (!text.trim()) {
    return {} as T & ApiErrorBody;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ApiRequestError(DEFAULT_MESSAGES.invalidResponse, {
        kind: 'invalidResponse',
        status: res.status,
      });
    }
    return parsed as T & ApiErrorBody;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError(DEFAULT_MESSAGES.invalidResponse, {
      kind: 'invalidResponse',
      status: res.status,
    });
  }
}
