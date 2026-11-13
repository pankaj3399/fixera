"use client";

import { GLOBAL_ERROR_COPY, resolveGlobalErrorLocale, type GlobalErrorLocale } from "@/lib/i18n/globalErrorLocale";

/**
 * Last-resort fallback when the root layout itself fails. Kept dependency-free
 * because the i18n provider is not available at this level: the copy comes
 * from a tiny inline en/nl/fr map, picked from the visitor's locale cookie,
 * the URL prefix, then the browser language.
 */
function currentLocale(): GlobalErrorLocale {
  if (typeof window === "undefined") return "en";
  return resolveGlobalErrorLocale({
    cookie: document.cookie,
    pathname: window.location.pathname,
    languages: navigator.languages,
  });
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = currentLocale();
  const copy = GLOBAL_ERROR_COPY[locale];
  return (
    <html lang={locale}>
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "#f8fafc",
            color: "#111827",
          }}
        >
          <div
            style={{
              maxWidth: "420px",
              width: "100%",
              padding: "24px",
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              background: "#ffffff",
              textAlign: "center",
            }}
          >
            <h1 style={{ fontSize: "18px", margin: 0 }}>{copy.title}</h1>
            <p style={{ fontSize: "14px", color: "#4b5563", marginTop: "8px" }}>
              {copy.body}
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: "20px",
                padding: "10px 18px",
                borderRadius: "10px",
                border: "none",
                background: "#4032f7",
                color: "#ffffff",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              {copy.retry}
            </button>
            {error.digest ? (
              <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: "16px" }}>
                {copy.reference}: {error.digest}
              </p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  );
}
