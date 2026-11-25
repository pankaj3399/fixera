"use client";

import { createContext, createElement, useCallback, useContext, useMemo, type ReactNode } from "react";
import {
  mergeContentTranslations,
  translateContentText,
  type ContentTextTranslator,
  type ContentTranslations,
} from "@/lib/contentTranslations";

const ContentTranslationsContext = createContext<ContentTranslations | undefined>(undefined);

export function ContentTranslationsProvider({
  value,
  children,
}: {
  value: ContentTranslations | null | undefined;
  children: ReactNode;
}) {
  // Nested providers (a card inside a page) add to the outer map.
  const outer = useContext(ContentTranslationsContext);
  const merged = useMemo(
    () => (outer ? mergeContentTranslations(outer, value ?? undefined) : value ?? undefined),
    [outer, value]
  );
  return createElement(ContentTranslationsContext.Provider, { value: merged }, children);
}

/**
 * `ct(text)` for the nearest provider; without a provider (or for text that
 * has no translation) the text is returned unchanged.
 */
export function useContentText(): ContentTextTranslator {
  const translations = useContext(ContentTranslationsContext);
  return useCallback(
    <T extends string | null | undefined>(value: T) => translateContentText(translations, value),
    [translations]
  ) as ContentTextTranslator;
}
