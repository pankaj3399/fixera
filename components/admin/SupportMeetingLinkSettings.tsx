"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Link2, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useErrorMessage } from "@/lib/i18n/useErrorMessage";
import {
  adminGetSupportMeetingLinkSettings,
  adminUpdateSupportMeetingLinkSettings,
  type SupportMeetingLinkSettings as Settings,
} from "@/lib/support";
import { validateSupportMeetingLink } from "@/lib/support/validation";

/**
 * Support-write admins save one default meeting link (Zoom personal room,
 * Teams or any https URL). It is applied to meetings assigned to them on
 * submit; without it those meetings stay pending until a link is added.
 */
export default function SupportMeetingLinkSettings() {
  const t = useTranslations("support.adminMeetingLink");
  const getErrorText = useErrorMessage();
  const { canWriteSupport } = useAdminAccess();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canWriteSupport) return;
    const controller = new AbortController();
    setLoadFailed(false);
    adminGetSupportMeetingLinkSettings(controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setSettings(loaded);
        setDraft(loaded.meetingLink || "");
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, [canWriteSupport, reloadKey]);

  if (!canWriteSupport) return null;

  const persist = async (value: string) => {
    if (saving) return;
    const clearing = !value.trim();
    if (!clearing) {
      const problem = validateSupportMeetingLink(value);
      if (problem) {
        setFieldError(t(`errors.${problem}`));
        return;
      }
    }
    setFieldError(null);
    setSaving(true);
    try {
      const saved = await adminUpdateSupportMeetingLinkSettings(value);
      setSettings(saved);
      setDraft(saved.meetingLink || "");
      toast.success(clearing ? t("cleared") : t("saved"));
    } catch (error) {
      const message = getErrorText(error, t("saveFailed"));
      setFieldError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const hasLink = Boolean(settings?.meetingLink);
  const unchanged = draft.trim() === (settings?.meetingLink || "");

  return (
    <Card data-testid="support-meeting-link-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadFailed ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
          >
            <span>{t("loadFailed")}</span>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="rounded-md border border-rose-300 bg-white px-2 py-1 font-medium"
            >
              {t("retry")}
            </button>
          </div>
        ) : !settings ? (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {t("loading")}
          </p>
        ) : (
          <>
            {!hasLink && (
              <p
                role="status"
                data-testid="support-meeting-link-missing"
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{t("missingHint")}</span>
              </p>
            )}
            {!settings.receivesMeetings && (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                {t("notReceivingHint")}
              </p>
            )}
            {hasLink && settings.provider && (
              <p className="text-xs text-emerald-700">
                {t("current", { provider: t(`provider.${settings.provider}`) })}
              </p>
            )}
            <form
              className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void persist(draft);
              }}
            >
              <div className="grid gap-1">
                <Label htmlFor="support-default-meeting-link">{t("label")}</Label>
                <Input
                  id="support-default-meeting-link"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  value={draft}
                  maxLength={500}
                  placeholder={t("placeholder")}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? "support-default-meeting-link-error" : undefined}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setFieldError(null);
                  }}
                />
              </div>
              <Button type="submit" disabled={saving || !draft.trim() || unchanged}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                {saving ? t("saving") : t("save")}
              </Button>
              {hasLink && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void persist("")}
                >
                  {t("clear")}
                </Button>
              )}
            </form>
            {fieldError && (
              <p id="support-default-meeting-link-error" role="alert" className="text-xs text-rose-700">
                {fieldError}
              </p>
            )}
            <p className="text-[11px] text-slate-500">{t("overrideNote")}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Ticket display: marks a link that came from the assigned admin's default. */
export function SupportMeetingLinkSourceNote({
  linkSource,
}: {
  linkSource?: "admin_default" | "manual" | null;
}) {
  const t = useTranslations("support.adminMeetingLink");
  if (linkSource !== "admin_default") return null;
  return (
    <span
      data-testid="support-meeting-link-source"
      className="inline-flex w-fit items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700"
    >
      <Link2 className="h-3 w-3" aria-hidden />
      {t("ticketDefaultBadge")}
    </span>
  );
}
