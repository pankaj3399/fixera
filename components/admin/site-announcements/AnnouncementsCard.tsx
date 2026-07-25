"use client";

import { Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AdminSiteAnnouncement,
  AnnouncementListFilters,
} from "@/lib/admin/siteAnnouncements";
import { announcementStatus } from "@/lib/admin/siteAnnouncements";
import {
  localeLabel,
  SELECT_TRIGGER_CLASS,
  STATUS_FILTER_OPTIONS,
  TYPE_FILTER_OPTIONS,
  TYPE_LABELS,
} from "@/lib/constants/siteAnnouncements";

interface AnnouncementsCardProps {
  items: AdminSiteAnnouncement[];
  loading: boolean;
  filters: AnnouncementListFilters;
  onFiltersChange: (partial: Partial<AnnouncementListFilters>) => void;
  togglingId: string | null;
  onPreview: (item: AdminSiteAnnouncement) => void;
  onEdit: (item: AdminSiteAnnouncement) => void;
  onToggleActive: (item: AdminSiteAnnouncement, isActive: boolean) => void;
}

export function AnnouncementsCard({
  items,
  loading,
  filters,
  onFiltersChange,
  togglingId,
  onPreview,
  onEdit,
  onToggleActive,
}: AnnouncementsCardProps) {
  return (
    <Card>
      <CardHeader className="space-y-4">
        <div>
          <CardTitle>Announcements</CardTitle>
          <CardDescription>{items.length} result(s)</CardDescription>
        </div>
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_11rem]">
          <Input
            placeholder="Search name or title…"
            value={filters.search}
            onChange={(e) => onFiltersChange({ search: e.target.value })}
            className="h-9 w-full text-sm"
          />
          <Select
            value={filters.status}
            onValueChange={(status) => onFiltersChange({ status })}
          >
            <SelectTrigger className={SELECT_TRIGGER_CLASS}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.type}
            onValueChange={(type) => onFiltersChange({ type })}
          >            <SelectTrigger className={SELECT_TRIGGER_CLASS}>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">
            No announcements yet. Create one to show a promo on the site.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => {
              const status = announcementStatus(item);
              return (
                <li
                  key={item._id}
                  className="flex flex-wrap items-start justify-between gap-3 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{item.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${status.tone}`}>
                        {status.label}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {TYPE_LABELS[item.type]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{item.title}</p>
                    <p className="line-clamp-2 text-sm text-slate-500">{item.message}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {item.activeCountries.length
                        ? item.activeCountries.join(", ")
                        : "All countries"}
                      {" · "}
                      {localeLabel(item.locale)}
                      {item.discountCode ? ` · code ${item.discountCode}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-slate-900"
                      onClick={() => onPreview(item)}
                      title="Preview"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-slate-900"
                      onClick={() => onEdit(item)}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <div className="ml-1 flex items-center gap-2 border-l border-slate-200 pl-3">
                      <Label
                        htmlFor={`live-${item._id}`}
                        className="cursor-pointer text-xs font-medium text-slate-500"
                      >
                        Live
                      </Label>
                      <Switch
                        id={`live-${item._id}`}
                        checked={item.isActive}
                        disabled={togglingId === item._id}
                        onCheckedChange={(checked) => onToggleActive(item, checked)}
                        aria-label={`Toggle live for ${item.name}`}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
