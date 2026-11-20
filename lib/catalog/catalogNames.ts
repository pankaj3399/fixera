import { useMemo } from "react";
import { useTranslations } from "next-intl";

/**
 * Same slug the backend derives for live catalog entries
 * (fixera-server src/utils/slug.ts `toSlug`), so a category or service is
 * found by its English name or by its slug.
 */
export function catalogNameSlug(input: string): string {
  return (input || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);
}

type Translator = ((key: string) => string) & { has?: (key: string) => boolean };

/**
 * Localized display name of a live catalog category/service (CA3-1). The
 * catalog stores English names; translations live in `nav.catalogNames`.
 * Unknown names (e.g. a service an admin added later) stay as recorded.
 * Only labels are translated: filter values and URLs keep the stored name.
 */
export function translateCatalogName(
  t: Translator,
  kind: "categories" | "services",
  value: string | null | undefined
): string {
  if (!value) return value ?? "";
  const slug = catalogNameSlug(value);
  if (!slug) return value;
  const key = `catalogNames.${kind}.${slug}`;
  try {
    if (typeof t.has === "function" ? t.has(key) : false) return t(key);
  } catch {
    // Missing message: fall back to the recorded name.
  }
  return value;
}

export function useCatalogNames() {
  const t = useTranslations("nav") as unknown as Translator;
  return useMemo(
    () => ({
      categoryName: (value: string | null | undefined) => translateCatalogName(t, "categories", value),
      serviceName: (value: string | null | undefined) => translateCatalogName(t, "services", value),
    }),
    [t]
  );
}
