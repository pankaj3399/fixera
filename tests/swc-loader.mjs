import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transform } from '@swc/core'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

const candidates = (base) => [
  base,
  `${base}.tsx`,
  `${base}.ts`,
  path.join(base, 'index.tsx'),
  path.join(base, 'index.ts'),
]

// Only files resolve: `@/lib/cms` must pick lib/cms.ts over a same-named directory, as Next does.
const isFile = (candidate) => existsSync(candidate) && statSync(candidate).isFile()
const resolveFile = (base) => candidates(base).find(isFile)

export async function resolve(specifier, context, nextResolve) {
  // Next package subpaths are not exported with Node's extensionless ESM
  // resolution, but the actual files exist as .js. Keep tests able to import
  // components that use usePathname (or render a next/link) in node tests, and the server
  // layouts whose metadata helpers import next/headers.
  if (specifier.startsWith('next/') && !specifier.endsWith('.js')) {
    try {
      return await nextResolve(`${specifier}.js`, context)
    } catch {
      // Fall through to the original error.
    }
  }
  if (specifier.startsWith('@/')) {
    const resolved = resolveFile(path.join(root, specifier.slice(2)))
    if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true }
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const resolved = resolveFile(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier))
    if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  // Stylesheets imported by a component are not evaluated by these tests.
  if (url.startsWith('file:') && url.endsWith('.css')) {
    return { format: 'module', source: 'export default {}', shortCircuit: true }
  }
  // JSON modules (message catalogues) load as default exports, as bundlers provide them.
  if (url.startsWith('file:') && url.endsWith('.json')) {
    const source = await readFile(fileURLToPath(url), 'utf8')
    return { format: 'module', source: `export default ${source}`, shortCircuit: true }
  }
  if (url.startsWith('file:') && (url.endsWith('.tsx') || url.endsWith('.ts'))) {
    const filename = fileURLToPath(url)
    const source = await readFile(filename, 'utf8')
    const result = await transform(source, {
      filename,
      jsc: {
        parser: { syntax: 'typescript', tsx: filename.endsWith('.tsx'), decorators: true },
        transform: { react: { runtime: 'automatic' } },
        target: 'es2022',
      },
      module: { type: 'es6' },
      sourceMaps: false,
    })
    return { format: 'module', source: result.code, shortCircuit: true }
  }
  return nextLoad(url, context)
}
