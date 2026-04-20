"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  adminListCms,
  CmsContent,
  CmsContentStatus,
  CmsContentType,
  CMS_TYPE_LABELS,
  CMS_TYPE_ORDER,
} from "@/lib/cms";
import { cn } from "@/lib/utils";
import { AlertCircle, FileText, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

const STATUS_FILTERS: Array<{ value: CmsContentStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];

export default function CmsAdminListPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();

  const [activeType, setActiveType] = useState<CmsContentType>("blog");
  const [status, setStatus] = useState<CmsContentStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<CmsContent[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [counts, setCounts] = useState<Record<CmsContentType, number>>({
    blog: 0,
    news: 0,
    faq: 0,
    policy: 0,
    landing: 0,
  });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/login");
    }
  }, [user, isAuthenticated, loading, router]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admin") return;
    let cancelled = false;
    setLoadingList(true);
    setListError(null);
    adminListCms({
      type: activeType,
      status: status === "all" ? undefined : status,
      search: debounced || undefined,
      limit: 100,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to load content";
        setListError(msg);
        toast.error(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeType, status, debounced, isAuthenticated, user, refreshKey]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admin") return;
    Promise.all(
      CMS_TYPE_ORDER.map((t) =>
        adminListCms({ type: t, limit: 1 })
          .then((r) => [t, r.pagination.total, null] as const)
          .catch((err: unknown) => [t, null, err instanceof Error ? err.message : "Failed"] as const)
      )
    ).then((entries) => {
      setCounts((prev) => {
        const next = { ...prev };
        for (const [t, c] of entries) {
          if (c !== null) next[t] = c;
        }
        return next;
      });
      const firstErr = entries.find(([, c]) => c === null);
      if (firstErr) toast.error(`Failed to refresh counts: ${firstErr[2] ?? "unknown error"}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  const headerGradient = useMemo(
    () => "bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300",
    []
  );

  if (loading || !isAuthenticated || user?.role !== "admin") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-gradient-to-br from-rose-50 via-pink-50 to-white">
        <Loader2 className="animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white">
      <div className="mx-auto max-w-6xl px-6 pt-24 pb-10">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl p-[1.5px] bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 shadow-sm">
          <div className="relative rounded-[calc(1.5rem-1.5px)] bg-white/90 p-7 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={cn("grid h-14 w-14 place-items-center rounded-2xl text-white shadow-lg shadow-rose-200", headerGradient)}>
                  <Sparkles size={22} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-rose-900">Content Studio</h1>
                  <p className="text-sm text-rose-500">Blogs, news, FAQs, policies & landing pages — all in one place.</p>
                </div>
              </div>
              <Link
                href="/admin/cms/new"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:shadow-lg hover:shadow-rose-300 hover:scale-[1.02]"
              >
                <Plus size={16} /> New content
              </Link>
            </div>
          </div>
        </div>

        {/* Type tabs */}
        <div className="mt-6 flex flex-wrap gap-2">
          {CMS_TYPE_ORDER.map((t) => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              className={cn(
                "group inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition",
                activeType === t
                  ? "border-transparent bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-md shadow-rose-200"
                  : "border-pink-200 bg-white/60 text-rose-700 hover:bg-rose-50 hover:shadow-sm"
              )}
            >
              {CMS_TYPE_LABELS[t]}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px]",
                  activeType === t ? "bg-white/30" : "bg-rose-100 text-rose-600"
                )}
              >
                {counts[t] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-pink-200 bg-white/70 px-3 py-2 focus-within:border-rose-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-rose-200">
            <Search size={14} className="text-rose-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or slug..."
              className="w-64 bg-transparent text-sm outline-none"
            />
          </div>
          <div className="flex gap-1 rounded-xl border border-pink-200 bg-white/70 p-1">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  status === s.value
                    ? "bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-sm"
                    : "text-rose-700 hover:bg-rose-50"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="mt-6">
          {listError && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm text-rose-800">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-500" />
              <div className="flex-1">
                <div className="font-semibold">Couldn&apos;t load content</div>
                <div className="text-xs text-rose-600">{listError}</div>
              </div>
              <button
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                className="rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
              >
                Retry
              </button>
            </div>
          )}
          {loadingList ? (
            <div className="flex items-center justify-center rounded-2xl border border-pink-200 bg-white/70 py-20">
              <Loader2 className="animate-spin text-rose-500" />
            </div>
          ) : listError && items.length === 0 ? null : items.length === 0 ? (
            <EmptyState type={activeType} />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {items.map((item) => (
                <ContentRow key={item._id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContentRow({ item }: { item: CmsContent }) {
  return (
    <Link
      href={`/admin/cms/${item._id}/edit`}
      className="group block rounded-2xl bg-gradient-to-br from-rose-100 via-pink-100 to-orange-100 p-[1.5px] transition hover:from-rose-200 hover:via-pink-200 hover:to-orange-200 hover:shadow-md hover:shadow-rose-100"
    >
      <div className="flex items-center gap-4 rounded-[calc(1rem-1.5px)] bg-white px-5 py-4">
        {item.coverImage ? (
          <img src={item.coverImage} alt="" className="h-14 w-20 rounded-xl object-cover shadow-sm" />
        ) : (
          <div className="flex h-14 w-20 items-center justify-center rounded-xl bg-gradient-to-br from-rose-50 to-pink-50 text-rose-300">
            <FileText size={18} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-rose-900 group-hover:text-rose-700">{item.title}</h3>
            <StatusPill status={item.status} />
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-rose-500">
            <span>/{item.type}/{item.slug}</span>
            <span>·</span>
            <span>Updated {new Date(item.updatedAt).toLocaleDateString()}</span>
            {item.tags?.length ? (
              <>
                <span>·</span>
                <span className="truncate">{item.tags.slice(0, 3).join(", ")}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

function StatusPill({ status }: { status: CmsContentStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        status === "published"
          ? "bg-gradient-to-r from-emerald-100 to-rose-100 text-emerald-700"
          : "bg-rose-50 text-rose-500"
      )}
    >
      {status}
    </span>
  );
}

function EmptyState({ type }: { type: CmsContentType }) {
  return (
    <div className="rounded-2xl border border-dashed border-pink-300 bg-gradient-to-br from-rose-50 via-pink-50 to-white py-16 text-center">
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-md shadow-rose-200">
        <Sparkles size={20} />
      </div>
      <h3 className="text-lg font-semibold text-rose-900">No {CMS_TYPE_LABELS[type]} yet</h3>
      <p className="mt-1 text-sm text-rose-500">Create your first piece to get started.</p>
      <Link
        href={`/admin/cms/new?type=${type}`}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:shadow-lg hover:shadow-rose-300 hover:scale-[1.02]"
      >
        <Plus size={16} /> New {CMS_TYPE_LABELS[type]}
      </Link>
    </div>
  );
}
