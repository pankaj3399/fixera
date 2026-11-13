export type PopularProject = {
  _id: string;
  title: string;
  category: string;
  service: string;
  image: string | null;
  location: string | null;
  startingPrice: number | null;
  priceType: string;
  avgRating: number;
  totalReviews: number;
  professional: {
    name: string;
    profileImage: string | null;
    city: string | null;
    country: string | null;
  } | null;
  /**
   * Set by the server when it dropped inline `data:` images from this record
   * (they made the home page HTML ~2 MB). The carousel loads them in the
   * browser from the same backend endpoint; see `popularProjectsPath`.
   */
  imagesDeferred?: boolean;
};

/** The backend query a popular-projects list was built from. */
export type PopularProjectsQuery = {
  limit: number;
  service: string;
};

export function normalizePopularProjectsQuery(options?: {
  limit?: number;
  service?: string;
}): PopularProjectsQuery {
  return {
    limit: Math.min(Math.max(options?.limit ?? 10, 1), 20),
    service: options?.service?.trim() ?? "",
  };
}

/** Backend path (without origin) for a popular-projects query. */
export function popularProjectsPath(query: PopularProjectsQuery): string {
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.service) params.set("service", query.service);
  return `/api/search/popular-projects?${params.toString()}`;
}

export const isInlineImage = (value: unknown): value is string =>
  typeof value === "string" && /^\s*data:/i.test(value);

/**
 * Drop inline `data:` images (project cover and professional avatar) so they
 * stay out of server HTML and the Data Cache. Remote URLs are kept as-is.
 */
export function withoutInlineImages(project: PopularProject): PopularProject {
  const coverInline = isInlineImage(project.image);
  const avatarInline = isInlineImage(project.professional?.profileImage);
  if (!coverInline && !avatarInline) return project;
  return {
    ...project,
    image: coverInline ? null : project.image,
    professional:
      project.professional && avatarInline
        ? { ...project.professional, profileImage: null }
        : project.professional,
    imagesDeferred: true,
  };
}
