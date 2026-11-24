/**
 * Machine translations of catalogue / professional-written text (project and
 * subproject titles, descriptions, included items, options, RFQ and VAT
 * questions, ...), sent by the API next to the original values:
 *
 *   contentTranslations: { locale: "nl", texts: { "<source text>": "<nl text>" } }
 *
 * The API keeps every original value (the booking flow submits and matches
 * on them), so components show `ct(value)` but keep sending `value`.
 * Text without a stored translation (not translated yet, or already written
 * in the visitor's language) is shown as written.
 */
export interface ContentTranslations {
  locale: string;
  texts: Record<string, string>;
}

export type ContentTextTranslator = <T extends string | null | undefined>(value: T) => T | string;

function isContentTranslations(value: unknown): value is ContentTranslations {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as ContentTranslations).locale === "string" &&
    !!(value as ContentTranslations).texts &&
    typeof (value as ContentTranslations).texts === "object"
  );
}

/** Pure lookup: the translation of `value`, or `value` itself. */
export function translateContentText<T extends string | null | undefined>(
  translations: ContentTranslations | null | undefined,
  value: T
): T | string {
  if (typeof value !== "string" || !value || !isContentTranslations(translations)) return value;
  const direct = translations.texts[value];
  if (typeof direct === "string" && direct) return direct;
  const trimmed = value.trim();
  if (trimmed !== value) {
    const byTrimmed = translations.texts[trimmed];
    if (typeof byTrimmed === "string" && byTrimmed) return byTrimmed;
  }
  return value;
}

/** Merges several translation maps (e.g. search results + a refreshed page). */
export function mergeContentTranslations(
  ...maps: Array<ContentTranslations | null | undefined>
): ContentTranslations | undefined {
  const valid = maps.filter(isContentTranslations);
  if (valid.length === 0) return undefined;
  return {
    locale: valid[valid.length - 1].locale,
    texts: Object.assign({}, ...valid.map((map) => map.texts)),
  };
}

/**
 * Label for a free-text value: its translation when there is one, otherwise
 * the value through `format` (e.g. title-casing a legacy price model name).
 */
export function translatedLabel(
  ct: (value: string) => string,
  value: string,
  format: (value: string) => string = (v) => v
): string {
  const translated = ct(value);
  return translated !== value ? translated : format(value);
}
