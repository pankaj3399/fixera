import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { isAllowedProjectImageType, pickProjectMediaUrl, uploadProjectMedia } from '../lib/projectMediaUpload.ts'

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'kitchen.png', { type: 'image/png' })

test('wizard uploads media as multipart and previews the signed URL', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return json(200, { success: true, data: { url: 'https://b.s3.amazonaws.com/projects/p1/image/u1/k.png', key: 'k', signedUrl: 'https://b.s3.amazonaws.com/projects/p1/image/u1/k.png?X-Amz-Signature=abc' } })
  }
  const result = await uploadProjectMedia({ apiBase: 'https://api.test', kind: 'image', file, projectId: '665f1c2a9e1d3f4a5b6c7d8e', fetchImpl })
  assert.deepEqual(result, { ok: true, url: 'https://b.s3.amazonaws.com/projects/p1/image/u1/k.png?X-Amz-Signature=abc' })
  assert.equal(calls[0].url, 'https://api.test/api/user/projects/upload/image')
  assert.equal(calls[0].init.method, 'POST')
  const body = calls[0].init.body
  assert.ok(body instanceof FormData, 'multipart, not a base64 data URL in JSON')
  assert.equal(body.get('image').name, 'kitchen.png')
  assert.equal(body.get('projectId'), '665f1c2a9e1d3f4a5b6c7d8e')
})

test('older backends without signedUrl fall back to the stored URL; unsafe project ids are not sent', async () => {
  let sent
  const fetchImpl = async (_url, init) => { sent = init.body; return json(200, { success: true, data: { url: 'https://b/x.mp4', key: 'x' } }) }
  const result = await uploadProjectMedia({ apiBase: '', kind: 'video', file, projectId: '../../etc', fetchImpl })
  assert.deepEqual(result, { ok: true, url: 'https://b/x.mp4' })
  assert.equal(sent.has('projectId'), false)
  assert.ok(sent.get('video'))
})

test('failures surface the backend message or the HTTP status', async () => {
  assert.deepEqual(
    await uploadProjectMedia({ apiBase: '', kind: 'image', file, fetchImpl: async () => json(400, { success: false, message: 'Invalid image file' }) }),
    { ok: false, status: 400, message: 'Invalid image file' },
  )
  assert.deepEqual(
    await uploadProjectMedia({ apiBase: '', kind: 'image', file, fetchImpl: async () => new Response('Request Entity Too Large', { status: 413 }) }),
    { ok: false, status: 413, message: undefined },
  )
  assert.deepEqual(
    await uploadProjectMedia({ apiBase: '', kind: 'image', file, fetchImpl: async () => { throw new TypeError('offline') } }),
    { ok: false, status: 0 },
  )
  assert.deepEqual(
    await uploadProjectMedia({ apiBase: '', kind: 'image', file, fetchImpl: async () => json(200, { success: true, data: {} }) }),
    { ok: false, status: 200, message: undefined },
    'a success body without any URL is not a usable upload',
  )
})

test('accepted image formats match the backend validator', () => {
  for (const type of ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']) assert.equal(isAllowedProjectImageType(type), true, type)
  for (const type of ['image/gif', 'image/svg+xml', 'image/heic']) assert.equal(isAllowedProjectImageType(type), false, type)
  assert.equal(pickProjectMediaUrl({ signedUrl: '  ', url: 'u' }), 'u')
  assert.equal(pickProjectMediaUrl(null), null)
})

test('wizard step 1 no longer inlines media as data URLs', () => {
  const step = readFileSync(new URL('../components/professional/project-wizard/Step1BasicInfo.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(step, /readAsDataURL/)
  assert.match(step, /uploadMediaFile\('image'\)/)
  assert.match(step, /uploadMediaFile\('video'\)/)
  for (const locale of ['en', 'nl', 'fr']) {
    const guide = JSON.parse(readFileSync(new URL(`../messages/${locale}/projectWizard.json`, import.meta.url), 'utf8')).step1.images.guide
    assert.doesNotMatch(guide, /GIF|SVG/, `${locale} guide must not promise formats the upload rejects`)
  }
})
