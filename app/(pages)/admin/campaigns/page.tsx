"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { authFetch } from "@/lib/utils";
import { messageFromApiBody } from "@/lib/apiErrors";
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CampaignHeaderActions } from "@/components/admin/marketing/CampaignHeaderActions";
import { LeadImportDialog } from "@/components/admin/marketing/LeadImportDialog";
import {
  MARKETING_AUDIENCE_TYPES,
  MARKETING_AUDIENCE_TYPE_LABELS,
  MARKETING_CAMPAIGN_TYPES,
  MARKETING_CAMPAIGN_TYPE_LABELS,
  MARKETING_ROLES,
  audienceIncludesLeads,
  audienceTypeLabel,
  audienceTypeOrNull,
  campaignAudienceValidation,
  campaignTypeLabel,
  campaignRoleLocked,
  formatDate,
  invitationFooterCopy,
  marketingCountryOptions,
  normalizeAudienceType,
  normalizeCampaignType,
  normalizeLanguages,
  normalizeServices,
  requireApiBase,
  subscriberSyncSummary,
  type LanguageOption,
  type MarketingAudienceType,
  type MarketingCampaignType,
  type MarketingRole,
  type ServiceOption,
} from "@/lib/admin/marketing";

type Locale = string;
type CampaignType = MarketingCampaignType;
type AudienceType = MarketingAudienceType;
type Role = MarketingRole;

interface LocaleContent {
  subject: string;
  htmlContent: string;
  previewText?: string;
  brevoTemplateId?: number;
}
interface BrevoTemplate {
  id: number;
  name: string;
  subject: string;
  tag: string;
  modifiedAt: string;
}
interface CampaignDelivery {
  locale: Locale;
  recipientCount: number;
  subscriberCount?: number;
  leadCount?: number;
  deduplicatedRecipientCount?: number;
  brevoCampaignId?: number;
  brevoListId?: number;
  stats?: {
    sent: number;
    delivered: number;
    uniqueViews: number;
    uniqueClicks: number;
    unsubscriptions: number;
  };
  error?: string;
}
interface Campaign {
  _id: string;
  name: string;
  type: CampaignType;
  audienceType?: AudienceType | string | null;
  audienceTypeInvalid?: boolean;
  status: string;
  content: Record<Locale, LocaleContent>;
  audience: {
    countries: string[];
    serviceKeys?: string[];
    interestedServices?: string[];
    locales: Locale[];
    roles: Role[];
  };
  inactiveDays?: number;
  autoSend: boolean;
  scheduledAt?: string | null;
  sentAt?: string | null;
  lastPreviewCount?: number;
  lastPreviewAt?: string;
  deliveries: CampaignDelivery[];
  lastError?: string;
  utmCampaign?: string;
  updatedAt: string;
}
interface FormState {
  name: string;
  type: CampaignType;
  audienceType: AudienceType;
  countries: string[];
  serviceKeys: string[];
  locales: Locale[];
  roles: Role[];
  inactiveDays: string;
  autoSend: boolean;
  scheduledAt: string;
  utmCampaign: string;
  content: Record<Locale, LocaleContent>;
}
interface AudiencePreview {
  total: number;
  exactTotalIsEstimate: boolean;
  bySource: { subscribers: number; leads: number } | null;
  byLocale: Record<string, number>;
  byRole: { customer: number; professional: number };
  deduplicated: number;
  excluded: {
    suppressed: number;
    invalidEmail: number;
    missingLocale: number;
    roleMismatch: number;
    localeMismatch: number;
  };
  fallbackLocaleCount: number;
  overLimit: boolean;
  truncated: boolean;
  criteriaHash?: string;
}

function emptyContent(): LocaleContent {
  return { subject: "", htmlContent: "", previewText: "" };
}
function emptyForm(): FormState {
  return {
    name: "",
    type: "newsletter",
    audienceType: "subscribers",
    countries: [],
    serviceKeys: [],
    locales: ["en"],
    roles: ["customer", "professional"],
    inactiveDays: "60",
    autoSend: false,
    scheduledAt: "",
    utmCampaign: "",
    content: { en: emptyContent() },
  };
}
function toDatetimeLocalValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function toScheduledIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function statusColor(status: string) {
  return (
    {
      sent: "bg-emerald-100 text-emerald-800",
      scheduled: "bg-blue-100 text-blue-800",
      failed: "bg-rose-100 text-rose-800",
      sending: "bg-amber-100 text-amber-800",
    }[status] || "bg-slate-100 text-slate-700"
  );
}
function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export default function AdminCampaignsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { canAccessPath, canWriteArea } = useAdminAccess();
  const canRead =
    !authLoading &&
    Boolean(isAuthenticated && user?.role === "admin") &&
    canAccessPath("/admin/campaigns");
  const canWrite = canRead && canWriteArea("campaigns");

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ q: "", status: "all", type: "all" });
  const [searchInput, setSearchInput] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [invalidAudienceType, setInvalidAudienceType] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeLocaleTab, setActiveLocaleTab] = useState<Locale>("en");
  const [languages, setLanguages] = useState<LanguageOption[]>(() => normalizeLanguages([]));
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [audiencePreview, setAudiencePreview] = useState<AudiencePreview | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testLocale, setTestLocale] = useState<Locale>("en");
  const [testSending, setTestSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [templates, setTemplates] = useState<BrevoTemplate[] | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [actionIds, setActionIds] = useState<Set<string>>(() => new Set());
  const [importOpen, setImportOpen] = useState(false);
  const latestLoadId = useRef(0);
  const latestPreviewId = useRef(0);
  const previewAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/login?redirect=%2Fadmin%2Fcampaigns");
      return;
    }
    if (user?.role !== "admin" || !canRead) router.replace("/dashboard");
  }, [authLoading, canRead, isAuthenticated, router, user?.role]);

  useEffect(() => {
    if (user?.email) setTestEmail((current) => current || user.email);
  }, [user?.email]);

  const load = useCallback(async (): Promise<boolean> => {
    const loadId = ++latestLoadId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.type !== "all") params.set("type", filters.type);
      const res = await authFetch(`${requireApiBase()}/api/admin/marketing-campaigns?${params}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(messageFromApiBody(json, "Failed to load campaigns"));
      }
      if (loadId !== latestLoadId.current) return false;
      const nextPages = Math.max(1, Number(json.data?.pagination?.totalPages) || 1);
      setTotalPages(nextPages);
      if (page > nextPages) {
        setPage(nextPages);
        return true;
      }
      setCampaigns(json.data?.campaigns || []);
      return true;
    } catch (error) {
      if (loadId === latestLoadId.current) {
        setLoadError(messageFromApiBody(error, "Failed to load campaigns"));
      }
      return false;
    } finally {
      if (loadId === latestLoadId.current) setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setFilters((current) => (current.q === searchInput ? current : { ...current, q: searchInput }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    authFetch(`${requireApiBase()}/api/public/marketing/languages`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(messageFromApiBody(json, "Language catalog unavailable"));
        }
        if (!controller.signal.aborted) {
          setLanguages(normalizeLanguages(json.data?.languages || json.data));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [canRead]);

  useEffect(() => {
    if (!dialogOpen) return;
    const controller = new AbortController();
    const countryQuery = form.countries.join(",");
    setServicesLoading(true);
    setServicesError(null);
    authFetch(
      `${requireApiBase()}/api/admin/marketing-campaigns/service-options${countryQuery ? `?countries=${encodeURIComponent(countryQuery)}` : ""}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(messageFromApiBody(json, "Service options unavailable"));
        }
        if (!controller.signal.aborted) {
          setServices(normalizeServices(json.data?.services || json.data?.options || json.data));
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setServices([]);
          setServicesError(messageFromApiBody(error, "Service options unavailable"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setServicesLoading(false);
      });
    return () => controller.abort();
  }, [dialogOpen, form.countries]);

  useEffect(() => {
    if (!dialogOpen || templates !== null) return;
    const controller = new AbortController();
    setTemplatesLoading(true);
    authFetch(`${requireApiBase()}/api/admin/marketing-campaigns/templates`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(messageFromApiBody(json, "Template lookup failed"));
        }
        if (!controller.signal.aborted) setTemplates(json.data?.templates || []);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          toast.error(messageFromApiBody(error, "Failed to load Brevo templates"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setTemplatesLoading(false);
      });
    return () => controller.abort();
  }, [dialogOpen, templates]);

  const availableLanguages = useMemo(() => {
    const selected = new Set(form.countries);
    const supported = languages.filter(
      (language) =>
        selected.size === 0 ||
        language.countries.length === 0 ||
        language.countries.some((country) => selected.has(country)),
    );
    const retained = languages.filter((language) => form.locales.includes(language.code));
    return Array.from(
      new Map([...supported, ...retained].map((language) => [language.code, language])).values(),
    );
  }, [form.countries, form.locales, languages]);

  const countryOptions: MultiSelectOption[] = useMemo(
    () => marketingCountryOptions(services, form.countries),
    [services, form.countries],
  );
  const serviceOptions: MultiSelectOption[] = useMemo(
    () =>
      services.map((service) => ({
        value: service.key,
        label: service.label,
        hint: service.countries?.join(", "),
      })),
    [services],
  );

  const openCreate = () => {
    if (!canWrite) return;
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setInvalidAudienceType(false);
    setAudiencePreview(null);
    setPreviewError(null);
    setActiveLocaleTab("en");
    setTestLocale("en");
    setDialogOpen(true);
  };

  const openEdit = (campaign: Campaign) => {
    if (!canWrite) return;
    const content = campaign.content || {};
    const existingLocales = Object.keys(content);
    const locales = campaign.audience?.locales?.length
      ? campaign.audience.locales
      : existingLocales.length
        ? existingLocales
        : ["en"];
    const serviceKeys = campaign.audience?.serviceKeys?.length
      ? campaign.audience.serviceKeys
      : campaign.audience?.interestedServices || [];
    const parsedAudienceType = audienceTypeOrNull(campaign.audienceType);
    setEditingId(campaign._id);
    setInvalidAudienceType(Boolean(campaign.audienceTypeInvalid) || parsedAudienceType === null);
    setForm({
      name: campaign.name,
      type: normalizeCampaignType(campaign.type),
      // Missing audienceType is the subscriber-only legacy behavior. An
      // unrecognized stored value stays blocked until explicitly reset.
      audienceType: parsedAudienceType ?? "subscribers",
      countries: campaign.audience?.countries || [],
      serviceKeys,
      locales,
      roles: campaign.audience?.roles?.length
        ? campaign.audience.roles
        : ["customer", "professional"],
      inactiveDays: String(campaign.inactiveDays || 60),
      autoSend: Boolean(campaign.autoSend),
      scheduledAt: campaign.scheduledAt ? toDatetimeLocalValue(campaign.scheduledAt) : "",
      utmCampaign: campaign.utmCampaign || "",
      content: Object.fromEntries(
        Array.from(new Set([...locales, ...existingLocales])).map((locale) => [
          locale,
          content[locale] || emptyContent(),
        ]),
      ),
    });
    setFormError(null);
    setAudiencePreview(null);
    setPreviewError(null);
    setActiveLocaleTab(locales[0] || "en");
    setTestLocale(locales[0] || "en");
    setDialogOpen(true);
  };

  const beginAction = (id: string) =>
    setActionIds((current) => new Set(current).add(id));
  const endAction = (id: string) =>
    setActionIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });

  const payload = useMemo(() => {
    const content: Record<Locale, LocaleContent> = {};
    Object.entries(form.content).forEach(([locale, block]) => {
      if (block.subject.trim() && (block.htmlContent.trim() || block.brevoTemplateId)) {
        content[locale] = {
          ...block,
          subject: block.subject.trim(),
          previewText: block.previewText?.trim() || undefined,
        };
      }
    });
    return {
      name: form.name.trim(),
      type: form.type,
      audienceType: form.audienceType,
      audience: {
        countries: form.countries,
        serviceKeys: form.serviceKeys,
        interestedServices: form.serviceKeys,
        locales: form.locales,
        roles: form.roles,
      },
      content,
      inactiveDays: form.type === "reengagement" ? Number(form.inactiveDays) || 60 : undefined,
      autoSend: form.type === "reengagement" ? form.autoSend : false,
      scheduledAt: toScheduledIso(form.scheduledAt),
      utmCampaign: form.utmCampaign.trim() || undefined,
    };
  }, [form]);

  const audienceKey = useMemo(
    () =>
      JSON.stringify({
        type: payload.type,
        audienceType: payload.audienceType,
        audience: payload.audience,
        inactiveDays: payload.inactiveDays,
      }),
    [payload],
  );

  useEffect(() => {
    latestPreviewId.current += 1;
    previewAbortRef.current?.abort();
    setAudiencePreview(null);
    setPreviewError(null);
    setAudienceLoading(false);
  }, [audienceKey]);

  const audienceError = useMemo(
    () =>
      invalidAudienceType
        ? "This campaign has an unrecognized audience type. Choose a valid audience type before saving it."
        : campaignAudienceValidation(form.type, form.audienceType, form.roles),
    [form.audienceType, form.roles, form.type, invalidAudienceType],
  );
  const leadsSelected = audienceIncludesLeads(form.audienceType);

  const previewAudience = async () => {
    if (!form.locales.length || !form.roles.length) {
      setPreviewError("Select at least one audience locale and role.");
      return;
    }
    if (audienceError) {
      setPreviewError(audienceError);
      return;
    }
    const requestId = ++latestPreviewId.current;
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    setAudienceLoading(true);
    setPreviewError(null);
    try {
      const res = await authFetch(
        `${requireApiBase()}/api/admin/marketing-campaigns/preview-audience`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: payload.type,
            audienceType: payload.audienceType,
            audience: payload.audience,
            inactiveDays: payload.inactiveDays,
            contentLocales: form.locales,
          }),
          signal: controller.signal,
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(messageFromApiBody(json, "Audience preview failed"));
      }
      const data = json.data || {};
      const sourceRecord =
        data.bySource && typeof data.bySource === "object" ? data.bySource : null;
      const next: AudiencePreview = {
        total: numberValue(data.exactTotal ?? data.count ?? data.total),
        exactTotalIsEstimate: Boolean(data.exactTotalIsEstimate),
        bySource: sourceRecord
          ? {
              subscribers: numberValue(sourceRecord.subscribers),
              leads: numberValue(sourceRecord.leads),
            }
          : null,
        byLocale:
          data.byLocale && typeof data.byLocale === "object"
            ? Object.fromEntries(
                Object.entries(data.byLocale).map(([locale, count]) => [
                  locale,
                  numberValue(count),
                ]),
              )
            : {},
        byRole: {
          customer: numberValue(data.byRole?.customer),
          professional: numberValue(data.byRole?.professional),
        },
        deduplicated: numberValue(data.deduplicated),
        excluded: {
          suppressed: numberValue(data.excluded?.suppressed),
          invalidEmail: numberValue(data.excluded?.invalidEmail),
          missingLocale: numberValue(data.excluded?.missingLocale),
          roleMismatch: numberValue(data.excluded?.roleMismatch),
          localeMismatch: numberValue(data.excluded?.localeMismatch),
        },
        fallbackLocaleCount: numberValue(data.fallbackLocaleCount),
        overLimit: Boolean(data.overLimit || data.truncated),
        truncated: Boolean(data.truncated || data.overLimit),
        criteriaHash: data.criteriaHash,
      };
      if (requestId === latestPreviewId.current) {
        setAudiencePreview(next);
        if (next.overLimit) {
          toast.error("Audience exceeds the 5,000-recipient delivery limit");
        }
      }
    } catch (error) {
      if (requestId !== latestPreviewId.current || controller.signal.aborted) return;
      const message = messageFromApiBody(error, "Audience preview failed");
      setPreviewError(message);
    } finally {
      if (requestId === latestPreviewId.current) setAudienceLoading(false);
    }
  };

  const validateBeforeSave = (): string | null => {
    if (!payload.name || !Object.keys(payload.content).length) {
      return "Name and at least one locale with subject and content are required.";
    }
    const missing = form.locales.filter((locale) => !payload.content[locale]);
    if (missing.length) {
      return `Provide content for every selected locale: ${missing.join(", ")}.`;
    }
    if (form.scheduledAt && !payload.scheduledAt) {
      return "Enter a valid schedule date and time.";
    }
    return audienceError;
  };

  const handleSave = async () => {
    if (!canWrite) return;
    const validation = validateBeforeSave();
    if (validation) {
      setFormError(validation === audienceError ? null : validation);
      toast.error(validation);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const base = requireApiBase();
      const res = await authFetch(
        editingId
          ? `${base}/api/admin/marketing-campaigns/${editingId}`
          : `${base}/api/admin/marketing-campaigns`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(messageFromApiBody(json, "Save failed"));
      }
      toast.success(editingId ? "Campaign updated" : "Campaign created");
      setDialogOpen(false);
      const refreshed = await load();
      if (!refreshed) {
        toast.error(
          "The campaign was saved, but the list could not be refreshed. Use Retry to reload.",
        );
      }
    } catch (error) {
      const message = messageFromApiBody(error, "Save failed");
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    if (!canWrite) return;
    if (!testEmail.trim()) {
      toast.error("Enter an email address for the test");
      return;
    }
    if (!payload.content[testLocale]) {
      toast.error(`Add content for ${testLocale.toUpperCase()} before sending a test`);
      return;
    }
    if (audienceError) {
      toast.error(audienceError);
      return;
    }
    setTestSending(true);
    try {
      const res = await authFetch(
        `${requireApiBase()}/api/admin/marketing-campaigns/test-send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: testEmail.trim(),
            locale: testLocale,
            campaign: payload,
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(messageFromApiBody(json, "Test send failed"));
      }
      toast.success(`Test email sent to ${testEmail.trim()}`);
    } catch (error) {
      toast.error(messageFromApiBody(error, "Test send failed"));
    } finally {
      setTestSending(false);
    }
  };

  const handleSend = async (id: string) => {
    if (!canWrite) return;
    if (!confirm("Send this campaign now via Brevo to the matched deduplicated audience?")) {
      return;
    }
    beginAction(id);
    try {
      const res = await authFetch(
        `${requireApiBase()}/api/admin/marketing-campaigns/${id}/send`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(messageFromApiBody(json, "Send failed"));
      }
      toast.success("Campaign sent");
    } catch (error) {
      toast.error(messageFromApiBody(error, "Send failed"));
    } finally {
      await load();
      endAction(id);
    }
  };

  const handleStats = async (id: string) => {
    if (!canWrite) return;
    beginAction(id);
    try {
      const res = await authFetch(
        `${requireApiBase()}/api/admin/marketing-campaigns/${id}/stats`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(messageFromApiBody(json, "Refresh failed"));
      }
      toast.success("Stats refreshed from Brevo");
      await load();
    } catch (error) {
      toast.error(messageFromApiBody(error, "Refresh failed"));
    } finally {
      endAction(id);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canWrite) return;
    if (!confirm("Delete this campaign?")) return;
    beginAction(id);
    try {
      const res = await authFetch(
        `${requireApiBase()}/api/admin/marketing-campaigns/${id}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(messageFromApiBody(json, "Delete failed"));
      }
      toast.success("Deleted");
      if (campaigns.length === 1 && page > 1) setPage((current) => current - 1);
      else await load();
    } catch (error) {
      toast.error(messageFromApiBody(error, "Delete failed"));
    } finally {
      endAction(id);
    }
  };

  const syncSubscribers = async () => {
    if (!canWrite) return;
    setSyncing(true);
    try {
      const res = await authFetch(
        `${requireApiBase()}/api/admin/marketing-subscribers/sync`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(messageFromApiBody(json, "Sync failed"));
      }
      const summary = subscriberSyncSummary(json.data);
      if (summary.tone === "warning") toast.warning(summary.message);
      else toast.success(summary.message);
    } catch (error) {
      toast.error(messageFromApiBody(error, "Sync failed"));
    } finally {
      setSyncing(false);
    }
  };

  const requestDialogOpenChange = (next: boolean) => {
    if (saving) return;
    setDialogOpen(next);
  };

  if (authLoading || !canRead) {
    return (
      <div className="p-8">
        <Skeleton className="mb-4 h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const activeContent = form.content[activeLocaleTab] || emptyContent();
  const editorLocaleOptions = Array.from(
    new Map(
      [
        ...availableLanguages,
        ...form.locales.map((code) => ({
          code,
          label: code.toUpperCase(),
          countries: [] as string[],
        })),
      ].map((language) => [language.code, language]),
    ).values(),
  );
  const leadAudienceNote = leadsSelected
    ? form.audienceType === "both"
      ? "Combined audiences send one email per address. Leads have not opted in to subscriber marketing."
      : "Leads receive one email per address and have not opted in to subscriber marketing."
    : "";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Email campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Multilingual newsletters, promotions, re-engagement, and invitations via Brevo.
          </p>
        </div>
        <CampaignHeaderActions
          canWrite={canWrite}
          syncing={syncing}
          onSyncSubscribers={() => void syncSubscribers()}
          onSubscribers={() => router.push("/admin/campaigns/subscribers")}
          onImportLeads={() => setImportOpen(true)}
          onOpenLeads={() => router.push("/admin/campaigns/leads")}
          onNewCampaign={openCreate}
        />
      </div>

      {!canWrite ? (
        <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Read-only access. Campaign changes, sends and imports are disabled.
        </p>
      ) : null}

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1.5fr_repeat(2,1fr)]">
          <div className="relative">
            <Input
              className="pl-9"
              placeholder="Search campaigns"
              aria-label="Search campaigns"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <Select
            value={filters.status}
            onValueChange={(status) => {
              setPage(1);
              setFilters((current) => ({ ...current, status }));
            }}
          >
            <SelectTrigger aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["draft", "scheduled", "sending", "sent", "failed"].map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.type}
            onValueChange={(type) => {
              setPage(1);
              setFilters((current) => ({ ...current, type }));
            }}
          >
            <SelectTrigger aria-label="Filter by campaign type">
              <SelectValue placeholder="Campaign type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaign types</SelectItem>
              {MARKETING_CAMPAIGN_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {MARKETING_CAMPAIGN_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading && campaigns.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : loadError && campaigns.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
              <p>{loadError}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="mt-3 bg-white">
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No campaigns found</CardTitle>
            <CardDescription>Create a draft or change the filters to view campaigns.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {loadError ? (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950">
              <p>{loadError}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="mt-2 bg-white">
                Retry
              </Button>
            </div>
          ) : null}
          {campaigns.map((campaign) => {
            const deliveries = campaign.deliveries || [];
            const totals = deliveries.reduce(
              (acc, delivery) => ({
                recipients: acc.recipients + (delivery.recipientCount || 0),
                sent: acc.sent + (delivery.stats?.sent || 0),
                delivered: acc.delivered + (delivery.stats?.delivered || 0),
                opens: acc.opens + (delivery.stats?.uniqueViews || 0),
                clicks: acc.clicks + (delivery.stats?.uniqueClicks || 0),
              }),
              { recipients: 0, sent: 0, delivered: 0, opens: 0, clicks: 0 },
            );
            const busy = actionIds.has(campaign._id);
            const audienceInvalid =
              Boolean(campaign.audienceTypeInvalid) ||
              audienceTypeOrNull(campaign.audienceType) === null;
            const hasProviderArtifacts = deliveries.some(
              (delivery) => Boolean(delivery.brevoCampaignId || delivery.brevoListId),
            );
            const canMutate =
              canWrite &&
              ["draft", "scheduled", "failed"].includes(campaign.status) &&
              !hasProviderArtifacts;
            return (
              <Card key={campaign._id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Mail className="h-4 w-4" aria-hidden />
                        {campaign.name}
                      </CardTitle>
                      <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{campaignTypeLabel(campaign.type)}</Badge>
                        <Badge variant={audienceInvalid ? "destructive" : "secondary"}>
                          Audience: {audienceTypeLabel(campaign.audienceType)}
                        </Badge>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor(campaign.status)}`}>
                          {campaign.status}
                        </span>
                        {campaign.autoSend && <Badge variant="secondary">auto re-engagement</Badge>}
                        {campaign.lastError && <span className="text-rose-600">{campaign.lastError}</span>}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canMutate ? (
                        <Button size="sm" variant="outline" onClick={() => openEdit(campaign)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
                          Edit
                        </Button>
                      ) : null}
                      {canWrite && !audienceInvalid && ["draft", "scheduled", "failed"].includes(campaign.status) ? (
                        <Button size="sm" onClick={() => void handleSend(campaign._id)} disabled={busy}>
                          {busy ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Send className="mr-1 h-3.5 w-3.5" aria-hidden />
                          )}
                          Send now
                        </Button>
                      ) : null}
                      {canWrite && campaign.status === "sent" ? (
                        <Button size="sm" variant="outline" onClick={() => void handleStats(campaign._id)} disabled={busy}>
                          <BarChart3 className="mr-1 h-3.5 w-3.5" aria-hidden />
                          Refresh stats
                        </Button>
                      ) : null}
                      {canMutate ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleDelete(campaign._id)}
                          disabled={busy}
                          aria-label={`Delete campaign ${campaign.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-5">
                  <div>Recipients: {totals.recipients}</div>
                  <div>Sent: {totals.sent}</div>
                  <div>Delivered: {totals.delivered}</div>
                  <div>Unique opens: {totals.opens}</div>
                  <div>Unique clicks: {totals.clicks}</div>
                  {campaign.scheduledAt && campaign.status !== "sent" && (
                    <div className="rounded-md bg-blue-50 px-3 py-2 text-blue-800 sm:col-span-5">
                      Scheduled for {formatDate(campaign.scheduledAt)}. Delivery runs during the next campaign job.
                    </div>
                  )}
                  {campaign.lastPreviewAt && (
                    <div className="sm:col-span-5">
                      Last server preview: {campaign.lastPreviewCount ?? 0} recipients on{" "}
                      {formatDate(campaign.lastPreviewAt)}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <LeadImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportAttempted={() => {}}
        onOpenLeads={() => {
          setImportOpen(false);
          router.push("/admin/campaigns/leads");
        }}
      />

      <Dialog open={dialogOpen} onOpenChange={requestDialogOpenChange}>
        <DialogContent
          className="max-h-[90vh] max-w-4xl overflow-y-auto"
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
            <DialogTitle>{editingId ? "Edit campaign" : "New campaign"}</DialogTitle>
            <DialogDescription>
              Build the campaign and preview the exact deduplicated audience the server will use.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Name</Label>
                <Input
                  id="campaign-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Spring promo BE"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-type">Campaign type</Label>
                <Select
                  value={form.type}
                  onValueChange={(type: CampaignType) =>
                    setForm((current) => ({ ...current, type }))
                  }
                >
                  <SelectTrigger id="campaign-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKETING_CAMPAIGN_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {MARKETING_CAMPAIGN_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-audience-type">Audience type</Label>
                <Select
                  value={form.audienceType}
                  onValueChange={(value: AudienceType) => {
                    const next = normalizeAudienceType(value);
                    setInvalidAudienceType(false);
                    setForm((current) => {
                      const roles =
                        next === "leads"
                          ? (["professional"] as Role[])
                          : next === "both" && !current.roles.includes("professional")
                            ? [...current.roles, "professional" as Role]
                            : current.roles;
                      return { ...current, audienceType: next, roles };
                    });
                  }}
                >
                  <SelectTrigger id="campaign-audience-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKETING_AUDIENCE_TYPES.map((audienceType) => (
                      <SelectItem
                        key={audienceType}
                        value={audienceType}
                        disabled={audienceType !== "subscribers" && form.type !== "invitation"}
                      >
                        {MARKETING_AUDIENCE_TYPE_LABELS[audienceType]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Leads and combined audiences are available only for Invitation campaigns.
                </p>
                {invalidAudienceType ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setInvalidAudienceType(false);
                      setAudiencePreview(null);
                      setPreviewError(null);
                      setForm((current) => ({ ...current, audienceType: "subscribers" }));
                    }}
                  >
                    Reset to Subscribers
                  </Button>
                ) : null}
              </div>
            </div>

            {audienceError ? (
              <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                {audienceError}
              </p>
            ) : null}
            {formError ? (
              <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                {formError}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Countries</Label>
                <MultiSelectCombobox
                  options={countryOptions}
                  value={form.countries}
                  onChange={(countries) => setForm((current) => ({ ...current, countries }))}
                  placeholder="All countries"
                  emptySelectionLabel="All countries"
                  searchPlaceholder="Search countries"
                  ariaLabel="Campaign countries"
                />
              </div>
              <div className="space-y-2">
                <Label>Interested services</Label>
                <MultiSelectCombobox
                  options={serviceOptions}
                  value={form.serviceKeys}
                  onChange={(serviceKeys) => setForm((current) => ({ ...current, serviceKeys }))}
                  placeholder={servicesLoading ? "Loading services…" : "All services"}
                  emptySelectionLabel="All services"
                  searchPlaceholder="Search services"
                  ariaLabel="Interested services"
                />
                {servicesError ? (
                  <p className="text-xs text-rose-600">{servicesError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Canonical service options are loaded from the marketing service catalog.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Audience roles</Label>
              <div className="flex flex-wrap gap-4 pt-2">
                {MARKETING_ROLES.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.roles.includes(role)}
                      disabled={campaignRoleLocked(form.audienceType, role, form.roles)}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          roles: checked
                            ? Array.from(new Set([...current.roles, role]))
                            : current.roles.filter((item) => item !== role),
                        }))
                      }
                    />
                    {role}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Leads always count as professionals. Roles apply to subscribers and to lead
                eligibility.
              </p>
              {leadsSelected && !form.roles.includes("professional") ? (
                <p role="alert" className="text-xs text-rose-700">
                  Leads require the professional role.
                </p>
              ) : null}
            </div>

            {form.type === "reengagement" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Inactive days</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.inactiveDays}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, inactiveDays: event.target.value }))
                    }
                  />
                </div>
                <label className="mt-7 flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.autoSend}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({ ...current, autoSend: Boolean(checked) }))
                    }
                  />
                  Auto-send via daily cron
                </label>
              </div>
            )}

            <div className="flex flex-wrap gap-4">
              {availableLanguages.map((language) => (
                <label key={language.code} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.locales.includes(language.code)}
                    disabled={form.locales.length === 1 && form.locales.includes(language.code)}
                    onCheckedChange={(checked) =>
                      setForm((current) => {
                        const locales = checked
                          ? Array.from(new Set([...current.locales, language.code]))
                          : current.locales.filter((locale) => locale !== language.code);
                        const content = { ...current.content };
                        locales.forEach((locale) => {
                          if (!content[locale]) content[locale] = emptyContent();
                        });
                        return { ...current, locales, content };
                      })
                    }
                  />
                  Audience locale {language.code.toUpperCase()}
                </label>
              ))}
            </div>

            <div className="flex gap-2 overflow-x-auto border-b">
              {editorLocaleOptions.map((language) => (
                <button
                  key={language.code}
                  type="button"
                  className={`whitespace-nowrap px-3 py-2 text-sm ${
                    activeLocaleTab === language.code
                      ? "border-b-2 border-foreground font-medium"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setActiveLocaleTab(language.code)}
                >
                  {language.code.toUpperCase()}
                  {form.content[language.code]?.subject ? " ✓" : ""}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="campaign-subject">Subject ({activeLocaleTab.toUpperCase()})</Label>
                <Input
                  id="campaign-subject"
                  value={activeContent.subject}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      content: {
                        ...current.content,
                        [activeLocaleTab]: { ...activeContent, subject: event.target.value },
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-preview-text">Preview text</Label>
                <Input
                  id="campaign-preview-text"
                  value={activeContent.previewText || ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      content: {
                        ...current.content,
                        [activeLocaleTab]: { ...activeContent, previewText: event.target.value },
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-html">HTML body</Label>
                <Textarea
                  id="campaign-html"
                  className="min-h-[160px] font-mono text-xs"
                  value={activeContent.htmlContent}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      content: {
                        ...current.content,
                        [activeLocaleTab]: { ...activeContent, htmlContent: event.target.value },
                      },
                    }))
                  }
                  placeholder="<h1>Hello</h1><p>...</p>"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-template">Brevo template</Label>
                <Select
                  value={String(activeContent.brevoTemplateId || "inline")}
                  disabled={templatesLoading}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      content: {
                        ...current.content,
                        [activeLocaleTab]: {
                          ...activeContent,
                          brevoTemplateId: value === "inline" ? undefined : Number(value),
                          subject:
                            activeContent.subject ||
                            templates?.find((template) => String(template.id) === value)?.subject ||
                            "",
                        },
                      },
                    }))
                  }
                >
                  <SelectTrigger id="campaign-template">
                    <SelectValue placeholder={templatesLoading ? "Loading templates..." : "Use inline HTML"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inline">Use inline HTML</SelectItem>
                    {(templates || []).map((template) => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {template.name} (#{template.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Eligible after (optional)</Label>
                <Input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scheduledAt: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Delivery is attempted during the first daily campaign run after this time (08:00 UTC).
                </p>
              </div>
              <div className="space-y-2">
                <Label>UTM campaign</Label>
                <Input
                  value={form.utmCampaign}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, utmCampaign: event.target.value }))
                  }
                  placeholder="spring_2026"
                />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium">Audience preview</h3>
                  <p className="text-xs text-muted-foreground">
                    Preview uses the server-side resolver; it is never the send authority.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void previewAudience()}
                  disabled={audienceLoading}
                >
                  {audienceLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  Preview audience
                </Button>
              </div>
              {previewError ? (
                <p role="alert" className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  {previewError}
                </p>
              ) : null}
              {audiencePreview ? (
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    {audiencePreview.exactTotalIsEstimate ? "Estimated total" : "Exact total"}:{" "}
                    <strong>{audiencePreview.total}</strong>
                  </div>
                  <div>
                    By language:{" "}
                    {form.locales
                      .map(
                        (locale) =>
                          `${locale.toUpperCase()} ${audiencePreview.byLocale[locale] || 0}`,
                      )
                      .join(", ") || "—"}
                  </div>
                  <div>
                    By account type: customer {audiencePreview.byRole.customer}, professional{" "}
                    {audiencePreview.byRole.professional}
                  </div>
                  {leadsSelected ? (
                    audiencePreview.bySource ? (
                      <>
                        <div>Subscribers: {audiencePreview.bySource.subscribers}</div>
                        <div>Leads: {audiencePreview.bySource.leads}</div>
                      </>
                    ) : (
                      <div className="text-amber-700">Source split unavailable.</div>
                    )
                  ) : null}
                  <div>Duplicate emails removed: {audiencePreview.deduplicated}</div>
                  <div>Fallback language: {audiencePreview.fallbackLocaleCount}</div>
                  <div>Suppressed or unsubscribed: {audiencePreview.excluded.suppressed}</div>
                  <div>Invalid email: {audiencePreview.excluded.invalidEmail}</div>
                  <div>Missing language: {audiencePreview.excluded.missingLocale}</div>
                  <div>Role mismatch: {audiencePreview.excluded.roleMismatch}</div>
                  <div>Language mismatch: {audiencePreview.excluded.localeMismatch}</div>
                  <div
                    className={
                      audiencePreview.overLimit
                        ? "font-medium text-rose-600 sm:col-span-3"
                        : "text-emerald-700 sm:col-span-3"
                    }
                  >
                    {audiencePreview.overLimit
                      ? "Over the 5,000-recipient limit; this cannot be sent."
                      : "Audience is within the delivery limit."}
                  </div>
                  {leadsSelected ? (
                    <p className="text-xs text-muted-foreground sm:col-span-3">{leadAudienceNote}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Run a preview after changing filters to see counts by source, language and
                  account type, plus deduplication and exclusions.
                </p>
              )}
            </div>

            {leadsSelected ? (
              <div className="rounded-lg border bg-muted/20 p-4">
                <h3 className="text-sm font-medium">Footer preview ({activeLocaleTab.toUpperCase()})</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Lead-inclusive campaigns use a neutral invitation footer. It does not claim the
                  recipient opted in, and the unsubscribe link remains.
                </p>
                <p className="mt-2 border-t pt-2 text-sm">
                  {invitationFooterCopy(activeLocaleTab).message}{" "}
                  <span className="underline underline-offset-2">{invitationFooterCopy(activeLocaleTab).unsubscribe}</span>
                </p>
              </div>
            ) : null}

            <div className="rounded-lg border p-4">
              <div className="mb-3">
                <h3 className="text-sm font-medium">Send a test email</h3>
                <p className="text-xs text-muted-foreground">
                  Uses this unsaved draft and does not create or mutate a campaign.
                  {leadsSelected
                    ? " The test uses the same neutral server-rendered footer as a live send."
                    : ""}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(event) => setTestEmail(event.target.value)}
                  placeholder="you@example.com"
                  aria-label="Test email address"
                />
                <Select value={testLocale} onValueChange={setTestLocale}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {form.locales.map((locale) => (
                      <SelectItem key={locale} value={locale}>
                        {locale.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleTestSend()}
                  disabled={testSending}
                >
                  {testSending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  Send test
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
