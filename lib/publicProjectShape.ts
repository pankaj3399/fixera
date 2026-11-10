import type { PublicProjectDto } from "@/types/project";

/**
 * Checks and normalizes a public project record before any view reads it. Used by the
 * server read (`lib/server/publicEntities.ts`) and by the client fetch, so both paths
 * hand the view the same shape.
 *
 * A record without an id, or without a professional that has an id, is unusable: the
 * view needs the professional for its contact and booking actions. It returns null.
 * Missing optional containers get safe defaults, so a field such as `distance` or
 * `media` never throws in render.
 */
export function normalizePublicProject(value: unknown): PublicProjectDto | null {
  if (!isRecord(value) || typeof value._id !== "string" || value._id === "") return null;
  if (!isRecord(value.professionalId) || typeof value.professionalId._id !== "string") return null;

  const distance = isRecord(value.distance) ? value.distance : {};
  const media = isRecord(value.media) ? value.media : {};
  const images = Array.isArray(media.images)
    ? media.images.filter((image): image is string => typeof image === "string" && image !== "")
    : [];

  return {
    ...(value as unknown as PublicProjectDto),
    distance: {
      ...(distance as unknown as PublicProjectDto["distance"]),
      noBorders: distance.noBorders === true,
    },
    media: { ...(media as unknown as PublicProjectDto["media"]), images },
    subprojects: Array.isArray(value.subprojects)
      ? (value.subprojects.filter(isRecord) as unknown as PublicProjectDto["subprojects"])
      : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
