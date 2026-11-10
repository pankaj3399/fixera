"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Content country the server used for this request's catalog lookup (category
 * layout redirects/404s). Client catalog fetches read it so both lookups agree,
 * instead of re-deriving a country from the browser language on a first visit.
 */
const CatalogCountryContext = createContext<string | null>(null);

export function CatalogCountryProvider({ country, children }: { country: string; children: ReactNode }) {
  return <CatalogCountryContext.Provider value={country}>{children}</CatalogCountryContext.Provider>;
}

/** The server-selected content country, or null outside a provider. */
export function useCatalogCountry(): string | null {
  return useContext(CatalogCountryContext);
}
