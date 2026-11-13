import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

register('./swc-loader.mjs', import.meta.url)

const {
  ROOT, ROOT_ENTRY_FILES, closure, findScopedLayouts, listSourceFiles, analyzeFile,
} = await import('./helpers/i18nClientClosure.mjs')
const manifest = await import('../i18n/clientNamespaces.ts')
const { NAMESPACES } = await import('../i18n/namespaces.ts')

const { ROOT_CLIENT_NAMESPACES, CLIENT_MESSAGE_SCOPES, ALL_NAMESPACES, scopeNamespaces, pickMessages } = manifest
const APP = path.join(ROOT, 'app')
const GLOBAL_ERROR = path.join(APP, 'global-error.tsx')

const provided = (scopes) => {
  const set = new Set(ROOT_CLIENT_NAMESPACES)
  for (const scope of scopes) {
    const configured = CLIENT_MESSAGE_SCOPES[scope]
    for (const ns of configured === ALL_NAMESPACES ? NAMESPACES : configured) set.add(ns)
  }
  return set
}

const isWithin = (file, dir) => file === dir || file.startsWith(dir + path.sep)

test('the manifest only names real namespaces', () => {
  for (const ns of ROOT_CLIENT_NAMESPACES) assert.ok(NAMESPACES.includes(ns), `root: unknown namespace ${ns}`)
  for (const [scope, configured] of Object.entries(CLIENT_MESSAGE_SCOPES)) {
    if (configured === ALL_NAMESPACES) continue
    for (const ns of configured) assert.ok(NAMESPACES.includes(ns), `${scope}: unknown namespace ${ns}`)
  }
})

test('the root layout serializes only the root namespaces to the client', () => {
  const source = readFileSync(path.join(APP, 'layout.tsx'), 'utf8')
  const providers = [...source.matchAll(/<NextIntlClientProvider\b[^>]*>/g)].map((m) => m[0])
  assert.equal(providers.length, 1)
  assert.match(providers[0], /messages=\{pickMessages\(messages, ROOT_CLIENT_NAMESPACES\)\}/)
})

test('every scoped layout names one known scope and wraps everything it renders', () => {
  const layouts = findScopedLayouts()
  assert.ok(layouts.length > 0)
  for (const layout of layouts) {
    assert.equal(layout.mentions, 1, `${layout.rel}: exactly one <ScopedIntlProvider>`)
    assert.equal(layout.scopes.length, 1, `${layout.rel}: scope must be a string literal`)
    assert.ok(layout.scopes[0] in CLIENT_MESSAGE_SCOPES, `${layout.rel}: unknown scope ${layout.scopes[0]}`)

    // Whatever the layout renders outside the provider would only see the root set.
    const text = readFileSync(layout.file, 'utf8')
    const source = ts.createSourceFile(layout.file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const fn = source.statements.find((s) => ts.isFunctionDeclaration(s) &&
      s.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword))
    assert.ok(fn?.body, `${layout.rel}: default export must be a function declaration`)
    const returns = []
    const collect = (node) => {
      if (ts.isFunctionLike(node) && node !== fn) return
      if (ts.isReturnStatement(node)) returns.push(node)
      ts.forEachChild(node, collect)
    }
    collect(fn.body)
    assert.ok(returns.length > 0, `${layout.rel}: no return`)
    for (const ret of returns) {
      let expr = ret.expression
      while (expr && ts.isParenthesizedExpression(expr)) expr = expr.expression
      const tag = expr && ts.isJsxElement(expr) ? expr.openingElement.tagName.getText(source)
        : expr && ts.isJsxSelfClosingElement(expr) ? expr.tagName.getText(source) : null
      assert.equal(tag, 'ScopedIntlProvider', `${layout.rel}: every return must be <ScopedIntlProvider> at the top`)
    }
  }
})

// The actual guarantee: for every file under app/ (pages, layouts, error and
// loading files, co-located components), everything it can import at runtime
// only uses namespaces its nearest providers supply.
test('every route subtree gets every namespace its components use', () => {
  const layouts = findScopedLayouts()
  const groups = new Map()
  for (const file of listSourceFiles(APP)) {
    if (file === GLOBAL_ERROR) continue
    const scopes = layouts.filter((l) => isWithin(file, l.dir)).map((l) => l.scopes[0]).sort()
    const key = scopes.join('+') || '(root)'
    if (!groups.has(key)) groups.set(key, { scopes, files: [] })
    groups.get(key).files.push(file)
  }
  const rootGroup = groups.get('(root)')
  for (const entry of ROOT_ENTRY_FILES) assert.ok(rootGroup.files.includes(entry), `${entry} is in the root group`)

  const failures = []
  for (const [key, { scopes, files }] of groups) {
    const result = closure(files)
    failures.push(...result.problems.map((p) => `[${key}] ${p}`))
    const supplied = provided(scopes)
    for (const [ns, by] of result.namespaces) {
      if (!supplied.has(ns)) failures.push(`[${key}] namespace "${ns}" (used by ${by}) is not supplied to the client`)
    }
  }
  assert.deepEqual([...new Set(failures)], [])
  // Sanity: the analysis really sees the public pages' client components.
  assert.ok(closure(groups.get('home').files).namespaces.has('home'))
  assert.ok(closure(groups.get('projectDetail').files).namespaces.has('projectBooking'))
})

test('the root set covers the root layout, error and 404 pages', () => {
  const result = closure(ROOT_ENTRY_FILES)
  assert.deepEqual(result.problems, [])
  const missing = [...result.namespaces.keys()].filter((ns) => !ROOT_CLIENT_NAMESPACES.includes(ns))
  assert.deepEqual(missing, [])
})

test('global-error renders without any provider, so it must not use next-intl hooks', () => {
  const result = closure([GLOBAL_ERROR])
  assert.deepEqual(result.problems, [])
  assert.deepEqual([...result.namespaces.keys()], [])
})

test('the analyzer resolves dynamic imports and namespace prefixes and rejects what it cannot resolve', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'i18n-closure-'))
  try {
    const write = (name, body) => writeFileSync(path.join(dir, name), body)
    write('entry.tsx', `import dynamic from 'next/dynamic'
import type { T } from './typeOnly'
export { helper } from './reexport'
const Lazy = dynamic(() => import('./lazy'))
export default function Entry() { return <Lazy /> }`)
    write('lazy.tsx', `import { useTranslations } from 'next-intl'
export default function Lazy() { const t = useTranslations('alpha.sub'); return <p>{t('x')}</p> }`)
    write('reexport.ts', `import { useTranslations } from 'next-intl'
export const helper = () => useTranslations("beta")`)
    write('typeOnly.ts', `import { useTranslations } from 'next-intl'
export type T = string
export const unused = () => useTranslations('gamma')`)
    write('bad.tsx', `import { useTranslations, useMessages } from 'next-intl'
import { toast } from 'sonner'
import { useTranslations as useT } from 'next-intl'
const ns = 'delta'
export function A() { useTranslations(ns); useTranslations(); useMessages(); useT('eps') }
export function B() { const hook = useTranslations; toast(<A />); return import(ns) }`)
    write('missing.ts', `import './nope'`)

    const good = closure([path.join(dir, 'entry.tsx')])
    assert.deepEqual(good.problems, [])
    assert.deepEqual([...good.namespaces.keys()].sort(), ['alpha', 'beta'])

    const bad = analyzeFile(path.join(dir, 'bad.tsx'))
    const expected = [
      /non-literal namespace/, /without a namespace/, /uses useMessages/, /aliases useTranslations/,
      /references useTranslations indirectly/, /passes JSX to toast/, /non-literal dynamic import/,
    ]
    for (const pattern of expected) assert.ok(bad.problems.some((p) => pattern.test(p)), `expected a problem matching ${pattern}: ${bad.problems.join('\n')}`)
    assert.match(closure([path.join(dir, 'missing.ts')]).problems.join('\n'), /does not resolve/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('scopes add only non-root namespaces and pickMessages copies just those', () => {
  const tree = Object.fromEntries(NAMESPACES.map((ns) => [ns, { k: ns }]))
  assert.deepEqual(scopeNamespaces('home').sort(), ['home', 'search'])
  assert.deepEqual(new Set(scopeNamespaces('authenticated')), new Set(NAMESPACES.filter((ns) => !ROOT_CLIENT_NAMESPACES.includes(ns))))
  for (const scope of Object.keys(CLIENT_MESSAGE_SCOPES)) {
    for (const ns of scopeNamespaces(scope)) assert.ok(!ROOT_CLIENT_NAMESPACES.includes(ns))
  }
  assert.deepEqual(pickMessages(tree, ['home', 'nope']), { home: { k: 'home' } })
})
