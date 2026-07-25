"use client";

import { Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSiteAnnouncementPreview } from "@/components/marketing/SiteAnnouncements";
import { AnnouncementFormDialog } from "@/components/admin/site-announcements/AnnouncementFormDialog";
import { AnnouncementsCard } from "@/components/admin/site-announcements/AnnouncementsCard";
import { useSiteAnnouncementsAdmin } from "@/hooks/useSiteAnnouncementsAdmin";
import { toLiveAnnouncement } from "@/lib/admin/siteAnnouncements";

export default function AdminSiteAnnouncementsPage() {
  const { startPreview } = useSiteAnnouncementPreview();
  const {
    authLoading,
    showPage,
    filters,
    patchFilters,
    items,
    listLoading,
    editor,
    openCreate,
    openEdit,
    closeEditor,
    patchForm,
    saving,
    save,
    togglingId,
    toggleActive,
  } = useSiteAnnouncementsAdmin();

  if (authLoading || !showPage) {
    return (
      <div className="container mx-auto max-w-6xl p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6 pt-28">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Megaphone className="h-6 w-6 text-orange-500" />
            Site Announcements
          </h1>
          <p className="mt-1 text-slate-600">Banners and popups shown to visitors by region.</p>
        </div>
        <Button onClick={openCreate} className="bg-orange-500 hover:bg-orange-600">
          <Plus className="mr-2 h-4 w-4" />
          New announcement
        </Button>
      </div>

      <AnnouncementsCard
        items={items}
        loading={listLoading}
        filters={filters}
        onFiltersChange={patchFilters}
        togglingId={togglingId}
        onPreview={(item) => startPreview(toLiveAnnouncement(item))}
        onEdit={openEdit}
        onToggleActive={toggleActive}
      />

      <AnnouncementFormDialog
        editor={editor}
        onClose={closeEditor}
        onFormChange={patchForm}
        saving={saving}
        onSave={save}
      />
    </div>
  );
}
