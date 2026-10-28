"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { resolveAnnouncementHref } from "@/lib/marketing/siteAnnouncements/href";
import type { SiteAnnouncement } from "@/lib/marketing/siteAnnouncements/types";

export function AnnouncementTopBar({
  announcement,
  isPreview = false,
  onCta,
}: {
  announcement: SiteAnnouncement;
  isPreview?: boolean;
  onCta: () => void;
}) {
  const t = useTranslations("content");
  const line = [announcement.title, announcement.message]
    .filter(Boolean)
    .join("  |  ")
    .toUpperCase();

  const content = (
    <p className="truncate text-center text-[11px] font-semibold tracking-wide sm:text-xs">
      {line}
      {announcement.discountCode ? (
        <>
          {"  |  "}
          <span className="font-mono">{announcement.discountCode}</span>
        </>
      ) : null}
    </p>
  );

  const href = resolveAnnouncementHref(announcement);
  const barClass = "w-full border-b border-black/10 bg-[#e24d3b] text-white";

  if (href && !isPreview) {
    return (
      <Link
        href={href}
        data-testid="site-announce-top-bar"
        className={`${barClass} block transition hover:bg-[#d64535]`}
        onClick={onCta}
      >
        <div className="mx-auto flex h-9 max-w-7xl items-center justify-center px-3 sm:px-6">
          {content}
        </div>
      </Link>
    );
  }

  return (
    <div
      data-testid="site-announce-top-bar"
      className={barClass}
      role="region"
      aria-label={isPreview ? t("announcements.previewAria") : t("announcements.promotionAria")}
    >
      <div className="mx-auto flex h-9 max-w-7xl items-center justify-center px-3 sm:px-6">
        {content}
      </div>
    </div>
  );
}
