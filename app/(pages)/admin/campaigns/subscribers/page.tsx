"use client"

import { messageFromApiBody } from "@/lib/apiErrors";


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { EU_COUNTRIES } from "@/lib/countries";
import { authFetch } from "@/lib/utils";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { errMessage, formatDate, normalizeLanguages, requireApiBase, subscriberSyncSummary, type LanguageOption, type ServiceOption } from "@/lib/admin/marketing";
import { Loader2, RefreshCw, Search, Users } from "lucide-react";
import { toast } from "sonner";

type Subscriber = {
  _id: string;
  email: string;
  name?: string;
  firstName?: string;
  role?: string;
  region?: string;
  locale?: string;
  interestedServices?: string[];
  serviceKeys?: string[];
  subscribedAt?: string;
  consentVerifiedAt?: string | null;
  unsubscribedAt?: string | null;
  lastCampaignSentAt?: string | null;
  suppressed?: boolean;
  suppressionReason?: string;
};

export default function MarketingSubscribersPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { canAccessPath, canWriteArea } = useAdminAccess();
  const allowed = !authLoading && Boolean(isAuthenticated && user?.role === "admin") && canAccessPath("/admin/campaigns/subscribers");
  const canWrite = allowed && canWriteArea("campaigns");
  const [rows, setRows] = useState<Subscriber[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [languages, setLanguages] = useState<LanguageOption[]>(() => normalizeLanguages([]));
  const [filters, setFilters] = useState({ q: "", country: "all", locale: "all", service: "all", status: "active" });
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const latestLoadId = useRef(0);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/login");
    else if (!authLoading && isAuthenticated && user?.role !== "admin") router.replace("/dashboard");
    else if (!authLoading && isAuthenticated && !allowed) router.replace("/dashboard");
  }, [allowed, authLoading, isAuthenticated, router, user?.role]);

  const load = useCallback(async () => {
    const loadId = ++latestLoadId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.country !== "all") params.set("region", filters.country);
      if (filters.locale !== "all") params.set("locale", filters.locale);
      if (filters.service !== "all") params.set("serviceKey", filters.service);
      if (filters.status !== "all") params.set("status", filters.status);
      const response = await authFetch(`${requireApiBase()}/api/admin/marketing-subscribers?${params.toString()}`);
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(messageFromApiBody(json, "Failed to load subscribers"));
      if (loadId !== latestLoadId.current) return;
      setRows(json.data?.subscribers || []);
      setTotal(Number(json.data?.pagination?.total) || 0);
      setTotalPages(Math.max(1, Number(json.data?.pagination?.totalPages) || 1));
    } catch (error) {
      if (loadId === latestLoadId.current) toast.error(errMessage(error, "Failed to load subscribers"));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { if (allowed) void load(); }, [allowed, load]);
  useEffect(() => { setPage(1); }, [filters]);
  useEffect(() => { const timer = setTimeout(() => setFilters((current) => (current.q === searchInput ? current : { ...current, q: searchInput })), 300); return () => clearTimeout(timer); }, [searchInput]);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    authFetch(`${requireApiBase()}/api/admin/marketing-campaigns/service-options`, { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error("Service options unavailable");
        if (!controller.signal.aborted) setServices(json.data?.services || []);
      })
      .catch(() => { if (!controller.signal.aborted) setServices([]); });
    return () => controller.abort();
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    authFetch(`${requireApiBase()}/api/public/marketing/languages`, { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error("Language catalog unavailable");
        if (!controller.signal.aborted) setLanguages(normalizeLanguages(json.data?.languages || json.data));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [allowed]);

  const countryOptions = useMemo(() => EU_COUNTRIES.map((country) => ({ value: country.code, label: `${country.name} (${country.code})` })), []);

  const sync = async () => {
    if (!canWrite) return;
    setSyncing(true);
    try {
      const response = await authFetch(`${requireApiBase()}/api/admin/marketing-subscribers/sync`, { method: "POST" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(messageFromApiBody(json, "Subscriber sync failed"));
      const summary = subscriberSyncSummary(json.data);
      if (summary.tone === "warning") toast.warning(summary.message);
      else toast.success(summary.message);
      await load();
    } catch (error) { toast.error(errMessage(error, "Subscriber sync failed")); }
    finally { setSyncing(false); }
  };

  if (authLoading || !allowed) return <div className="p-8"><Skeleton className="mb-4 h-10 w-72" /><Skeleton className="h-48 w-full" /></div>;

  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Marketing subscribers</h1><p className="mt-1 text-sm text-muted-foreground">Consent-backed subscribers synchronized from user notification preferences.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => router.push("/admin/campaigns")}><Users className="mr-2 h-4 w-4" />Campaigns</Button>{canWrite ? <Button onClick={() => void sync()} disabled={syncing}>{syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Sync subscribers</Button> : null}</div>
    </div>
    <Card><CardContent className="grid gap-3 p-4 md:grid-cols-[1.6fr_repeat(4,1fr)]">
      <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search email" aria-label="Search subscribers" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></div>
      <Select value={filters.country} onValueChange={(country) => setFilters((current) => ({ ...current, country }))}><SelectTrigger aria-label="Filter by country"><SelectValue placeholder="Country" /></SelectTrigger><SelectContent><SelectItem value="all">All countries</SelectItem>{countryOptions.map((country) => <SelectItem key={country.value} value={country.value}>{country.label}</SelectItem>)}</SelectContent></Select>
      <Select value={filters.locale} onValueChange={(locale) => setFilters((current) => ({ ...current, locale }))}><SelectTrigger aria-label="Filter by language"><SelectValue placeholder="Language" /></SelectTrigger><SelectContent><SelectItem value="all">All languages</SelectItem>{languages.map((language) => <SelectItem key={language.code} value={language.code}>{language.label}</SelectItem>)}</SelectContent></Select>
      <Select value={filters.service} onValueChange={(service) => setFilters((current) => ({ ...current, service }))}><SelectTrigger aria-label="Filter by service"><SelectValue placeholder="Service" /></SelectTrigger><SelectContent><SelectItem value="all">All services</SelectItem>{services.map((service) => <SelectItem key={service.key} value={service.key}>{service.label}</SelectItem>)}</SelectContent></Select>
      <Select value={filters.status} onValueChange={(status) => setFilters((current) => ({ ...current, status }))}><SelectTrigger aria-label="Filter by status"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="unsubscribed">Unsubscribed</SelectItem></SelectContent></Select>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Subscribers <span className="text-base font-normal text-muted-foreground">({total})</span></CardTitle><CardDescription>Use filters to inspect the exact consent audience available to campaigns.</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0">
      {loading ? <div className="space-y-3 p-6"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No subscribers match these filters.</p> : <Table><TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Name / role</TableHead><TableHead>Country</TableHead><TableHead>Language</TableHead><TableHead>Services</TableHead><TableHead>Consent verified</TableHead><TableHead>Status</TableHead><TableHead>Last send</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => { const servicesForRow = row.serviceKeys?.length ? row.serviceKeys : row.interestedServices || []; const suppressed = Boolean(row.suppressed || row.unsubscribedAt); return <TableRow key={row._id}><TableCell className="font-medium">{row.email}</TableCell><TableCell>{row.firstName || row.name || "—"}<div className="text-xs text-muted-foreground">{row.role || "—"}</div></TableCell><TableCell>{row.region || "—"}</TableCell><TableCell>{(row.locale || "en").toUpperCase()}</TableCell><TableCell className="max-w-56">{servicesForRow.length ? servicesForRow.join(", ") : "—"}</TableCell><TableCell className="whitespace-nowrap">{formatDate(row.consentVerifiedAt || undefined)}</TableCell><TableCell><Badge variant={suppressed ? "destructive" : "secondary"}>{suppressed ? `Suppressed${row.suppressionReason ? ` · ${row.suppressionReason}` : ""}` : "Active"}</Badge></TableCell><TableCell className="whitespace-nowrap">{formatDate(row.lastCampaignSentAt || undefined)}</TableCell></TableRow>; })}</TableBody></Table>}
    </CardContent></Card>
    {totalPages > 1 && <div className="flex items-center justify-between"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</Button><span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>Next</Button></div>}
  </div>;
}
