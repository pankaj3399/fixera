"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileText,
  Languages,
  Loader2,
  RefreshCw,
  Save,
  Send,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  adminCreateCmsWithTranslations,
  adminDeleteCms,
  adminGetCms,
  adminListCmsServiceOptions,
  adminListFaqCategories,
  adminTranslateCms,
  adminUpdateCmsWithTranslations,
  CmsContent,
  CmsContentStatus,
  CmsContentType,
  CmsServiceOption,
  CmsTranslationResult,
  CmsTranslationStatus,
  CmsUpsertPayload,
  CMS_CONTENT_LOCALE_LABELS,
  CMS_CONTENT_LOCALES,
  CMS_TYPE_LABELS,
  CMS_TYPE_ORDER,
  FaqCategory,
  getPublicPathForCms,
  getPublicSlugPrefixForCms,
  normalizeCmsContentLocale,
  normalizeCmsTranslationResults,
  persistableCmsHtml,
  persistableCmsMediaUrl,
  slugify,
  withCmsLangParam,
} from "@/lib/cms";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import dynamic from "next/dynamic";
import CoverImageUpload from "./CoverImageUpload";
import SeoPanel from "./SeoPanel";
import RelatedContentPicker, { relatedItemsFromCms } from "./RelatedContentPicker";
import { EU_COUNTRIES } from "@/lib/countries";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { Label } from "@/components/ui/label";

const RichTextEditor = dynamic(() => import("./RichTextEditor"), {
  ssr: false,
  loading: () => <div className="min-h-80 animate-pulse rounded-xl border bg-muted/30" />,
});

interface Props {
  mode: "create" | "edit";
  initial?: CmsContent;
  lockedType?: CmsContentType;
  initialSlug?: string;
  initialTitle?: string;
}

const COVER_RECOMMENDATIONS: Partial<Record<CmsContentType, string>> = {
  blog: "Recommended: 1600 × 900 px (16:9) — used on cards and the article hero",
  news: "Recommended: 1600 × 900 px (16:9) — used on cards and the article hero",
  landing: "Recommended: 1600 × 700 px (16:7) — full-width page hero",
  policy: "Recommended: 1600 × 700 px (16:7) — page hero (optional)",
};
const DEFAULT_COVER_RECOMMENDATION = "Recommended: 1600 × 900 px (16:9)";

const CMS_COUNTRY_OPTIONS = EU_COUNTRIES.map((country) => ({
  value: country.code,
  label: `${country.name} (${country.code})`,
}));

const EMPTY: Partial<CmsContent> = {
  type: "blog",
  title: "",
  slug: "",
  locale: "en",
  body: "",
  excerpt: "",
  coverImage: "",
  coverImageAlt: "",
  category: "",
  tags: [],
  authorOverride: "",
  status: "draft",
  seo: {},
  relatedServiceSlug: "",
  activeCountries: [],
};

const TRANSLATION_STATUS_LABELS: Record<CmsTranslationStatus, string> = {
  created: "Created",
  updated: "Updated",
  synced: "Up to date",
  skipped_manual: "Manual kept",
  failed: "Failed",
  disabled: "Azure not configured",
};

const TRANSLATION_STASH_PREFIX = "fixera:cms:translation-results:";

function stashTranslationResults(id: string, results: CmsTranslationResult[]) {
  if (!results.length || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${TRANSLATION_STASH_PREFIX}${id}`,
      JSON.stringify(results)
    );
  } catch {
    // Session storage can be unavailable (private mode); the inline panel still works.
  }
}

function readStashedTranslationResults(id: string): CmsTranslationResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(`${TRANSLATION_STASH_PREFIX}${id}`);
    if (!raw) return [];
    window.sessionStorage.removeItem(`${TRANSLATION_STASH_PREFIX}${id}`);
    return normalizeCmsTranslationResults(JSON.parse(raw));
  } catch {
    return [];
  }
}

function translationTone(status: CmsTranslationStatus): string {
  switch (status) {
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "disabled":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "skipped_manual":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

export default function CmsContentForm({ mode, initial, lockedType, initialSlug, initialTitle }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<Partial<CmsContent>>(() => {
    if (initial) {
      return {
        ...initial,
        tags: Array.isArray(initial.tags) ? initial.tags : [],
        seo: initial.seo || {},
        coverImageAlt: initial.coverImageAlt || "",
        activeCountries: Array.isArray(initial.activeCountries) ? initial.activeCountries : [],
      };
    }
    return {
      ...EMPTY,
      type: lockedType || "blog",
      slug: initialSlug || "",
      title: initialTitle || "",
    };
  });
  const [slugTouched, setSlugTouched] = useState(mode === "edit" || Boolean(initialSlug));
  const [tagInput, setTagInput] = useState("");
  const [faqCategories, setFaqCategories] = useState<FaqCategory[]>([]);
  const [faqCategoriesError, setFaqCategoriesError] = useState<string | null>(null);
  const [serviceOptions, setServiceOptions] = useState<CmsServiceOption[]>([]);
  const [serviceOptionsError, setServiceOptionsError] = useState<string | null>(null);
  const [relatedItems, setRelatedItems] = useState(() => relatedItemsFromCms(initial?.relatedContent));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showForceTranslateConfirm, setShowForceTranslateConfirm] = useState(false);
  const [translationResults, setTranslationResults] = useState<CmsTranslationResult[]>([]);
  const [translationSource, setTranslationSource] = useState<"save" | "retranslate" | null>(null);
  /** Results describe the last saved content; editing makes them potentially stale. */
  const [translationsStale, setTranslationsStale] = useState(false);
  /** Monotonic form revision, so a retry/save finishing late can't claim fresh state. */
  const formRevision = useRef(0);
  const savedRevision = useRef(0);
  const actionLock = useRef<"save" | "delete" | "translate" | null>(null);
  const busy = saving || deleting || translating;

  // A create redirects to the edit page; carry the per-locale save results
  // across that navigation so they are not silently lost.
  useEffect(() => {
    if (!initial?._id) return;
    const results = readStashedTranslationResults(initial._id);
    if (!results.length) return;
    setTranslationResults(results);
    setTranslationSource("save");
    setTranslationsStale(false);
  }, [initial?._id]);

  useEffect(() => {
    const stubs = relatedItems.filter((item) => !item.slug);
    if (stubs.length === 0) return;
    let cancelled = false;
    Promise.all(stubs.map((s) => adminGetCms(s._id).catch(() => null))).then((docs) => {
      if (cancelled) return;
      setRelatedItems((prev) =>
        prev.map((item) => {
          if (item.slug) return item;
          const doc = docs.find((d) => d && d._id === item._id);
          if (!doc || (doc.type !== "blog" && doc.type !== "news")) return item;
          return { _id: doc._id, title: doc.title, slug: doc.slug, type: doc.type };
        })
      );
    });
    return () => {
      cancelled = true;
    };
    // Hydrate stubs once after mount / when initial related content is unpopulated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?._id]);

  useEffect(() => {
    adminListFaqCategories()
      .then((cats) => {
        setFaqCategories(cats);
        setFaqCategoriesError(null);
      })
      .catch((err: unknown) => {
        setFaqCategories([]);
        setFaqCategoriesError(err instanceof Error ? err.message : "Failed to load FAQ categories");
      });
  }, []);

  useEffect(() => {
    adminListCmsServiceOptions()
      .then((opts) => {
        setServiceOptions(opts);
        setServiceOptionsError(null);
      })
      .catch((err: unknown) => {
        setServiceOptions([]);
        setServiceOptionsError(err instanceof Error ? err.message : "Failed to load service options");
      });
  }, []);

  useEffect(() => {
    if (!slugTouched && form.title) {
      setForm((f) => {
        const generated = slugify(f.title || "");
        const next = generated.trim() ? generated : `untitled-${Date.now().toString(36)}`;
        return { ...f, slug: next };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title]);

  const type = form.type as CmsContentType;
  const requiresCover = type === "blog" || type === "news";
  const hasTags = type === "blog" || type === "news";
  const isFaq = type === "faq";
  const supportsCountryTargeting = hasTags || isFaq;
  const slugPrefix = getPublicSlugPrefixForCms(type);
  const publicPreviewPath = form.slug ? getPublicPathForCms(type, form.slug) : null;
  const publicPreviewHref = publicPreviewPath
    ? withCmsLangParam(publicPreviewPath, normalizeCmsContentLocale(form.locale))
    : null;
  const formLocale = normalizeCmsContentLocale(form.locale);
  const isMachineTranslation = form.autoTranslated === true;
  const isManualTranslation = !isMachineTranslation && Boolean(form.translatedFrom);
  const coverRecommendation = COVER_RECOMMENDATIONS[type] ?? DEFAULT_COVER_RECOMMENDATION;

  const markFormChanged = () => {
    formRevision.current += 1;
    setTranslationsStale(true);
  };

  const update = (patch: Partial<CmsContent>) => {
    setForm((f) => ({ ...f, ...patch }));
    markFormChanged();
  };

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    const current = form.tags || [];
    if (current.includes(t) || current.length >= 20) return;
    update({ tags: [...current, t].slice(0, 20) });
  };

  const removeTag = (t: string) => update({ tags: (form.tags || []).filter((x) => x !== t) });

  const canSubmit = useMemo(() => {
    if (!form.title?.trim()) return false;
    if (!form.slug?.trim()) return false;
    if (requiresCover && !form.coverImage) return false;
    if (isFaq && faqCategoriesError) return false;
    if (isFaq && !form.category) return false;
    return true;
  }, [form, requiresCover, isFaq, faqCategoriesError]);

  const announceTranslationOutcome = (results: CmsTranslationResult[]) => {
    if (!results.length) return;
    const failed = results.filter((result) => result.status === "failed");
    if (failed.length > 0) {
      const locales = failed
        .map((result) => (result.locale === "*" ? "all locales" : result.locale.toUpperCase()))
        .join(", ");
      toast.warning(`Content saved, but translation failed for ${locales}. See Translations.`);
      return;
    }
    if (results.every((result) => result.status === "disabled")) {
      toast.info("Content saved. Azure Translator is not configured, so translations were skipped.");
    }
  };

  const save = async (status: CmsContentStatus) => {
    if (actionLock.current) return;
    if (!canSubmit) {
      toast.error("Please fill the required fields");
      return;
    }
    actionLock.current = "save";
    setSaving(true);
    const revisionAtSaveStart = formRevision.current;
    try {
      const payload: CmsUpsertPayload = {
        type: form.type,
        title: form.title?.trim(),
        slug: slugify(form.slug || ""),
        locale: formLocale,
        body: persistableCmsHtml(form.body || ""),
        excerpt: form.excerpt || "",
        coverImage: persistableCmsMediaUrl(form.coverImage) ?? (mode === "edit" ? "" : undefined),
        coverImageAlt:
          mode === "edit"
            ? (form.coverImageAlt || "").trim() || null
            : (form.coverImageAlt || "").trim() || undefined,
        category: isFaq ? form.category : undefined,
        tags: hasTags ? form.tags || [] : [],
        authorOverride: hasTags ? (form.authorOverride || "").trim() : undefined,
        status,
        seo: {
          ...(form.seo || {}),
          ...(form.seo?.ogImage
            ? { ogImage: persistableCmsMediaUrl(form.seo.ogImage) || form.seo.ogImage }
            : {}),
        },
        relatedServiceSlug: hasTags ? (form.relatedServiceSlug || "").trim() : undefined,
        relatedContent: hasTags ? relatedItems.map((r) => r._id) : [],
        activeCountries: supportsCountryTargeting ? form.activeCountries || [] : [],
      };
      if (mode === "create") {
        const { content: created, translations } =
          await adminCreateCmsWithTranslations(payload);
        stashTranslationResults(created._id, translations);
        toast.success(status === "published" ? "Published!" : "Draft saved");
        announceTranslationOutcome(translations);
        router.push(`/admin/cms/${created._id}/edit`);
      } else if (initial?._id) {
        const { content: updated, translations } =
          await adminUpdateCmsWithTranslations(initial._id, payload);
        savedRevision.current = revisionAtSaveStart;
        if (formRevision.current === revisionAtSaveStart) {
          setForm({
            ...updated,
            tags: Array.isArray(updated.tags) ? updated.tags : [],
            seo: updated.seo || {},
            coverImageAlt: updated.coverImageAlt || "",
            activeCountries: Array.isArray(updated.activeCountries) ? updated.activeCountries : [],
          });
          setRelatedItems(relatedItemsFromCms(updated.relatedContent));
          setTranslationsStale(false);
        } else {
          // The admin kept typing while the request was in flight; never
          // discard those edits just to apply the server echo.
          setTranslationsStale(true);
        }
        setTranslationResults(translations);
        setTranslationSource("save");
        toast.success(status === "published" ? "Published!" : "Draft saved");
        announceTranslationOutcome(translations);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      actionLock.current = null;
      setSaving(false);
    }
  };

  const runTranslate = async (force: boolean) => {
    if (actionLock.current || !initial?._id) return;
    actionLock.current = "translate";
    setShowForceTranslateConfirm(false);
    setTranslating(true);
    try {
      // Deliberately does not touch `form`: unsaved edits must survive, and a
      // translation run must never masquerade as a content save.
      const { translations } = await adminTranslateCms(initial._id, { force });
      setTranslationResults(translations);
      setTranslationSource("retranslate");
      // The translation reflects the saved document. If the form has unsaved
      // edits (before or during this request), keep it marked stale instead of
      // claiming the translations match what is on screen.
      setTranslationsStale(formRevision.current !== savedRevision.current);
      const failed = translations.filter((result) => result.status === "failed");
      const disabled = translations.every((result) => result.status === "disabled");
      const manualKept = translations.filter((result) => result.status === "skipped_manual");
      if (failed.length > 0) {
        toast.warning(
          `Translation failed for ${failed
            .map((r) => (r.locale === "*" ? "all locales" : r.locale.toUpperCase()))
            .join(", ")}.`
        );
      } else if (translations.length === 0) {
        toast.info("No translation results were returned.");
      } else if (disabled && translations.length > 0) {
        toast.info("Azure Translator is not configured, so translations were skipped.");
      } else if (manualKept.length > 0 && !force) {
        toast.info(
          `Manual translations kept for ${manualKept.map((r) => r.locale.toUpperCase()).join(", ")}.`
        );
      } else {
        toast.success(force ? "Translations overwritten" : "Translations updated");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Translation failed");
    } finally {
      actionLock.current = null;
      setTranslating(false);
    }
  };

  const remove = () => {
    if (!initial?._id || actionLock.current) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!initial?._id || actionLock.current) return;
    setShowDeleteConfirm(false);
    actionLock.current = "delete";
    setDeleting(true);
    try {
      await adminDeleteCms(initial._id);
      toast.success("Deleted");
      router.push("/admin/cms");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    } finally {
      actionLock.current = null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white pt-16 pb-16">
      <div className="sticky top-16 z-20 border-b border-pink-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <button
            onClick={() => router.push("/admin/cms")}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50"
          >
            <ArrowLeft size={16} /> Back to content
          </button>
          <div className="flex items-center gap-2">
            {mode === "edit" && publicPreviewHref && (
              form.status === "published" ? (
                <a
                  href={publicPreviewHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-pink-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                >
                  <ExternalLink size={14} /> View live
                </a>
              ) : (
                <span
                  title="Publish first to view live"
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-pink-200 bg-white/70 px-4 py-2 text-sm font-medium text-rose-400"
                >
                  <ExternalLink size={14} /> View live
                </span>
              )
            )}
            {mode === "edit" && (
              <button
                onClick={remove}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />} Delete
              </button>
            )}
            <button
              onClick={() => save("draft")}
              disabled={busy || !canSubmit}
              className="inline-flex items-center gap-2 rounded-xl border border-pink-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save draft
            </button>
            <button
              onClick={() => save("published")}
              disabled={busy || !canSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:shadow-lg hover:shadow-rose-300 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
              {form.status === "published" ? "Update" : "Publish"}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 pt-6 lg:grid-cols-[1fr_360px]">
        {/* MAIN */}
        <div className="space-y-6">
          <GradientCard>
            <div className="space-y-5 p-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-md shadow-rose-200">
                  <FileText size={18} />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-rose-900">
                    {mode === "create" ? "New content" : "Edit content"}
                  </h1>
                  <p className="text-xs text-rose-500">
                    {CMS_TYPE_LABELS[type]} · {form.status} · {CMS_CONTENT_LOCALE_LABELS[formLocale]} ({formLocale})
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {isMachineTranslation ? (
                      <span
                        title="Generated by Azure Translator; editing it turns it into a manual translation."
                        className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700"
                      >
                        Auto-translated
                      </span>
                    ) : isManualTranslation ? (
                      <span
                        title="Manual translation: automatic sync never overwrites it unless you explicitly force it."
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700"
                      >
                        Manual translation
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {!lockedType && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-rose-700">Type</label>
                  <div className="flex flex-wrap gap-2">
                    {CMS_TYPE_ORDER.map((t) => (
                      <button
                        key={t}
                        type="button"
                        disabled={mode === "edit"}
                        onClick={() => update({ type: t, category: t === "faq" ? form.category : undefined, tags: t === "blog" || t === "news" ? form.tags : [] })}
                        className={cn(
                          "rounded-xl border px-4 py-2 text-sm font-medium transition",
                          type === t
                            ? "border-transparent bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-sm"
                            : "border-pink-200 bg-white text-rose-700 hover:bg-rose-50",
                          mode === "edit" && "opacity-60 cursor-not-allowed"
                        )}
                      >
                        {CMS_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-rose-700">Title</label>
                <input
                  value={form.title || ""}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder="Give it a compelling title..."
                  className="w-full rounded-xl border border-pink-200 bg-white/60 px-4 py-3 text-base outline-none transition focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-200"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-rose-700">Slug</label>
                <div className="flex items-center gap-2 rounded-xl border border-pink-200 bg-white/60 px-3 focus-within:border-rose-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-rose-200">
                  {slugPrefix && <span className="text-sm text-rose-400">{slugPrefix}</span>}
                  <input
                    value={form.slug || ""}
                    onChange={(e) => {
                      setSlugTouched(true);
                      update({ slug: slugify(e.target.value) });
                    }}
                    placeholder="url-slug"
                    className="flex-1 bg-transparent py-3 text-sm outline-none"
                  />
                </div>
                {!slugPrefix && (
                  <p className="text-[11px] text-rose-400">
                    FAQ items don&apos;t have individual URLs — the slug is used as an identifier only.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-rose-700">Excerpt</label>
                <textarea
                  value={form.excerpt || ""}
                  onChange={(e) => update({ excerpt: e.target.value })}
                  rows={2}
                  placeholder="Short summary for listings and search results"
                  className="w-full resize-none rounded-xl border border-pink-200 bg-white/60 px-4 py-3 text-sm outline-none transition focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-200"
                />
              </div>
            </div>
          </GradientCard>

          <GradientCard>
            <div className="p-6 pb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-700">Body</h2>
            </div>
            <div className="px-6 pb-6">
              <RichTextEditor
                value={form.body || ""}
                onChange={(html) => update({ body: html })}
                placeholder="Tell your story..."
              />
            </div>
          </GradientCard>

          <SeoPanel
            value={form.seo || {}}
            onChange={(seo) => update({ seo })}
            fallbackTitle={form.title}
            fallbackDescription={form.excerpt}
            pathPreview={publicPreviewPath ? `fixtract.com${publicPreviewPath}` : undefined}
          />
        </div>

        {/* SIDEBAR */}
        <div className="space-y-6">
          <GradientCard>
            <div className="p-6 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-700">Cover</h3>
              <CoverImageUpload
                value={form.coverImage}
                altValue={form.coverImageAlt}
                onChange={(url) => update({ coverImage: url, ...(url ? {} : { coverImageAlt: "" }) })}
                onAltChange={(alt) => update({ coverImageAlt: alt })}
                required={requiresCover}
                recommendedSize={coverRecommendation}
              />
            </div>
          </GradientCard>

          {supportsCountryTargeting && (
            <GradientCard>
              <div className="p-6 space-y-2">
                <Label className="text-sm font-semibold uppercase tracking-wide text-rose-700">
                  Target countries
                </Label>
                <MultiSelectCombobox
                  options={CMS_COUNTRY_OPTIONS}
                  value={form.activeCountries || []}
                  onChange={(countries) => update({ activeCountries: countries })}
                  ariaLabel="Target countries"
                  placeholder="All countries (default)"
                  emptySelectionLabel="All countries (default)"
                  searchPlaceholder="Search countries..."
                />
                <p className="text-[11px] text-rose-400">
                  Leave empty to show this {CMS_TYPE_LABELS[type].toLowerCase()} to everyone. When set, only visitors from the selected countries can see it.
                </p>
              </div>
            </GradientCard>
          )}

          {hasTags && (
            <GradientCard>
              <div className="p-6 space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-700">Writer name</h3>
                <input
                  value={form.authorOverride || ""}
                  onChange={(e) => update({ authorOverride: e.target.value })}
                  placeholder="Defaults to your admin name"
                  maxLength={120}
                  className="w-full rounded-xl border border-pink-200 bg-white/60 px-4 py-2 text-sm outline-none transition focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-200"
                />
                <p className="text-[11px] text-rose-400">Shown as the author on blog/news cards and detail pages.</p>
              </div>
            </GradientCard>
          )}

          {hasTags && (
            <GradientCard>
              <div className="p-6 space-y-2">
                <label htmlFor="related-service-select" className="block text-sm font-semibold uppercase tracking-wide text-rose-700">Related service</label>
                {serviceOptionsError ? (
                  <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                    <div className="font-semibold">Couldn&apos;t load services</div>
                    <div className="mt-0.5 text-rose-600">{serviceOptionsError}</div>
                  </div>
                ) : (
                  <select
                    id="related-service-select"
                    value={form.relatedServiceSlug || ""}
                    onChange={(e) => update({ relatedServiceSlug: e.target.value })}
                    className="w-full rounded-xl border border-pink-200 bg-white/60 px-4 py-2 text-sm outline-none transition focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-200"
                  >
                    <option value="">— None —</option>
                    {serviceOptions.map((opt) => (
                      <option key={opt.slug} value={opt.slug}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-rose-400">Optional. Surfaces this {CMS_TYPE_LABELS[type].toLowerCase()} in the matching service landing page&apos;s related-articles section, and links back from the article.</p>
              </div>
            </GradientCard>
          )}

          {hasTags && (
            <GradientCard>
              <div className="p-6 space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-700">Related reading</h3>
                <p className="text-[11px] text-rose-400">
                  Link other published blogs/news for internal SEO. Shown at the bottom of this article.
                </p>
                <RelatedContentPicker
                  value={relatedItems}
                  onChange={(next) => {
                    setRelatedItems(next);
                    markFormChanged();
                  }}
                  excludeId={initial?._id}
                />
              </div>
            </GradientCard>
          )}

          {isFaq && (
            <GradientCard>
              <div className="p-6 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-700">FAQ Category</h3>
                {faqCategoriesError ? (
                  <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                    <div className="font-semibold">Couldn&apos;t load categories</div>
                    <div className="mt-0.5 text-rose-600">{faqCategoriesError}</div>
                    <div className="mt-1 text-rose-500">
                      Saving is disabled until categories load. Refresh the page to retry.
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {faqCategories.map((c) => (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => update({ category: c.slug })}
                        className={cn(
                          "rounded-xl border px-4 py-2 text-left text-sm transition",
                          form.category === c.slug
                            ? "border-transparent bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-sm"
                            : "border-pink-200 bg-white text-rose-700 hover:bg-rose-50"
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </GradientCard>
          )}

          {hasTags && (
            <GradientCard>
              <div className="p-6 space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-rose-700">
                  <Tag size={14} /> Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(form.tags || []).map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-100 to-pink-100 px-3 py-1 text-xs font-medium text-rose-700"
                    >
                      {t}
                      <button type="button" onClick={() => removeTag(t)} className="hover:text-rose-900">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(tagInput);
                      setTagInput("");
                    }
                  }}
                  placeholder="Type a tag and press Enter"
                  className="w-full rounded-xl border border-pink-200 bg-white/60 px-4 py-2 text-sm outline-none transition focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-200"
                />
                <p className="text-[11px] text-rose-400">{(form.tags || []).length}/20 tags</p>
              </div>
            </GradientCard>
          )}

          <GradientCard>
            <div className="p-6 space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-700">Language</h3>
              <select
                value={formLocale}
                onChange={(e) =>
                  update({ locale: normalizeCmsContentLocale(e.target.value) })
                }
                disabled={busy}
                aria-label="Content language"
                className="w-full rounded-xl border border-pink-200 bg-white/60 px-4 py-2 text-sm outline-none transition focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-200 disabled:opacity-60"
              >
                {CMS_CONTENT_LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {CMS_CONTENT_LOCALE_LABELS[code]} ({code})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-rose-400">
                English is the source language. Saving an original syncs the other supported
                languages automatically.
              </p>
            </div>
          </GradientCard>

          <GradientCard>
            <div className="p-6 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-700">Status</h3>
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium capitalize",
                  form.status === "published"
                    ? "bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-sm"
                    : "border border-pink-200 bg-white text-rose-700"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    form.status === "published" ? "bg-white" : "bg-rose-400"
                  )}
                />
                {form.status || "draft"}
              </div>
              <p className="text-[11px] text-rose-400">
                Use Save draft or Publish at the top to change the status.
              </p>
            </div>
          </GradientCard>

          <GradientCard>
            <div className="p-6 space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-rose-700">
                <Languages size={14} /> Translations
              </h3>

              {isManualTranslation ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                  This is a manual translation. Automatic saves and normal re-translation keep
                  manual text untouched; only the explicit overwrite action below replaces it.
                </p>
              ) : isMachineTranslation ? (
                <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-800">
                  This document is a machine translation. Editing and saving it turns it into a
                  manual translation that future automatic syncs will not overwrite.
                </p>
              ) : (
                <p className="text-[11px] leading-relaxed text-rose-400">
                  Saving this original syncs the other supported languages. Manual translations
                  are never overwritten without an explicit confirmation.
                </p>
              )}

              {translationResults.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-rose-500">
                    {translationSource === "retranslate" ? "Last re-translate" : "Last save"}
                    {translationsStale ? " — content changed since, results may be out of date" : ""}
                  </p>
                  {translationResults.map((result) => (
                    <div
                      key={`${result.locale}-${result.status}`}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-[11px]",
                        translationTone(result.status)
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 font-medium">
                        <span>{result.locale === "*" ? "All locales" : result.locale.toUpperCase()}</span>
                        <span>{TRANSLATION_STATUS_LABELS[result.status]}</span>
                      </div>
                      {result.error ? (
                        <p className="mt-1 break-words opacity-90">{result.error}</p>
                      ) : null}
                    </div>
                  ))}
                  {translationsStale ? (
                    <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Save or re-translate to refresh the translation status.
                    </p>
                  ) : null}
                </div>
              )}

              {mode === "edit" && initial?._id ? (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => runTranslate(false)}
                    disabled={busy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-pink-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                  >
                    {translating ? (
                      <Loader2 className="animate-spin" size={13} />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                    Re-translate
                  </button>
                  <p className="text-[11px] leading-relaxed text-rose-400">
                    Retries only missing or stale machine translations. Manual translations are
                    kept.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowForceTranslateConfirm(true)}
                    disabled={busy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
                  >
                    Overwrite manual translations…
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-rose-400">
                  Save this content first to run or retry translations.
                </p>
              )}
            </div>
          </GradientCard>

        </div>
      </div>

      <Dialog open={showForceTranslateConfirm} onOpenChange={setShowForceTranslateConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Overwrite manual translations?</DialogTitle>
            <DialogDescription>
              Azure Translator will replace any manually edited translations in the other
              supported locales with machine translations. This cannot be undone from this
              screen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => setShowForceTranslateConfirm(false)}
              className="inline-flex items-center justify-center rounded-xl border border-pink-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => runTranslate(true)}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:shadow-lg hover:shadow-rose-300 disabled:opacity-50"
            >
              <RefreshCw size={14} /> Overwrite translations
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this content?</DialogTitle>
            <DialogDescription>
              This cannot be undone. The item will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="inline-flex items-center justify-center rounded-xl border border-pink-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:shadow-lg hover:shadow-rose-300"
            >
              <Trash2 size={14} /> Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GradientCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-rose-100 via-pink-100 to-orange-100 p-[1.5px] shadow-sm transition hover:shadow-md hover:shadow-rose-100">
      <div className="rounded-[calc(1rem-1.5px)] bg-white">{children}</div>
    </div>
  );
}
