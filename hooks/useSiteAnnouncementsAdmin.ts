"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  type AdminSiteAnnouncement,
  type AnnouncementEditor,
  type AnnouncementFormState,
  type AnnouncementListFilters,
  announcementToForm,
  emptyAnnouncementForm,
  fetchSiteAnnouncements,
  saveSiteAnnouncement,
  setSiteAnnouncementActive,
  validateAnnouncementForm,
} from "@/lib/admin/siteAnnouncements";

const DEFAULT_FILTERS: AnnouncementListFilters = {
  status: "all",
  type: "all",
  search: "",
};

export type { AnnouncementEditor };

export function useSiteAnnouncementsAdmin() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  const isAdmin = Boolean(isAuthenticated && user?.role === "admin");
  const showPage = !authLoading && isAdmin;

  const [filters, setFilters] = useState<AnnouncementListFilters>(DEFAULT_FILTERS);
  const [items, setItems] = useState<AdminSiteAnnouncement[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState<AnnouncementEditor>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Auth gate — single redirect effect
  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) router.replace("/login");
  }, [authLoading, isAdmin, router]);

  // List fetch — one effect, debounce + AbortController
  useEffect(() => {
    if (!showPage) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setListLoading(true);
      try {
        const announcements = await fetchSiteAnnouncements(filters, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setItems(announcements);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast.error(err instanceof Error ? err.message : "Could not load announcements");
      } finally {
        if (!controller.signal.aborted) {
          setListLoading(false);
        }
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [showPage, filters, reloadKey]);

  const patchFilters = (partial: Partial<AnnouncementListFilters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  };

  const openCreate = () => {
    setEditor({ id: null, form: emptyAnnouncementForm() });
  };

  const openEdit = (item: AdminSiteAnnouncement) => {
    setEditor({ id: item._id, form: announcementToForm(item) });
  };

  const closeEditor = () => setEditor(null);

  const patchForm = (form: AnnouncementFormState) => {
    setEditor((prev) => (prev ? { ...prev, form } : prev));
  };

  const save = async () => {
    if (!editor) return;
    const error = validateAnnouncementForm(editor.form);
    if (error) {
      toast.error(error);
      return;
    }
    try {
      setSaving(true);
      await saveSiteAnnouncement(editor.id, editor.form);
      toast.success(editor.id ? "Announcement updated" : "Announcement created");
      setEditor(null);
      setReloadKey((key) => key + 1);
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

  return {
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
  };
}
