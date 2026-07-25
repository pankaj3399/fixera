"use client";

import Link from "next/link";
import {
  resolveAnnouncementHref,
  type SiteAnnouncement,
} from "@/lib/marketing/siteAnnouncements";

export function AnnouncementTopBar({
  announcement,
  isPreview = false,
  onCta,
}: {
  announcement: SiteAnnouncement;
  isPreview?: boolean;
  onCta: () => void;
}) {
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
        aria-label="Site promotion"
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
      aria-label={isPreview ? "Announcement preview" : "Site promotion"}
    >
      <div className="mx-auto flex h-9 max-w-7xl items-center justify-center px-3 sm:px-6">
        {content}
      </div>
    </div>
  );
}
