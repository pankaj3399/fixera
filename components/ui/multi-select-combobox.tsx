"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
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

function defaultSummary(
  value: string[],
  options: readonly MultiSelectOption[],
  placeholder: string,
  emptySelectionLabel?: string,
): string {
  if (value.length === 0) {
    return emptySelectionLabel ?? placeholder;
  }
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  if (value.length <= 2) {
    return value.map(labelFor).join(", ");
  }
  return `${value.length} selected`;
}

export function MultiSelectCombobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  emptySelectionLabel,
  searchPlaceholder = "Search…",
  ariaLabel = "Options",
  className,
}: MultiSelectComboboxProps) {
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
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query) ||
          o.value.toLowerCase().includes(query),
      )
    : options;

  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const summary = defaultSummary(value, options, placeholder, emptySelectionLabel);
  const optionClass =
    "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted";

  return (
    <div className={cn("relative", className)} ref={popoverRef}>
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

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable
          className="absolute z-[10001] mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <div className="border-b p-2">
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 border-0 bg-muted/50 text-sm shadow-none focus-visible:ring-0"
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </div>

          <div className="max-h-52 overflow-y-auto p-1">
            {emptySelectionLabel && !query && (
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
                <span>{emptySelectionLabel}</span>
              </div>
            )}

            {filtered.length > 0 ? (
              filtered.map((option) => {
                const checked = value.includes(option.value);
                return (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={checked}
                    tabIndex={0}
                    onClick={() => toggle(option.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(option.value);
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
                    <span>{option.label}</span>
                    {option.hint ? (
                      <span className="ml-auto text-xs text-muted-foreground">{option.hint}</span>
                    ) : null}
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
