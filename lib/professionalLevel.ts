export const PROFESSIONAL_LEVELS = [
  "New",
  "Level 1",
  "Level 2",
  "Level 3",
  "Expert",
] as const;

export type ProfessionalLevel = (typeof PROFESSIONAL_LEVELS)[number];

export const LEVEL_COLORS: Record<ProfessionalLevel, string> = {
  New: "bg-gray-100 text-gray-600",
  "Level 1": "bg-blue-100 text-blue-700",
  "Level 2": "bg-green-100 text-green-700",
  "Level 3": "bg-purple-100 text-purple-700",
  Expert: "bg-amber-100 text-amber-700",
};

export const ADMIN_TAG_PRESETS = ["verified", "our choice"] as const;

export type AdminTagPreset = (typeof ADMIN_TAG_PRESETS)[number];

export const ADMIN_TAG_STYLES: Record<AdminTagPreset, string> = {
  verified: "bg-blue-50 text-blue-700 border-blue-200",
  "our choice": "bg-amber-50 text-amber-700 border-amber-200",
};

const DEFAULT_LEVEL_COLOR = "bg-gray-100 text-gray-600";
const DEFAULT_TAG_STYLE = "bg-gray-50 text-gray-600 border-gray-200";

const LEVEL_LOOKUP: Record<string, ProfessionalLevel> = Object.fromEntries(
  PROFESSIONAL_LEVELS.map((lvl) => [lvl.toLowerCase(), lvl])
) as Record<string, ProfessionalLevel>;

const TAG_LOOKUP: Record<string, AdminTagPreset> = Object.fromEntries(
  ADMIN_TAG_PRESETS.map((tag) => [tag.toLowerCase(), tag])
) as Record<string, AdminTagPreset>;

export const normalizeProfessionalLevel = (
  input?: string | null
): ProfessionalLevel | null => {
  if (!input) return null;
  return LEVEL_LOOKUP[input.trim().toLowerCase()] ?? null;
};

export const normalizeAdminTag = (
  input?: string | null
): AdminTagPreset | null => {
  if (!input) return null;
  return TAG_LOOKUP[input.trim().toLowerCase()] ?? null;
};

export const getLevelColor = (level?: string | null): string => {
  const canonical = normalizeProfessionalLevel(level);
  return canonical ? LEVEL_COLORS[canonical] : DEFAULT_LEVEL_COLOR;
};

export const getAdminTagStyle = (tag?: string | null): string => {
  const canonical = normalizeAdminTag(tag);
  return canonical ? ADMIN_TAG_STYLES[canonical] : DEFAULT_TAG_STYLE;
};

export const formatAdminTagLabel = (tag: string): string =>
  tag
    .split(" ")
    .map((w) => (w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

export const formatResponseTime = (ms: number): string => {
  if (!ms || ms <= 0) return "N/A";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`;
};
