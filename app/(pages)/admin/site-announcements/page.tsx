"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSiteAnnouncementPreview } from "@/components/marketing/SiteAnnouncements";
import { AnnouncementFormDialog } from "@/components/admin/site-announcements/AnnouncementFormDialog";
import { AnnouncementsCard } from "@/components/admin/site-announcements/AnnouncementsCard";
import {
  type AdminSiteAnnouncement,
  type AnnouncementFormState,
  announcementToForm,
  emptyAnnouncementForm,
  fetchSiteAnnouncements,
  saveSiteAnnouncement,
  setSiteAnnouncementActive,
  toLiveAnnouncement,
  validateAnnouncementForm,
} from "@/lib/admin/siteAnnouncements";

export default function AdminSiteAnnouncementsPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const { startPreview } = useSiteAnnouncementPreview();

  const [items, setItems] = useState<AdminSiteAnnouncement[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AnnouncementFormState>(emptyAnnouncementForm);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const latestReq = useRef(0);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/login");
    }
  }, [user, isAuthenticated, loading, router]);

  const loadItems = useCallback(async () => {
    const id = ++latestReq.current;
    try {
      setListLoading(true);
      const announcements = await fetchSiteAnnouncements({ status: statusFilter, type: typeFilter, search });
      if (id !== latestReq.current) return;
      setItems(announcements);
    } catch (err) {
      if (id !== latestReq.current) return;
      toast.error(err instanceof Error ? err.message : "Could not load announcements");
    } finally {
      if (id === latestReq.current) setListLoading(false);
    }
  }, [statusFilter, typeFilter, search]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admin") return;
    const t = setTimeout(loadItems, 200);
    return () => clearTimeout(t);
  }, [isAuthenticated, user, loadItems]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyAnnouncementForm());
    setDialogOpen(true);
  };

  const openEdit = (item: AdminSiteAnnouncement) => {
    setEditingId(item._id);
    setForm(announcementToForm(item));
    setDialogOpen(true);
  };

  const save = async () => {
    const error = validateAnnouncementForm(form);
    if (error) {
      toast.error(error);
      return;
    }
    try {
      setSaving(true);
      await saveSiteAnnouncement(editingId, form);
      toast.success(editingId ? "Announcement updated" : "Announcement created");
      setDialogOpen(false);
      loadItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: AdminSiteAnnouncement, isActive: boolean) => {
    setTogglingId(item._id);
    setItems((prev) =>
      prev.map((row) => (row._id === item._id ? { ...row, isActive } : row)),
    );
    try {
      await setSiteAnnouncementActive(item._id, isActive);
      toast.success(isActive ? "Announcement is live" : "Announcement hidden");
    } catch (err) {
      setItems((prev) =>
        prev.map((row) => (row._id === item._id ? { ...row, isActive: !isActive } : row)),
      );
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setTogglingId(null);
    }
  };

  if (loading || !isAuthenticated || user?.role !== "admin") {
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
        statusFilter={statusFilter}
        typeFilter={typeFilter}
        search={search}
        togglingId={togglingId}
        onStatusFilterChange={setStatusFilter}
        onTypeFilterChange={setTypeFilter}
        onSearchChange={setSearch}
        onPreview={(item) => startPreview(toLiveAnnouncement(item))}
        onEdit={openEdit}
        onToggleActive={toggleActive}
      />

      <AnnouncementFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingId={editingId}
        form={form}
        onFormChange={setForm}
        saving={saving}
        onSave={save}
      />
    </div>
  );
}
