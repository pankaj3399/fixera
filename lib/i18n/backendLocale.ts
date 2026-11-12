/**
 * Sends the active UI language to the Fixtract API as `Accept-Language`, so
 * the API returns its validation/business messages in that language (en, nl,
 * fr). The language is read from `<html lang>` at request time: it follows the
 * visitor's locale on public pages and is "en" on the English-only admin pages
 * (see DocumentLanguageSync).
 *
 * Installed once in the browser by patching `fetch` and `XMLHttpRequest` for
 * requests to the API origin only; an explicit `Accept-Language` set by the
 * caller always wins. `Accept-Language` is a CORS-safelisted header, so this
 * adds no preflight requests.
 */

export const BACKEND_MESSAGE_LOCALES = ["en", "nl", "fr"] as const;
export type BackendMessageLocale = (typeof BACKEND_MESSAGE_LOCALES)[number];

export function normalizeBackendLocale(value: unknown): BackendMessageLocale {
  const base = typeof value === "string" ? value.trim().toLowerCase().split("-")[0] : "";
  return (BACKEND_MESSAGE_LOCALES as readonly string[]).includes(base)
    ? (base as BackendMessageLocale)
    : "en";
}

function originOf(url: string | URL | undefined | null, base?: string): string | null {
  if (!url) return null;
  try {
    return new URL(String(url), base).origin;
  } catch {
    return null;
  }
}

/** True when `requestUrl` targets the configured API origin. */
export function isBackendRequest(
  requestUrl: string | URL | undefined | null,
  backendUrl: string | undefined | null,
  pageUrl?: string,
): boolean {
  const backendOrigin = originOf(backendUrl ?? undefined);
  if (!backendOrigin) return false;
  return originOf(requestUrl, pageUrl) === backendOrigin;
}

type FetchInput = Parameters<typeof fetch>[0];

function requestUrlOf(input: FetchInput): string | undefined {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === "object" && "url" in input) return (input as Request).url;
  return undefined;
}

/**
 * Returns fetch arguments with `Accept-Language` added for API requests that
 * do not set it themselves. Pure, so it can be unit-tested.
 */
export function withBackendLocale(
  input: FetchInput,
  init: RequestInit | undefined,
  options: { backendUrl?: string | null; locale: BackendMessageLocale; pageUrl?: string },
): [FetchInput, RequestInit | undefined] {
  if (!isBackendRequest(requestUrlOf(input), options.backendUrl, options.pageUrl)) return [input, init];
  const headers = new Headers(
    init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined),
  );
  if (headers.has("accept-language")) return [input, init];
  headers.set("Accept-Language", options.locale);
  return [input, { ...(init || {}), headers }];
}

type PatchedWindow = Window & typeof globalThis & { __fixeraBackendLocaleInstalled?: boolean };
type TrackedXhr = XMLHttpRequest & { __fixeraUrl?: string; __fixeraHasLanguage?: boolean };

export function currentDocumentLocale(): BackendMessageLocale {
  if (typeof document === "undefined") return "en";
  return normalizeBackendLocale(document.documentElement.lang);
}

/** Idempotent; a no-op outside the browser or without an API URL. */
export function installBackendLocaleHeader(
  backendUrl: string | undefined = process.env.NEXT_PUBLIC_BACKEND_URL,
  getLocale: () => BackendMessageLocale = currentDocumentLocale,
): void {
  if (typeof window === "undefined" || !backendUrl) return;
  const win = window as PatchedWindow;
  if (win.__fixeraBackendLocaleInstalled) return;
  win.__fixeraBackendLocaleInstalled = true;

  if (typeof win.fetch === "function") {
    const originalFetch = win.fetch.bind(win);
    win.fetch = ((input: FetchInput, init?: RequestInit) => {
      let args: [FetchInput, RequestInit | undefined] = [input, init];
      try {
        args = withBackendLocale(input, init, {
          backendUrl,
          locale: getLocale(),
          pageUrl: win.location?.href,
        });
      } catch {
        // Never block a request because of the language hint.
      }
      return originalFetch(args[0], args[1]);
    }) as typeof fetch;
  }

  const Xhr = win.XMLHttpRequest;
  if (typeof Xhr === "function") {
    const proto = Xhr.prototype as TrackedXhr;
    const originalOpen = proto.open;
    const originalSetHeader = proto.setRequestHeader;
    const originalSend = proto.send;
    proto.open = function open(this: TrackedXhr, ...args: unknown[]) {
      this.__fixeraUrl = String(args[1] ?? "");
      this.__fixeraHasLanguage = false;
      return (originalOpen as (...a: unknown[]) => void).apply(this, args);
    } as XMLHttpRequest["open"];
    proto.setRequestHeader = function setRequestHeader(this: TrackedXhr, name: string, value: string) {
      if (String(name).toLowerCase() === "accept-language") this.__fixeraHasLanguage = true;
      return originalSetHeader.call(this, name, value);
    };
    proto.send = function send(this: TrackedXhr, body?: Document | XMLHttpRequestBodyInit | null) {
      try {
        if (!this.__fixeraHasLanguage && isBackendRequest(this.__fixeraUrl, backendUrl, win.location?.href)) {
          originalSetHeader.call(this, "Accept-Language", getLocale());
        }
      } catch {
        // Ignore: the request is sent without the hint.
      }
      return originalSend.call(this, body);
    };
  }
}
