import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { transformSync } from '@swc/core'
const require = createRequire(import.meta.url)
const React = require('react')
const settle = () => new Promise(resolve => setImmediate(resolve))
function hooks() {
  const slots = []
  let index = 0
  let pending = new Set()
  const changed = (prev, deps) => !prev || !deps || deps.length !== prev.length || deps.some((v, j) => !Object.is(v, prev[j]))
  const api = {
    ...React,
    useRef(value) { const i = index++; return slots[i] ??= { current: value } },
    useState(value) {
      const i = index++
      if (!(i in slots)) {
        const cell = { value: typeof value === 'function' ? value() : value }
        cell.set = v => { cell.value = typeof v === 'function' ? v(cell.value) : v }
        slots[i] = cell
      }
      return [slots[i].value, slots[i].set]
    },
    useMemo(fn, deps) {
      const i = index++
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: fn() }
      return slots[i].value
    },
    useCallback(fn, deps) {
      const i = index++
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: fn }
      return slots[i].value
    },
    useEffect(fn, deps) {
      const i = index++
      const slot = slots[i] ??= { deps: undefined, cleanup: null, ran: false }
      if (!slot.ran || changed(slot.deps, deps)) {
        slot.deps = deps
        slot.ran = true
        pending.add(slot)
        slot.fn = fn
      }
    },
  }
  api.useLayoutEffect = api.useEffect
  return {
    api,
    values() { return slots.filter(s => s && "value" in s).map(s => s.value) },
    render(fn) { index = 0; return fn() },
    abandonRender(fn) {
      // State/memo/effect work is discarded; ref objects retain render writes,
      // matching the leak this regression must catch.
      const previous = slots.slice()
      const snapshots = previous.map(slot => slot && !('current' in slot) ? { ...slot } : null)
      const beforePending = new Set(pending)
      try { index = 0; return fn() } finally {
        previous.forEach((slot, i) => { if (snapshots[i]) Object.assign(slot, snapshots[i]) })
        slots.splice(0, slots.length, ...previous)
        pending = beforePending
      }
    },
    flush() {
      const run = [...pending]
      pending = new Set()
      for (const slot of run) {
        if (typeof slot.cleanup === 'function') slot.cleanup()
        const cleanup = slot.fn()
        slot.cleanup = typeof cleanup === 'function' ? cleanup : null
      }
    },
    unmount() { for (const slot of slots) if (slot && typeof slot.cleanup === 'function') slot.cleanup() },
    reset() { slots.length = 0; pending = new Set() },
  }
}

function loadComponent(file, mocks, exportName = 'default') {
  const { code } = transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  })
  const exports = {}
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name]
    if (name.startsWith('@/')) throw new Error(`unmocked import ${name}`)
    return require(name)
  }, exports)
  return exports[exportName]
}

/** Any named export is an inert component (UI primitives, icons). */
const stubModule = () => new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : function Stub() { return null }) })

function findAll(tree, predicate, found = []) {
  if (!tree || typeof tree !== 'object') return found
  if (Array.isArray(tree)) { tree.forEach(node => findAll(node, predicate, found)); return found }
  if (predicate(tree)) found.push(tree)
  for (const child of React.Children.toArray(tree.props?.children)) findAll(child, predicate, found)
  return found
}
const textOf = node => (typeof node === 'string' || typeof node === 'number')
  ? String(node)
  : node && typeof node === 'object' ? React.Children.toArray(node.props?.children).map(textOf).join('') : ''


const translator = key => key
translator.rich = key => key
const ui = stubModule()
const common = {
  'next-intl': { useTranslations: () => translator },
  'next/navigation': { useRouter: () => ({ push() {} }), usePathname: () => '/' },
  sonner: { toast: { error() {}, success() {} } },
  'lucide-react': ui,
  '@/lib/i18n/useErrorMessage': { useErrorMessage: () => translator },
  ...Object.fromEntries(['card', 'button', 'input', 'label', 'dialog', 'badge', 'table', 'switch', 'select', 'skeleton'].map(name => [`@/components/ui/${name}`, ui])),
}


export { hooks, loadComponent, findAll, textOf, common, ui, settle }
