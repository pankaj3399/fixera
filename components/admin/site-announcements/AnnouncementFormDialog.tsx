"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AnnouncementEditor,
  AnnouncementFormState,
} from "@/lib/admin/siteAnnouncements";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import {
  DELAY_OPTIONS,
  LOCALE_OPTIONS,
  PLACEMENT_OPTIONS,
  PRIORITY_OPTIONS,
  SELECT_TRIGGER_CLASS,
  SITE_ANNOUNCEMENT_COUNTRY_OPTIONS,
  announcementUsesOverlay,
} from "@/lib/constants/siteAnnouncements";
import { FormField, FormFieldLabel, FormSettingRow } from "./FormPrimitives";

interface AnnouncementFormDialogProps {
  editor: AnnouncementEditor;
  onClose: () => void;
  onFormChange: (form: AnnouncementFormState) => void;
  saving: boolean;
  onSave: () => void;
}

export function AnnouncementFormDialog({
  editor,
  onClose,
  onFormChange,
  saving,
  onSave,
}: AnnouncementFormDialogProps) {
  return (
    <Dialog open={editor !== null} onOpenChange={(next) => !next && onClose()}>
      {editor ? (
        <AnnouncementFormDialogBody
          editingId={editor.id}
          form={editor.form}
          onFormChange={onFormChange}
          saving={saving}
          onSave={onSave}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function AnnouncementFormDialogBody({
  editingId,
  form,
  onFormChange,
  saving,
  onSave,
  onClose,
}: {
  editingId: string | null;
  form: AnnouncementFormState;
  onFormChange: (form: AnnouncementFormState) => void;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const patch = (partial: Partial<AnnouncementFormState>) =>
    onFormChange({ ...form, ...partial });

  const showsOverlayOptions = announcementUsesOverlay(form.type);

  return (
    <DialogContent className="flex max-h-[min(90vh,720px)] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
      <DialogHeader className="shrink-0 border-b border-slate-200 px-6 py-4 text-left">
        <DialogTitle className="font-sans text-lg font-semibold tracking-normal text-slate-900">
          {editingId ? "Edit announcement" : "New announcement"}
        </DialogTitle>
      </DialogHeader>

      <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
        <div className="space-y-4 border-b border-slate-200 px-6 py-6 md:border-b-0 md:border-r md:overflow-y-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            What visitors see
          </p>

          <FormField>
            <FormFieldLabel required>Internal name</FormFieldLabel>
            <Input
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Summer BE promo"
              className="h-9 text-sm"
            />
          </FormField>

          <div className="grid w-full grid-cols-2 gap-4">
            <FormField>
              <FormFieldLabel required>Placement</FormFieldLabel>
              <Select
                value={form.type}
                onValueChange={(v) => patch({ type: v as typeof form.type })}
              >
                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLACEMENT_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField>
              <FormFieldLabel>Priority</FormFieldLabel>
              <Select value={form.priority} onValueChange={(v) => patch({ priority: v })}>
                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
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
            </FormField>
          </div>

          <FormField>
            <FormFieldLabel required>Headline</FormFieldLabel>
            <Input
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Summer 10% off painting"
              className="h-9 text-sm"
            />
          </FormField>

          <FormField>
            <FormFieldLabel required>Supporting text</FormFieldLabel>
            <Input
              value={form.message}
              onChange={(e) => patch({ message: e.target.value })}
              placeholder="Book this month and save"
              className="h-9 text-sm"
            />
          </FormField>

          <div className="grid w-full grid-cols-2 gap-4">
            <FormField>
              <FormFieldLabel>Link</FormFieldLabel>
              <Input
                value={form.ctaUrl}
                onChange={(e) => patch({ ctaUrl: e.target.value })}
                placeholder="/services"
                className="h-9 font-mono text-sm"
              />
            </FormField>
            <FormField>
              <FormFieldLabel>Code</FormFieldLabel>
              <Input
                value={form.discountCode}
                onChange={(e) => patch({ discountCode: e.target.value.toUpperCase() })}
                placeholder="SUMMER10"
                className="h-9 font-mono text-sm uppercase"
              />
            </FormField>
          </div>

          {form.type !== "top_bar" && (
            <FormField>
              <FormFieldLabel>Button text</FormFieldLabel>
              <Input
                value={form.ctaLabel}
                onChange={(e) => patch({ ctaLabel: e.target.value })}
                placeholder="Claim offer"
                className="h-9 text-sm"
              />
            </FormField>
          )}
        </div>

        <div className="flex flex-col gap-4 px-6 py-6 md:overflow-y-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Who & when
          </p>

          <div className="grid w-full grid-cols-2 gap-4">
            <FormField>
              <FormFieldLabel>Countries</FormFieldLabel>
              <MultiSelectCombobox
                options={SITE_ANNOUNCEMENT_COUNTRY_OPTIONS}
                value={form.countries}
                onChange={(countries) => patch({ countries })}
                emptySelectionLabel="Everywhere"
                searchPlaceholder="Search countries…"
                ariaLabel="Countries"
              />
            </FormField>
            <FormField>
              <FormFieldLabel>Language</FormFieldLabel>
              <Select value={form.locale} onValueChange={(v) => patch({ locale: v })}>
                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
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
            </FormField>
          </div>

          <div className="grid w-full grid-cols-2 gap-4">
            <FormField>
              <FormFieldLabel required>Starts</FormFieldLabel>
              <Input
                type="date"
                value={form.startsAt}
                onChange={(e) => patch({ startsAt: e.target.value })}
                className="h-9 text-sm"
              />
            </FormField>
            <FormField>
              <FormFieldLabel required>Ends</FormFieldLabel>
              <Input
                type="date"
                value={form.endsAt}
                onChange={(e) => patch({ endsAt: e.target.value })}
                className="h-9 text-sm"
              />
            </FormField>
          </div>

          {showsOverlayOptions && (
            <FormField>
              <FormFieldLabel>Show after</FormFieldLabel>
              <Select
                value={form.delaySeconds}
                onValueChange={(v) => patch({ delaySeconds: v })}
              >
                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
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
            </FormField>
          )}

          <div className="space-y-0 rounded-lg bg-slate-50 px-4 py-2">
            <FormSettingRow
              title="Live"
              description="Visible on the site"
              checked={form.isActive}
              onCheckedChange={(isActive) => patch({ isActive })}
            />
            {showsOverlayOptions && (
              <FormSettingRow
                title="Closable"
                description="Visitor can dismiss"
                checked={form.dismissible}
                onCheckedChange={(dismissible) => patch({ dismissible })}
              />
            )}
            <FormSettingRow
              title="Needs marketing consent"
              description="Cookie opt-in required"
              checked={form.requireMarketingConsent}
              onCheckedChange={(requireMarketingConsent) =>
                patch({ requireMarketingConsent })
              }
            />
          </div>

          <div className="mt-auto flex justify-end gap-2 pt-2">
            <Button variant="outline" className="h-9" onClick={onClose}>
              Cancel
            </Button>
            <Button className="h-9" onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Save changes" : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}
