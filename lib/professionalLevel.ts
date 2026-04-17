export const PROFESSIONAL_LEVELS = [
  "New",
  "Level 1",
  "Level 2",
  "Level 3",
  "Expert",
] as const;

export type ProfessionalLevel = (typeof PROFESSIONAL_LEVELS)[number];

export const LEVEL_COLORS: Record<string, string> = {
  New: "bg-gray-100 text-gray-600",
  "Level 1": "bg-blue-100 text-blue-700",
  "Level 2": "bg-green-100 text-green-700",
  "Level 3": "bg-purple-100 text-purple-700",
  Expert: "bg-amber-100 text-amber-700",
};

export const ADMIN_TAG_PRESETS = ["verified", "our choice"] as const;

export const ADMIN_TAG_STYLES: Record<string, string> = {
  verified: "bg-blue-50 text-blue-700 border-blue-200",
  "our choice": "bg-amber-50 text-amber-700 border-amber-200",
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
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
};
