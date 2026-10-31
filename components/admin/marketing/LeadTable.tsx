"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, RefreshCw, SearchX, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, type LanguageOption, type ServiceOption } from "@/lib/admin/marketing";
import {
  LEAD_SORT_LABELS,
  leadImportOutcome,
  leadImportStatusLabel,
  leadIsSuppressed,
  leadServiceLabels,
  leadSortAria,
  leadSortButtonLabel,
  type LeadImportRecord,
  type LeadRecord,
  type LeadSortKey,
  type SortDirection,
} from "@/lib/admin/marketingLeads";

const SORTABLE_COLUMNS: LeadSortKey[] = ["email", "country", "locale", "service"];

function SortHeader({
  column,
  sort,
  direction,
  onSort,
}: {
  column: LeadSortKey;
  sort: LeadSortKey;
  direction: SortDirection;
  onSort: (column: LeadSortKey) => void;
}) {
  const active = column === sort;
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead scope="col" aria-sort={leadSortAria(column, sort, direction)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 rounded-sm text-left font-medium underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={leadSortButtonLabel(column, sort, direction)}
      >
        {LEAD_SORT_LABELS[column]}
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </button>
    </TableHead>
  );
}

export interface LeadTableProps {
  leads: LeadRecord[];
  services: readonly ServiceOption[];
  languages: readonly LanguageOption[];
  sort: LeadSortKey;
  direction: SortDirection;
  canWrite: boolean;
  busyLeadId?: string | null;
  onSort: (column: LeadSortKey) => void;
  onEdit: (lead: LeadRecord) => void;
  onDelete: (lead: LeadRecord) => void;
}

export function LeadTable({
  leads,
  services,
  languages,
  sort,
  direction,
  canWrite,
  busyLeadId,
  onSort,
  onEdit,
  onDelete,
}: LeadTableProps) {
  const languageLabels = new Map(languages.map((language) => [language.code, language.label]));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {SORTABLE_COLUMNS.map((column) => (
            <SortHeader
              key={column}
              column={column}
              sort={sort}
              direction={direction}
              onSort={onSort}
            />
          ))}
          <TableHead scope="col">Status</TableHead>
          {canWrite ? <TableHead scope="col">Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => {
          const suppressed = leadIsSuppressed(lead);
          const labels = leadServiceLabels(lead, services);
          const busy = busyLeadId === lead._id;
          return (
            <TableRow key={lead._id}>
              <TableCell className="max-w-72 whitespace-normal break-words font-medium">
                {lead.email}
              </TableCell>
              <TableCell className="whitespace-nowrap">{lead.country || "—"}</TableCell>
              <TableCell className="whitespace-nowrap" title={languageLabels.get(lead.locale)}>
                {lead.locale ? lead.locale.toUpperCase() : "—"}
              </TableCell>
              <TableCell className="max-w-64 whitespace-normal">
                {labels.length ? labels.join(", ") : "—"}
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <Badge variant={suppressed ? "destructive" : "secondary"}>
                    {suppressed ? "Suppressed" : "Active lead"}
                  </Badge>
                  {suppressed && lead.suppressionReason ? (
                    <p className="max-w-40 text-xs text-muted-foreground">
                      {lead.suppressionReason}
                    </p>
                  ) : null}
                </div>
              </TableCell>
              {canWrite ? (
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => onEdit(lead)}
                      aria-label={`Edit lead ${lead.email}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => onDelete(lead)}
                      aria-label={`Delete lead ${lead.email}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" aria-hidden />
                      Delete
                    </Button>
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function LeadTableSkeleton() {
  return (
    <div className="space-y-3 p-6" role="status" aria-live="polite">
      <span className="sr-only">Loading leads</span>
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function LeadTableEmpty({
  hasFilters,
  canWrite,
  onImport,
  onClearFilters,
}: {
  hasFilters: boolean;
  canWrite: boolean;
  onImport: () => void;
  onClearFilters: () => void;
}) {
  if (hasFilters) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm text-muted-foreground">No leads match these filters.</p>
        <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3 p-6">
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <SearchX className="mt-0.5 h-4 w-4" aria-hidden />
        <p>
          {canWrite
            ? "No leads yet. Import Leads to add professional contacts."
            : "No leads yet. Imported professional contacts will appear here."}
        </p>
      </div>
      {canWrite ? (
        <Button type="button" size="sm" onClick={onImport}>
          Import Leads
        </Button>
      ) : null}
    </div>
  );
}

export function LeadLoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="m-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
      <p>{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-3 bg-white">
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Retry
      </Button>
    </div>
  );
}

const IMPORT_TONE_CLASSES: Record<string, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  danger: "border-rose-200 bg-rose-50 text-rose-950",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

function importTone(record: LeadImportRecord): string {
  return leadImportOutcome(record).tone;
}

function countText(record: LeadImportRecord): string {
  if (record.fileError) return record.fileError;
  const parts = [
    record.importedRows > 0 ? `Imported ${record.importedRows}` : "",
    record.duplicateRows > 0 ? `Duplicates ${record.duplicateRows}` : "",
    record.failedRows > 0 ? `Failed ${record.failedRows}` : "",
    record.suppressedRows > 0 ? `Suppressed ${record.suppressedRows}` : "",
    record.errorCount > 0 && record.errors.length === 0 ? `Errors ${record.errorCount}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No changes";
}

export interface LeadImportHistoryTableProps {
  imports: LeadImportRecord[];
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  total: number;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onViewDetails?: (record: LeadImportRecord) => void;
}

export function LeadImportHistoryTable({
  imports,
  loading,
  error,
  page,
  totalPages,
  total,
  onRetry,
  onPageChange,
  onViewDetails,
}: LeadImportHistoryTableProps) {
  if (loading) {
    return (
      <div className="space-y-3 p-6" role="status" aria-live="polite">
        <span className="sr-only">Loading upload history</span>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (error) {
    return <LeadLoadError message={error} onRetry={onRetry} />;
  }
  if (!imports.length) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No imports yet. Imported workbooks will appear here.
      </p>
    );
  }
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">File</TableHead>
            <TableHead scope="col">Uploaded</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col">Rows</TableHead>
            <TableHead scope="col">Result</TableHead>
            {onViewDetails ? <TableHead scope="col">Details</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {imports.map((record) => {
            const tone = importTone(record);
            return (
              <TableRow key={record._id || `${record.filename}-${record.uploadedAt || ""}`}>
                <TableCell className="max-w-64 whitespace-normal break-words font-medium">
                  {record.filename}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {record.uploadedAt ? formatDate(record.uploadedAt) : "Unknown time"}
                </TableCell>
                <TableCell>
                  <span
                    data-import-tone={tone}
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${IMPORT_TONE_CLASSES[tone] || IMPORT_TONE_CLASSES.neutral}`}
                  >
                    {leadImportStatusLabel(record)}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">{record.totalRows}</TableCell>
                <TableCell className="max-w-80 whitespace-normal text-xs text-muted-foreground">
                  {countText(record)}
                </TableCell>
                {onViewDetails ? (
                  <TableCell>
                    {record.errors.length ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onViewDetails(record)}
                        aria-label={`View errors for ${record.filename}`}
                      >
                        View errors
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {total} {total === 1 ? "import" : "imports"}
        </p>
        {totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LeadImportErrorsList({
  errors,
  total,
}: {
  errors: LeadImportRecord["errors"];
  total?: number;
}) {
  if (!errors.length) return null;
  const visible = errors.slice(0, 50);
  const totalCount = total ?? errors.length;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Row errors</p>
      <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-background/60 p-2 text-xs">
        {visible.map((error, index) => (
          <li key={`${error.row ?? "row"}-${error.field ?? "field"}-${index}`}>
            {error.row !== undefined ? `Row ${error.row}` : "Workbook"}
            {error.field ? `, ${error.field}` : ""}: {error.message}
          </li>
        ))}
      </ul>
      {totalCount > visible.length ? (
        <p className="text-xs text-muted-foreground">
          Showing the first {visible.length} of {totalCount} errors.
        </p>
      ) : null}
    </div>
  );
}

export function LeadImportHistoryDetails({ record }: { record: LeadImportRecord }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p className="break-words">
          <span className="text-muted-foreground">File:</span> {record.filename}
        </p>
        <p>
          <span className="text-muted-foreground">Uploaded:</span>{" "}
          {record.uploadedAt ? formatDate(record.uploadedAt) : "Unknown time"}
        </p>
        <p>
          <span className="text-muted-foreground">Status:</span>{" "}
          {leadImportStatusLabel(record)}
        </p>
        <p>
          <span className="text-muted-foreground">Rows:</span> {record.totalRows}
        </p>
      </div>
      {record.fileError ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {record.fileError}
        </p>
      ) : null}
      <LeadImportErrorsList errors={record.errors} total={record.errorCount} />
    </div>
  );
}
