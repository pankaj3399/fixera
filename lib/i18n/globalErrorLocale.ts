/**
 * Copy + locale resolution for app/global-error.tsx, which renders outside
 * the next-intl provider (the root layout itself failed).
 */
export const GLOBAL_ERROR_COPY = {
  en: {
    title: "Something went wrong",
    body: "The page could not be loaded. Please try again.",
    retry: "Try again",
    reference: "Reference",
  },
  nl: {
    title: "Er is iets misgegaan",
    body: "De pagina kon niet worden geladen. Probeer het opnieuw.",
    retry: "Opnieuw proberen",
    reference: "Referentie",
  },
  fr: {
    title: "Une erreur s'est produite",
    body: "La page n'a pas pu être chargée. Veuillez réessayer.",
    retry: "Réessayer",
    reference: "Référence",
  },
} as const;

export type GlobalErrorLocale = keyof typeof GLOBAL_ERROR_COPY;

export function resolveGlobalErrorLocale(input: {
  cookie?: string | null;
  pathname?: string | null;
  languages?: readonly string[] | null;
}): GlobalErrorLocale {
  const isLocale = (value: unknown): value is GlobalErrorLocale =>
    value === "en" || value === "nl" || value === "fr";
  const fromCookie = input.cookie?.match(/(?:^|;\s*)NEXT_LOCALE=([a-z]{2})/i)?.[1]?.toLowerCase();
  if (isLocale(fromCookie)) return fromCookie;
  const fromPath = input.pathname?.match(/^\/(en|nl|fr)(?:\/|$)/)?.[1];
  if (isLocale(fromPath)) return fromPath;
  for (const language of input.languages || []) {
    const base = language.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}

