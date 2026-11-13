/**
 * "Auto-translate" for email campaign drafts: fills the other draft
 * languages from the source language via the backend translator. Nothing is
 * saved or sent; the admin reviews the filled fields and saves as usual.
 */
import { authFetch } from "@/lib/utils";
import { ApiRequestError, apiErrorFromBody } from "@/lib/apiErrors";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export interface CampaignLocaleContent {
  subject: string;
  htmlContent: string;
  previewText?: string;
  brevoTemplateId?: number;
}

export type CampaignTranslationOutcome =
  | { locale: string; status: "translated"; content: { subject: string; htmlContent: string; previewText?: string } }
  | { locale: string; status: "failed"; errorCode?: string; error?: string };

/** Draft languages to fill: every selected locale except the source. */
export function campaignAutoTranslateTargets(locales: readonly string[], sourceLocale: string): string[] {
  return Array.from(new Set(locales)).filter((locale) => locale !== sourceLocale);
}

export function hasTranslatableSource(content: CampaignLocaleContent | undefined): boolean {
  if (!content || content.brevoTemplateId) return false;
  return Boolean(content.subject.trim()) && Boolean(content.htmlContent.replace(/<[^>]*>/g, "").trim());
}

/** Targets that already have text the auto-translation would replace. */
export function targetsWithExistingContent(
  content: Record<string, CampaignLocaleContent | undefined>,
  targets: readonly string[],
): string[] {
  return targets.filter((locale) => {
    const block = content[locale];
    if (!block) return false;
    return Boolean(block.subject.trim()) || Boolean(block.htmlContent.replace(/<[^>]*>/g, "").trim());
  });
}

/** Applies translated outcomes onto the draft; failed locales keep their current content. */
export function mergeCampaignTranslations(
  content: Record<string, CampaignLocaleContent>,
  outcomes: readonly CampaignTranslationOutcome[],
): Record<string, CampaignLocaleContent> {
  const next = { ...content };
  for (const outcome of outcomes) {
    if (outcome.status !== "translated") continue;
    next[outcome.locale] = {
      subject: outcome.content.subject,
      htmlContent: outcome.content.htmlContent,
      ...(outcome.content.previewText ? { previewText: outcome.content.previewText } : {}),
      // Inline HTML now; a per-language Brevo template no longer applies.
      brevoTemplateId: undefined,
    };
  }
  return next;
}

export function parseCampaignTranslationOutcomes(value: unknown): CampaignTranslationOutcome[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): CampaignTranslationOutcome[] => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    if (typeof e.locale !== "string") return [];
    const c = e.content as Record<string, unknown> | undefined;
    if (e.status === "translated" && c && typeof c.subject === "string" && typeof c.htmlContent === "string") {
      return [
        {
          locale: e.locale,
          status: "translated",
          content: {
            subject: c.subject,
            htmlContent: c.htmlContent,
            ...(typeof c.previewText === "string" && c.previewText ? { previewText: c.previewText } : {}),
          },
        },
      ];
    }
    return [
      {
        locale: e.locale,
        status: "failed",
        ...(typeof e.errorCode === "string" ? { errorCode: e.errorCode } : {}),
        ...(typeof e.error === "string" ? { error: e.error } : {}),
      },
    ];
  });
}

export async function requestCampaignAutoTranslate(input: {
  sourceLocale: string;
  targetLocales: string[];
  content: CampaignLocaleContent;
}): Promise<CampaignTranslationOutcome[]> {
  const res = await authFetch(`${API_BASE}/api/admin/marketing-campaigns/auto-translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
      content: {
        subject: input.content.subject,
        htmlContent: input.content.htmlContent,
        ...(input.content.previewText ? { previewText: input.content.previewText } : {}),
      },
    }),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiRequestError("The server returned an unexpected response. Please try again.", {
      kind: "invalidResponse",
      status: res.status,
    });
  }
  const body = json as { success?: unknown; data?: { translations?: unknown } } | null;
  if (!res.ok || !body?.success) {
    throw apiErrorFromBody(body, "Auto-translation failed", { status: res.status });
  }
  return parseCampaignTranslationOutcomes(body.data?.translations);
}
