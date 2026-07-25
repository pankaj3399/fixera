"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Megaphone, Loader2, ChevronDown, Check, Eye } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSiteAnnouncementPreview } from "@/components/marketing/SiteAnnouncements";
import type { SiteAnnouncement as LiveSiteAnnouncement } from "@/components/marketing/SiteAnnouncements";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

const COUNTRY_OPTIONS = [
  { code: "BE", label: "Belgium" },
  { code: "NL", label: "Netherlands" },
  { code: "FR", label: "France" },
  { code: "DE", label: "Germany" },
  { code: "LU", label: "Luxembourg" },
] as const;

const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "nl", label: "Dutch" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
] as const;

const DELAY_OPTIONS = [
  { value: "0", label: "Immediately" },
  { value: "1", label: "After 1 second" },
  { value: "3", label: "After 3 seconds" },
  { value: "5", label: "After 5 seconds" },
  { value: "10", label: "After 10 seconds" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "0", label: "Normal" },
  { value: "5", label: "Higher" },
  { value: "10", label: "Highest" },
] as const;

type AnnouncementType = "top_bar" | "modal" | "exit_intent";

interface SiteAnnouncement {
  _id: string;
  name: string;
  type: AnnouncementType;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
  discountCode?: string;
  activeCountries: string[];
  locale: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  priority: number;
  delaySeconds: number;
  dismissible: boolean;
  requireMarketingConsent: boolean;
  createdAt: string;
}

interface FormState {
  name: string;
  type: AnnouncementType;
  title: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  discountCode: string;
  countries: string[];
  locale: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  priority: string;
  delaySeconds: string;
  dismissible: boolean;
  requireMarketingConsent: boolean;
}

const selectTriggerClass = "h-9 w-full text-sm";

function Field({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>{children}</div>;
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Label className="inline-flex gap-0 font-sans text-sm font-medium leading-5 text-slate-700">
      {children}
      {required ? <span className="ml-0.5 text-red-500">*</span> : null}
    </Label>
  );
}

function SettingRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{title}</p>
        <p className="text-[11px] text-slate-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </div>
  );
}

function CountryCombobox({
  value,
  onChange,
}: {
  value: string[];
  onChange: (countries: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => searchRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    setSearch("");
  }, [open]);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? COUNTRY_OPTIONS.filter(
        (c) => c.label.toLowerCase().includes(query) || c.code.toLowerCase().includes(query),
      )
    : COUNTRY_OPTIONS;

  const labelFor = (code: string) =>
    COUNTRY_OPTIONS.find((c) => c.code === code)?.label || code;

  const toggle = (code: string) => {
    if (value.includes(code)) onChange(value.filter((c) => c !== code));
    else onChange([...value, code]);
  };

  const summary =
    value.length === 0
      ? "Everywhere"
      : value.length <= 2
        ? value.map(labelFor).join(", ")
        : `${value.length} countries`;

  const optionClass =
    "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted";

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          open && "border-ring ring-ring/50 ring-[3px]",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className={cn(
            "min-w-0 truncate text-left",
            value.length === 0 && "text-muted-foreground",
          )}
        >
          {summary}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Countries"
          aria-multiselectable
          className="absolute z-[10001] mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <div className="border-b p-2">
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search countries…"
              className="h-8 border-0 bg-muted/50 text-sm shadow-none focus-visible:ring-0"
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </div>

          <div className="max-h-52 overflow-y-auto p-1">
            {!query && (
              <div
                role="option"
                aria-selected={value.length === 0}
                tabIndex={0}
                onClick={() => onChange([])}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onChange([]);
                  }
                }}
                className={optionClass}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs",
                    value.length === 0 && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {value.length === 0 && <Check className="size-3.5" />}
                </span>
                <span>Everywhere</span>
              </div>
            )}

            {filtered.length > 0 ? (
              filtered.map((country) => {
                const checked = value.includes(country.code);
                return (
                  <div
                    key={country.code}
                    role="option"
                    aria-selected={checked}
                    tabIndex={0}
                    onClick={() => toggle(country.code)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(country.code);
                      }
                    }}
                    className={optionClass}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs",
                        checked && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {checked && <Check className="size-3.5" />}
                    </span>
                    <span>{country.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{country.code}</span>
                  </div>
                );
              })
            ) : (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const formatLocalIsoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const nearestDelay = (n: number) => {
  const allowed = [0, 1, 3, 5, 10];
  return String(allowed.reduce((best, cur) => (Math.abs(cur - n) < Math.abs(best - n) ? cur : best)));
};

const nearestPriority = (n: number) => {
  if (n >= 8) return "10";
  if (n >= 3) return "5";
  return "0";
};

const emptyForm = (): FormState => {
  const now = new Date();
  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return {
    name: "",
    type: "top_bar",
    title: "",
    message: "",
    ctaLabel: "Learn more",
    ctaUrl: "/services",
    discountCode: "",
    countries: [],
    locale: "en",
    startsAt: formatLocalIsoDate(now),
    endsAt: formatLocalIsoDate(in30),
    isActive: true,
    priority: "0",
    delaySeconds: "3",
    dismissible: true,
    requireMarketingConsent: true,
  };
};

const buildPayload = (form: FormState) => {
  const showsDelay = form.type === "modal" || form.type === "exit_intent";
  const showsDismiss = showsDelay;
  return {
    name: form.name.trim(),
    type: form.type,
    title: form.title.trim(),
    message: form.message.trim(),
    ctaLabel: form.type === "top_bar" ? undefined : form.ctaLabel.trim() || undefined,
    ctaUrl: form.ctaUrl.trim() || undefined,
    discountCode: form.discountCode.trim() || undefined,
    activeCountries: form.countries,
    locale: form.locale || "en",
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    isActive: form.isActive,
    priority: Number(form.priority) || 0,
    delaySeconds: showsDelay ? Number(form.delaySeconds) || 0 : 0,
    dismissible: showsDismiss ? form.dismissible : false,
    requireMarketingConsent: form.requireMarketingConsent,
  };
};

const toForm = (a: SiteAnnouncement): FormState => ({
  name: a.name,
  type: a.type,
  title: a.title,
  message: a.message,
  ctaLabel: a.ctaLabel || "",
  ctaUrl: a.ctaUrl || "",
  discountCode: a.discountCode || "",
  countries: [...a.activeCountries],
  locale: LOCALE_OPTIONS.some((l) => l.value === a.locale) ? a.locale : "en",
  startsAt: formatLocalIsoDate(new Date(a.startsAt)),
  endsAt: formatLocalIsoDate(new Date(a.endsAt)),
  isActive: a.isActive,
  priority: nearestPriority(a.priority ?? 0),
  delaySeconds: nearestDelay(a.delaySeconds ?? 3),
  dismissible: a.dismissible !== false,
  requireMarketingConsent: a.requireMarketingConsent !== false,
});

const toLiveAnnouncement = (a: SiteAnnouncement): LiveSiteAnnouncement => ({
  _id: a._id,
  name: a.name,
  type: a.type,
  title: a.title,
  message: a.message,
  ctaLabel: a.ctaLabel,
  ctaUrl: a.ctaUrl,
  discountCode: a.discountCode,
  activeCountries: a.activeCountries,
  locale: a.locale,
  delaySeconds: a.delaySeconds,
  dismissible: a.dismissible,
  requireMarketingConsent: a.requireMarketingConsent,
});

const typeLabel = (t: AnnouncementType) => {
  if (t === "top_bar") return "Banner";
  if (t === "modal") return "Popup";
  return "Exit offer";
};

const statusLabel = (a: SiteAnnouncement): { label: string; tone: string } => {
  const now = new Date();
  if (!a.isActive) return { label: "Disabled", tone: "bg-slate-200 text-slate-700" };
  if (now < new Date(a.startsAt)) return { label: "Scheduled", tone: "bg-amber-100 text-amber-700" };
  if (now > new Date(a.endsAt)) return { label: "Expired", tone: "bg-rose-100 text-rose-700" };
  return { label: "Active", tone: "bg-emerald-100 text-emerald-700" };
};

export default function AdminSiteAnnouncementsPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const { startPreview } = useSiteAnnouncementPreview();

  const [items, setItems] = useState<SiteAnnouncement[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const latestReq = useRef(0);

  const showsDelay = form.type === "modal" || form.type === "exit_intent";
  const showsDismiss = form.type === "modal" || form.type === "exit_intent";

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/login");
    }
  }, [user, isAuthenticated, loading, router]);

  const loadItems = useCallback(async () => {
    const id = ++latestReq.current;
    try {
      setListLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await authFetch(`${API_BASE}/api/admin/site-announcements?${params}`);
      const json = await res.json();
      if (id !== latestReq.current) return;
      if (!res.ok || !json.success) throw new Error(json.msg || "Failed to load");
      setItems(json.data.announcements || []);
    } catch (err) {
      if (id !== latestReq.current) return;
      toast.error(err instanceof Error ? err.message : "Could not load announcements");
    } finally {
      if (id === latestReq.current) setListLoading(false);
    }
  }, [statusFilter, typeFilter, search]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admin") return;
    const t = setTimeout(loadItems, 200);
    return () => clearTimeout(t);
  }, [isAuthenticated, user, loadItems]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (a: SiteAnnouncement) => {
    setEditingId(a._id);
    setForm(toForm(a));
    setDialogOpen(true);
  };

  const openPreview = (a: SiteAnnouncement) => {
    startPreview(toLiveAnnouncement(a));
  };

  const save = async () => {
    if (!form.name.trim() || !form.title.trim() || !form.message.trim()) {
      toast.error("Name, title, and message are required");
      return;
    }
    try {
      setSaving(true);
      const payload = buildPayload(form);

      const url = editingId
        ? `${API_BASE}/api/admin/site-announcements/${editingId}`
        : `${API_BASE}/api/admin/site-announcements`;
      const res = await authFetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.msg || "Save failed");
      toast.success(editingId ? "Announcement updated" : "Announcement created");
      setDialogOpen(false);
      loadItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a: SiteAnnouncement, isActive: boolean) => {
    setTogglingId(a._id);
    setItems((prev) => prev.map((item) => (item._id === a._id ? { ...item, isActive } : item)));
    try {
      const payload = buildPayload({ ...toForm(a), isActive });
      const res = await authFetch(`${API_BASE}/api/admin/site-announcements/${a._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.msg || "Update failed");
      toast.success(isActive ? "Announcement is live" : "Announcement hidden");
    } catch (err) {
      setItems((prev) =>
        prev.map((item) => (item._id === a._id ? { ...item, isActive: !isActive } : item)),
      );
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setTogglingId(null);
    }
  };

  if (loading || !isAuthenticated || user?.role !== "admin") {
    return (
      <div className="container mx-auto max-w-6xl p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6 pt-28">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Megaphone className="h-6 w-6 text-orange-500" />
            Site Announcements
          </h1>
          <p className="mt-1 text-slate-600">
            Banners and popups shown to visitors by region.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-orange-500 hover:bg-orange-600">
          <Plus className="mr-2 h-4 w-4" />
          New announcement
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>Announcements</CardTitle>
            <CardDescription>{items.length} result(s)</CardDescription>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_11rem]">
            <Input
              placeholder="Search name or title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full text-sm"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="top_bar">Banner</SelectItem>
                <SelectItem value="modal">Popup</SelectItem>
                <SelectItem value="exit_intent">Exit offer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {listLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500">No announcements yet. Create one to show a promo on the site.</p>
          ) : (
            <ul className="divide-y">
              {items.map((a) => {
                const st = statusLabel(a);
                return (
                  <li key={a._id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{a.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${st.tone}`}>{st.label}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {typeLabel(a.type)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{a.title}</p>
                      <p className="line-clamp-2 text-sm text-slate-500">{a.message}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {a.activeCountries.length ? a.activeCountries.join(", ") : "All countries"}
                        {" · "}
                        {LOCALE_OPTIONS.find((l) => l.value === a.locale)?.label || a.locale}
                        {a.discountCode ? ` · code ${a.discountCode}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-slate-900"
                        onClick={() => openPreview(a)}
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-slate-900"
                        onClick={() => openEdit(a)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <div className="ml-1 flex items-center gap-2 border-l border-slate-200 pl-3">
                        <Label
                          htmlFor={`live-${a._id}`}
                          className="cursor-pointer text-xs font-medium text-slate-500"
                        >
                          Live
                        </Label>
                        <Switch
                          id={`live-${a._id}`}
                          checked={a.isActive}
                          disabled={togglingId === a._id}
                          onCheckedChange={(checked) => toggleActive(a, checked)}
                          aria-label={`Toggle live for ${a.name}`}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[min(90vh,720px)] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="shrink-0 border-b border-slate-200 px-6 py-4 text-left">
            <DialogTitle className="font-sans text-lg font-semibold tracking-normal text-slate-900">
              {editingId ? "Edit announcement" : "New announcement"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
            {/* Left: content */}
            <div className="space-y-4 border-b border-slate-200 px-6 py-6 md:border-b-0 md:border-r md:overflow-y-auto">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                What visitors see
              </p>

              <Field>
                <FieldLabel required>Internal name</FieldLabel>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Summer BE promo"
                  className="h-9 text-sm"
                />
              </Field>

              <div className="grid w-full grid-cols-2 gap-4">
                <Field>
                  <FieldLabel required>Placement</FieldLabel>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm({ ...form, type: v as AnnouncementType })}
                  >
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top_bar">Banner under navbar</SelectItem>
                      <SelectItem value="modal">Popup on the page</SelectItem>
                      <SelectItem value="exit_intent">Exit offer</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Priority</FieldLabel>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field>
                <FieldLabel required>Headline</FieldLabel>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Summer 10% off painting"
                  className="h-9 text-sm"
                />
              </Field>

              <Field>
                <FieldLabel required>Supporting text</FieldLabel>
                <Input
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Book this month and save"
                  className="h-9 text-sm"
                />
              </Field>

              <div className="grid w-full grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Link</FieldLabel>
                  <Input
                    value={form.ctaUrl}
                    onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })}
                    placeholder="/services"
                    className="h-9 font-mono text-sm"
                  />
                </Field>
                <Field>
                  <FieldLabel>Code</FieldLabel>
                  <Input
                    value={form.discountCode}
                    onChange={(e) => setForm({ ...form, discountCode: e.target.value.toUpperCase() })}
                    placeholder="SUMMER10"
                    className="h-9 font-mono text-sm uppercase"
                  />
                </Field>
              </div>

              {form.type !== "top_bar" && (
                <Field>
                  <FieldLabel>Button text</FieldLabel>
                  <Input
                    value={form.ctaLabel}
                    onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
                    placeholder="Claim offer"
                    className="h-9 text-sm"
                  />
                </Field>
              )}
            </div>

            {/* Right: targeting + schedule + options */}
            <div className="flex flex-col gap-4 px-6 py-6 md:overflow-y-auto">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Who & when
              </p>

              <div className="grid w-full grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Countries</FieldLabel>
                  <CountryCombobox
                    value={form.countries}
                    onChange={(countries) => setForm({ ...form, countries })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Language</FieldLabel>
                  <Select value={form.locale} onValueChange={(v) => setForm({ ...form, locale: v })}>
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCALE_OPTIONS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid w-full grid-cols-2 gap-4">
                <Field>
                  <FieldLabel required>Starts</FieldLabel>
                  <Input
                    type="date"
                    value={form.startsAt}
                    onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                    className="h-9 text-sm"
                  />
                </Field>
                <Field>
                  <FieldLabel required>Ends</FieldLabel>
                  <Input
                    type="date"
                    value={form.endsAt}
                    onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                    className="h-9 text-sm"
                  />
                </Field>
              </div>

              {showsDelay && (
                <Field>
                  <FieldLabel>Show after</FieldLabel>
                  <Select
                    value={form.delaySeconds}
                    onValueChange={(v) => setForm({ ...form, delaySeconds: v })}
                  >
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELAY_OPTIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              <div className="space-y-0 rounded-lg bg-slate-50 px-4 py-2">
                <SettingRow
                  title="Live"
                  description="Visible on the site"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                />
                {showsDismiss && (
                  <SettingRow
                    title="Closable"
                    description="Visitor can dismiss"
                    checked={form.dismissible}
                    onCheckedChange={(v) => setForm({ ...form, dismissible: v })}
                  />
                )}
                <SettingRow
                  title="Needs marketing consent"
                  description="Cookie opt-in required"
                  checked={form.requireMarketingConsent}
                  onCheckedChange={(v) => setForm({ ...form, requireMarketingConsent: v })}
                />
              </div>

              <div className="mt-auto flex justify-end gap-2 pt-2">
                <Button variant="outline" className="h-9" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button className="h-9" onClick={save} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Save changes" : "Create"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
