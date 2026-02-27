import { iconMapData } from "@/data/icons";
import {
  Droplet, Zap, PaintBucket, Hammer, Home, TreePine, Sparkles, Fan,
  Thermometer, Layers, Grid, Sun, Palette, ChefHat, Bath, DoorOpen,
  Truck, Wrench, Shield, BrickWall, Ruler, Building,
  type LucideIcon,
} from "lucide-react";

const ICON_COMPONENTS: Record<string, LucideIcon> = {
  Droplet, Zap, PaintBucket, Hammer, Home, TreePine, Sparkles, Fan,
  Thermometer, Layers, Grid, Sun, Palette, ChefHat, Bath, DoorOpen,
  Truck, Wrench, Shield, BrickWall, Ruler, Building,
};

/**
 * Resolves the icon key string for a service based on:
 * 1. A custom icon name (from admin configuration) if it exists in iconMapData
 * 2. Slug-based keyword matching as fallback
 * 3. "Wrench" as the default
 */
const resolveServiceIconKey = (slug: string, customIcon?: string): string => {
  if (customIcon && iconMapData[customIcon as keyof typeof iconMapData]) {
    return customIcon;
  }

  const s = slug.toLowerCase();
  if (s.includes("plumb")) return "Droplet";
  if (s.includes("electr")) return "Zap";
  if (s.includes("paint")) return "PaintBucket";
  if (s.includes("renov")) return "Hammer";
  if (s.includes("roof")) return "Home";
  if (s.includes("garden") || s.includes("landsc")) return "TreePine";
  if (s.includes("clean")) return "Sparkles";
  if (s.includes("hvac") || s.includes("air")) return "Fan";
  if (s.includes("insul")) return "Thermometer";
  if (s.includes("floor")) return "Layers";
  if (s.includes("tile") || s.includes("tiling")) return "Grid";
  if (s.includes("solar")) return "Sun";
  if (s.includes("design") || s.includes("3d")) return "Palette";
  if (s.includes("kitchen")) return "ChefHat";
  if (s.includes("bath")) return "Bath";
  if (s.includes("carpentry") || s.includes("wood")) return "Hammer";
  if (s.includes("window") || s.includes("door")) return "DoorOpen";
  if (s.includes("mov") || s.includes("remov")) return "Truck";
  if (s.includes("fenc")) return "BrickWall";
  if (s.includes("plaster") || s.includes("drywall")) return "Ruler";
  if (s.includes("demolit")) return "Hammer";

  return "Wrench";
};

/** Returns the appropriate Lucide icon component for a service. */
export const getServiceIcon = (slug: string, customIcon?: string): LucideIcon => {
  const key = resolveServiceIconKey(slug, customIcon);
  return ICON_COMPONENTS[key] || iconMapData[key as keyof typeof iconMapData] || Wrench;
};

/** Returns the icon name (string) for a service — used with the Icon component. */
export const getServiceIconName = (slug: string, customIcon?: string): string => {
  return resolveServiceIconKey(slug, customIcon);
};

/** Category-level icon mapping based on category slug/name */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "small-tasks": Wrench,
  "interior": Palette,
  "exterior": Building,
  "outdoor-work": TreePine,
  "renovation": Hammer,
  "inspections": Shield,
};

const CATEGORY_ICON_NAMES: Record<string, string> = {
  "small-tasks": "Wrench",
  "interior": "Palette",
  "exterior": "Building",
  "outdoor-work": "TreePine",
  "renovation": "Hammer",
  "inspections": "Shield",
};

const resolveCategoryIconKey = (categorySlug: string, categoryName?: string): string => {
  const slug = categorySlug.toLowerCase();
  if (CATEGORY_ICON_NAMES[slug]) return CATEGORY_ICON_NAMES[slug];

  const name = (categoryName || "").toLowerCase();
  if (name.includes("small") || name.includes("task")) return "Wrench";
  if (name.includes("interior")) return "Palette";
  if (name.includes("exterior")) return "Building";
  if (name.includes("outdoor") || name.includes("garden")) return "TreePine";
  if (name.includes("renov")) return "Hammer";
  if (name.includes("inspect")) return "Shield";

  return "Wrench";
};

/** Returns the icon component for a category. */
export const getCategoryIcon = (categorySlug: string, categoryName?: string): LucideIcon => {
  const slug = categorySlug.toLowerCase();
  if (CATEGORY_ICONS[slug]) return CATEGORY_ICONS[slug];

  const key = resolveCategoryIconKey(categorySlug, categoryName);
  return ICON_COMPONENTS[key] || Wrench;
};

/** Same as getCategoryIcon but returns string name */
export const getCategoryIconName = (categorySlug: string, categoryName?: string): string => {
  return resolveCategoryIconKey(categorySlug, categoryName);
};
