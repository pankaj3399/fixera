import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hooks, loadComponent, settle } from './reviewComponentHarness.mjs'

function colorHook() {
  const state = hooks()
  const react = { ...state.api, useReducer(reducer, initial) { const [value, set] = state.api.useState(initial); return [value, () => set(reducer)] } }
  const useTierColors = loadComponent('../lib/tierColors.ts', { react, '@/components/dashboard/TierBadge': { TIER_BADGE_FALLBACK_COLOR: '#6B7280' } }, 'useTierColors')
  return { state, render() { const value = state.render(useTierColors); state.flush(); return value } }
}
test('failed color requests retry while mounted, preserving successful empty metadata caches', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const previousFetch = globalThis.fetch, previousBackend = process.env.NEXT_PUBLIC_BACKEND_URL
  process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend.test'
  const requests = []
  let failed = true
  globalThis.fetch = async url => {
    requests.push(url)
    if (url.endsWith('professional-levels') && failed) throw new Error('offline')
    return { ok: true, json: async () => ({ success: true, data: url.endsWith('loyalty-tiers') ? { tiers: [] } : { levels: [{ name: 'Gold', color: '#FFD700' }] } }) }
  }
  const h = colorHook()
  try {
    assert.equal(h.render().levelColor('Gold'), '#6B7280')
    await settle(); assert.equal(h.render().levelColor('Gold'), '#6B7280')
    failed = false
    t.mock.timers.tick(5000); await settle()
    const colors = h.render()
    assert.equal(colors.levelColor(' Gold '), '#FFD700')
    assert.equal(colors.tierColor('Gold'), '#6B7280')
    assert.equal(requests.filter(url => url.endsWith('loyalty-tiers')).length, 1, 'successful empty result is complete')
    assert.equal(requests.filter(url => url.endsWith('professional-levels')).length, 2)
    t.mock.timers.tick(20000); await settle(); assert.equal(requests.length, 3)
  } finally { h.state.unmount(); globalThis.fetch = previousFetch; if (previousBackend === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL; else process.env.NEXT_PUBLIC_BACKEND_URL = previousBackend }
})
test('color retries stop when the last subscriber unmounts', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const previousFetch = globalThis.fetch, previousBackend = process.env.NEXT_PUBLIC_BACKEND_URL
  process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend.test'
  let requests = 0
  globalThis.fetch = async () => { requests++; return { ok: false } }
  const h = colorHook()
  try {
    h.render(); await settle(); h.state.unmount()
    t.mock.timers.tick(20000); await settle()
    assert.equal(requests, 2)
  } finally { globalThis.fetch = previousFetch; if (previousBackend === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL; else process.env.NEXT_PUBLIC_BACKEND_URL = previousBackend }
})
