import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy professional support URL. Keep old bookmarks, emails and deep links
 * working while the shared support page serves customers and professionals.
 */
export default async function LegacyProfessionalSupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry));
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }
  query.set("tab", query.get("tab") || "ticket");
  redirect(`/support?${query.toString()}`);
}
