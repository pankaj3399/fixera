"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/apiErrors";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";
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
  deleteSiteAnnouncement,
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
  const { canAccessPath } = useAdminAccess();
  const router = useRouter();

  const isAdmin = Boolean(isAuthenticated && user?.role === "admin");
  const canManage = canAccessPath("/admin/site-announcements");
  const showPage = !authLoading && isAdmin && canManage;

  const [filters, setFilters] = useState<AnnouncementListFilters>(DEFAULT_FILTERS);
  const [items, setItems] = useState<AdminSiteAnnouncement[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState<AnnouncementEditor>(null);
  const [saving, setSaving] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(() => new Set());

  // Auth gate — single redirect effect
  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      router.replace("/login");
      return;
    }
    if (!canManage) router.replace("/dashboard");
  }, [authLoading, isAdmin, canManage, router]);

  // List fetch — one effect, debounce + AbortController
  useEffect(() => {
    if (!showPage) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setListLoading(true);
      try {
        const result = await fetchSiteAnnouncements(filters, page, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setTotal(result.total);
          const lastPage = Math.max(1, Math.ceil(result.total / 20));
          if (page > lastPage) {
            setPage(lastPage);
            return;
          }
          setItems(result.items);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast.error(getErrorMessage(err, "Could not load announcements"));
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
  }, [showPage, filters, page, reloadKey]);

  const patchFilters = (partial: Partial<AnnouncementListFilters>) => {
    setPage(1);
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
      toast.error(getErrorMessage(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: AdminSiteAnnouncement, isActive: boolean) => {
    const previousIsActive = item.isActive;
    setTogglingIds((prev) => {
      const next = new Set(prev);
      next.add(item._id);
      return next;
    });
    setItems((prev) =>
      prev.map((row) => (row._id === item._id ? { ...row, isActive } : row)),
    );
    try {
      await setSiteAnnouncementActive(item._id, isActive);
      toast.success(isActive ? "Announcement is live" : "Announcement hidden");
    } catch (err) {
      setItems((prev) =>
        prev.map((row) =>
          row._id === item._id ? { ...row, isActive: previousIsActive } : row,
        ),
      );
      toast.error(getErrorMessage(err, "Could not update"));
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(item._id);
        return next;
      });
    }
  };

  /** CA6: delete after an explicit confirmation; the list reloads afterwards. */
  const deleteAnnouncement = async (item: AdminSiteAnnouncement) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${item.name}"? This cannot be undone. To only take it offline, switch "Live" off instead.`)) return;
    setTogglingIds((prev) => new Set(prev).add(item._id));
    try {
      await deleteSiteAnnouncement(item._id);
      setItems((prev) => prev.filter((row) => row._id !== item._id));
      setTotal((prev) => Math.max(0, prev - 1));
      toast.success("Announcement deleted");
      setReloadKey((key) => key + 1);
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not delete"));
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(item._id);
        return next;
      });
    }
  };

  return {
    authLoading,
    showPage,
    filters,
    patchFilters,
    items,
    page,
    total,
    setPage,
    listLoading,
    editor,
    openCreate,
    openEdit,
    closeEditor,
    patchForm,
    saving,
    save,
    togglingIds,
    toggleActive,
    deleteAnnouncement,
  };
}
