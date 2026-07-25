import { SKIP_PATH_PREFIXES } from "./constants";

export function shouldSkipAnnouncements(pathname: string | null): boolean {
  if (!pathname) return false;
  return SKIP_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
