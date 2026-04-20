"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FileText, Loader2, Save, Send, Tag, Trash2, X } from "lucide-react";
import {
  adminCreateCms,
  adminDeleteCms,
  adminListFaqCategories,
  adminUpdateCms,
  CmsContent,
  CmsContentStatus,
  CmsContentType,
  CmsUpsertPayload,
  CMS_TYPE_LABELS,
  CMS_TYPE_ORDER,
  FaqCategory,
  getPublicPathForCms,
  getPublicSlugPrefixForCms,
  slugify,
} from "@/lib/cms";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RichTextEditor from "./RichTextEditor";
import CoverImageUpload from "./CoverImageUpload";
import SeoPanel from "./SeoPanel";

interface Props {
  mode: "create" | "edit";
  initial?: CmsContent;
  lockedType?: CmsContentType;
}

const EMPTY: Partial<CmsContent> = {
  type: "blog",
  title: "",
  slug: "",
  locale: "en",
  body: "",
  excerpt: "",
  coverImage: "",
  category: "",
  tags: [],
  status: "draft",
  seo: {},
};

export default function CmsContentForm({ mode, initial, lockedType }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<Partial<CmsContent>>(() => {
    if (initial) {
      return {
        ...initial,
        tags: Array.isArray(initial.tags) ? initial.tags : [],
        seo: initial.seo || {},
      };
    }
    return { ...EMPTY, type: lockedType || "blog" };
  });
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [tagInput, setTagInput] = useState("");
  const [faqCategories, setFaqCategories] = useState<FaqCategory[]>([]);
  const [faqCategoriesError, setFaqCategoriesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
  const slugPrefix = getPublicSlugPrefixForCms(type);
  const publicPreviewPath = form.slug ? getPublicPathForCms(type, form.slug) : null;

  const update = (patch: Partial<CmsContent>) => setForm((f) => ({ ...f, ...patch }));

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

  const save = async (status: CmsContentStatus) => {
    if (!canSubmit) {
      toast.error("Please fill the required fields");
      return;
    }
    setSaving(true);
    try {
      const payload: CmsUpsertPayload = {
        type: form.type,
        title: form.title?.trim(),
        slug: slugify(form.slug || ""),
        locale: form.locale || "en",
        body: form.body || "",
        excerpt: form.excerpt || "",
        coverImage: form.coverImage || undefined,
        category: isFaq ? form.category : undefined,
        tags: hasTags ? form.tags || [] : [],
        status,
        seo: form.seo || {},
      };
      if (mode === "create") {
        const created = await adminCreateCms(payload);
        toast.success(status === "published" ? "Published!" : "Draft saved");
        router.push(`/admin/cms/${created._id}/edit`);
      } else if (initial?._id) {
        const updated = await adminUpdateCms(initial._id, payload);
        setForm({
          ...updated,
          tags: Array.isArray(updated.tags) ? updated.tags : [],
          seo: updated.seo || {},
        });
        toast.success(status === "published" ? "Published!" : "Draft saved");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!initial?._id) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!initial?._id) return;
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      await adminDeleteCms(initial._id);
      toast.success("Deleted");
      router.push("/admin/cms");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
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
            {mode === "edit" && (
              <button
                onClick={remove}
                disabled={deleting || saving}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />} Delete
              </button>
            )}
            <button
              onClick={() => save("draft")}
              disabled={saving || !canSubmit}
              className="inline-flex items-center gap-2 rounded-xl border border-pink-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save draft
            </button>
            <button
              onClick={() => save("published")}
              disabled={saving || !canSubmit}
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
                    {CMS_TYPE_LABELS[type]} · {form.status}
                  </p>
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
            pathPreview={publicPreviewPath ? `fixera.com${publicPreviewPath}` : undefined}
          />
        </div>

        {/* SIDEBAR */}
        <div className="space-y-6">
          <GradientCard>
            <div className="p-6 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-700">Cover</h3>
              <CoverImageUpload
                value={form.coverImage}
                onChange={(url) => update({ coverImage: url })}
                required={requiresCover}
              />
            </div>
          </GradientCard>

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
        </div>
      </div>

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
