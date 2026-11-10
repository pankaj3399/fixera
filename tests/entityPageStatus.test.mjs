import assert from 'node:assert/strict'
import { test } from 'node:test'
import { register } from 'node:module'

register('./swc-loader.mjs', import.meta.url)

process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test'
process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.test'

const { default: ProjectDetailPage } = await import('../app/(pages)/projects/[id]/page.tsx')
const { default: ProfessionalProfilePage } = await import('../app/(pages)/professional/[id]/page.tsx')

/** Answers every backend request with one status and body; restores fetch when called. */
function stubBackend(status, body) {
  const original = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  return () => {
    globalThis.fetch = original
  }
}

/** next/navigation's notFound() throws a framework error whose digest names the 404. */
const isNotFoundSignal = (error) => /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(String(error?.digest ?? error?.message ?? ''))

const projectRecord = { _id: 'p1', title: 'Kitchen', professionalId: { _id: 'pro1', name: 'Jan' } }

test('project page: found passes the record to the view, unavailable passes null, not_found calls notFound()', async () => {
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    let restore = stubBackend(200, { success: true, project: projectRecord })
    try {
      const element = await ProjectDetailPage({ params: Promise.resolve({ id: 'p1' }) })
      assert.equal(element.props.initialProject._id, 'p1')
      assert.equal(typeof element.props.serverNow, 'string', 'the server time is passed for the first render')
    } finally {
      restore()
    }

    restore = stubBackend(500, { success: false })
    try {
      const element = await ProjectDetailPage({ params: Promise.resolve({ id: 'p1' }) })
      assert.equal(element.props.initialProject, null, 'an outage renders the shell, not a 404')
    } finally {
      restore()
    }

    restore = stubBackend(200, { success: true, project: { _id: 'p1', professionalId: null } })
    try {
      const element = await ProjectDetailPage({ params: Promise.resolve({ id: 'p1' }) })
      assert.equal(element.props.initialProject, null, 'an unusable record is treated as unavailable, not shown')
    } finally {
      restore()
    }

    restore = stubBackend(404, { success: false })
    try {
      await assert.rejects(ProjectDetailPage({ params: Promise.resolve({ id: 'p1' }) }), isNotFoundSignal)
    } finally {
      restore()
    }
  } finally {
    console.warn = originalWarn
  }
})

test('professional page: found passes the profile, unavailable (429) passes null, not_found calls notFound()', async () => {
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    let restore = stubBackend(200, { success: true, data: { professional: { _id: 'pro1', name: 'Jan' } } })
    try {
      const element = await ProfessionalProfilePage({ params: Promise.resolve({ id: 'pro1' }) })
      assert.equal(element.props.initialProfessional.name, 'Jan')
    } finally {
      restore()
    }

    restore = stubBackend(429, { success: false, msg: 'Too many requests' })
    try {
      const element = await ProfessionalProfilePage({ params: Promise.resolve({ id: 'pro1' }) })
      assert.equal(element.props.initialProfessional, null, 'a rate limit is not a missing profile')
    } finally {
      restore()
    }

    restore = stubBackend(404, { success: false })
    try {
      await assert.rejects(ProfessionalProfilePage({ params: Promise.resolve({ id: 'pro1' }) }), isNotFoundSignal)
    } finally {
      restore()
    }
  } finally {
    console.warn = originalWarn
  }
})
