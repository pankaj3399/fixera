import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
const { createProjectMediaUploader, appendProjectMedia, resolveWizardProjectId } = await import('../lib/projectMediaUploads.ts')

const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
const tick = () => new Promise(resolve => setImmediate(resolve))
const file = name => new File([new Uint8Array([1, 2, 3])], name, { type: name.endsWith('.mp4') ? 'video/mp4' : 'image/png' })

/** Minimal stand-in for the wizard page: projectData + functional setState, like React's. */
function wizardPage(initial = {}) {
  const page = { state: { media: { images: [], videos: [] }, ...initial }, pendingLog: [], uploads: [], mounted: true }
  page.setState = update => { page.state = typeof update === 'function' ? update(page.state) : update }
  page.uploader = createProjectMediaUploader({
    getMedia: () => page.state.media,
    getProjectId: () => resolveWizardProjectId(page.state),
    isActive: () => page.mounted,
    onPendingChange: pending => page.pendingLog.push(pending),
    upload: (kind, f, projectId) => {
      const d = deferred()
      page.uploads.push({ kind, name: f.name, projectId, ...d })
      return d.promise
    },
    commit: (kind, urls) => page.setState(prev => ({ ...prev, media: appendProjectMedia(prev.media, kind, urls) })),
  })
  return page
}

test('F1: an upload finishing after the first draft save assigned the id still lands in the wizard state', async () => {
  const page = wizardPage()
  // Step 1 instance A starts a video upload, then the user clicks Save draft:
  // the save assigns the id (formerly the Step 1 key, which remounted it).
  const accepted = page.uploader.enqueue('video', [file('site.mp4')])
  assert.equal(page.uploader.hasPending(), true, 'Save/Next/Submit must see the pending upload')
  assert.deepEqual(page.uploader.pending(), { image: 0, video: 1 })
  page.setState(prev => ({ ...prev, id: 'p1', status: 'draft' }))
  // Instance A is gone; nothing of it is needed for the commit.
  page.uploads[0].resolve('https://s3/projects/temp/video/u/site.mp4?X-Amz-Signature=s')
  assert.equal(await accepted, true)
  assert.deepEqual(page.state.media.videos, ['https://s3/projects/temp/video/u/site.mp4?X-Amz-Signature=s'])
  assert.equal(page.state.id, 'p1', 'the commit is a functional update and keeps the saved id')
  assert.equal(page.uploader.hasPending(), false)
  assert.deepEqual(page.pendingLog.at(-1), { image: 0, video: 0 })
})

test('F1: commits apply on top of edits made while the upload was in flight (delete / reorder / other fields)', async () => {
  const page = wizardPage({ media: { images: ['a', 'b', 'c'], videos: [] }, title: 'Old' })
  const done = page.uploader.enqueue('image', [file('d.png')])
  page.setState(prev => ({ ...prev, title: 'New', media: { ...prev.media, images: ['c', 'a'] } }))
  page.uploads[0].resolve('d-url')
  await done
  assert.deepEqual(page.state.media.images, ['c', 'a', 'd-url'])
  assert.equal(page.state.title, 'New')
})

test('F1: slots stay reserved across in-flight uploads, per kind, and failures release them', async () => {
  const page = wizardPage({ media: { images: ['x'], videos: [] } })
  const first = page.uploader.enqueue('image', [file('1.png'), file('2.png')])
  assert.equal(await page.uploader.enqueue('image', [file('3.png'), file('4.png')]), false, '1 stored + 2 in flight + 2 > 4')
  const video = page.uploader.enqueue('video', [file('v.mp4')])
  assert.deepEqual(page.uploader.pending(), { image: 2, video: 1 })
  // Out-of-order completion keeps selection order; a failed file is dropped.
  page.uploads[1].resolve('2-url')
  page.uploads[0].reject(new Error('network'))
  page.uploads[2].resolve(null)
  await Promise.all([first, video])
  assert.deepEqual(page.state.media, { images: ['x', '2-url'], videos: [] })
  assert.deepEqual(page.uploader.pending(), { image: 0, video: 0 })
  assert.equal(await Promise.race([page.uploader.enqueue('video', [file('w.mp4')]), tick().then(() => 'queued')]), 'queued', 'video slot freed after the failed upload')
})

test('F8: the upload project id is read at upload time from the wizard id (temp only until the draft exists)', async () => {
  const page = wizardPage()
  const before = page.uploader.enqueue('image', [file('a.png')])
  page.setState(prev => ({ ...prev, id: '665f1c2a9e1d3f4a5b6c7d8e' }))
  const after = page.uploader.enqueue('image', [file('b.png')])
  assert.equal(page.uploads[0].projectId, undefined, 'new project: backend keys it under temp, intentionally')
  assert.equal(page.uploads[1].projectId, '665f1c2a9e1d3f4a5b6c7d8e', 'saved project: keyed under its id')
  page.uploads.forEach(u => u.resolve(`${u.name}-url`))
  await Promise.all([before, after])
  assert.equal(resolveWizardProjectId({ id: 'w1', _id: 'legacy' }), 'w1')
  assert.equal(resolveWizardProjectId({ _id: 'legacy' }), 'legacy')
  assert.equal(resolveWizardProjectId({ id: '  ' }), undefined)
  assert.equal(resolveWizardProjectId(undefined), undefined)
})

test('F1: after the page unmounts, a finishing upload neither commits nor reports pending state', async () => {
  const page = wizardPage()
  const done = page.uploader.enqueue('image', [file('a.png')])
  const logged = page.pendingLog.length
  page.mounted = false
  page.uploads[0].resolve('late-url')
  await done
  assert.deepEqual(page.state.media.images, [])
  assert.equal(page.pendingLog.length, logged)
})

test('appendProjectMedia enforces the limits and tolerates missing lists', () => {
  assert.deepEqual(appendProjectMedia(undefined, 'image', ['a']), { images: ['a'], videos: [] })
  assert.deepEqual(appendProjectMedia({ images: ['1', '2', '3'], videos: ['v'] }, 'image', ['4', '5']).images, ['1', '2', '3', '4'])
  assert.deepEqual(appendProjectMedia({ images: [], videos: ['v'] }, 'video', ['w']).videos, ['v'])
})

test('wizard wiring: uploads are page-owned, saves/navigation wait for them, Step 1 is not keyed by the id', () => {
  const page = readFileSync(new URL('../app/(pages)/projects/create/page.tsx', import.meta.url), 'utf8')
  const step = readFileSync(new URL('../components/professional/project-wizard/Step1BasicInfo.tsx', import.meta.url), 'utf8')
  assert.match(page, /createProjectMediaUploader\(/)
  assert.doesNotMatch(page, /key=\{projectData\.id/)
  assert.match(page, /key=\{step1HydrationKey\}/)
  for (const fn of ['saveProjectDraft', 'handleStepChange', 'handleNext', 'handlePrevious', 'handleSubmit', 'handleShowValidationErrors']) {
    const body = page.slice(page.indexOf(`const ${fn} = `), page.indexOf(`const ${fn} = `) + 400)
    assert.match(body, /blockWhileUploading\(\)/, `${fn} must wait for uploads`)
  }
  assert.match(page, /projectId !== selfAssignedProjectIdRef\.current/, 'first save must not reload over in-memory state')
  assert.doesNotMatch(step, /createProjectMediaQueue|uploadProjectMedia|formData\._id \|\| data\._id/)
  assert.match(step, /delete fields\.media\s+onChange\(fields\)/, 'Step 1 must not echo its stale media copy')
})
