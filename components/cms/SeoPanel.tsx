"use client";

import { ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import { CmsSeo } from "@/lib/cms";
import { cn } from "@/lib/utils";

interface Props {
  value: CmsSeo;
  onChange: (next: CmsSeo) => void;
  fallbackTitle?: string;
  fallbackDescription?: string;
  pathPreview?: string;
}

export default function SeoPanel({ value, onChange, fallbackTitle, fallbackDescription, pathPreview }: Props) {
  const [open, setOpen] = useState(true);

  const update = (patch: Partial<CmsSeo>) => onChange({ ...value, ...patch });

  const previewTitle = value.titleTag || fallbackTitle || "Untitled";
  const previewDesc = value.metaDescription || fallbackDescription || "Add a description to improve search rankings.";

  return (
    <div className="rounded-2xl bg-gradient-to-br from-rose-100 via-pink-100 to-orange-100 p-[1.5px] shadow-sm">
      <div className="rounded-[calc(1rem-1.5px)] bg-white">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-t-[calc(1rem-1.5px)] bg-gradient-to-r from-rose-50 to-pink-50 px-5 py-3 text-rose-900"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Search size={16} className="text-rose-500" /> SEO & Social
          </span>
          <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div className="space-y-5 p-5">
            <div className="rounded-xl border border-pink-100 bg-gradient-to-br from-rose-50/60 to-white p-4">
              <div className="text-[11px] uppercase tracking-wide text-rose-500">Google preview</div>
              <div className="mt-2 text-xs text-emerald-700 truncate">{pathPreview || "fixera.com/..."}</div>
              <div className="mt-1 text-base text-blue-800 line-clamp-1">{previewTitle}</div>
              <div className="mt-1 text-sm text-slate-600 line-clamp-2">{previewDesc}</div>
            </div>

            <Field label="Title tag" hint={`${(value.titleTag || "").length}/60 recommended`}>
              <input
                value={value.titleTag || ""}
                onChange={(e) => update({ titleTag: e.target.value })}
                placeholder={fallbackTitle || "SEO title"}
                className="w-full rounded-xl border border-pink-200 bg-white/60 px-4 py-2 text-sm outline-none transition focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-200"
              />
            </Field>

            <Field label="Meta description" hint={`${(value.metaDescription || "").length}/160 recommended`}>
              <textarea
                value={value.metaDescription || ""}
                onChange={(e) => update({ metaDescription: e.target.value })}
                rows={3}
                placeholder={fallbackDescription || "Short description shown in search results"}
                className="w-full resize-none rounded-xl border border-pink-200 bg-white/60 px-4 py-2 text-sm outline-none transition focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-200"
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="OG title">
                <input
                  value={value.ogTitle || ""}
                  onChange={(e) => update({ ogTitle: e.target.value })}
                  placeholder="Defaults to title tag"
                  className="w-full rounded-xl border border-pink-200 bg-white/60 px-4 py-2 text-sm outline-none transition focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-200"
                />
              </Field>
              <Field label="OG image URL">
                <input
                  value={value.ogImage || ""}
                  onChange={(e) => update({ ogImage: e.target.value })}
                  placeholder="Defaults to cover image"
                  className="w-full rounded-xl border border-pink-200 bg-white/60 px-4 py-2 text-sm outline-none transition focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-200"
                />
              </Field>
            </div>

            <Field label="Canonical URL">
              <input
                value={value.canonical || ""}
                onChange={(e) => update({ canonical: e.target.value })}
                placeholder="Defaults to page URL"
                className="w-full rounded-xl border border-pink-200 bg-white/60 px-4 py-2 text-sm outline-none transition focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-200"
              />
            </Field>

            <label className="flex items-center gap-3 rounded-xl bg-rose-50/50 px-4 py-3">
              <input
                type="checkbox"
                checked={!!value.noindex}
                onChange={(e) => update({ noindex: e.target.checked })}
                className="h-4 w-4 accent-rose-500"
              />
              <span className="text-sm text-rose-900">
                Hide from search engines (<code className="text-xs">noindex</code>)
              </span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wide text-rose-700">{label}</label>
        {hint && <span className="text-[11px] text-rose-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
