"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  adminListCms,
  adminListLandingSlots,
  adminSyncLandingSlots,
  CmsContent,
  CmsContentStatus,
  CmsContentType,
  CmsLandingSlot,
  CMS_TYPE_LABELS,
  CMS_TYPE_ORDER,
  CMS_RESERVED_POLICIES,
  getPublicPathForCms,
  getLandingServicePath,
} from "@/lib/cms";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, FileText, Loader2, Plus, Search, Share2, Sparkles } from "lucide-react";
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
  const [reservedSlots, setReservedSlots] = useState<Array<{ slug: string; label: string; usedFor: string; item: CmsContent | null }>>([]);
  const [reservedSlotsError, setReservedSlotsError] = useState<string | null>(null);
  const [landingSlots, setLandingSlots] = useState<CmsLandingSlot[]>([]);
  const [landingSlotsError, setLandingSlotsError] = useState<string | null>(null);
  const [landingSlotsLoading, setLandingSlotsLoading] = useState(true);
  const [landingSlotsOpen, setLandingSlotsOpen] = useState(false);

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

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admin") return;
    let cancelled = false;
    adminListCms({ type: "policy", limit: 100 })
      .then((res) => {
        if (cancelled) return;
        const bySlug = new Map(res.items.map((i) => [i.slug, i]));
        setReservedSlots(
          CMS_RESERVED_POLICIES.map((r) => ({
            slug: r.slug,
            label: r.label,
            usedFor: r.usedFor,
            item: bySlug.get(r.slug) || null,
          }))
        );
        setReservedSlotsError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to refresh policy slots";
        setReservedSlotsError(msg);
        setReservedSlots((prev) =>
          prev.length > 0
            ? prev
            : CMS_RESERVED_POLICIES.map((r) => ({
                slug: r.slug,
                label: r.label,
                usedFor: r.usedFor,
                item: null,
              }))
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, refreshKey]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admin") return;
    let cancelled = false;
    setLandingSlotsLoading(true);
    setLandingSlotsError(null);
    adminSyncLandingSlots()
      .catch(() => { /* sync failure shouldn't block listing — list fetch surfaces the error */ })
      .then(() => adminListLandingSlots())
      .then((slots) => {
        if (cancelled || !slots) return;
        setLandingSlots(slots);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to refresh landing slots";
        setLandingSlotsError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setLandingSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, refreshKey]);

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

        {/* Reserved policy slots */}
        <div className="mt-6 rounded-2xl border border-pink-200 bg-white/70 p-5 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-rose-900">Reserved policy slots</h2>
              <p className="text-xs text-rose-500">
                These slugs are wired to specific places in the app. Create a Policy with the exact slug to fill the slot.
              </p>
            </div>
          </div>
          {reservedSlotsError && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="flex-1">
                <span className="font-semibold">Couldn&apos;t refresh policy slots:</span>{" "}
                <span>{reservedSlotsError}</span>
              </div>
              <button
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                className="rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
              >
                Retry
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {reservedSlots.length === 0 ? (
              <p className="col-span-full text-xs text-gray-500">Loading…</p>
            ) : (
              reservedSlots.map((slot) => (
                <ReservedSlotCard key={slot.slug} slot={slot} createType="policy" />
              ))
            )}
          </div>
        </div>

        {/* Reserved landing slots */}
        <div className="mt-6 rounded-2xl border border-pink-200 bg-white/70 p-5 shadow-sm">
          <button
            type="button"
            onClick={() => setLandingSlotsOpen((v) => !v)}
            aria-expanded={landingSlotsOpen}
            className="flex w-full items-start justify-between gap-3 text-left"
          >
            <div>
              <h2 className="text-sm font-semibold text-rose-900">Reserved landing slots</h2>
              <p className="text-xs text-rose-500">
                About + every service. Create a Landing with the matching slug to fill the slot — it overrides the default page content.
                {landingSlots.length > 0 && (
                  <span className="ml-1 text-rose-400">({landingSlots.length})</span>
                )}
              </p>
            </div>
            <span className="mt-0.5 shrink-0 rounded-full p-1 text-rose-500 transition hover:bg-rose-50">
              {landingSlotsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </button>
          {landingSlotsOpen && (
            <div className="mt-3">
              {landingSlotsError && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                  <div className="flex-1">
                    <span className="font-semibold">Couldn&apos;t refresh landing slots:</span>{" "}
                    <span>{landingSlotsError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRefreshKey((k) => k + 1)}
                    className="rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
                  >
                    Retry
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {landingSlotsLoading ? (
                  <p className="col-span-full text-xs text-gray-500">Loading…</p>
                ) : !landingSlotsError && landingSlots.length === 0 ? (
                  <p className="col-span-full text-xs text-gray-500">No landing slots configured.</p>
                ) : (
                  landingSlots.map((slot) => (
                    <ReservedSlotCard key={slot.slug} slot={slot} createType="landing" />
                  ))
                )}
              </div>
            </div>
          )}
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
          <Link
            href="/admin/cms/social"
            className="inline-flex items-center gap-2 rounded-xl border border-pink-200 bg-white/60 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 hover:shadow-sm"
          >
            <Share2 size={14} /> Social Media
          </Link>
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
  const primaryPath = getPublicPathForCms(item.type, item.slug);
  const landingServicePath = item.type === "landing" ? getLandingServicePath(item.slug) : null;
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
          {primaryPath && (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-rose-400">
              <span>Displayed at</span>
              <code className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-600">{primaryPath}</code>
              {landingServicePath && (
                <>
                  <span>or</span>
                  <code className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-600">{landingServicePath}</code>
                  <span>(if a matching service exists)</span>
                </>
              )}
            </div>
          )}
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

interface ReservedSlotShape {
  slug: string;
  label: string;
  usedFor: string;
  item: { _id: string; status: CmsContentStatus } | CmsContent | null;
}

function ReservedSlotCard({
  slot,
  createType,
}: {
  slot: ReservedSlotShape;
  createType: CmsContentType;
}) {
  const present = !!slot.item;
  const published = slot.item?.status === "published";
  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition",
        present && published
          ? "border-emerald-200 bg-emerald-50/40"
          : present
            ? "border-amber-200 bg-amber-50/40"
            : "border-rose-200 bg-rose-50/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {present && published ? (
              <CheckCircle2 size={14} className="text-emerald-600" />
            ) : (
              <AlertCircle size={14} className={present ? "text-amber-600" : "text-rose-600"} />
            )}
            <span className="text-sm font-semibold text-gray-900">{slot.label}</span>
          </div>
          <p className="mt-0.5 text-[11px] font-mono text-gray-600">slug: {slot.slug}</p>
          <p className="mt-1 text-[11px] text-gray-600">{slot.usedFor}</p>
        </div>
        <div className="shrink-0">
          {present ? (
            <Link
              href={`/admin/cms/${slot.item!._id}/edit`}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition",
                published
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-amber-500 text-white hover:bg-amber-600"
              )}
            >
              {published ? "Edit" : "Review"}
            </Link>
          ) : (
            <Link
              href={`/admin/cms/new?type=${createType}&slug=${encodeURIComponent(slot.slug)}&title=${encodeURIComponent(slot.label)}`}
              className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700"
            >
              Create
            </Link>
          )}
        </div>
      </div>
    </div>
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
