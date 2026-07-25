"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  resolveAnnouncementHref,
  type SiteAnnouncement,
} from "@/lib/marketing/siteAnnouncements";

export function PromoOverlay({
  announcement,
  onClose,
  onCta,
  testId,
  variant,
  isPreview = false,
}: {
  announcement: SiteAnnouncement;
  onClose: () => void;
  onCta: () => void;
  testId: string;
  variant: "offer" | "exit";
  isPreview?: boolean;
}) {
  const href = resolveAnnouncementHref(announcement);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canDismiss = announcement.dismissible || isPreview;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();

    const onCancel = (event: Event) => {
      if (!canDismiss) {
        event.preventDefault();
        return;
      }
      onClose();
    };

    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
    };
  }, [canDismiss, onClose]);

  const copyCode = async () => {
    if (!announcement.discountCode) return;
    try {
      await navigator.clipboard.writeText(announcement.discountCode);
      setCopied(true);
      toast.success("Code copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy code");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[70] m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-4 backdrop:bg-black/40 backdrop:backdrop-blur-[2px] open:flex open:items-center open:justify-center"
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
      onClick={(event) => {
        if (event.target === dialogRef.current && canDismiss) onClose();
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl ring-1 ring-black/5">
        {canDismiss ? (
          <button
            type="button"
            aria-label="Close"
            className="absolute right-3 top-3 z-10 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}

        <div className="border-b border-slate-100 bg-slate-50 px-6 pb-5 pt-6">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {variant === "exit" ? "Before you go" : "Limited offer"}
          </p>
          <h2
            id={`${testId}-title`}
            className="mt-1 pr-8 text-xl font-semibold leading-snug text-slate-900"
          >
            {announcement.title}
          </h2>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm leading-relaxed text-slate-600">{announcement.message}</p>

          {announcement.discountCode ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Promo code
                </p>
                <p className="font-mono text-base font-semibold text-slate-900">
                  {announcement.discountCode}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={copyCode}>
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            {canDismiss ? (
              <Button variant="ghost" size="sm" className="order-2 sm:order-1" onClick={onClose}>
                Maybe later
              </Button>
            ) : null}
            {href && !isPreview ? (
              <Button asChild size="sm" className="order-1 sm:order-2" onClick={onCta}>
                <Link href={href} className="gap-1.5">
                  {announcement.ctaLabel || "Claim offer"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : href ? (
              <Button size="sm" className="order-1 sm:order-2" type="button" tabIndex={-1}>
                {announcement.ctaLabel || "Claim offer"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </dialog>
  );
}
