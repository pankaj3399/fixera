/**
 * Label of a stored checkout VAT line. Quote checkouts recorded before the
 * F1-8 fix named a selected option by its raw id ("6b000132…"); show the
 * project's option name instead. Any other description is returned as is.
 */
export function vatLineLabel(
  description: string | null | undefined,
  extraOptions: Array<{ _id?: string | null; name?: string | null }> | null | undefined,
): string {
  const text = String(description ?? "")
  if (!/^[0-9a-f]{24}$/i.test(text)) return text
  const option = (extraOptions || []).find((entry) => String(entry?._id ?? "") === text)
  return option?.name ? String(option.name) : text
}
