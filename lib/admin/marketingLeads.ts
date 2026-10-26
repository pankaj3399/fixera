import {
  ApiRequestError,
  apiErrorFromBody,
  classifyApiError,
  getErrorMessage,
  readJsonResponse,
  type ApiErrorKind,
} from "@/lib/apiErrors";
import { authFetch } from "@/lib/utils";
import type { ServiceOption } from "@/lib/admin/marketing";

export const LEAD_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const LEAD_IMPORT_MAX_ROWS = 5000;
export const LEAD_IMPORT_ACCEPT = ".xlsx,.xls";
export const LEAD_IMPORT_FILE_FIELD = "file";
export const LEAD_LIST_ENDPOINT = "/api/admin/marketing-leads";
export const LEAD_IMPORT_ENDPOINT = "/api/admin/marketing-leads/import";
export const LEAD_IMPORT_HISTORY_ENDPOINT = "/api/admin/marketing-lead-imports";

export type LeadSortKey =
  | "email"
  | "country"
  | "locale"
  | "service"
  | "createdAt"
  | "updatedAt"
  | "lastCampaignSentAt";
export type SortDirection = "asc" | "desc";

export const LEAD_SORT_LABELS: Record<LeadSortKey, string> = {
  email: "Email",
  country: "Country",
  locale: "Language",
  service: "Service",
  createdAt: "Created",
  updatedAt: "Updated",
  lastCampaignSentAt: "Last send",
};

export const DEFAULT_LEAD_SORT: LeadSortKey = "email";
export const DEFAULT_LEAD_DIRECTION: SortDirection = "asc";

export interface LeadListFilters {
  q: string;
  country: string;
  locale: string;
  service: string;
  sort: LeadSortKey;
  direction: SortDirection;
}

export interface LeadRecord {
  _id: string;
  email: string;
  country: string;
  locale: string;
  serviceKeys: string[];
  interestedServices?: string[];
  status?: string;
  unsubscribedAt?: string | null;
  lastCampaignSentAt?: string | null;
  suppressed: boolean;
  suppressionReason?: string | null;
  sourceImportId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeadListPage {
  leads: LeadRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LeadImportErrorRow {
  row?: number;
  field?: string;
  message: string;
}

export interface LeadImportRecord {
  _id?: string;
  filename: string;
  uploadedAt?: string | null;
  uploadedBy?: string | null;
  status: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  failedRows: number;
  suppressedRows: number;
  fileError?: string | null;
  errorCount: number;
  errors: LeadImportErrorRow[];
}

export interface LeadImportHistoryPage {
  imports: LeadImportRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LeadEditValues {
  country: string;
  locale: string;
  serviceKeys: string[];
}

export type LeadImportKind =
  | "success"
  | "partial"
  | "duplicate"
  | "failed"
  | "processing"
  | "empty"
  | "unknown";
export type LeadImportTone = "success" | "neutral" | "warning" | "danger";

export interface LeadImportOutcome {
  kind: LeadImportKind;
  tone: LeadImportTone;
  title: string;
  message: string;
  statusLabel: string;
  counts: {
    totalRows: number;
    importedRows: number;
    duplicateRows: number;
    failedRows: number;
    suppressedRows: number;
  };
}

export interface LeadImportErrorState {
  message: string;
  retryable: boolean;
  ambiguous: boolean;
  kind: string;
  status?: number;
  code?: string;
}

export interface RequestOptions {
  apiBase: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export class LeadImportRequestError extends ApiRequestError {
  readonly record?: LeadImportRecord;

  constructor(
    message: string,
    options: { kind?: ApiErrorKind; status?: number; code?: string; serverMessage?: string },
    record?: LeadImportRecord,
  ) {
    super(message, options);
    this.name = "LeadImportRequestError";
    this.record = record;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function optionalCount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
}

function parsePagination(
  value: unknown,
  fallback: { page: number; limit: number; total: number },
): LeadListPage["pagination"] {
  const record = asRecord(value) || {};
  const total = asCount(record.total) || fallback.total;
  const limit = asCount(record.limit) || fallback.limit;
  const page = asCount(record.page) || fallback.page;
  const totalPages = asCount(record.totalPages) || Math.max(1, Math.ceil(total / Math.max(1, limit)));
  return { page, limit, total, totalPages };
}

export function leadListParams(
  filters: LeadListFilters,
  page: number,
  limit: number,
): URLSearchParams {
  const params = new URLSearchParams();
  const query = filters.q.trim();
  if (query.length >= 2) params.set("q", query);
  if (filters.country && filters.country !== "all") params.set("country", filters.country);
  if (filters.locale && filters.locale !== "all") params.set("locale", filters.locale);
  if (filters.service && filters.service !== "all") params.set("serviceKey", filters.service);
  params.set("sort", filters.sort);
  params.set("direction", filters.direction);
  params.set("page", String(Math.max(1, page)));
  params.set("limit", String(Math.max(1, limit)));
  return params;
}

export function leadListHasFilters(filters: LeadListFilters): boolean {
  return (
    filters.q.trim().length >= 2 ||
    (Boolean(filters.country) && filters.country !== "all") ||
    (Boolean(filters.locale) && filters.locale !== "all") ||
    (Boolean(filters.service) && filters.service !== "all")
  );
}

export function clampLeadPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, totalPages));
}

export function nextLeadSort(
  current: LeadSortKey,
  direction: SortDirection,
  key: LeadSortKey,
): { sort: LeadSortKey; direction: SortDirection } {
  return current === key
    ? { sort: key, direction: direction === "asc" ? "desc" : "asc" }
    : { sort: key, direction: "asc" };
}

export function leadSortAria(
  key: LeadSortKey,
  sort: LeadSortKey,
  direction: SortDirection,
): "ascending" | "descending" | "none" {
  if (key !== sort) return "none";
  return direction === "asc" ? "ascending" : "descending";
}

export function leadSortButtonLabel(
  key: LeadSortKey,
  sort: LeadSortKey,
  direction: SortDirection,
): string {
  const label = LEAD_SORT_LABELS[key];
  if (key !== sort) return `Sort by ${label} ascending`;
  return direction === "asc"
    ? `Sort by ${label} descending`
    : `Sort by ${label} ascending`;
}

export function normalizeLeadRecord(value: unknown): LeadRecord | null {
  const record = asRecord(value);
  const id = asString(record?._id);
  const email = asString(record?.email);
  if (!record || !id || !email) return null;
  const serviceKeys = asStringArray(record.serviceKeys);
  const interestedServices = asStringArray(record.interestedServices);
  const unsubscribedAt = typeof record.unsubscribedAt === "string" ? record.unsubscribedAt : null;
  return {
    _id: id,
    email,
    country: asString(record.country)?.toUpperCase() || "",
    locale: asString(record.locale)?.toLowerCase() || "",
    serviceKeys: serviceKeys.length ? serviceKeys : interestedServices,
    interestedServices: interestedServices.length ? interestedServices : undefined,
    status: asString(record.status),
    unsubscribedAt,
    lastCampaignSentAt:
      typeof record.lastCampaignSentAt === "string" ? record.lastCampaignSentAt : null,
    suppressed: Boolean(record.suppressed) || Boolean(unsubscribedAt),
    suppressionReason: asString(record.suppressionReason) || null,
    sourceImportId: asString(record.sourceImportId) || null,
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
  };
}

export function normalizeLeadRows(value: unknown): LeadRecord[] {
  return Array.isArray(value)
    ? value.map(normalizeLeadRecord).filter((lead): lead is LeadRecord => Boolean(lead))
    : [];
}

export function leadServiceKeys(lead: LeadRecord): string[] {
  return lead.serviceKeys.length ? lead.serviceKeys : lead.interestedServices || [];
}

export function leadServiceLabels(lead: LeadRecord, services: readonly ServiceOption[]): string[] {
  const labels = new Map<string, string>();
  const catalog = new Map(services.map((service) => [service.key, service.label]));
  leadServiceKeys(lead).forEach((key) => {
    const label = catalog.get(key) || catalog.get(key.toLowerCase()) || key;
    labels.set(key, label);
  });
  return Array.from(labels.values());
}

export function leadIsSuppressed(lead: LeadRecord): boolean {
  return Boolean(lead.suppressed || lead.unsubscribedAt);
}

export function leadSuppressionLabel(lead: LeadRecord): string {
  if (!leadIsSuppressed(lead)) return "Active lead";
  return lead.suppressionReason ? `Suppressed: ${lead.suppressionReason}` : "Suppressed";
}

export function leadFileValidation(file: Pick<File, "name" | "size"> | null | undefined): string | null {
  if (!file) return "Choose an Excel workbook (.xlsx or .xls) to import.";
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    return "Choose an Excel workbook (.xlsx or .xls).";
  }
  if (file.size <= 0) return "The selected file is empty.";
  if (file.size > LEAD_IMPORT_MAX_BYTES) return "The workbook must be 5 MB or smaller.";
  return null;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseImportErrors(value: unknown): LeadImportErrorRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const record = asRecord(entry);
      const message =
        asString(record?.message) || asString(record?.msg) || asString(entry);
      if (!message) return null;
      const row = optionalCount(record?.row);
      const field = asString(record?.field);
      return {
        ...(row !== undefined ? { row } : {}),
        ...(field ? { field } : {}),
        message,
      };
    })
    .filter((entry): entry is LeadImportErrorRow => Boolean(entry))
    .slice(0, 200);
}

const IMPORT_STATUS_ALIASES: Record<string, string> = {
  committed: "completed",
  validated: "failed",
};

/**
 * Accepts either the import handler's `data` envelope or one history row.
 * Counts come from the server. `validatedRows` is deliberately never read.
 */
export function parseLeadImportRecord(value: unknown): LeadImportRecord | null {
  const record = asRecord(value);
  if (!record) return null;
  const importRecord = asRecord(record.import) || record;
  const summary = asRecord(record.summary) || {};
  const rawStatus = asString(importRecord.status)?.toLowerCase();
  const status = rawStatus ? IMPORT_STATUS_ALIASES[rawStatus] || rawStatus : "";
  const errors = parseImportErrors(record.errors || importRecord.errors);
  const insertedRows = optionalCount(importRecord.insertedRows);
  const updatedRows = optionalCount(importRecord.updatedRows);
  const importedFromParts =
    insertedRows !== undefined || updatedRows !== undefined
      ? (insertedRows || 0) + (updatedRows || 0)
      : undefined;
  const importedRows =
    optionalCount(importRecord.importedRows) ??
    optionalCount(summary.importedRows) ??
    importedFromParts ??
    0;
  const duplicateRows =
    optionalCount(importRecord.duplicateRows) ??
    optionalCount(summary.duplicateRows) ??
    0;
  const failedRows =
    optionalCount(importRecord.failedRows) ??
    optionalCount(importRecord.rejectedRows) ??
    optionalCount(summary.failedRows) ??
    0;
  const suppressedRows =
    optionalCount(importRecord.suppressedRows) ??
    optionalCount(summary.suppressedRows) ??
    0;
  const totalRows =
    optionalCount(importRecord.totalRows) ??
    optionalCount(summary.totalRows) ??
    importedRows + duplicateRows + failedRows;

  if (!status && totalRows === 0 && errors.length === 0 && !asString(importRecord.filename)) {
    return null;
  }

  return {
    _id: asString(importRecord._id),
    filename: asString(importRecord.filename) || "Workbook",
    uploadedAt: asString(importRecord.uploadedAt) || null,
    uploadedBy: asString(importRecord.uploadedBy) || null,
    status: status || "unknown",
    totalRows,
    importedRows,
    duplicateRows,
    failedRows,
    suppressedRows,
    fileError: asString(importRecord.fileError) || null,
    errorCount:
      optionalCount(importRecord.errorCount) ??
      optionalCount(summary.errorCount) ??
      errors.length,
    errors,
  };
}

export function leadImportKind(record: LeadImportRecord): LeadImportKind {
  if (record.status === "processing") return "processing";
  if (!["completed", "partial", "failed", "duplicate_only"].includes(record.status)) {
    return "unknown";
  }
  if (record.fileError || record.status === "failed") return "failed";
  if (
    record.totalRows === 0 &&
    record.importedRows === 0 &&
    record.duplicateRows === 0 &&
    record.failedRows === 0
  ) {
    return "empty";
  }
  if (record.importedRows === 0 && record.failedRows > 0) {
    return "failed";
  }
  if (record.importedRows === 0 && record.duplicateRows > 0 && record.failedRows === 0) {
    return "duplicate";
  }
  if (
    record.importedRows > 0 &&
    record.failedRows > 0
  ) {
    return "partial";
  }
  if (record.importedRows > 0) return "success";
  return "unknown";
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function leadImportStatusLabel(record: LeadImportRecord): string {
  switch (leadImportKind(record)) {
    case "success":
      return record.suppressedRows > 0 ? "Imported; suppressed leads excluded" : "Imported";
    case "partial":
      return "Partially imported";
    case "duplicate":
      return "No new leads";
    case "failed":
      return "Import failed";
    case "processing":
      return "Processing";
    case "empty":
      return "No data rows";
    default:
      return "Unknown status";
  }
}

export function leadImportOutcome(record: LeadImportRecord): LeadImportOutcome {
  const kind = leadImportKind(record);
  const counts = {
    totalRows: record.totalRows,
    importedRows: record.importedRows,
    duplicateRows: record.duplicateRows,
    failedRows: record.failedRows,
    suppressedRows: record.suppressedRows,
  };
  const statusLabel = leadImportStatusLabel(record);

  if (kind === "success") {
    const duplicates =
      record.duplicateRows > 0
        ? ` ${plural(record.duplicateRows, "duplicate")} skipped.`
        : "";
    return {
      kind,
      tone: record.suppressedRows > 0 ? "warning" : "success",
      title: record.suppressedRows > 0 ? "Import complete with suppressed leads" : "Import complete",
      message: `Imported ${plural(record.importedRows, "lead")}.${duplicates}${record.suppressedRows > 0 ? " Suppressed leads are not eligible for campaigns." : ""}`,
      statusLabel,
      counts,
    };
  }
  if (kind === "partial") {
    const details = [
      record.duplicateRows > 0 ? `${plural(record.duplicateRows, "duplicate")} skipped` : "",
      record.failedRows > 0 ? `${plural(record.failedRows, "row")} failed` : "",
      record.suppressedRows > 0 ? "Suppressed leads are not eligible for campaigns" : "",
    ].filter(Boolean);
    return {
      kind,
      tone: "warning",
      title: "Import completed with skipped rows",
      message: `Imported ${record.importedRows} of ${record.totalRows} rows. ${details.join(". ")}.`,
      statusLabel,
      counts,
    };
  }
  if (kind === "duplicate") {
    return {
      kind,
      tone: "neutral",
      title: "No new leads",
      message: `All ${plural(record.duplicateRows, "row")} already exist. Nothing was imported.`,
      statusLabel,
      counts,
    };
  }
  if (kind === "failed") {
    const detail = record.fileError
      ? record.fileError
      : record.failedRows > 0
        ? `${record.failedRows} of ${record.totalRows} rows failed.`
        : "";
    return {
      kind,
      tone: "danger",
      title: "Import failed",
      message: detail ? `No leads were imported. ${detail}` : "No leads were imported.",
      statusLabel,
      counts,
    };
  }
  if (kind === "processing") {
    return {
      kind,
      tone: "neutral",
      title: "Import processing",
      message: "This import is still processing. Refresh the upload history for the final result.",
      statusLabel,
      counts,
    };
  }
  if (kind === "empty") {
    return {
      kind,
      tone: "neutral",
      title: "No data rows",
      message: "The workbook did not contain any data rows to import.",
      statusLabel,
      counts,
    };
  }
  return {
    kind,
    tone: "warning",
    title: "Unknown import status",
    message:
      "The server returned an unrecognized import status. The counts below are reported by the server; do not treat this as a successful import.",
    statusLabel,
    counts,
  };
}

export function leadImportErrorState(error: unknown): LeadImportErrorState {
  const classified = classifyApiError(error);
  const ambiguousKinds = new Set(["network", "timeout", "server", "unavailable", "invalidResponse"]);
  const retryableKinds = new Set([
    ...ambiguousKinds,
    "conflict",
    "rateLimited",
  ]);
  return {
    message: getErrorMessage(error, "The import failed. Please try again."),
    retryable: retryableKinds.has(classified.kind),
    ambiguous: ambiguousKinds.has(classified.kind),
    kind: classified.kind,
    status: classified.status,
    code: classified.code,
  };
}

export function parseLeadListData(value: unknown): LeadListPage {
  const data = asRecord(value);
  if (!data || !Array.isArray(data.leads)) {
    throw new ApiRequestError("We could not read the lead list.", { kind: "invalidResponse" });
  }
  const leads = normalizeLeadRows(data.leads);
  const pagination = parsePagination(data.pagination, {
    page: 1,
    limit: 25,
    total: leads.length,
  });
  return { leads, pagination };
}

export function parseLeadHistoryData(value: unknown): LeadImportHistoryPage {
  const data = asRecord(value);
  if (!data || !Array.isArray(data.imports)) {
    throw new ApiRequestError("We could not read the upload history.", { kind: "invalidResponse" });
  }
  const imports = data.imports
    .map(parseLeadImportRecord)
    .filter((record): record is LeadImportRecord => Boolean(record));
  const pagination = parsePagination(data.pagination, {
    page: 1,
    limit: 10,
    total: imports.length,
  });
  return { imports, pagination };
}

export async function requestLeadList(
  params: URLSearchParams,
  options: RequestOptions,
): Promise<LeadListPage> {
  const fetchImpl = options.fetchImpl || authFetch;
  const response = await fetchImpl(`${options.apiBase}${LEAD_LIST_ENDPOINT}?${params.toString()}`, {
    signal: options.signal,
  });
  const json = await readJsonResponse<{ data?: unknown }>(response);
  if (!response.ok || !json.success) {
    throw apiErrorFromBody(json, "Failed to load leads", { status: response.status });
  }
  return parseLeadListData(json.data);
}

export async function requestLeadImportHistory(
  params: URLSearchParams,
  options: RequestOptions,
): Promise<LeadImportHistoryPage> {
  const fetchImpl = options.fetchImpl || authFetch;
  const response = await fetchImpl(
    `${options.apiBase}${LEAD_IMPORT_HISTORY_ENDPOINT}?${params.toString()}`,
    { signal: options.signal },
  );
  const json = await readJsonResponse<{ data?: unknown }>(response);
  if (!response.ok || !json.success) {
    throw apiErrorFromBody(json, "Failed to load upload history", { status: response.status });
  }
  return parseLeadHistoryData(json.data);
}

export async function requestLeadImport(options: {
  apiBase: string;
  file: File;
  fetchImpl?: typeof fetch;
}): Promise<LeadImportRecord> {
  const fetchImpl = options.fetchImpl || authFetch;
  const form = new FormData();
  form.append(LEAD_IMPORT_FILE_FIELD, options.file, options.file.name);
  const response = await fetchImpl(`${options.apiBase}${LEAD_IMPORT_ENDPOINT}`, {
    method: "POST",
    body: form,
  });
  const json = await readJsonResponse<{ data?: unknown }>(response);
  if (!response.ok || !json.success) {
    const fallback = "The import failed. Please try again.";
    const sourceError = apiErrorFromBody(json, fallback, { status: response.status });
    const record = parseLeadImportRecord(json.data) || undefined;
    throw new LeadImportRequestError(
      sourceError.message,
      {
        kind: sourceError.kind,
        status: sourceError.status,
        code: sourceError.code,
        serverMessage: sourceError.serverMessage,
      },
      record,
    );
  }
  const record = parseLeadImportRecord(json.data);
  if (!record) {
    throw new ApiRequestError("We could not read the import result.", {
      kind: "invalidResponse",
      status: response.status,
    });
  }
  return record;
}

export async function requestLeadUpdate(
  leadId: string,
  values: LeadEditValues,
  options: RequestOptions,
): Promise<LeadRecord | null> {
  const fetchImpl = options.fetchImpl || authFetch;
  const response = await fetchImpl(
    `${options.apiBase}${LEAD_LIST_ENDPOINT}/${encodeURIComponent(leadId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leadEditPayload(values)),
      signal: options.signal,
    },
  );
  const json = await readJsonResponse<{ data?: { lead?: unknown } }>(response);
  if (!response.ok || !json.success) {
    throw apiErrorFromBody(json, "Failed to save lead", { status: response.status });
  }
  return normalizeLeadRecord(json.data?.lead);
}

export async function requestLeadDelete(
  leadId: string,
  options: RequestOptions,
): Promise<void> {
  const fetchImpl = options.fetchImpl || authFetch;
  const response = await fetchImpl(
    `${options.apiBase}${LEAD_LIST_ENDPOINT}/${encodeURIComponent(leadId)}`,
    { method: "DELETE", signal: options.signal },
  );
  const json = await readJsonResponse(response);
  if (!response.ok || !json.success) {
    throw apiErrorFromBody(json, "Failed to delete lead", { status: response.status });
  }
}

export function leadEditPayload(values: LeadEditValues): LeadEditValues {
  return {
    country: values.country.trim().toUpperCase(),
    locale: values.locale.trim().toLowerCase(),
    serviceKeys: Array.from(new Set(values.serviceKeys.map((key) => key.trim()).filter(Boolean))),
  };
}

export function validateLeadEditValues(values: LeadEditValues): string | null {
  if (!values.country.trim()) return "Select a country.";
  if (!values.locale.trim()) return "Select a language.";
  if (!values.serviceKeys.length) return "Select at least one service.";
  if (values.serviceKeys.length > 20) return "Select no more than 20 services.";
  return null;
}
