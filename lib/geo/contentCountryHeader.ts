/**
 * Effective content country for server renders (CMS filtering, catalog).
 *
 * The middleware resolves the country (geo, or the admin default outside the
 * auto-conversion roll-out), always deletes any client-supplied value of this
 * first-party header and then sets it, so server code can trust it. Readers
 * fall back to the platform geo header for requests the middleware did not
 * rewrite. Relying on a first-party header avoids depending on whether the
 * hosting platform lets middleware override its own `x-vercel-*` headers.
 */
export const CONTENT_COUNTRY_REQUEST_HEADER = "x-fixera-content-country";
export const PLATFORM_COUNTRY_REQUEST_HEADER = "x-vercel-ip-country";

const toCountryCode = (value: string | null | undefined): string | undefined => {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : undefined;
};

export function readContentCountry(headers: { get(name: string): string | null }): string | undefined {
  return (
    toCountryCode(headers.get(CONTENT_COUNTRY_REQUEST_HEADER)) ??
    toCountryCode(headers.get(PLATFORM_COUNTRY_REQUEST_HEADER))
  );
}
