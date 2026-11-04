/**
 * Wizard-level owner of project media uploads.
 *
 * Uploads take seconds to minutes (multipart video), far longer than the old
 * FileReader path. They must therefore be owned by the wizard page, not by the
 * Step 1 component that started them: Step 1 unmounts on step changes, and a
 * per-instance queue would resolve into a dead component and silently drop
 * the media (and orphan the uploaded object).
 *
 * The controller:
 * - reserves the 4-image / 1-video slots across in-flight uploads;
 * - commits finished uploads through `commit(kind, urls)`, which the page
 *   implements as a functional `setProjectData(prev => …)` update so a commit
 *   always lands on the latest media (deletions/reorders made meanwhile);
 * - reports per-kind pending counts so Save draft / Next / Submit / step
 *   changes can be blocked until every upload has landed;
 * - reads the project id at upload time (`getProjectId`), so files uploaded
 *   after the first draft save are keyed under that project instead of temp;
 * - stops committing once `isActive()` turns false (page unmounted). An
 *   object uploaded by an abandoned page stays unreferenced in storage; the
 *   page warns before unload while uploads are pending to keep that rare.
 */
import { createProjectMediaQueue } from './projectMediaQueue'
import type { ProjectMediaKind } from './projectMediaUpload'

export type ProjectMediaLists = { images: string[]; videos: string[] }
export type ProjectMediaPending = Record<ProjectMediaKind, number>

export const PROJECT_MEDIA_LIMITS: Record<ProjectMediaKind, number> = { image: 4, video: 1 }

const listKey = (kind: ProjectMediaKind): keyof ProjectMediaLists => (kind === 'image' ? 'images' : 'videos')

export function normalizeProjectMedia(media?: Partial<ProjectMediaLists> | null): ProjectMediaLists {
  return {
    images: Array.isArray(media?.images) ? media.images : [],
    videos: Array.isArray(media?.videos) ? media.videos : [],
  }
}

/** Pure append used by the page's functional state update; enforces the limits. */
export function appendProjectMedia(
  media: Partial<ProjectMediaLists> | null | undefined,
  kind: ProjectMediaKind,
  urls: readonly string[],
): ProjectMediaLists {
  const current = normalizeProjectMedia(media)
  const key = listKey(kind)
  return { ...current, [key]: [...current[key], ...urls].slice(0, PROJECT_MEDIA_LIMITS[kind]) }
}

/** Project id the upload endpoint should key the object under (never the legacy `_id` alias alone). */
export function resolveWizardProjectId(data: { id?: unknown; _id?: unknown } | null | undefined): string | undefined {
  const id = data?.id ?? data?._id
  return typeof id === 'string' && id.trim() ? id : undefined
}

export function createProjectMediaUploader({
  upload,
  getMedia,
  getProjectId,
  commit,
  onPendingChange,
  isActive = () => true,
}: {
  upload: (kind: ProjectMediaKind, file: File, projectId: string | undefined) => Promise<string | null>
  getMedia: () => Partial<ProjectMediaLists> | null | undefined
  getProjectId: () => string | undefined
  commit: (kind: ProjectMediaKind, urls: string[]) => void
  onPendingChange?: (pending: ProjectMediaPending) => void
  isActive?: () => boolean
}) {
  const pending: ProjectMediaPending = { image: 0, video: 0 }
  const queueFor = (kind: ProjectMediaKind) =>
    createProjectMediaQueue<File>(
      PROJECT_MEDIA_LIMITS[kind],
      () => normalizeProjectMedia(getMedia())[listKey(kind)].length,
      file => upload(kind, file, getProjectId()),
      urls => { if (isActive()) commit(kind, urls) },
      count => {
        pending[kind] = count
        if (isActive()) onPendingChange?.({ ...pending })
      },
    )
  const queues = { image: queueFor('image'), video: queueFor('video') }
  return {
    /** Resolves `false` when the files would exceed the kind's limit (nothing is uploaded). */
    enqueue: (kind: ProjectMediaKind, files: readonly File[]) => queues[kind](files),
    pending: (): ProjectMediaPending => ({ ...pending }),
    hasPending: () => pending.image + pending.video > 0,
  }
}

export type ProjectMediaUploader = ReturnType<typeof createProjectMediaUploader>
