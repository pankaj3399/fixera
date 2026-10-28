"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface MultiSelectComboboxProps {
  options: readonly MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  /** When set, shows a "select none" row that clears the selection (e.g. "Everywhere"). */
  emptySelectionLabel?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
  className?: string;
}

function OptionRow({
  selected,
  label,
  hint,
  onSelect,
}: {
  selected: boolean;
  label: string;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs",
          selected && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {selected ? <Check className="size-3.5" /> : null}
      </span>
      <span>{label}</span>
      {hint ? <span className="ml-auto text-xs text-muted-foreground">{hint}</span> : null}
    </button>
  );
}

export function MultiSelectCombobox({
  options,
  value,
  onChange,
  placeholder,
  emptySelectionLabel,
  searchPlaceholder,
  ariaLabel,
  className,
}: MultiSelectComboboxProps) {
  const t = useTranslations("common");
  const pathname = usePathname();
  // Admin UI stays English; public pages use the common namespace. Explicit
  // labels passed by a caller always win over these localized defaults.
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  const resolvedPlaceholder = placeholder ?? (isAdmin ? "Select…" : t("multiSelect.placeholder"));
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? (isAdmin ? "Search…" : t("multiSelect.searchPlaceholder"));
  const resolvedAriaLabel = ariaLabel ?? (isAdmin ? "Options" : t("multiSelect.options"));
  const resolvedSearchAriaLabel = isAdmin
    ? `Search ${resolvedAriaLabel}`
    : t("multiSelect.searchOptions", { label: resolvedAriaLabel });
  const selectedCountLabel = isAdmin
    ? `${value.length} selected`
    : t("multiSelect.selectedCount", { count: value.length });
  const noMatchesLabel = isAdmin ? "No matches" : t("multiSelect.noMatches");

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      query
        ? options.filter(
            (o) =>
              o.label.toLowerCase().includes(query) ||
              o.value.toLowerCase().includes(query),
          )
        : options,
    [options, query],
  );

  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const labelFor = (optionValue: string) =>
    options.find((o) => o.value === optionValue)?.label ?? optionValue;
  const summary =
    value.length === 0
      ? emptySelectionLabel ?? resolvedPlaceholder
      : value.length <= 2
        ? value.map(labelFor).join(", ")
        : selectedCountLabel;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            open && "border-ring ring-ring/50 ring-[3px]",
            className,
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={resolvedAriaLabel}
        >
          <span
            className={cn(
              "min-w-0 truncate text-left",
              value.length === 0 && !emptySelectionLabel && "text-muted-foreground",
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
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <div className="overflow-hidden">
          <div className="border-b p-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={resolvedSearchPlaceholder}
              className="h-8 border-0 bg-muted/50 text-sm shadow-none focus-visible:ring-0"
              aria-label={resolvedSearchAriaLabel}
            />
          </div>

          <div
            role="listbox"
            aria-label={resolvedAriaLabel}
            aria-multiselectable
            className="max-h-52 overflow-y-auto p-1"
          >
            {emptySelectionLabel && !query ? (
              <OptionRow
                selected={value.length === 0}
                label={emptySelectionLabel}
                onSelect={() => onChange([])}
              />
            ) : null}

            {filtered.map((option) => (
              <OptionRow
                key={option.value}
                selected={value.includes(option.value)}
                label={option.label}
                hint={option.hint}
                onSelect={() => toggle(option.value)}
              />
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              {noMatchesLabel}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
