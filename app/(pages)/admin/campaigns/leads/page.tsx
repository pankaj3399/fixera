"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileUp, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { authFetch } from "@/lib/utils";
import { classifyApiError, getErrorMessage } from "@/lib/apiErrors";
import {
  errMessage,
  marketingCountryOptions,
  normalizeLanguages,
  normalizeServices,
  requireApiBase,
  type LanguageOption,
  type ServiceOption,
} from "@/lib/admin/marketing";
import {
  DEFAULT_LEAD_DIRECTION,
  DEFAULT_LEAD_SORT,
  clampLeadPage,
  leadListHasFilters,
  leadListParams,
  nextLeadSort,
  requestLeadDelete,
  requestLeadImportHistory,
  requestLeadList,
  requestLeadUpdate,
  type LeadEditValues,
  type LeadImportRecord,
  type LeadListFilters,
  type LeadRecord,
  type LeadSortKey,
} from "@/lib/admin/marketingLeads";
import {
  LeadTable,
  LeadTableEmpty,
  LeadTableSkeleton,
  LeadImportHistoryDetails,
  LeadImportHistoryTable,
  LeadLoadError,
} from "@/components/admin/marketing/LeadTable";
import { LeadImportDialog } from "@/components/admin/marketing/LeadImportDialog";
import { LeadDeleteDialog, LeadEditDialog } from "@/components/admin/marketing/LeadFormDialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const LEAD_PAGE_SIZE = 25;
const HISTORY_PAGE_SIZE = 10;
const DEFAULT_FILTERS: LeadListFilters = {
  q: "",
  country: "all",
  locale: "all",
  service: "all",
  sort: DEFAULT_LEAD_SORT,
  direction: DEFAULT_LEAD_DIRECTION,
};

export default function MarketingLeadsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { canAccessPath, canWriteArea } = useAdminAccess();
  const canRead =
    !authLoading &&
    Boolean(isAuthenticated && user?.role === "admin") &&
    canAccessPath("/admin/campaigns/leads");
  const canWrite = canRead && canWriteArea("campaigns");

  const [rows, setRows] = useState<LeadRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LeadListFilters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [languages, setLanguages] = useState<LanguageOption[]>(() => normalizeLanguages([]));
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [languagesError, setLanguagesError] = useState<string | null>(null);
  const [catalogRetry, setCatalogRetry] = useState(0);

  const [importOpen, setImportOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadRecord | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingLead, setDeletingLead] = useState<LeadRecord | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [history, setHistory] = useState<LeadImportRecord[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyDetails, setHistoryDetails] = useState<LeadImportRecord | null>(null);

  const latestListId = useRef(0);
  const latestHistoryId = useRef(0);
  const listAbort = useRef<AbortController | null>(null);
  const historyAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/login?redirect=%2Fadmin%2Fcampaigns%2Fleads");
      return;
    }
    if (user?.role !== "admin" || !canRead) router.replace("/dashboard");
  }, [authLoading, canRead, isAuthenticated, router, user?.role]);

  const load = useCallback(async (): Promise<boolean> => {
    const requestId = ++latestListId.current;
    listAbort.current?.abort();
    const controller = new AbortController();
    listAbort.current = controller;
    setLoading(true);
    setLoadError(null);
    try {
      const params = leadListParams(filters, page, LEAD_PAGE_SIZE);
      const result = await requestLeadList(params, {
        apiBase: requireApiBase(),
        signal: controller.signal,
      });
      if (requestId !== latestListId.current || controller.signal.aborted) return false;
      const nextTotalPages = Math.max(1, result.pagination.totalPages);
      setTotal(result.pagination.total);
      setTotalPages(nextTotalPages);
      const clampedPage = clampLeadPage(page, nextTotalPages);
      if (clampedPage !== page) {
        setPage(clampedPage);
        return true;
      }
      setRows(result.leads);
      return true;
    } catch (error) {
      if (requestId !== latestListId.current || controller.signal.aborted) return false;
      setLoadError(getErrorMessage(error, "Failed to load leads"));
      return false;
    } finally {
      if (requestId === latestListId.current) setLoading(false);
    }
  }, [filters, page]);

  const loadHistory = useCallback(async (): Promise<boolean> => {
    const requestId = ++latestHistoryId.current;
    historyAbort.current?.abort();
    const controller = new AbortController();
    historyAbort.current = controller;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams({
        page: String(historyPage),
        limit: String(HISTORY_PAGE_SIZE),
      });
      const result = await requestLeadImportHistory(params, {
        apiBase: requireApiBase(),
        signal: controller.signal,
      });
      if (requestId !== latestHistoryId.current || controller.signal.aborted) return false;
      const nextTotalPages = Math.max(1, result.pagination.totalPages);
      setHistoryTotal(result.pagination.total);
      setHistoryTotalPages(nextTotalPages);
      setHistory(result.imports);
      setHistoryPage((current) => clampLeadPage(current, nextTotalPages));
      return true;
    } catch (error) {
      if (requestId !== latestHistoryId.current || controller.signal.aborted) return false;
      setHistoryError(getErrorMessage(error, "Failed to load upload history"));
      return false;
    } finally {
      if (requestId === latestHistoryId.current) setHistoryLoading(false);
    }
  }, [historyPage]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  useEffect(() => {
    if (canRead) void loadHistory();
  }, [canRead, loadHistory]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setFilters((current) => {
        if (current.q === searchInput) return current;
        return { ...current, q: searchInput };
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setServicesError(null);
    setLanguagesError(null);
    authFetch(`${requireApiBase()}/api/admin/marketing-campaigns/service-options`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) {
          throw new Error("Service options unavailable");
        }
        if (!controller.signal.aborted) {
          setServices(normalizeServices(json.data?.services || json.data?.options || json.data));
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setServicesError(errMessage(error, "Service options unavailable."));
      });
    authFetch(`${requireApiBase()}/api/public/marketing/languages`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) {
          throw new Error("Language catalog unavailable");
        }
        if (!controller.signal.aborted) {
          setLanguages(normalizeLanguages(json.data?.languages || json.data));
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLanguagesError(errMessage(error, "Language catalog unavailable."));
      });
    return () => controller.abort();
  }, [canRead, catalogRetry]);

  const updateFilters = (next: Partial<LeadListFilters>) => {
    setPage(1);
    setFilters((current) => ({ ...current, ...next }));
  };

  const handleSort = (key: LeadSortKey) => {
    const next = nextLeadSort(filters.sort, filters.direction, key);
    setPage(1);
    setFilters((current) => ({ ...current, ...next }));
  };

  const clearFilters = () => {
    setSearchInput("");
    setPage(1);
    setFilters((current) => ({
      ...DEFAULT_FILTERS,
      sort: current.sort,
      direction: current.direction,
    }));
  };

  const refreshAfterMutation = async (successMessage: string, failureMessage: string) => {
    const refreshed = await load();
    if (refreshed) toast.success(successMessage);
    else toast.error(failureMessage);
  };

  const saveEdit = async (lead: LeadRecord, values: LeadEditValues) => {
    if (!canWrite || editSaving) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await requestLeadUpdate(lead._id, values, { apiBase: requireApiBase() });
      setEditingLead(null);
      await refreshAfterMutation(
        "Lead updated.",
        "The lead was saved, but the list could not be refreshed. Use Retry to reload.",
      );
    } catch (error) {
      const status = classifyApiError(error).status;
      if (status === 404) {
        setEditingLead(null);
        const refreshed = await load();
        toast.error(
          refreshed
            ? "This lead was removed. The list was refreshed."
            : "This lead was removed, but the list could not be refreshed. Use Retry to reload.",
        );
      } else {
        setEditError(getErrorMessage(error, "Failed to save lead"));
      }
    } finally {
      setEditSaving(false);
    }
  };

  const deleteLead = async (lead: LeadRecord) => {
    if (!canWrite || deleteSaving) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await requestLeadDelete(lead._id, { apiBase: requireApiBase() });
      setDeletingLead(null);
      await refreshAfterMutation(
        "Lead deleted.",
        "The lead was deleted, but the list could not be refreshed. Use Retry to reload.",
      );
    } catch (error) {
      const status = classifyApiError(error).status;
      if (status === 404) {
        setDeletingLead(null);
        const refreshed = await load();
        toast.error(
          refreshed
            ? "This lead was already removed. The list was refreshed."
            : "This lead was already removed, but the list could not be refreshed. Use Retry to reload.",
        );
      } else {
        setDeleteError(getErrorMessage(error, "Failed to delete lead"));
      }
    } finally {
      setDeleteSaving(false);
    }
  };

  const handleImported = async () => {
    const refreshed = await load();
    if (!refreshed) {
      toast.error("Could not refresh lead records after the import attempt. Use Retry to reload.");
    }
    if (historyPage === 1) {
      void loadHistory();
    } else {
      setHistoryPage(1);
    }
  };

  if (authLoading || !canRead) {
    return (
      <div className="p-8">
        <Skeleton className="mb-4 h-10 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const hasFilters = leadListHasFilters(filters);
  const listAnnouncement = `${rows.length} leads loaded on page ${page} of ${totalPages}. ${total} total.`;
  const countryOptions = marketingCountryOptions(services, [
    ...rows.map((row) => row.country),
    ...(filters.country === "all" ? [] : [filters.country]),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads database</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Professional contacts imported from Excel. Separate from consent-backed subscribers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <Button onClick={() => setImportOpen(true)}>
              <FileUp className="mr-2 h-4 w-4" aria-hidden />
              Import Leads
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => router.push("/admin/campaigns")}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
            Campaigns
          </Button>
        </div>
      </div>

      {!canWrite ? (
        <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Read-only access. Import, edit and delete actions are disabled.
        </p>
      ) : null}

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[1.6fr_repeat(3,1fr)_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              className="pl-9"
              placeholder="Search email"
              aria-label="Filter leads by email"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            {searchInput.trim().length === 1 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Enter at least 2 characters to search.
              </p>
            ) : null}
          </div>
          <Select
            value={filters.country}
            onValueChange={(country) => updateFilters({ country })}
          >
            <SelectTrigger aria-label="Filter leads by country" className="w-full">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {countryOptions.map((country) => (
                <SelectItem key={country.value} value={country.value}>
                  {country.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.locale}
            onValueChange={(locale) => updateFilters({ locale })}
          >
            <SelectTrigger aria-label="Filter leads by language" className="w-full">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All languages</SelectItem>
              {languages.map((language) => (
                <SelectItem key={language.code} value={language.code}>
                  {language.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1">
            <Select
              value={filters.service}
              onValueChange={(service) => updateFilters({ service })}
            >
              <SelectTrigger aria-label="Filter leads by service" className="w-full">
                <SelectValue placeholder="Service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                {services.map((service) => (
                  <SelectItem key={service.key} value={service.key}>
                    {service.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {servicesError ? (
              <p className="text-xs text-amber-700" role="alert">
                {servicesError}{" "}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => setCatalogRetry((current) => current + 1)}
                >
                  Retry
                </button>
              </p>
            ) : null}
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={clearFilters} disabled={!hasFilters && !searchInput}>
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>
      {languagesError ? (
        <p className="text-xs text-amber-700" role="alert">
          {languagesError}{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => setCatalogRetry((current) => current + 1)}
          >
            Retry
          </button>
        </p>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {listAnnouncement}
      </p>

      <Card aria-busy={loading}>
        <CardHeader>
          <CardTitle>
            Leads{" "}
            <span className="text-base font-normal text-muted-foreground">({total})</span>
          </CardTitle>
          <CardDescription>
            Server-side filters and sorting across the full lead database. Suppressed leads stay
            visible but are not eligible for campaigns.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {loading && rows.length === 0 ? (
            <LeadTableSkeleton />
          ) : loadError && rows.length === 0 ? (
            <LeadLoadError message={loadError} onRetry={() => void load()} />
          ) : rows.length === 0 ? (
            <LeadTableEmpty
              hasFilters={hasFilters}
              canWrite={canWrite}
              onImport={() => setImportOpen(true)}
              onClearFilters={clearFilters}
            />
          ) : (
            <>
              {loadError ? (
                <LeadLoadError message={loadError} onRetry={() => void load()} />
              ) : null}
              <LeadTable
                leads={rows}
                services={services}
                languages={languages}
                sort={filters.sort}
                direction={filters.direction}
                canWrite={canWrite}
                busyLeadId={editSaving ? editingLead?._id || null : deleteSaving ? deletingLead?._id || null : null}
                onSort={handleSort}
                onEdit={(lead) => {
                  setEditingLead(lead);
                  setEditError(null);
                }}
                onDelete={(lead) => {
                  setDeletingLead(lead);
                  setDeleteError(null);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Next
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Upload history</CardTitle>
          <CardDescription>
            File name, upload time and import result. The workbook itself is not stored or
            downloadable.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <LeadImportHistoryTable
            imports={history}
            loading={historyLoading}
            error={historyError}
            page={historyPage}
            totalPages={historyTotalPages}
            total={historyTotal}
            onRetry={() => void loadHistory()}
            onPageChange={setHistoryPage}
            onViewDetails={(record) => setHistoryDetails(record)}
          />
        </CardContent>
      </Card>

      <LeadImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportAttempted={() => {
          void handleImported();
        }}
        onOpenLeads={() => {
          setImportOpen(false);
          void load();
          if (historyPage === 1) void loadHistory();
          else setHistoryPage(1);
        }}
      />

      <LeadEditDialog
        open={Boolean(editingLead)}
        lead={editingLead}
        services={services}
        languages={languages}
        catalogError={servicesError || languagesError}
        saving={editSaving}
        error={editError}
        onOpenChange={(open) => {
          if (!open && !editSaving) {
            setEditingLead(null);
            setEditError(null);
          }
        }}
        onSave={(lead, values) => {
          void saveEdit(lead, values);
        }}
      />

      <LeadDeleteDialog
        open={Boolean(deletingLead)}
        lead={deletingLead}
        deleting={deleteSaving}
        error={deleteError}
        onOpenChange={(open) => {
          if (!open && !deleteSaving) {
            setDeletingLead(null);
            setDeleteError(null);
          }
        }}
        onDelete={(lead) => {
          void deleteLead(lead);
        }}
      />

      <Dialog
        open={Boolean(historyDetails)}
        onOpenChange={(open) => {
          if (!open) setHistoryDetails(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import details</DialogTitle>
          </DialogHeader>
          {historyDetails ? <LeadImportHistoryDetails record={historyDetails} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
