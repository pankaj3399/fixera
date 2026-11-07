import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)

const {
  cancellationRequestsSearch,
  cancellationStatusFilterStateFromQuery,
  selectCancellationStatusFilter,
  syncCancellationStatusFilterState,
} = await import('@/lib/admin/cancellationRequestFilters')

// Mirrors the page: it stays mounted across client navigations, keeps
// `{ filterState, page }` in state and, on every render, syncs from the
// current `searchParams.get('status')` (resetting the page when the filter
// changes). A dropdown selection updates the filter and writes the URL; the
// written query arrives in a later render.
function mountQueue(search) {
  const statusOf = (s) => new URLSearchParams(s).get('status')
  const view = { search, filterState: cancellationStatusFilterStateFromQuery(statusOf(search)), page: 1 }
  const render = () => {
    const synced = syncCancellationStatusFilterState(view.filterState, statusOf(view.search))
    if (synced !== view.filterState) {
      if (synced.filter !== view.filterState.filter) view.page = 1
      view.filterState = synced
    }
    return view.filterState.filter
  }
  render()
  return {
    get filter() { return render() },
    get page() { return view.page },
    get search() { return view.search },
    navigate(nextSearch) { view.search = nextSearch; return render() },
    goToPage(page) { view.page = page },
    select(filter) {
      view.filterState = selectCancellationStatusFilter(view.filterState, filter)
      view.page = 1
      const before = render() // React re-renders before the URL update lands
      view.search = cancellationRequestsSearch(view.search, filter)
      return [before, render()]
    },
  }
}

test('plain menu link after the dispute link resets the escalated view to pending (query removal)', () => {
  const queue = mountQueue('?status=escalated')
  assert.equal(queue.filter, 'escalated')
  queue.goToPage(2)
  assert.equal(queue.navigate(''), 'pending')
  assert.equal(queue.page, 1)
})

test('client navigation that adds or changes ?status= updates the view (query addition)', () => {
  const queue = mountQueue('')
  assert.equal(queue.filter, 'pending')
  assert.equal(queue.navigate('?status=escalated'), 'escalated')
  assert.equal(queue.navigate('?status=approved'), 'approved')
  assert.equal(queue.navigate('?status=all'), 'all')
  assert.equal(queue.navigate('?status=bogus'), 'pending')
  assert.equal(queue.navigate('?status=escalated'), 'escalated')
  assert.equal(queue.navigate(''), 'pending')
})

test('a dropdown selection is kept, written to the URL, and still reset by the plain menu link', () => {
  const queue = mountQueue('')
  // Not undone by the render before the URL catches up, nor by the URL echo.
  assert.deepEqual(queue.select('escalated'), ['escalated', 'escalated'])
  assert.equal(queue.search, '?status=escalated')
  queue.goToPage(3)
  assert.equal(queue.filter, 'escalated')
  assert.equal(queue.page, 3, 'unchanged query keeps the page')
  assert.deepEqual(queue.select('denied'), ['denied', 'denied'])
  assert.equal(queue.search, '?status=denied')
  assert.equal(queue.navigate(''), 'pending')

  // Choosing pending on the dispute link's view clears the query.
  const fromDispute = mountQueue('?status=escalated')
  assert.deepEqual(fromDispute.select('pending'), ['pending', 'pending'])
  assert.equal(fromDispute.search, '')
  assert.equal(fromDispute.navigate('?status=escalated'), 'escalated')
})

test('URL written for a selection keeps other query values', () => {
  assert.equal(cancellationRequestsSearch('', 'pending'), '')
  assert.equal(cancellationRequestsSearch('', 'all'), '?status=all')
  assert.equal(cancellationRequestsSearch('?status=escalated', 'pending'), '')
  assert.equal(cancellationRequestsSearch('?status=bogus', 'approved'), '?status=approved')
  assert.equal(cancellationRequestsSearch('?ref=x&status=escalated', 'pending'), '?ref=x')
  assert.equal(cancellationRequestsSearch('?ref=x', 'denied'), '?ref=x&status=denied')
})

test('the page derives its filter from the live query, not only on mount', () => {
  const page = readFileSync(new URL('../app/(pages)/admin/cancellation-requests/page.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /useState<StatusFilter>\(\(\) => parseCancellationStatusFilter/)
  assert.match(page, /const statusQuery = searchParams\.get\('status'\)/)
  assert.match(page, /const syncedFilterState = syncCancellationStatusFilterState\(filterState, statusQuery\)\n\s+if \(syncedFilterState !== filterState\) \{\n\s+[^\n]*\n\s+setFilterState\(syncedFilterState\)\n\s+if \(syncedFilterState\.filter !== filterState\.filter\) setPage\(1\)/)
  assert.match(page, /const statusFilter = syncedFilterState\.filter/)
  assert.match(page, /setFilterState\(\(state\) => selectCancellationStatusFilter\(state, value\)\)/)
  assert.match(page, /window\.history\.replaceState\(null, '', `\$\{pathname\}\$\{cancellationRequestsSearch\(search, value\)\}\$\{hash\}`\)/)
  assert.match(page, /<Select value=\{statusFilter\} onValueChange=\{selectStatusFilter\}>/)
})
