"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Ticket, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

type DiscountType = "percentage" | "fixed";

interface DiscountCode {
  _id: string;
  code: string;
  type: DiscountType;
  value: number;
  maxDiscountAmount?: number;
  minBookingAmount?: number;
  activeCountries: string[];
  applicableServices: string[];
  validFrom: string;
  validUntil: string;
  usageLimit?: number;
  perUserLimit: number;
  usageCount: number;
  isActive: boolean;
  description?: string;
  createdAt: string;
}

interface FormState {
  code: string;
  type: DiscountType;
  value: string;
  maxDiscountAmount: string;
  minBookingAmount: string;
  activeCountries: string;
  applicableServices: string[];
  validFrom: string;
  validUntil: string;
  usageLimit: string;
  perUserLimit: string;
  isActive: boolean;
  description: string;
}

interface ServiceCategoryItem {
  name: string;
  services: { name: string }[];
}

const formatLocalIsoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const emptyForm = (): FormState => {
  const nowLocal = new Date();
  const in30DaysLocal = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return {
    code: "",
    type: "percentage",
    value: "",
    maxDiscountAmount: "",
    minBookingAmount: "",
    activeCountries: "",
    applicableServices: [],
    validFrom: formatLocalIsoDate(nowLocal),
    validUntil: formatLocalIsoDate(in30DaysLocal),
    usageLimit: "",
    perUserLimit: "1",
    isActive: true,
    description: "",
  };
};

const toForm = (code: DiscountCode): FormState => ({
  code: code.code,
  type: code.type,
  value: String(code.value),
  maxDiscountAmount: code.maxDiscountAmount != null ? String(code.maxDiscountAmount) : "",
  minBookingAmount: code.minBookingAmount != null ? String(code.minBookingAmount) : "",
  activeCountries: code.activeCountries.join(", "),
  applicableServices: [...code.applicableServices],
  validFrom: formatLocalIsoDate(new Date(code.validFrom)),
  validUntil: formatLocalIsoDate(new Date(code.validUntil)),
  usageLimit: code.usageLimit != null ? String(code.usageLimit) : "",
  perUserLimit: String(code.perUserLimit),
  isActive: code.isActive,
  description: code.description || "",
});

const statusLabel = (code: DiscountCode): { label: string; tone: string } => {
  const now = new Date();
  const from = new Date(code.validFrom);
  const until = new Date(code.validUntil);
  if (!code.isActive) return { label: "Disabled", tone: "bg-slate-200 text-slate-700" };
  if (now < from) return { label: "Scheduled", tone: "bg-amber-100 text-amber-700" };
  if (now > until) return { label: "Expired", tone: "bg-rose-100 text-rose-700" };
  if (
    code.usageLimit != null &&
    Number.isInteger(code.usageLimit) &&
    code.usageLimit > 0 &&
    Number.isInteger(code.usageCount) &&
    code.usageCount >= code.usageLimit
  ) {
    return { label: "Exhausted", tone: "bg-rose-100 text-rose-700" };
  }
  return { label: "Active", tone: "bg-emerald-100 text-emerald-700" };
};

export default function AdminDiscountCodesPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();

  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategoryItem[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [servicesOpen, setServicesOpen] = useState(false);
  const servicesPopoverRef = useRef<HTMLDivElement | null>(null);
  const servicesButtonRef = useRef<HTMLButtonElement | null>(null);
  const servicesContentRef = useRef<HTMLDivElement | null>(null);
  const latestLoadCodesRequestId = useRef(0);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/login");
    }
  }, [user, isAuthenticated, loading, router]);

  const loadCodes = useCallback(async () => {
    const requestId = ++latestLoadCodesRequestId.current;
    const isCurrent = () => requestId === latestLoadCodesRequestId.current;
    try {
      setListLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await authFetch(`${API_BASE}/api/admin/discount-codes?${params.toString()}`);
      const json = await res.json();
      if (!isCurrent()) return;
      if (!res.ok || !json.success) throw new Error(json.msg || "Failed to load codes");
      setCodes(json.data.codes || []);
    } catch (err) {
      if (!isCurrent()) return;
      toast.error(err instanceof Error ? err.message : "Could not load discount codes");
    } finally {
      if (isCurrent()) setListLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admin") return;
    const t = setTimeout(loadCodes, 250);
    return () => clearTimeout(t);
  }, [isAuthenticated, user, loadCodes]);

  const serviceCatalogCountry = useMemo(() => {
    const parts = form.activeCountries.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    return parts.length === 1 && /^[A-Z]{2}$/.test(parts[0]) ? parts[0] : null;
  }, [form.activeCountries]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admin") return;
    const ac = new AbortController();
    setIsLoadingServices(true);
    setServicesError(null);
    (async () => {
      try {
        const url = serviceCatalogCountry
          ? `${API_BASE}/api/service-categories/active?country=${encodeURIComponent(serviceCatalogCountry)}`
          : `${API_BASE}/api/service-categories/active`;
        const res = await fetch(url, {
          signal: ac.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          setServicesError(`Failed to load services (${res.status})`);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data)) setServiceCategories(data as ServiceCategoryItem[]);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("Failed to load service categories:", err);
        setServicesError(err instanceof Error ? err.message : "Failed to load services");
      } finally {
        if (!ac.signal.aborted) setIsLoadingServices(false);
      }
    })();
    return () => ac.abort();
  }, [isAuthenticated, user, serviceCatalogCountry]);

  useEffect(() => {
    if (!servicesOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (servicesPopoverRef.current && !servicesPopoverRef.current.contains(e.target as Node)) {
        setServicesOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setServicesOpen(false);
        servicesButtonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    const focusTimer = window.setTimeout(() => {
      servicesContentRef.current?.focus();
    }, 0);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.clearTimeout(focusTimer);
    };
  }, [servicesOpen]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setServicesOpen(false);
    setDialogOpen(true);
  };

  const openEdit = (code: DiscountCode) => {
    setEditingId(code._id);
    setForm(toForm(code));
    setServicesOpen(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.value.trim()) {
      toast.error("Code and value are required");
      return;
    }
    const value = Number(form.value);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Value must be a positive number");
      return;
    }
    if (form.type === "percentage" && value > 100) {
      toast.error("Percentage cannot exceed 100");
      return;
    }

    const fromParts = form.validFrom.split("-").map((p) => parseInt(p, 10));
    const untilParts = form.validUntil.split("-").map((p) => parseInt(p, 10));
    if (
      fromParts.length !== 3 ||
      untilParts.length !== 3 ||
      fromParts.some((n) => !Number.isFinite(n)) ||
      untilParts.some((n) => !Number.isFinite(n))
    ) {
      toast.error("Invalid date format");
      return;
    }
    const validFromDate = new Date(fromParts[0], fromParts[1] - 1, fromParts[2], 0, 0, 0, 0);
    const validUntilDate = new Date(untilParts[0], untilParts[1] - 1, untilParts[2], 23, 59, 59, 999);
    if (!Number.isFinite(validFromDate.getTime()) || !Number.isFinite(validUntilDate.getTime())) {
      toast.error("Invalid date format");
      return;
    }
    if (validUntilDate.getTime() < validFromDate.getTime()) {
      toast.error("validUntil must be the same or after validFrom");
      return;
    }

    const perUserLimitParsed = form.perUserLimit.trim() === "" ? NaN : Number(form.perUserLimit);
    const perUserLimit = Number.isInteger(perUserLimitParsed) && perUserLimitParsed >= 1
      ? perUserLimitParsed
      : (form.perUserLimit.trim() === "" ? 1 : null);
    if (perUserLimit === null) {
      toast.error("Per-user limit must be a whole number ≥ 1");
      return;
    }

    const payload: Record<string, unknown> = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value,
      validFrom: validFromDate.toISOString(),
      validUntil: validUntilDate.toISOString(),
      perUserLimit,
      isActive: form.isActive,
      activeCountries: form.activeCountries.split(",").map(s => s.trim()).filter(Boolean),
      applicableServices: form.applicableServices,
      description: form.description.trim() || undefined,
    };
    if (form.maxDiscountAmount.trim()) {
      const n = Number(form.maxDiscountAmount);
      if (!Number.isFinite(n) || n < 0) {
        toast.error("Max discount amount must be a non-negative number");
        return;
      }
      payload.maxDiscountAmount = n;
    }
    if (form.minBookingAmount.trim()) {
      const n = Number(form.minBookingAmount);
      if (!Number.isFinite(n) || n < 0) {
        toast.error("Min booking amount must be a non-negative number");
        return;
      }
      payload.minBookingAmount = n;
    }
    if (form.usageLimit.trim()) {
      const n = Number(form.usageLimit);
      if (!Number.isInteger(n) || n < 0) {
        toast.error("Usage limit must be a non-negative whole number");
        return;
      }
      payload.usageLimit = n;
    }

    try {
      setSaving(true);
      const url = editingId
        ? `${API_BASE}/api/admin/discount-codes/${editingId}`
        : `${API_BASE}/api/admin/discount-codes`;
      const res = await authFetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const detail = json?.error?.message ? ` (${json.error.message})` : "";
        throw new Error((json.msg || "Failed to save") + detail);
      }
      toast.success(editingId ? "Discount code updated" : "Discount code created");
      setDialogOpen(false);
      await loadCodes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save discount code");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (code: DiscountCode) => {
    if (!confirm(`Disable code ${code.code}? Existing redemptions are preserved.`)) return;
    try {
      const res = await authFetch(`${API_BASE}/api/admin/discount-codes/${code._id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.msg || "Failed to delete");
      toast.success("Code disabled");
      await loadCodes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete code");
    }
  };

  const stats = useMemo(() => {
    const active = codes.filter(c => statusLabel(c).label === "Active").length;
    const totalRedemptions = codes.reduce((sum, c) => sum + c.usageCount, 0);
    return { total: codes.length, active, totalRedemptions };
  }, [codes]);

  if (loading || !isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <Skeleton className="h-32 w-full mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="max-w-7xl mx-auto px-6 pt-28">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Ticket className="w-8 h-8 text-rose-500" />
              Discount Codes
            </h1>
            <p className="text-slate-600 mt-1">Create promotional codes for customers to use at checkout.</p>
          </div>
          <Button onClick={openCreate} className="bg-rose-500 hover:bg-rose-600 text-white">
            <Plus className="w-4 h-4 mr-2" /> New Code
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Total codes</CardDescription></CardHeader>
            <CardContent className="text-3xl font-bold">{stats.total}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Currently active</CardDescription></CardHeader>
            <CardContent className="text-3xl font-bold text-emerald-600">{stats.active}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Total redemptions</CardDescription></CardHeader>
            <CardContent className="text-3xl font-bold text-rose-600">{stats.totalRedemptions}</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <CardTitle>All codes</CardTitle>
              <div className="flex gap-2">
                <Input
                  placeholder="Search code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-48"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {listLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
              </div>
            ) : codes.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                No discount codes yet. Create your first one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-slate-200">
                      <th className="py-3 pr-4">Code</th>
                      <th className="py-3 pr-4">Value</th>
                      <th className="py-3 pr-4">Usage</th>
                      <th className="py-3 pr-4">Valid</th>
                      <th className="py-3 pr-4">Countries</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((c) => {
                      const st = statusLabel(c);
                      return (
                        <tr key={c._id} className="border-b border-slate-100">
                          <td className="py-3 pr-4 font-mono font-semibold">{c.code}</td>
                          <td className="py-3 pr-4">
                            {c.type === "percentage" ? `${c.value}%` : `€${c.value}`}
                            {c.maxDiscountAmount != null ? <span className="text-slate-500"> (max €{c.maxDiscountAmount})</span> : null}
                          </td>
                          <td className="py-3 pr-4">
                            {c.usageCount}{c.usageLimit != null ? ` / ${c.usageLimit}` : ""}
                          </td>
                          <td className="py-3 pr-4 whitespace-nowrap">
                            {new Date(c.validFrom).toLocaleDateString()} → {new Date(c.validUntil).toLocaleDateString()}
                          </td>
                          <td className="py-3 pr-4">
                            {c.activeCountries.length === 0 ? <span className="text-slate-400">All</span> : c.activeCountries.join(", ")}
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${st.tone}`}>{st.label}</span>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="outline" aria-label={`Edit discount code ${c.code}`} onClick={() => openEdit(c)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" aria-label={`Delete discount code ${c.code}`} onClick={() => handleDelete(c)} className="text-rose-600 hover:text-rose-700">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setServicesOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 shrink-0">
            <DialogTitle>{editingId ? "Edit discount code" : "Create discount code"}</DialogTitle>
            <DialogDescription>
              Codes are absorbed by the platform — professional payout is unaffected.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 px-6 py-4 overflow-y-auto flex-1 min-h-0">
            <div className="col-span-2">
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="SUMMER25"
                className="font-mono"
              />
            </div>

            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as DiscountType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Fixed amount (€)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Value</Label>
              <Input
                type="number"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder={form.type === "percentage" ? "10" : "15"}
              />
            </div>

            {form.type === "percentage" && (
              <div>
                <Label>Max discount (optional)</Label>
                <Input
                  type="number"
                  value={form.maxDiscountAmount}
                  onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })}
                  placeholder="€ cap"
                />
              </div>
            )}

            <div>
              <Label>Min booking amount (optional)</Label>
              <Input
                type="number"
                value={form.minBookingAmount}
                onChange={(e) => setForm({ ...form, minBookingAmount: e.target.value })}
                placeholder="€"
              />
            </div>

            <div>
              <Label>Valid from</Label>
              <Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
            </div>

            <div>
              <Label>Valid until</Label>
              <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
            </div>

            <div>
              <Label>Total usage limit (optional)</Label>
              <Input
                type="number"
                step={1}
                min={0}
                value={form.usageLimit}
                onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                placeholder="Unlimited"
              />
            </div>

            <div>
              <Label>Per-user limit</Label>
              <Input
                type="number"
                step={1}
                min={1}
                value={form.perUserLimit}
                onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <Label>Countries (ISO codes, comma-separated; empty = all)</Label>
              <Input
                value={form.activeCountries}
                onChange={(e) => setForm({ ...form, activeCountries: e.target.value })}
                placeholder="BE, NL, FR"
              />
            </div>

            <div className="col-span-2">
              <Label>Applicable services</Label>
              <div className="relative" ref={servicesPopoverRef}>
                <button
                  ref={servicesButtonRef}
                  type="button"
                  onClick={() => setServicesOpen((o) => !o)}
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  aria-haspopup="dialog"
                  aria-expanded={servicesOpen}
                >
                  <span className="truncate text-left">
                    {form.applicableServices.length === 0
                      ? "All services"
                      : form.applicableServices.length <= 2
                        ? form.applicableServices.join(", ")
                        : `${form.applicableServices.length} services selected`}
                  </span>
                  <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                </button>
                {servicesOpen && (
                  <div
                    ref={servicesContentRef}
                    role="dialog"
                    aria-label="Select applicable services"
                    tabIndex={-1}
                    className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg outline-none"
                  >
                    <label className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 cursor-pointer hover:bg-slate-50">
                      <Checkbox
                        checked={form.applicableServices.length === 0}
                        onCheckedChange={(v) => {
                          if (v) setForm({ ...form, applicableServices: [] });
                        }}
                      />
                      <span className="text-sm font-medium">All services</span>
                    </label>
                    {isLoadingServices ? (
                      <div className="px-3 py-2 text-sm text-slate-500">Loading services...</div>
                    ) : servicesError ? (
                      <div className="px-3 py-2 text-sm text-rose-600">{servicesError}</div>
                    ) : serviceCategories.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-500">No services available</div>
                    ) : (
                      serviceCategories.map((cat) => (
                        <div key={cat.name}>
                          <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-50">
                            {cat.name}
                          </div>
                          {cat.services.map((svc) => {
                            const checked = form.applicableServices.includes(svc.name);
                            return (
                              <label
                                key={`${cat.name}-${svc.name}`}
                                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-50"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => {
                                    if (v) {
                                      if (!form.applicableServices.includes(svc.name)) {
                                        setForm({ ...form, applicableServices: [...form.applicableServices, svc.name] });
                                      }
                                    } else {
                                      setForm({
                                        ...form,
                                        applicableServices: form.applicableServices.filter((s) => s !== svc.name),
                                      });
                                    }
                                  }}
                                />
                                <span className="text-sm">{svc.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {form.applicableServices.length === 0
                  ? "Code applies to all services."
                  : `Applies to ${form.applicableServices.length} service${form.applicableServices.length === 1 ? "" : "s"}.`}
              </p>
            </div>

            <div className="col-span-2">
              <Label>Description (internal)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Summer promo 2026"
              />
            </div>

            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-slate-200 shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-rose-500 hover:bg-rose-600 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingId ? "Save changes" : "Create code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
