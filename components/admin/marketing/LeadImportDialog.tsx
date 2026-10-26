"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { LeadImportErrorsList } from "@/components/admin/marketing/LeadTable";
import { requireApiBase } from "@/lib/admin/marketing";
import {
  LEAD_IMPORT_ACCEPT,
  formatFileSize,
  leadFileValidation,
  leadImportErrorState,
  leadImportOutcome,
  requestLeadImport,
  LeadImportRequestError,
  type LeadImportErrorState,
  type LeadImportRecord,
  type LeadImportTone,
} from "@/lib/admin/marketingLeads";
import { cn } from "@/lib/utils";

const RESULT_TONE_CLASSES: Record<LeadImportTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  danger: "border-rose-200 bg-rose-50 text-rose-950",
  neutral: "border-slate-200 bg-slate-50 text-slate-800",
};

const RESULT_ICONS: Record<LeadImportTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
  neutral: FileSpreadsheet,
};

export interface LeadImportDialogBodyProps {
  fileName?: string | null;
  fileSize?: number | null;
  fileError?: string | null;
  importing: boolean;
  result: LeadImportRecord | null;
  error: LeadImportErrorState | null;
  inputId?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onFileChange: (file: File | null) => void;
  onRemoveFile: () => void;
  onSubmit: () => void;
  onTryAgain: () => void;
  onChooseAnother: () => void;
  onOpenLeads: () => void;
  onDone: () => void;
  onCancel: () => void;
}

export function LeadImportDialogBody({
  fileName,
  fileSize,
  fileError,
  importing,
  result,
  error,
  inputId: providedInputId,
  inputRef,
  onFileChange,
  onRemoveFile,
  onSubmit,
  onTryAgain,
  onChooseAnother,
  onOpenLeads,
  onDone,
  onCancel,
}: LeadImportDialogBodyProps) {
  const generatedId = useId().replace(/:/g, "");
  const inputId = providedInputId || `${generatedId}-lead-workbook`;
  const helpId = `${generatedId}-lead-workbook-help`;
  const fileErrorId = `${generatedId}-lead-workbook-error`;
  const outcome = result ? leadImportOutcome(result) : null;
  const failedResult = outcome?.tone === "danger";
  const ResultIcon = outcome ? RESULT_ICONS[outcome.tone] : null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
        <p className="font-medium">Leads are not subscribers.</p>
        <p className="mt-1">
          Imported leads have not opted in to marketing emails. They are available only for
          Invitation campaigns and never become subscribers or accounts.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        Upload an Excel workbook with Email, Country, Language and Service columns. Leads are
        professional contacts, not subscribers.
      </p>

      <div className="space-y-2">
        <p className="text-sm font-medium">Required columns</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Email
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Country
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Language
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Service
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t text-muted-foreground">
                <td className="px-3 py-2">ada@example.com</td>
                <td className="px-3 py-2">BE</td>
                <td className="px-3 py-2">nl</td>
                <td className="px-3 py-2">Plumbing</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          A lead is the combination of all four columns. The same email can appear with a
          different country, language or service. An exact four-column duplicate is skipped.
        </p>
      </div>

      <ul className="space-y-1 text-xs text-muted-foreground">
        <li>Accepted formats: .xlsx and .xls.</li>
        <li>Maximum size: 5 MB. Maximum data rows: 5,000.</li>
        <li>
          The first non-empty worksheet is used. The first non-empty row is the header row.
          Extra columns are ignored.
        </li>
      </ul>

      <div className="space-y-2">
        <Label htmlFor={inputId}>Excel workbook</Label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={LEAD_IMPORT_ACCEPT}
          className="sr-only"
          aria-describedby={`${helpId}${fileError ? ` ${fileErrorId}` : ""}`}
          disabled={importing}
          onChange={(event) => {
            onFileChange(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            autoFocus
            disabled={importing}
            onClick={() => inputRef?.current?.click()}
            aria-controls={inputId}
          >
            <Upload className="mr-2 h-4 w-4" aria-hidden />
            Choose file
          </Button>
          {fileName ? (
            <span className="min-w-0 text-sm">
              <span className="break-all font-medium">{fileName}</span>
              <span className="ml-1 text-muted-foreground">
                ({formatFileSize(fileSize || 0)})
              </span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">No file selected.</span>
          )}
          {fileName && !importing ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRemoveFile}>
              Remove file
            </Button>
          ) : null}
        </div>
        <p id={helpId} className="text-xs text-muted-foreground">
          The workbook is parsed in memory and is not stored or downloadable.
        </p>
        {fileError ? (
          <p id={fileErrorId} role="alert" className="text-sm text-rose-700">
            {fileError}
          </p>
        ) : null}
      </div>

      {importing ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Importing leads. Do not close this dialog.
        </div>
      ) : null}

      {outcome && result ? (
        <div
          role={outcome.tone === "danger" ? "alert" : "status"}
          aria-live={outcome.tone === "danger" ? "assertive" : "polite"}
          className={cn("rounded-lg border px-3 py-3 text-sm", RESULT_TONE_CLASSES[outcome.tone])}
        >
          <div className="flex items-start gap-2">
            {ResultIcon ? <ResultIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : null}
            <div className="min-w-0 space-y-1">
              <p className="font-medium">{outcome.title}</p>
              <p>{outcome.message}</p>
              <p className="text-xs">{outcome.statusLabel}</p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="opacity-70">Total rows</dt>
              <dd className="font-medium">{result.totalRows}</dd>
            </div>
            <div>
              <dt className="opacity-70">Imported</dt>
              <dd className="font-medium">{result.importedRows}</dd>
            </div>
            <div>
              <dt className="opacity-70">Duplicates</dt>
              <dd className="font-medium">{result.duplicateRows}</dd>
            </div>
            <div>
              <dt className="opacity-70">Failed</dt>
              <dd className="font-medium">{result.failedRows}</dd>
            </div>
            {result.suppressedRows > 0 ? (
              <div>
                <dt className="opacity-70">Suppressed</dt>
                <dd className="font-medium">{result.suppressedRows}</dd>
              </div>
            ) : null}
            {result.errorCount > 0 ? (
              <div>
                <dt className="opacity-70">Reported errors</dt>
                <dd className="font-medium">{result.errorCount}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-3 text-foreground">
            <LeadImportErrorsList errors={result.errors} total={result.errorCount} />
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className={cn(
            "rounded-lg border px-3 py-2.5 text-sm",
            error.ambiguous
              ? "border-amber-300 bg-amber-50 text-amber-950"
              : "border-rose-200 bg-rose-50 text-rose-950",
          )}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="space-y-1">
              <p>{error.message}</p>
              {error.ambiguous ? (
                <p className="text-xs">
                  The request may have completed. Retrying is safe because duplicate rows are
                  skipped.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <DialogFooter className="gap-2">
        {importing ? (
          <>
            <Button type="button" variant="outline" disabled>
              Cancel
            </Button>
            <Button type="button" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Importing leads
            </Button>
          </>
        ) : error || failedResult ? (
          <>
            {error?.retryable ? (
              <Button type="button" onClick={onTryAgain}>
                Try again
              </Button>
            ) : null}
            <Button
              type="button"
              variant={error?.retryable ? "outline" : "default"}
              onClick={onChooseAnother}
            >
              Choose another file
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </>
        ) : result ? (
          <>
            <Button type="button" variant="outline" onClick={onOpenLeads}>
              Open leads database
            </Button>
            <Button type="button" onClick={onDone}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={onCancel} disabled={importing}>
              Cancel
            </Button>
            <Button type="button" onClick={onSubmit} disabled={importing || !fileName || Boolean(fileError)}>
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="mr-2 h-4 w-4" aria-hidden />
              )}
              Import leads
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
}

export interface LeadImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportAttempted: () => void;
  onOpenLeads: () => void;
}

export function LeadImportDialog({
  open,
  onOpenChange,
  onImportAttempted,
  onOpenLeads,
}: LeadImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<LeadImportRecord | null>(null);
  const [error, setError] = useState<LeadImportErrorState | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId().replace(/:/g, "");

  const clearFile = () => {
    setFile(null);
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const reset = () => {
    clearFile();
    setFileError(null);
    setImporting(false);
    setResult(null);
    setError(null);
  };

  useEffect(() => {
    if (!open) reset();
    // Reset only when the dialog closes. Reopening starts with a clean file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFileChange = (next: File | null) => {
    setResult(null);
    setError(null);
    setFileError(null);
    if (!next) {
      clearFile();
      return;
    }
    const validation = leadFileValidation(next);
    setFile(next);
    if (validation) setFileError(validation);
  };

  const submit = async () => {
    if (importing) return;
    if (!file) {
      setFileError(leadFileValidation(null));
      return;
    }
    const validation = leadFileValidation(file);
    if (validation) {
      setFileError(validation);
      return;
    }
    setFileError(null);
    setError(null);
    setResult(null);
    setImporting(true);
    try {
      const record = await requestLeadImport({
        apiBase: requireApiBase(),
        file,
      });
      setResult(record);
    } catch (caught) {
      const nextError = leadImportErrorState(caught);
      if (caught instanceof LeadImportRequestError && caught.record) {
        setResult(caught.record);
      }
      setError(nextError);
      if (!nextError.retryable) clearFile();
    } finally {
      setImporting(false);
      onImportAttempted();
    }
  };

  const chooseAnother = () => {
    clearFile();
    setFileError(null);
    setResult(null);
    setError(null);
    window.setTimeout(() => inputRef.current?.click(), 0);
  };

  const requestClose = (next: boolean) => {
    if (importing) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        closeLabel="Close"
        showCloseButton={!importing}
        onEscapeKeyDown={(event) => {
          if (importing) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (importing) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Import Leads</DialogTitle>
          <DialogDescription>
            Upload professional contacts from Excel. They stay separate from subscribers and
            accounts.
          </DialogDescription>
        </DialogHeader>
        <LeadImportDialogBody
          inputId={inputId}
          inputRef={inputRef}
          fileName={file?.name || null}
          fileSize={file?.size || null}
          fileError={fileError}
          importing={importing}
          result={result}
          error={error}
          onFileChange={handleFileChange}
          onRemoveFile={clearFile}
          onSubmit={() => void submit()}
          onTryAgain={() => void submit()}
          onChooseAnother={chooseAnother}
          onOpenLeads={onOpenLeads}
          onDone={() => requestClose(false)}
          onCancel={() => requestClose(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
