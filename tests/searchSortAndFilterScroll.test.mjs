import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const PAGE = read('app/[ctx]/(pages)/search/page.tsx')
const FILTERS = read('components/search/SearchFilters.tsx')
const SORT = read('components/search/SearchSortSelect.tsx')

test('FT1-11: sorting left the filter sidebar', () => {
  assert.doesNotMatch(FILTERS, /id="sortBy"/)
  assert.doesNotMatch(FILTERS, /filters\.sortBy\)/)
})

test('FT1-11: sorting sits at the top right, on the row of the search tabs', () => {
  const tabsRow = PAGE.indexOf('sm:justify-between')
  const tabs = PAGE.indexOf('<Tabs value={searchType}')
  const sort = PAGE.indexOf('<SearchSortSelect')
  const results = PAGE.indexOf('{/* Main Content */}')
  assert.ok(tabsRow > 0 && tabsRow < tabs && tabs < sort && sort < results, 'tabs left, sort right, above the results')
  assert.match(PAGE, /onChange=\{\(value\) => handleFilterChange\('sortBy', value\)\}/)
  // Same options as before, availability only for projects.
  for (const option of ['relevant', 'price_low', 'price_high', 'newest', 'availability', 'popularity']) {
    assert.match(SORT, new RegExp(`value="${option}"`))
  }
  assert.match(SORT, /searchType === 'projects' && \(\s*<SelectItem value="availability">/)
})

test('FT1-11: the filter sidebar scrolls on its own on desktop', () => {
  const wrapper = PAGE.match(/data-testid="search-filters-scroll"\s*className="([^"]+)"/)
  assert.ok(wrapper, 'scroll wrapper present')
  for (const cls of ['lg:sticky', 'lg:top-24', 'lg:max-h-[calc(100vh-7rem)]', 'lg:overflow-y-auto', 'lg:overscroll-contain']) {
    assert.ok(wrapper[1].split(/\s+/).includes(cls), cls)
  }
})
