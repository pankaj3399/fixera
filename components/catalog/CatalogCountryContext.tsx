"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Content country the server used for this request's catalog lookup (category
 * layout redirects/404s). Client catalog fetches read it so both lookups agree,
 * instead of re-deriving a country from the browser language on a first visit.
 */
const CatalogCountryContext = createContext<string | null>(null);

/**
 * The live category (with its services) the server layout already resolved
 * for this request, so the category page renders its service list in the
 * server HTML (crawlable) instead of a loading skeleton.
 */
export interface InitialCatalogCategory {
  name: string;
  slug: string;
  services: Array<{ name: string; slug: string }>;
}
const InitialCatalogCategoryContext = createContext<InitialCatalogCategory | null>(null);

export function CatalogCountryProvider({
  country,
  initialCategory = null,
  children,
}: {
  country: string;
  initialCategory?: InitialCatalogCategory | null;
  children: ReactNode;
}) {
  return (
    <CatalogCountryContext.Provider value={country}>
      <InitialCatalogCategoryContext.Provider value={initialCategory}>{children}</InitialCatalogCategoryContext.Provider>
    </CatalogCountryContext.Provider>
  );
}

/** The server-selected content country, or null outside a provider. */
export function useCatalogCountry(): string | null {
  return useContext(CatalogCountryContext);
}

/** The server-resolved live category for this route, or null (outage fallback / outside a provider). */
export function useInitialCatalogCategory(): InitialCatalogCategory | null {
  return useContext(InitialCatalogCategoryContext);
}
