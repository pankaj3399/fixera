import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { setImmediate } from 'node:timers/promises'
import { transformSync } from '@swc/core'

const require = createRequire(import.meta.url)

/** Run a component's hooks and event handlers without mounting its UI dependencies or a DOM. */
export function componentHarness(file, imports = {}) {
  const slots = []
  let cursor = 0, dirty = true, tree, props = {}, effects = []
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))
  const hooks = {
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], (value) => {
        const next = typeof value === 'function' ? value(slots[i]) : value
        if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true }
      }]
    },
    useMemo(fn, deps) {
      const i = cursor++
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: fn() }
      return slots[i].value
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps) },
    useRef(value) { return hooks.useMemo(() => ({ current: value }), []) },
    useId() { return hooks.useMemo(() => `help-${cursor}`, []) },
    useEffect(fn, deps) {
      const i = cursor++
      if (!slots[i] || changed(slots[i].deps, deps)) {
        effects.push(() => {
          slots[i]?.cleanup?.()
          slots[i] = { deps, cleanup: fn() }
        })
      }
    },
  }
  const source = transformSync(readFileSync(file, 'utf8'), {
    filename: String(file), jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  }).code
  const compiled = { exports: {} }
  const load = (name) => {
    if (name === 'react') return hooks
    if (name === 'react/jsx-runtime') return require(name)
    if (name in imports) return imports[name]
    // Keep UI wrappers as element types; assertions inspect the component's own rendered props.
    if (name.startsWith('@/components/ui/') || name === 'lucide-react') {
      return new Proxy({ __esModule: true }, { get: (target, key) => target[key] ?? key })
    }
    if (name === 'next/link') return { __esModule: true, default: 'a' }
    throw new Error(`Missing component test import: ${name}`)
  }
  new Function('require', 'module', 'exports', source)(load, compiled, compiled.exports)
  let activeComponent = compiled.exports.default
  const api = {
    useComponent(component) { activeComponent = component; dirty = true },
    exports: compiled.exports,
    render(nextProps = props) {
      props = nextProps; cursor = 0; dirty = false; effects = []
      tree = activeComponent(props)
      for (const effect of effects) effect()
      return tree
    },
    async settle() {
      for (let i = 0; i < 20; i++) {
        if (dirty) api.render()
        await setImmediate()
        if (!dirty) return
      }
      throw new Error('Component did not settle')
    },
    findAll(predicate) {
      const found = []
      const visit = (node) => {
        if (Array.isArray(node)) return node.forEach(visit)
        if (!node || typeof node !== 'object' || !node.props) return
        if (predicate(node)) found.push(node)
        visit(node.props.children)
      }
      visit(tree)
      return found
    },
    unmount() { for (const slot of slots) slot?.cleanup?.() },
  }
  return api
}

export function elementText(node) {
  if (Array.isArray(node)) return node.map(elementText).join('')
  if (node == null || typeof node === 'boolean') return ''
  return typeof node === 'object' ? elementText(node.props?.children) : String(node)
}
