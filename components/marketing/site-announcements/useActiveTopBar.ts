"use client";

import type { SiteAnnouncement } from "@/lib/marketing/siteAnnouncements/types";
import { useAnnouncementsCtx, useSiteAnnouncementPreview } from "./context";

/** Active top bar: live announcement or admin preview override. */
export function useActiveTopBar(): {
  bar?: SiteAnnouncement;
  isPreview: boolean;
} {
  const { skip, topBar } = useAnnouncementsCtx();
  const { preview } = useSiteAnnouncementPreview();
  const previewBar = preview?.type === "top_bar" ? preview : undefined;
  const bar = previewBar ?? (!skip ? topBar : undefined);
  return { bar, isPreview: Boolean(previewBar) };
}
