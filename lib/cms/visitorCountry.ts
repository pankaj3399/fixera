import { cookies } from "next/headers";
import { GEO_COUNTRY_COOKIE } from "@/lib/marketing/siteAnnouncements/constants";

export function parseVisitorCountryCode(value: string | undefined | null): string | undefined {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : undefined;
}

/** Read the visitor country cookie set by middleware (Vercel geo / dev override). */
export async function getVisitorCountryCode(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return parseVisitorCountryCode(cookieStore.get(GEO_COUNTRY_COOKIE)?.value);
}
