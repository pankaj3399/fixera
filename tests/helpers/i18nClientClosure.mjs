/**
 * Static analysis of which next-intl message namespaces each route subtree
 * needs on the client.
 *
 * The root layout sends only ROOT_CLIENT_NAMESPACES to the browser, and every
 * route subtree wraps itself in <ScopedIntlProvider scope="..."> to add the
 * namespaces of its own client components (i18n/clientNamespaces.ts). This
 * module walks the runtime import graph (static imports, re-exports, dynamic
 * import() / next/dynamic, require) from a set of entry files and collects
 * every namespace passed to useTranslations(). It is deliberately
 * conservative: files are counted whether they end up rendered on the server
 * or the client, and type-only imports are the only edges skipped.
 *
 * Anything it cannot resolve statically (a non-literal or missing namespace,
 * useMessages/createTranslator/useExtracted, an aliased useTranslations
 * import, a local module it cannot find) is reported as a problem so the test
 * fails instead of silently under-supplying messages.
 *
 * Run directly to print the computed sets:
 *   node tests/helpers/i18nClientClosure.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))

const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs']
const FORBIDDEN_INTL_APIS = new Set(['useMessages', 'createTranslator', 'useExtracted', 'IntlProvider'])
// The scoped provider itself merges whole message trees; it renders no copy.
const PROVIDER_IMPLEMENTATION = 'components/i18n/ScopedMessagesProvider.tsx'

const isFile = (candidate) => existsSync(candidate) && statSync(candidate).isFile()

function resolveLocal(base) {
  if (isFile(base) && SOURCE_EXTENSIONS.includes(path.extname(base))) return base
  for (const ext of SOURCE_EXTENSIONS) if (isFile(base + ext)) return base + ext
  for (const ext of SOURCE_EXTENSIONS) {
    const index = path.join(base, `index${ext}`)
    if (isFile(index)) return index
  }
  return null
}

/** Resolve a specifier to a project source file, `null` for packages/assets. */
export function resolveSpecifier(specifier, fromFile) {
  let base
  if (specifier.startsWith('@/')) base = path.join(ROOT, specifier.slice(2))
  else if (specifier.startsWith('./') || specifier.startsWith('../')) base = path.resolve(path.dirname(fromFile), specifier)
  else return { external: true }
  // Assets (json, css, images) carry no translation hooks.
  const ext = path.extname(base)
  if (ext && !SOURCE_EXTENSIONS.includes(ext) && isFile(base)) return { asset: true }
  const resolved = resolveLocal(base)
  return resolved ? { file: resolved } : { missing: true }
}

const analysisCache = new Map()

const isToastCall = (callee) =>
  (ts.isIdentifier(callee) && callee.text === 'toast') ||
  (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'toast')

function containsJsx(node) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true
  return ts.forEachChild(node, containsJsx) ?? false
}

/**
 * Parse one file: its runtime imports, the namespaces it passes to
 * useTranslations, and anything that cannot be analysed statically.
 */
export function analyzeFile(file) {
  if (analysisCache.has(file)) return analysisCache.get(file)
  const text = readFileSync(file, 'utf8')
  const kind = file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const rel = path.relative(ROOT, file)
  const imports = []
  const namespaces = new Set()
  const problems = []
  const translationHooks = new Set()

  const where = (node) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
    return `${rel}:${line + 1}`
  }

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause
      const specifier = statement.moduleSpecifier.text
      if (specifier === 'next-intl' || specifier === 'use-intl' || specifier.startsWith('use-intl/')) {
        const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : []
        for (const element of named) {
          const imported = (element.propertyName ?? element.name).text
          if (imported === 'useTranslations' && !clause.isTypeOnly && !element.isTypeOnly) {
            if (element.propertyName && element.propertyName.text !== element.name.text) {
              problems.push(`${where(element)} aliases useTranslations as ${element.name.text}`)
            }
            translationHooks.add(element.name.text)
          }
          if (FORBIDDEN_INTL_APIS.has(imported) && !clause.isTypeOnly && !element.isTypeOnly && rel !== PROVIDER_IMPLEMENTATION) {
            problems.push(`${where(element)} uses ${imported}; the closure test cannot tell which namespaces it needs`)
          }
        }
        if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          problems.push(`${where(statement)} uses a namespace import of ${specifier}`)
        }
      }
      if (clause?.isTypeOnly) continue
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && !clause.name &&
        clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((e) => e.isTypeOnly)) continue
      imports.push(specifier)
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (!statement.isTypeOnly) imports.push(statement.moduleSpecifier.text)
    }
  }

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require')) {
        const [arg] = node.arguments
        if (arg && ts.isStringLiteralLike(arg)) imports.push(arg.text)
        else problems.push(`${where(node)} has a non-literal dynamic import`)
      } else if (isToastCall(callee) && node.arguments.some(containsJsx)) {
        // <Toaster> is mounted by the root layout, so JSX handed to toast()
        // renders under the root provider, not the calling route's.
        problems.push(`${where(node)} passes JSX to toast(); it would render with the root message set only`)
      } else if (ts.isIdentifier(callee) && translationHooks.has(callee.text)) {
        const [arg] = node.arguments
        if (!arg) problems.push(`${where(node)} calls useTranslations() without a namespace`)
        else if (ts.isStringLiteralLike(arg)) namespaces.add(arg.text.split('.')[0])
        else problems.push(`${where(node)} calls useTranslations with a non-literal namespace`)
      }
    } else if (ts.isIdentifier(node) && translationHooks.has(node.text)) {
      // The hook must only ever be called directly, never passed around.
      const parent = node.parent
      const isCallee = ts.isCallExpression(parent) && parent.expression === node
      const isImport = ts.isImportSpecifier(parent)
      const isTypeUse = ts.isTypeQueryNode(parent) || ts.isTypeReferenceNode(parent) || ts.isQualifiedName(parent)
      if (!isCallee && !isImport && !isTypeUse) problems.push(`${where(node)} references useTranslations indirectly`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)

  const result = { file, rel, imports, namespaces, problems }
  analysisCache.set(file, result)
  return result
}

/** Walk the runtime import graph from `entries`, collecting namespaces. */
export function closure(entries) {
  const seen = new Set()
  const stack = [...entries]
  const namespaces = new Map() // namespace -> first file that needs it
  const problems = []
  while (stack.length) {
    const file = stack.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const info = analyzeFile(file)
    problems.push(...info.problems)
    for (const ns of info.namespaces) if (!namespaces.has(ns)) namespaces.set(ns, info.rel)
    for (const specifier of info.imports) {
      const resolved = resolveSpecifier(specifier, file)
      if (resolved.file) stack.push(resolved.file)
      else if (resolved.missing) problems.push(`${info.rel} imports ${specifier}, which does not resolve to a source file`)
    }
  }
  return { files: seen, namespaces, problems }
}

export function listSourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listSourceFiles(full))
    else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name)) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

const APP = path.join(ROOT, 'app')

/** Files rendered by the root layout itself, outside any route subtree. */
export const ROOT_ENTRY_FILES = ['layout.tsx', 'error.tsx', 'not-found.tsx'].map((f) => path.join(APP, f))

/**
 * Every layout that wraps its subtree in <ScopedIntlProvider scope="...">,
 * with the scope it names. A scoped layout's subtree is every source file in
 * its directory (co-located components included), which over-approximates
 * what the route actually renders.
 */
export function findScopedLayouts() {
  const layouts = []
  for (const file of listSourceFiles(APP)) {
    if (!/^layout\.(t|j)sx?$/.test(path.basename(file))) continue
    if (path.dirname(file) === APP) continue
    const text = readFileSync(file, 'utf8')
    const scopes = [...text.matchAll(/<ScopedIntlProvider\s+scope=["']([^"']+)["']/g)].map((m) => m[1])
    const mentions = (text.match(/<ScopedIntlProvider\b/g) ?? []).length
    if (mentions === 0) continue
    layouts.push({ file, rel: path.relative(ROOT, file), dir: path.dirname(file), scopes, mentions })
  }
  return layouts
}

export function routeFiles() {
  return listSourceFiles(APP).filter((file) => /^(page|layout|loading|error|not-found|template|default)\.(t|j)sx?$/.test(path.basename(file)))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sizeOf = (ns) => readFileSync(path.join(ROOT, 'messages/en', `${ns}.json`)).length
  const root = closure(ROOT_ENTRY_FILES)
  const rootSet = [...root.namespaces.keys()].sort()
  console.log('ROOT', rootSet.join(', '), `(${rootSet.reduce((s, n) => s + sizeOf(n), 0)} B en)`)
  for (const [ns, by] of root.namespaces) console.log(`   ${ns} <- ${by}`)
  const dirs = process.argv.slice(2)
  for (const dir of dirs) {
    const abs = path.resolve(ROOT, dir)
    const c = closure(listSourceFiles(abs))
    const extra = [...c.namespaces.keys()].filter((n) => !rootSet.includes(n)).sort()
    console.log(dir, '=>', extra.join(', '), `(+${extra.reduce((s, n) => s + sizeOf(n), 0)} B en)`)
    if (process.env.VERBOSE) for (const n of extra) console.log(`   ${n} <- ${c.namespaces.get(n)}`)
    if (c.problems.length) console.log('  PROBLEMS', c.problems)
  }
  if (root.problems.length) console.log('ROOT PROBLEMS', root.problems)
}
