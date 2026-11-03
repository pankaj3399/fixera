# i18n & currency (frontend)

Booking.com-style localization: the URL never changes, there is **no `/[locale]`
segment**. Language and display currency are resolved per request from the URL,
cookies, geo headers and `Accept-Language`.

Languages: `en` (default), `nl` (informal je/jij), `fr` (vous).
Country/currency audience: Belgium, Netherlands, France (+ any visitor, via geo).
Admin panel (`app/(pages)/admin/**`, `components/admin/**`) **stays English** —
never add translations there. Admin routes render `<html lang="en">` (set via
the middleware document-locale header and kept in sync on client navigation)
without changing `NEXT_LOCALE`, so returning to a public page restores the
visitor's chosen language.

## How the values are resolved

`middleware.ts` resolves both values and forwards them on request headers
(`x-fixera-locale`, `x-fixera-currency`) because cookies set on a response are
not visible to the server render of that same request.

First the middleware picks the **effective country** for the request (see
"Auto-conversion roll-out" below). It is the geo country (`?geo=XX` on
localhost/dev, else `x-vercel-ip-country`, else the `fixera_geo_country`
cookie) for roll-out countries, and the admin's default country for everyone
else.

Locale order:

1. `?lang=xx` (validated, also persists `NEXT_LOCALE` for 1 year)
2. `NEXT_LOCALE` cookie (manual choice, 1 year)
3. effective country: `NL→nl`, `FR/LU/MC→fr`, `BE→` top `Accept-Language` if
   it is nl/fr, else Wallonia/Brussels region header (only when the effective
   country is the detected one) → fr, else nl; `CH→` top `Accept-Language` fr,
   else en; everything else → `en`
4. `Accept-Language` (when there is no effective country)
5. `en`

Currency order: `NEXT_CURRENCY` → effective country (`lib/currency/countries.ts`) → `EUR`.

Manual choices (`?lang=`, `NEXT_LOCALE`, `NEXT_CURRENCY`) always win over the
roll-out.

### Auto-conversion roll-out

Super admin → Platform settings → Auto-conversion stores the roll-out
countries and a default country (`GET /api/public/auto-conversion` →
`{ success, data: { configured, enabledCountries, defaultCountry } }`).
`lib/i18n/autoConversionLoader.ts` caches it per edge isolate and
`resolveRequestCountry` (`lib/i18n/autoConversion.ts`) applies it:

| Config state | Effective country | Geo cookies |
| --- | --- | --- |
| `configured` (fresh, or last good answer during an outage) | geo country if it is a roll-out country, else the default country | written |
| `unconfigured` (`configured: false`, HTTP 404 = endpoint not deployed, or no `NEXT_PUBLIC_BACKEND_URL`) | geo country (auto-conversion everywhere) | written |
| `unknown` (cold isolate with timeout/5xx/network error/unusable body, and no earlier answer) | the previous decision from the `fixera_geo_country` cookie, else the platform fallback `BE`; the geo country is never granted on its own | **not** written |

Cache policy: a good answer is reused for 5 minutes; after a failure the last
answer (or `unknown`) is kept and retried after 60 seconds; fetch timeout 1.5 s,
3 s for an isolate's first fetch. An admin change therefore reaches visitors
within about 5 minutes.

The effective country reaches server renders on the first-party
`x-fixera-content-country` request header. The middleware deletes any
client-supplied value and then sets it; `lib/geo/contentCountryHeader.ts`
(`readContentCountry`) reads it first and falls back to `x-vercel-ip-country`.
The middleware still also overrides `x-vercel-ip-country` for older readers, but
no reader relies on the host forwarding that override. CMS reads send both
headers to the backend, which currently filters by `x-vercel-ip-country`.

`Accept-Language` parsing (`i18n/localeResolution.ts`) ignores `q=0` entries,
clamps numeric out-of-range weights into `0…1`, ignores malformed qvalues and
keeps header order for equal weights.

The header picker always writes `NEXT_LOCALE` for a manual choice — even when
it equals the currently auto-detected locale. If the current URL has `?lang=`,
selecting a language first removes that parameter (preserving every other
query param and the hash) and reloads the cleaned URL, otherwise the stale URL
value would keep overriding the cookie (and a soft update could keep the old
root layout's language). When the geo country is Belgium, the picker shows the
Belgian flag for Dutch and French; geo cookies are read after mount so SSR and
hydration markup cannot disagree.

Middleware also keeps the legacy geo cookies for their existing consumers
(site announcements, the category page, the switcher's suggestions):
`fixera_geo_country` (the **effective** country — the admin default for
visitors outside the roll-out, not necessarily their geo country),
`fixera_geo_locale` (always `en|nl|fr`, derived from the effective country)
and `geo_currency`. They are rewritten only from an authoritative config state
(see the table above).

Server code reads the resolved values with `getLocale()` (next-intl) or
`getActiveCurrency()` (`lib/currency/server.ts`).

## Messages: one file per namespace

```
messages/<locale>/<namespace>.json     # content is NOT wrapped in the namespace
i18n/namespaces.ts                     # the list of namespaces
i18n/request.ts                        # merges them as { [namespace]: json }
i18n/global.d.ts                       # next-intl AppConfig typing (from en files)
scripts/check-i18n.mjs                 # npm run i18n:check
```

Adding a namespace:

1. Add the name to `i18n/namespaces.ts`.
2. Create `messages/en/<namespace>.json`, `nl/...`, `fr/...` with identical keys.
3. Add the import + entry in `i18n/global.d.ts` (so `tsc` validates keys).
4. `npm run i18n:check`.

`npm run i18n:check` fails when a namespace file is missing, when nl/fr keys
differ from en, when ICU placeholders (`{name}`) differ, or when
`i18n/global.d.ts` was not updated.

## Translating a component

Server component:

```tsx
import { getTranslations } from "next-intl/server";

export default async function Hero() {
  const t = await getTranslations("nav");
  return <h1>{t("forProfessionals")}</h1>;
}
```

Client component:

```tsx
"use client";
import { useTranslations } from "next-intl";

export function Menu() {
  const t = useTranslations("nav");
  return <button>{t("openMenu")}</button>;
}
```

`NextIntlClientProvider` is wired in `app/layout.tsx`, so client components just
work. Use `t("key", { count })` for ICU plurals; never concatenate translated
sentences. Keep brand names ("Fixtract"), external brand names and admin-only UI
untranslated.

Shared UI defaults translate through the `common` namespace on public pages:
the close button of `DialogContent`, the multi-select placeholder/search/count/
empty-result labels and the site-wide fallback description
(`common.meta.siteDescription`). Explicit labels passed by a caller always win;
admin routes continue to render English defaults even when the visitor's
cookie is nl/fr. Admin can also pass `closeLabel` to `DialogContent`.

## Metadata

`buildMetadata()` and the root layout derive OpenGraph `locale`/`alternateLocale`
and the fallback description from the active request locale (`en_US`,
`nl_BE`, `fr_BE`). Canonical URLs stay locale-free because language is a
preference, not a route segment. `buildMetadata()` is async and is called from
`generateMetadata()` functions; `noindexMetadata()` stays synchronous so admin
and other static `metadata` exports keep working.

## Prices

All DB prices are EUR. Conversion is **display only**; payments, checkout,
invoices and emails are always charged in EUR.

Client components (inside `CurrencyProvider`, i.e. the whole app tree):

```tsx
"use client";
import { useCurrency } from "@/contexts/CurrencyContext";

export function Price({ amount }: { amount: number }) {
  const { formatPrice, currency, convertFromEur } = useCurrency();
  return (
    <p>
      {formatPrice(amount)}            {/* converted + localized, EUR fallback */}
      <span className="sr-only">{currency}</span>
    </p>
  );
}
```

`useCurrency()` returns:

| Field | Type | Notes |
| --- | --- | --- |
| `currency` | `CurrencyCode` | active display currency |
| `setCurrency(code)` | `(code: string) => void` | sets `NEXT_CURRENCY` for 1 year + updates instantly |
| `rates` | `Record<string, number> \| null` | EUR-based rates from the backend |
| `convertFromEur(amount)` | `(amount: number) => number` | returns the EUR amount when the rate is missing |
| `formatPrice(eurAmount, opts?)` | `(number, { charge?: boolean }) => string` | formats with the active locale (`nl-BE`, `fr-BE`, `en-GB`); `{ charge: true }` always returns EUR |

Server components / non-React code use the pure helpers (pass the rates):

```ts
import { formatPrice, convertFromEur } from "@/lib/currency/convert";

formatPrice(100, { locale: "nl-BE", currency: "USD", rates });     // "$ 108,00"
formatPrice(100, { locale: "nl-BE", currency: "USD", rates, charge: true }); // "€ 100,00"
```

Rates come from `GET <backend>/api/public/exchange-rates` (ECB reference rates,
cached for an hour server-side and refreshed in the background client-side).
Missing rates never produce a wrong number: the EUR amount is formatted instead.

## Self-check

`node scripts/check-i18n-currency.mjs` runs focused assertions against the real
TypeScript helpers (Node's built-in type stripping; run it with the repo's Node
24 toolchain): Accept-Language q-value handling, Belgian locale resolution,
language-picker URL cleanup, and the currency formatters' EUR fallbacks /
no-conversion rules for charged amounts. It is a small guard, not a test
framework.

## CMS content

`lib/cms/public.ts` passes the active locale to the public CMS endpoints
(`?locale=en|nl|fr`); the backend falls back to English when a translation is
missing. The locale is part of the fetch URL, i.e. part of Next's cache key.
Revalidation tags stay locale-agnostic so a single admin save flushes all
locales (`app/api/cms/revalidate`).

The admin CMS stays English and supports exactly `en`, `nl`, `fr`. Saving an
original returns `{ success, data, translations }`; `lib/cms.ts` parses the
whole envelope (`adminCreateCmsWithTranslations` /
`adminUpdateCmsWithTranslations`) while the older `adminCreateCms` /
`adminUpdateCms` still return just the saved document. Translation results are
typed per locale: `created`, `updated`, `synced`, `skipped_manual`, `failed`,
`disabled` (Azure key missing). The editor keeps content-save success separate
from translation failures and never reloads the form after a retry, so unsaved
edits survive.

`POST /api/admin/cms/:id/translate` with `{ force: boolean }` returns
`{ success, translations }` (no `data`). Normal retries use `force: false` and
keep manual translations; overwriting manual text requires `force: true` and an
explicit confirmation dialog. Retries revalidate the public CMS cache. The list
shows the locale and auto-translated/manual badge, filters by language, and
scopes reserved policy/landing slots to their English source documents. "View
live" appends `?lang=<document locale>` so the preview always opens in that
document's language.
