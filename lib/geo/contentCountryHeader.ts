/**
 * Country headers on server-side CMS/catalog requests to the backend.
 *
 * The middleware resolves the effective content country (geo, or the admin
 * default outside the auto-conversion roll-out) and carries it in the route
 * context (lib/routeContext.ts). Backend reads send it as the first-party
 * header, plus the platform geo header the backend filtered on historically (a
 * hosting edge in front of the backend may replace `x-vercel-ip-country`).
 * The middleware also reads the platform header for the visitor's geo country.
 */
export const CONTENT_COUNTRY_REQUEST_HEADER = "x-fixera-content-country";
export const PLATFORM_COUNTRY_REQUEST_HEADER = "x-vercel-ip-country";
