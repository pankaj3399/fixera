"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Share2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { adminGetSiteSettings, adminUpdateSiteSettings, SocialLinks } from "@/lib/siteSettings";
import { getErrorMessage } from "@/lib/apiErrors";

const FIELDS: Array<{ key: keyof SocialLinks; label: string; placeholder: string }> = [
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/fixtract" },
  { key: "twitter", label: "Twitter / X", placeholder: "https://twitter.com/fixtract" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/fixtract" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/company/fixtract" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@fixtract" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@fixtract" },
];

function isValidUrl(v: string): boolean {
  if (!v.trim()) return true;
  try {
    const parsed = new URL(v.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default function AdminSocialSettingsPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [values, setValues] = useState<SocialLinks>({});
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/login");
    }
  }, [user, isAuthenticated, loading, router]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admin") return;
    setFetching(true);
    adminGetSiteSettings()
      .then((s) => {
        const loaded = s.socialLinks || {};
        setValues(loaded);
        const invalid = (Object.entries(loaded) as Array<[keyof SocialLinks, string | undefined]>)
          .filter(([, v]) => v && !isValidUrl(v))
          .map(([k]) => k);
        if (invalid.length > 0) {
          toast.error(`Stored link looks malformed: ${invalid.join(", ")}`);
        }
      })
      .catch((err) => toast.error(getErrorMessage(err, "Failed to load settings")))
      .finally(() => setFetching(false));
  }, [isAuthenticated, user]);

  const fieldErrors = (Object.entries(values) as Array<[keyof SocialLinks, string | undefined]>)
    .filter(([, v]) => v && !isValidUrl(v))
    .map(([k]) => k);

  const save = async () => {
    if (fieldErrors.length > 0) {
      toast.error(`Fix invalid URL(s): ${fieldErrors.join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      const next = await adminUpdateSiteSettings({ socialLinks: values });
      setValues(next.socialLinks || {});
      toast.success("Social links saved");
    } catch (err) {
      toast.error(getErrorMessage(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading || fetching) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-gradient-to-br from-rose-50 via-pink-50 to-white">
        <Loader2 className="animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white pt-16 pb-16">
      <div className="sticky top-16 z-20 border-b border-pink-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link
            href="/admin/cms"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50"
          >
            <ArrowLeft size={16} /> Back to content
          </Link>
          <button
            onClick={save}
            disabled={saving || fieldErrors.length > 0}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:shadow-lg hover:shadow-rose-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 pt-6">
        <div className="rounded-2xl bg-gradient-to-br from-rose-100 via-pink-100 to-orange-100 p-[1.5px] shadow-sm">
          <div className="rounded-[calc(1rem-1.5px)] bg-white">
            <div className="space-y-5 p-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-md shadow-rose-200">
                  <Share2 size={18} />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-rose-900">Social Media</h1>
                  <p className="text-xs text-rose-500">Paste full URLs. Icons hide automatically when a link is empty.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {FIELDS.map((f) => {
                  const raw = values[f.key] || "";
                  const invalid = Boolean(raw) && !isValidUrl(raw);
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-rose-700">{f.label}</label>
                      <input
                        value={raw}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        aria-invalid={invalid || undefined}
                        className={
                          invalid
                            ? "w-full rounded-xl border border-rose-400 bg-rose-50/60 px-4 py-2 text-sm outline-none transition focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-300"
                            : "w-full rounded-xl border border-pink-200 bg-white/60 px-4 py-2 text-sm outline-none transition focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-200"
                        }
                      />
                      {invalid && (
                        <p className="text-[11px] text-rose-600">Use a full URL starting with http:// or https://</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
