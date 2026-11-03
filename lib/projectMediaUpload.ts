/**
 * Project wizard media upload (images/videos).
 *
 * Files are uploaded as multipart to the private project-media store instead
 * of being inlined as base64 data URLs in the draft JSON (which bloated the
 * project document and pushed draft saves past request-size limits).
 *
 * Wire contract: POST /api/user/projects/upload/{image|video}, field `image`
 * or `video`, optional `projectId` → { success, data: { url, key, signedUrl?,
 * signedUrlExpiresAt? } }. `signedUrl` is a time-limited preview URL for the
 * private object; the backend strips signatures again on save, so storing it
 * in the draft is safe. `url` alone is used only by backends that predate it.
 */

export type ProjectMediaKind = 'image' | 'video'

/** Formats the backend upload validator accepts (magic-byte checked server-side). */
export const PROJECT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const PROJECT_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo'] as const

export const isAllowedProjectImageType = (type: string) =>
  (PROJECT_IMAGE_TYPES as readonly string[]).includes(type === 'image/jpg' ? 'image/jpeg' : type)

/**
 * Upper bound for one upload request. A stalled request would otherwise keep
 * its queue slot forever and block save, step changes and submit until a
 * reload. Ten minutes fits the 50 MiB video limit at about 0.7 Mbit/s.
 */
export const PROJECT_MEDIA_UPLOAD_TIMEOUT_MS = 10 * 60_000

export type ProjectMediaUploadResult =
  | { ok: true; url: string }
  | { ok: false; status: number; message?: string }

/** Display URL from an upload response: signed preview first, stored URL as fallback. */
export function pickProjectMediaUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const { signedUrl, url } = data as { signedUrl?: unknown; url?: unknown }
  if (typeof signedUrl === 'string' && signedUrl.trim()) return signedUrl
  if (typeof url === 'string' && url.trim()) return url
  return null
}

const safeMessage = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const body = value as { message?: unknown; msg?: unknown; error?: { message?: unknown } }
  const candidate = body.message ?? body.msg ?? body.error?.message
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined
}

export async function uploadProjectMedia({
  apiBase,
  kind,
  file,
  projectId,
  fetchImpl,
  timeoutMs = PROJECT_MEDIA_UPLOAD_TIMEOUT_MS,
}: {
  apiBase: string
  kind: ProjectMediaKind
  file: Blob & { name?: string }
  projectId?: string | null
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>
  timeoutMs?: number
}): Promise<ProjectMediaUploadResult> {
  const body = new FormData()
  body.append(kind, file, file.name || kind)
  if (projectId && /^[A-Za-z0-9_-]{1,64}$/.test(projectId)) body.append('projectId', projectId)
  // Covers the response body too: an aborted read resolves to a failed upload.
  const signal = AbortSignal.timeout(timeoutMs)
  let res: Response
  try {
    res = await fetchImpl(`${apiBase}/api/user/projects/upload/${kind}`, { method: 'POST', body, signal })
  } catch {
    return { ok: false, status: 0 }
  }
  const json: unknown = await res.json().catch(() => null)
  const success = Boolean(json && typeof json === 'object' && (json as { success?: unknown }).success === true)
  const url = success ? pickProjectMediaUrl((json as { data?: unknown }).data) : null
  if (!res.ok || !url) return { ok: false, status: res.status, message: safeMessage(json) }
  return { ok: true, url }
}
