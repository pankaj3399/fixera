"use client";

import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { marketingCountryOptions, normalizeLanguages, type LanguageOption, type ServiceOption } from "@/lib/admin/marketing";
import {
  leadServiceKeys,
  validateLeadEditValues,
  type LeadEditValues,
  type LeadRecord,
} from "@/lib/admin/marketingLeads";

export interface LeadEditDialogProps {
  open: boolean;
  lead: LeadRecord | null;
  services: readonly ServiceOption[];
  languages: readonly LanguageOption[];
  catalogError?: string | null;
  saving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (lead: LeadRecord, values: LeadEditValues) => void;
}

export function LeadEditDialog({
  open,
  lead,
  services,
  languages,
  catalogError,
  saving,
  error,
  onOpenChange,
  onSave,
}: LeadEditDialogProps) {
  const uid = useId().replace(/:/g, "");
  const emailId = `${uid}-lead-email`;
  const countryId = `${uid}-lead-country`;
  const languageId = `${uid}-lead-language`;
  const errorId = `${uid}-lead-edit-error`;
  const [country, setCountry] = useState("");
  const [locale, setLocale] = useState("");
  const [serviceKeys, setServiceKeys] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const leadKey = lead
    ? `${lead._id}|${lead.country}|${lead.locale}|${leadServiceKeys(lead).join(",")}`
    : "";
  useEffect(() => {
    if (!lead) return;
    setCountry(lead.country || "");
    setLocale(lead.locale || "");
    setServiceKeys(leadServiceKeys(lead));
    setFormError(null);
    // The key covers every editable value; do not reset on unrelated list reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadKey]);

  const countryOptions = marketingCountryOptions(services, [country]);
  const languageOptions = Array.from(
    new Map(
      [
        ...normalizeLanguages(languages).map((item) => ({ code: item.code, label: item.label })),
        ...(locale && !languages.some((item) => item.code === locale)
          ? [{ code: locale, label: locale.toUpperCase() }]
          : []),
      ].map((item) => [item.code, item]),
    ).values(),
  );
  const serviceOptions: MultiSelectOption[] = Array.from(
    new Map(
      [
        ...services.map((service) => ({ value: service.key, label: service.label })),
        ...serviceKeys
          .filter((key) => !services.some((service) => service.key === key))
          .map((key) => ({ value: key, label: key })),
      ].map((item) => [item.value, item]),
    ).values(),
  );

  const submit = () => {
    if (!lead) return;
    const values = { country, locale, serviceKeys };
    const validation = validateLeadEditValues(values);
    setFormError(validation);
    if (validation) return;
    onSave(lead, values);
  };

  const requestOpenChange = (next: boolean) => {
    if (saving) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        closeLabel="Close"
        showCloseButton={!saving}
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit lead</DialogTitle>
          <DialogDescription>
            Email cannot be changed. Editing these fields does not change consent or suppression.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={emailId}>Email</Label>
            <Input id={emailId} value={lead?.email || ""} disabled readOnly />
            <p className="text-xs text-muted-foreground">
              Delete this row and import the corrected address if the email is wrong.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={countryId}>Country</Label>
              <Select value={country} onValueChange={(value) => { setCountry(value); setFormError(null); }}>
                <SelectTrigger id={countryId} className="w-full">
                  <SelectValue placeholder="Select a country" />
                </SelectTrigger>
                <SelectContent>
                  {countryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={languageId}>Language</Label>
              <Select value={locale} onValueChange={(value) => { setLocale(value); setFormError(null); }}>
                <SelectTrigger id={languageId} className="w-full">
                  <SelectValue placeholder="Select a language" />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Services</Label>
            <MultiSelectCombobox
              options={serviceOptions}
              value={serviceKeys}
              onChange={(next) => { setServiceKeys(next); setFormError(null); }}
              placeholder="Select at least one service"
              searchPlaceholder="Search services"
              ariaLabel="Lead services"
            />
            {catalogError ? (
              <p className="text-xs text-amber-700">
                {catalogError} You can keep the current service keys, but new labels are unavailable.
              </p>
            ) : null}
          </div>
          {formError ? (
            <p id={errorId} role="alert" className="text-sm text-rose-700">
              {formError}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => requestOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface LeadDeleteDialogProps {
  open: boolean;
  lead: LeadRecord | null;
  deleting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (lead: LeadRecord) => void;
}

export function LeadDeleteDialog({
  open,
  lead,
  deleting,
  error,
  onOpenChange,
  onDelete,
}: LeadDeleteDialogProps) {
  const requestOpenChange = (next: boolean) => {
    if (deleting) return;
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        closeLabel="Close"
        showCloseButton={!deleting}
        onEscapeKeyDown={(event) => {
          if (deleting) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (deleting) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Delete lead?</DialogTitle>
          <DialogDescription>
            This removes the lead row. The email&apos;s suppression status is not changed, so
            re-importing it will not bypass an unsubscribe.
          </DialogDescription>
        </DialogHeader>
        {lead ? (
          <p className="break-words rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="font-medium">{lead.email}</span>
            <span className="text-muted-foreground">
              {" "}
              · {lead.country || "No country"} · {(lead.locale || "No language").toUpperCase()}
            </span>
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {error}
          </p>
        ) : null}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => requestOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (lead) onDelete(lead);
            }}
            disabled={deleting || !lead}
          >
            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            Delete lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
