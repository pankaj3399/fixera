'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  popularProjectsPath,
  type PopularProject,
  type PopularProjectsQuery,
} from '@/lib/popularProject';

export type DeferredImages = Record<string, { image: string | null; profileImage: string | null }>;

const imageOf = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

/** Map backend popular-projects JSON to images by project id. */
export function imagesById(data: unknown): DeferredImages {
  const projects = data && typeof data === 'object' ? (data as { projects?: unknown }).projects : null;
  if (!Array.isArray(projects)) return {};
  const images: DeferredImages = {};
  for (const item of projects) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { _id?: unknown; image?: unknown; professional?: unknown };
    if (typeof record._id !== 'string') continue;
    const professional = record.professional && typeof record.professional === 'object'
      ? (record.professional as { profileImage?: unknown })
      : null;
    images[record._id] = { image: imageOf(record.image), profileImage: imageOf(professional?.profileImage) };
  }
  return images;
}

/**
 * Fill in the images the server left out of a popular-projects list
 * (inline `data:` images, see `withoutInlineImages`). Only records marked
 * `imagesDeferred` are touched, matched by project id; images the server
 * did send are kept exactly. Until the request succeeds, or if it fails,
 * the cards keep their no-image placeholder.
 */
export function applyDeferredImages(projects: PopularProject[], images: DeferredImages): PopularProject[] {
  return projects.map((project) => {
    const filled = project.imagesDeferred ? images[project._id] : undefined;
    if (!filled) return project;
    return {
      ...project,
      image: project.image ?? filled.image,
      professional: project.professional
        ? { ...project.professional, profileImage: project.professional.profileImage ?? filled.profileImage }
        : project.professional,
    };
  });
}

export function useDeferredPopularImages(
  projects: PopularProject[],
  query: PopularProjectsQuery | undefined,
  backendUrl: string | undefined = process.env.NEXT_PUBLIC_BACKEND_URL,
): PopularProject[] {
  const [images, setImages] = useState<DeferredImages>({});
  const needsImages = Boolean(query) && projects.some((project) => project.imagesDeferred);
  const path = query ? popularProjectsPath(query) : null;

  useEffect(() => {
    if (!needsImages || !path || !backendUrl) return;
    const controller = new AbortController();
    // Same endpoint and parameters as the server render, so the backend's
    // CDN can serve it; no credentials, nothing user-specific.
    fetch(`${backendUrl}${path}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!controller.signal.aborted) setImages(imagesById(data));
      })
      .catch(() => {
        // Keep the placeholders.
      });
    return () => controller.abort();
  }, [needsImages, path, backendUrl]);

  return useMemo(() => applyDeferredImages(projects, images), [projects, images]);
}
