import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
const { syncKeyedFlag, raiseKeyedFlag, isKeyedFlagOn } = await import('../lib/marketing/siteAnnouncements/revealState.ts')
const { createAnnouncementEventRecorder } = await import('../lib/marketing/siteAnnouncements/events.ts')

/**
 * Drives the same state transitions the hooks use, render by render, and
 * applies the Overlays impression rule (record while visible, keyed by the
 * page occurrence) through the real recorder.
 */
function overlayHarness(announcement) {
  const sent = []
  const record = createAnnouncementEventRecorder({ apiBase: '', send: (url, init) => sent.push(`${init.body.get('event')}@${url}`) })
  let state = { key: null, on: false }
  let pathname = '/'
  const keyFor = path => `${announcement._id}:${announcement.frequency === 'once_pageview' ? path : 'campaign'}`
  const render = () => {
    const key = keyFor(pathname)
    state = syncKeyedFlag(state, key) // render-phase adjustment
    const visible = isKeyedFlagOn(state, key)
    if (visible) record(announcement, 'impression', announcement.frequency === 'once_pageview' ? pathname : 'campaign')
    return visible
  }
  return {
    sent,
    navigate(path) { pathname = path; return render() },
    rerender: render,
    /** The delay timer / exit gesture scheduled for the key that was current at schedule time. */
    fire(forPath = pathname) { state = raiseKeyedFlag(state, keyFor(forPath)); return render() },
  }
}
const modal = { _id: 'm1', updatedAt: 'v1', frequency: 'once_pageview' }

test('F2: navigating before the delay elapses never records an impression for the new page', () => {
  const h = overlayHarness(modal)
  assert.equal(h.navigate('/'), false)
  assert.equal(h.fire('/'), true, 'revealed on / after its delay')
  // Old hook: `revealed` was still true in the first render after the path
  // change, so /a and /b were counted although the modal never showed there.
  assert.equal(h.navigate('/a'), false, 'hidden in the very render of the key change (no flash)')
  assert.equal(h.navigate('/b'), false)
  assert.deepEqual(h.sent, ['impression@/api/public/site-announcements/m1/event'])
})

test('F2: a late timer for the previous page is ignored; revisiting a page waits for its own delay', () => {
  const h = overlayHarness(modal)
  h.navigate('/')
  h.fire('/')
  h.navigate('/a')
  assert.equal(h.fire('/'), false, 'the old page timer does not reveal /a')
  assert.equal(h.navigate('/'), false, 'back on / is not instantly revealed')
  assert.equal(h.fire('/a'), false)
  assert.equal(h.fire('/'), true)
  assert.equal(h.rerender(), true)
  assert.equal(h.sent.length, 1, 'same occurrence (/) is deduplicated for this page load')
  h.navigate('/c')
  assert.equal(h.fire('/c'), true)
  assert.equal(h.sent.length, 2, 'a real reveal on a new page counts once')
})

test('F2: exit intent (and campaign frequency) needs its own trigger after a key change', () => {
  const exitOnce = overlayHarness({ _id: 'x1', updatedAt: 'v1', frequency: 'once_pageview' })
  exitOnce.navigate('/')
  exitOnce.fire('/')
  assert.equal(exitOnce.navigate('/pricing'), false, 'no carry-over of the exit trigger')
  assert.equal(exitOnce.rerender(), false)
  assert.equal(exitOnce.fire('/pricing'), true)
  assert.equal(exitOnce.sent.length, 2)

  const campaign = overlayHarness({ _id: 'x2', updatedAt: 'v1', frequency: 'once_session' })
  campaign.navigate('/')
  campaign.fire()
  assert.equal(campaign.navigate('/other'), true, 'campaign key is page-independent: stays revealed')
  assert.equal(campaign.sent.length, 1, 'and is counted once per page load')
})

test('F2: unchanged keys keep state identity (no render-phase update loop)', () => {
  const s = { key: 'k', on: true }
  assert.equal(syncKeyedFlag(s, 'k'), s)
  assert.equal(raiseKeyedFlag(s, 'k'), s)
  assert.deepEqual(syncKeyedFlag(s, null), { key: null, on: false })
  assert.equal(isKeyedFlagOn(raiseKeyedFlag({ key: null, on: false }, null), null), false)
})

test('hooks and overlays use the key-scoped state', () => {
  const read = p => readFileSync(new URL(`../components/marketing/site-announcements/${p}`, import.meta.url), 'utf8')
  for (const file of ['useDelayedReveal.ts', 'useExitIntent.ts']) {
    const src = read(file)
    assert.match(src, /const current = syncKeyedFlag\(state, key\);\s*\/\/[^\n]*\n\s*if \(current !== state\) setState\(current\);/, file)
    assert.match(src, /setState\(\(prev\) => raiseKeyedFlag\(prev, key\)\)/, file)
    assert.match(src, /return isKeyedFlagOn\(current, key\);/, file)
  }
  assert.match(read('Overlays.tsx'), /exitIntent \? `\$\{exitIntent\._id\}:\$\{exitOccurrence\}` : null/)
})
