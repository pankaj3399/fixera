"use client";

import { createContext, useContext } from "react";
import type { SiteAnnouncement } from "@/lib/marketing/siteAnnouncements/types";

export type AnnouncementsCtx = {
  skip: boolean;
  topBar?: SiteAnnouncement;
  modal?: SiteAnnouncement;
  exitIntent?: SiteAnnouncement;
  hide: (announcement: SiteAnnouncement) => void;
  onCta: (announcement: SiteAnnouncement) => void;
};

export type PreviewCtx = {
  preview: SiteAnnouncement | null;
  startPreview: (announcement: SiteAnnouncement) => void;
  clearPreview: () => void;
};

export const AnnouncementsContext = createContext<AnnouncementsCtx | null>(null);
export const PreviewContext = createContext<PreviewCtx | null>(null);

export function useAnnouncementsCtx(): AnnouncementsCtx {
  const ctx = useContext(AnnouncementsContext);
  if (!ctx) throw new Error("SiteAnnouncementsProvider required");
  return ctx;
}

export function useSiteAnnouncementPreview(): PreviewCtx {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("SiteAnnouncementsProvider required");
  return ctx;
}
