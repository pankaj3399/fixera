import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const { hooks, loadComponent } = await import('./reviewComponentHarness.mjs')
const localeUrls = await import('../lib/seo/localeUrls.ts')

// Announcement CTA clicks were not counted on /nl, /fr and /en/... pages: the
// prefixed-locale link handler stopped the click in the capture phase, so the
// link's own React onClick (the announcement onCta counter) never ran.
test('a prefixed-locale link click keeps the locale and still reaches the link handlers', () => {
  const previous = { window: globalThis.window, Element: globalThis.Element, HTMLAnchorElement: globalThis.HTMLAnchorElement }
  class FakeElement { closest() { return this } }
  class FakeAnchor extends FakeElement {
    constructor(href) { super(); this.href = href; this.target = '' }
    hasAttribute() { return false }
  }
  const listeners = []
  const assigned = []
  globalThis.Element = FakeElement
  globalThis.HTMLAnchorElement = FakeAnchor
  globalThis.window = {
    location: { pathname: '/nl', search: '', origin: 'https://fixera.test', assign: url => assigned.push(url) },
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
    removeEventListener() {},
  }
  const state = hooks()
  try {
    const Component = loadComponent('../components/locale/PrefixedLocaleLinks.tsx', {
      react: state.api,
      '@/lib/seo/localeUrls': localeUrls,
    })
    state.render(() => Component()); state.flush()
    const capture = listeners.find(l => l.type === 'click' && l.capture)
    assert.ok(capture, 'listens on window in the capture phase')

    // One DOM dispatch: window capture first, then (unless propagation was
    // stopped) React's delegated handler, which runs next/link's onClick.
    let ctaClicks = 0
    let clientNavigations = 0
    const event = {
      button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
      defaultPrevented: false, propagationStopped: false,
      target: new FakeAnchor('https://fixera.test/services/painting?promo=1'),
      preventDefault() { this.defaultPrevented = true },
      stopPropagation() { this.propagationStopped = true },
    }
    capture.fn(event)
    if (!event.propagationStopped) {
      ctaClicks += 1 // the Link's onClick prop (announcement onCta)
      if (!event.defaultPrevented) clientNavigations += 1 // next/link skips defaultPrevented clicks
    }

    assert.deepEqual(assigned, ['/nl/services/painting?promo=1'], 'full navigation keeps the /nl prefix')
    assert.equal(event.propagationStopped, false, 'the click must keep propagating')
    assert.equal(ctaClicks, 1, 'the announcement CTA handler records the click')
    assert.equal(clientNavigations, 0, 'no client-side navigation competes with the full navigation')
  } finally {
    state.unmount()
    Object.assign(globalThis, previous)
  }
})

test('next/link runs its onClick prop and then skips navigation for a defaultPrevented click', () => {
  // The prefixed-locale handler relies on this order instead of stopPropagation.
  const source = readFileSync(new URL('../node_modules/next/dist/client/app-dir/link.js', import.meta.url), 'utf8')
  const onClick = source.indexOf("typeof onClick === 'function'")
  const guard = source.indexOf('if (e.defaultPrevented)', onClick)
  const navigate = source.indexOf('linkClicked(e,', guard)
  assert.ok(onClick > 0 && guard > onClick && navigate > guard)
})
