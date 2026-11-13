import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)

const React = await import('react')
const { renderToString } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const { createRequire } = await import('node:module')
const require = createRequire(import.meta.url)
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime')
const { PathParamsContext } = require('next/dist/shared/lib/hooks-client-context.shared-runtime')
const { CatalogCountryProvider } = await import('@/components/catalog/CatalogCountryContext')
const { default: CategoryPage } = await import('@/app/(pages)/categories/[categorySlug]/page')
const { default: ServicesHubClient } = await import('@/app/(pages)/services/ServicesHubClient')

const catalog = JSON.parse(readFileSync(new URL('../messages/en/catalog.json', import.meta.url), 'utf8'))
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function render(element, slug) {
  return renderToString(
    React.createElement(NextIntlClientProvider, { locale: 'en', timeZone: 'UTC', messages: { catalog } },
      React.createElement(AppRouterContext.Provider, { value: router },
        React.createElement(PathParamsContext.Provider, { value: slug ? { categorySlug: slug } : {} }, element))))
}

const category = {
  name: 'Interior',
  slug: 'interior',
  services: [
    { name: 'Painting', slug: 'painting' },
    { name: 'Plastering', slug: 'plastering' },
  ],
}

test('category page: the server HTML lists the services (crawlable), not a skeleton', () => {
  const html = render(
    React.createElement(CatalogCountryProvider, { country: 'BE', initialCategory: category }, React.createElement(CategoryPage)),
    'interior',
  )
  assert.match(html, /href="\/services\/painting"/)
  assert.match(html, /href="\/services\/plastering"/)
  assert.match(html, /<h1[^>]*>/)
})

test('category page without server data (outage) still renders its loading state', () => {
  const html = render(
    React.createElement(CatalogCountryProvider, { country: 'BE', initialCategory: null }, React.createElement(CategoryPage)),
    'interior',
  )
  assert.doesNotMatch(html, /href="\/services\/painting"/)
})

test('services index: initial categories render server-side', () => {
  const html = render(React.createElement(ServicesHubClient, {
    initialCategories: [{ ...category, services: category.services.map((s) => ({ ...s, isActive: true, countries: ['BE'] })) }],
  }))
  assert.match(html, /href="\/services\/painting"/)
})

test('services index page is a server component that loads the live catalog; no fabricated professionals on service pages', () => {
  const page = read('app/(pages)/services/page.tsx')
  assert.doesNotMatch(page, /^['"]use client['"]/)
  assert.match(page, /getServiceCategories/)
  const servicePage = read('app/(pages)/services/[serviceId]/page.tsx')
  assert.doesNotMatch(servicePage, /professionalsForService/)
})
