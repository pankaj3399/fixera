"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  resolveAnnouncementHref,
} from "@/lib/marketing/siteAnnouncements/href";
import type { SiteAnnouncement } from "@/lib/marketing/siteAnnouncements/types";

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
  const canDismiss = announcement.dismissible || isPreview;

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
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && canDismiss) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        data-testid={testId}
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        onPointerDownOutside={(event) => {
          if (!canDismiss) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (!canDismiss) event.preventDefault();
        }}
      >
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

        <DialogHeader className="space-y-1 border-b border-slate-100 bg-slate-50 px-6 pb-5 pt-6 text-left">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {variant === "exit" ? "Before you go" : "Limited offer"}
          </p>
          <DialogTitle className="pr-8 text-xl font-semibold leading-snug text-slate-900">
            {announcement.title}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5">
          <DialogDescription className="text-sm leading-relaxed text-slate-600">
            {announcement.message}
          </DialogDescription>

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
      </DialogContent>
    </Dialog>
  );
}
