import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const { CurrencyProvider } = await import('@/contexts/CurrencyContext')
const { AnonymizeDialogBody } = await import('@/components/admin/AnonymizeAccountDialog')
const { AnonymizeCleanupRecovery } = await import('@/components/admin/AnonymizeCleanupRecovery')
const { PartyCard } = await import('@/components/booking/details/DetailPrimitives')
const { QuotationPanel } = await import('@/components/booking/details/QuotationPanel')
const ChatList = (await import('@/components/chat/ChatList')).default
const {
  ANONYMIZE_RECOVERY_LIST_LIMIT,
  anonymizeCanAttempt,
  anonymizeConfirmationError,
  anonymizeRecoveryFromError,
  anonymizeRefreshFailureMessage,
  anonymizeResultAnnouncement,
  executeAnonymizeAccount,
  isAmbiguousAnonymizeError,
  isAnonymizationComplete,
  isFullyAnonymizedResult,
  mergeAnonymizeRecoveryRecord,
  reconcileAnonymizePreview,
  requestAnonymizePreview,
  requestAnonymizeRecoveryList,
  shouldCheckAnonymizeStatus,
  upsertAnonymizeRecoveryRecord,
} = await import('../lib/adminAnonymize.ts')
const {
  anonymizeRecoveryStorageKey,
  purgeAllAnonymizeRecoveryStorage,
  purgeLegacyAnonymizeRecoveryStorage,
  readAnonymizeRecoveryRecords,
  writeAnonymizeRecoveryRecords,
} = await import('../lib/anonymizeRecoveryStorage.ts')
const { canManageUserDeletion } = await import('../lib/adminRbac.ts')
const {
  conversationCounterparty,
  isAnonymizedIdentity,
  isConversationCounterpartyAnonymized,
} = await import('../lib/anonymizedUsers.ts')

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/adminAnonymize/${name}.json`, import.meta.url), 'utf8'))
const wireFixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/adminAnonymize/wire/${name}.json`, import.meta.url), 'utf8'))

const messagesByLocale = {
  en: {
    bookings: JSON.parse(readFileSync(new URL('../messages/en/bookings.json', import.meta.url), 'utf8')),
    chat: JSON.parse(readFileSync(new URL('../messages/en/chat.json', import.meta.url), 'utf8')),
  },
  nl: {
    bookings: JSON.parse(readFileSync(new URL('../messages/nl/bookings.json', import.meta.url), 'utf8')),
    chat: JSON.parse(readFileSync(new URL('../messages/nl/chat.json', import.meta.url), 'utf8')),
  },
  fr: {
    bookings: JSON.parse(readFileSync(new URL('../messages/fr/bookings.json', import.meta.url), 'utf8')),
    chat: JSON.parse(readFileSync(new URL('../messages/fr/chat.json', import.meta.url), 'utf8')),
  },
}

const target = {
  id: '665f1f77bcf86cd799439011',
  name: 'Ada Customer',
  email: 'ada@example.com',
  role: 'customer',
}

function renderWithMessages(element, locale = 'en', messages = { bookings: messagesByLocale[locale].bookings }) {
  return renderToStaticMarkup(
    React.createElement(
      NextIntlClientProvider,
      { locale, messages, timeZone: 'UTC' },
      React.createElement(
        CurrencyProvider,
        { initialCurrency: 'EUR', initialRates: { EUR: 1 }, refreshRates: false },
        element
      )
    )
  )
}

function dialogHtml(overrides = {}) {
  const props = {
    target,
    preview: fixture('eligible-preview'),
    loading: false,
    previewError: null,
    actionError: null,
    result: null,
    confirmation: '',
    onConfirmationChange: () => {},
    executing: false,
    checking: false,
    onRetryPreview: () => {},
    onCheckStatus: () => {},
    onExecute: () => {},
    onClose: () => {},
    ...overrides,
  }
  return renderToStaticMarkup(React.createElement(AnonymizeDialogBody, props))
}

function actionButton(html, label = 'Anonymize account') {
  return html.match(new RegExp(`<button[^>]*>${label}</button>`))
}

test('preview GET is read-only and sends the bearer token without mutating the target', async () => {
  const calls = []
  const result = await requestAnonymizePreview({
    userId: target.id,
    token: 'admin-token',
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ success: true, data: fixture('eligible-preview') }), { status: 200 })
    },
  })

  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `/api/admin/users/${target.id}/anonymize/preview`)
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.body, undefined)
  assert.equal(calls[0].init.credentials, 'include')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer admin-token')
  assert.equal(calls[0].init.headers['Content-Type'], undefined)
})

test('execute PUT sends the exact confirmation and JSON content type', async () => {
  const calls = []
  const partial = fixture('partial-result')
  const result = await executeAnonymizeAccount({
    userId: target.id,
    confirmation: 'ANONYMIZE',
    token: 'admin-token',
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ success: true, data: partial }), { status: 200 })
    },
  })

  assert.equal(result.ok, true)
  assert.equal(calls[0].url, `/api/admin/users/${target.id}/anonymize`)
  assert.equal(calls[0].init.method, 'PUT')
  assert.equal(calls[0].init.body, JSON.stringify({ confirm: 'ANONYMIZE' }))
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer admin-token')
})

test('a preview for a different target is rejected as a stale response', async () => {
  const result = await requestAnonymizePreview({
    userId: target.id,
    token: 'admin-token',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: { ...fixture('eligible-preview'), target: { ...target, id: '665f1f77bcf86cd799439099' } },
        }),
        { status: 200 }
      ),
  })
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'invalid_response')
  assert.match(result.error.message, /different account/i)
})

test('server blockers and recovery details survive error parsing', async () => {
  const blocked = await executeAnonymizeAccount({
    userId: target.id,
    confirmation: 'ANONYMIZE',
    token: 'admin-token',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          success: false,
          msg: 'Active bookings still block this account.',
          code: 'ANONYMIZE_BLOCKED',
          blockers: [
            { code: 'ACTIVE_BOOKINGS', message: '2 bookings still have an active lifecycle state.', count: 2 },
          ],
        }),
        { status: 409 }
      ),
  })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.error.code, 'ANONYMIZE_BLOCKED')
  assert.equal(blocked.error.blockers[0].count, 2)

  const inProgress = await executeAnonymizeAccount({
    userId: target.id,
    confirmation: 'ANONYMIZE',
    token: 'admin-token',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          success: false,
          msg: 'Another request is already processing this account.',
          code: 'ANONYMIZATION_IN_PROGRESS',
          data: {
            retryAfterSeconds: 5,
            recovery: { targetId: target.id, tombstoned: true, fullyAnonymized: false, retryable: true },
          },
        }),
        { status: 409 }
      ),
  })
  assert.equal(inProgress.ok, false)
  assert.equal(inProgress.error.retryAfterSeconds, 5)
  assert.equal(inProgress.error.recovery?.retryable, true)
  assert.equal(shouldCheckAnonymizeStatus(inProgress.error), true)
})

test('network and timeout failures stay distinguishable from a completed command', async () => {
  const network = await executeAnonymizeAccount({
    userId: target.id,
    confirmation: 'ANONYMIZE',
    token: 'admin-token',
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch')
    },
  })
  assert.equal(network.ok, false)
  assert.equal(network.error.kind, 'network')
  assert.equal(isAmbiguousAnonymizeError(network.error), true)

  const timeout = await executeAnonymizeAccount({
    userId: target.id,
    confirmation: 'ANONYMIZE',
    token: 'admin-token',
    fetchImpl: async () => {
      throw new DOMException('The operation timed out', 'TimeoutError')
    },
  })
  assert.equal(timeout.ok, false)
  assert.equal(timeout.error.kind, 'timeout')
  assert.equal(shouldCheckAnonymizeStatus(timeout.error), true)
})

test('recovery list is read-only, permission-gated and maps actual server states', async () => {
  const calls = []
  const result = await requestAnonymizeRecoveryList({
    token: 'admin-token',
    limit: 25,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({
        success: true,
        data: {
          accounts: [
            {
              targetId: target.id,
              role: 'customer',
              state: 'partial_cleanup',
              isAnonymized: true,
              identityRemoved: true,
              legacyAnonymized: false,
              deletedAt: '2026-10-26T12:00:00.000Z',
              anonymizedAt: '2026-10-26T12:00:00.000Z',
              startedAt: '2026-10-26T12:00:00.000Z',
              completedAt: null,
              pendingFiles: 2,
              pendingCalendarReleases: 1,
              lastError: 'One owned file could not be deleted.',
              previewPath: `/api/admin/users/${target.id}/anonymize/preview`,
            },
            {
              targetId: '665f1f77bcf86cd799439012',
              role: 'professional',
              state: 'recovery_in_progress',
              isAnonymized: true,
              identityRemoved: false,
              legacyAnonymized: false,
              deletedAt: '2026-10-26T12:00:00.000Z',
              pendingFiles: 1,
              pendingCalendarReleases: 0,
              lastError: null,
            },
            {
              targetId: '665f1f77bcf86cd799439013',
              role: 'customer',
              state: 'recovery_required',
              isAnonymized: true,
              identityRemoved: true,
              legacyAnonymized: true,
              deletedAt: '2025-01-01T12:00:00.000Z',
              pendingFiles: 0,
              pendingCalendarReleases: 0,
              lastError: null,
            },
          ],
          total: 3,
          counts: { partialCleanup: 1, recoveryInProgress: 1, recoveryRequired: 1 },
        },
      }), { status: 200 })
    },
  })
  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/admin/users/anonymization/recovery?limit=25')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.body, undefined)
  assert.equal(calls[0].init.credentials, 'include')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer admin-token')
  assert.equal(result.data.accounts[0].state, 'already_anonymized')
  assert.equal(result.data.accounts[0].identityRemoved, true)
  assert.equal(result.data.accounts[0].cleanup.pendingFiles, 2)
  assert.equal(result.data.accounts[1].state, 'recovery_required')
  assert.equal(result.data.accounts[1].identityRemoved, false)
  assert.equal(result.data.accounts[2].legacyAnonymized, true)
  assert.equal(result.data.counts.recoveryInProgress, 1)
  assert.equal(result.data.accounts.every((account) => account.source === 'server'), true)
  assert.equal(result.data.page, 1)
  assert.equal(result.data.limit, 3)
  assert.equal(result.data.totalPages, null)
})

test('recovery list permission denial stays an error and never fabricates accounts', async () => {
  const result = await requestAnonymizeRecoveryList({
    token: 'admin-token',
    fetchImpl: async () => new Response(
      JSON.stringify({ success: false, code: 'ADMIN_PERMISSION_DENIED', msg: 'You do not have permission to do that.' }),
      { status: 403 },
    ),
  })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'ADMIN_PERMISSION_DENIED')
  assert.equal(result.error.status, 403)
})

test('recovery list request is bounded with the real timeout path', async () => {
  let calls = 0
  const result = await requestAnonymizeRecoveryList({
    token: 'admin-token',
    timeoutMs: 25,
    fetchImpl: (_url, init) => {
      calls += 1
      return new Promise((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) return
        signal.addEventListener('abort', () => {
          reject(signal.reason || new DOMException('The operation timed out', 'TimeoutError'))
        }, { once: true })
      })
    },
  })
  assert.equal(calls, 1)
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'timeout')
  assert.match(result.error.message, /taking longer|timed out|timeout/i)
})

test('recovery list consumes the page and totalPages contract', async () => {
  const calls = []
  const result = await requestAnonymizeRecoveryList({
    token: 'admin-token',
    page: 2,
    limit: ANONYMIZE_RECOVERY_LIST_LIMIT,
    fetchImpl: async (url) => {
      calls.push(url)
      return new Response(JSON.stringify({
        success: true,
        data: {
          accounts: [{
            targetId: target.id,
            role: 'customer',
            state: 'partial_cleanup',
            isAnonymized: true,
            accessDisabled: true,
            identityRemoved: true,
            legacyAnonymized: false,
            needsRedaction: false,
            pendingFiles: 1,
            pendingCalendarReleases: 0,
            lastError: null,
          }],
          total: 251,
          page: 2,
          limit: 100,
          totalPages: 3,
          counts: { partialCleanup: 251, recoveryInProgress: 0, recoveryRequired: 0 },
        },
      }), { status: 200 })
    },
  })
  assert.equal(result.ok, true)
  assert.equal(calls[0], `/api/admin/users/anonymization/recovery?page=2&limit=${ANONYMIZE_RECOVERY_LIST_LIMIT}`)
  assert.equal(ANONYMIZE_RECOVERY_LIST_LIMIT, 100)
  assert.equal(result.data.accounts.length, 1)
  assert.equal(result.data.accounts[0].accessDisabled, true)
  assert.equal(result.data.accounts[0].needsRedaction, false)
  assert.equal(result.data.total, 251)
  assert.equal(result.data.page, 2)
  assert.equal(result.data.limit, 100)
  assert.equal(result.data.totalPages, 3)
})

test('execute is bounded by a real timeout and never leaves the dialog pending forever', async () => {
  let calls = 0
  const result = await executeAnonymizeAccount({
    userId: target.id,
    confirmation: 'ANONYMIZE',
    token: 'admin-token',
    timeoutMs: 25,
    fetchImpl: (_url, init) => {
      calls += 1
      return new Promise((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) return
        signal.addEventListener('abort', () => {
          reject(signal.reason || new DOMException('The operation timed out', 'TimeoutError'))
        }, { once: true })
      })
    },
  })
  assert.equal(calls, 1)
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'timeout')
  assert.equal(result.error.postExecution, true)
  assert.equal(isAmbiguousAnonymizeError(result.error), true)
  assert.equal(shouldCheckAnonymizeStatus(result.error), true)
})

test('gateway and non-JSON server failures after the PUT are ambiguous, not retryable', async () => {
  for (const status of [500, 502, 503, 504]) {
    let calls = 0
    const result = await executeAnonymizeAccount({
      userId: target.id,
      confirmation: 'ANONYMIZE',
      token: 'admin-token',
      fetchImpl: async () => {
        calls += 1
        return new Response('<html>upstream failure</html>', { status })
      },
    })
    assert.equal(calls, 1, `one PUT for ${status}`)
    assert.equal(result.ok, false)
    assert.equal(result.error.status, status)
    assert.equal(isAmbiguousAnonymizeError(result.error), true, `ambiguous ${status}`)
    assert.equal(shouldCheckAnonymizeStatus(result.error), true, `check status ${status}`)
  }
})

test('only known not-applied execute failures keep a normal retry', async () => {
  const permission = await executeAnonymizeAccount({
    userId: target.id,
    confirmation: 'ANONYMIZE',
    token: 'admin-token',
    fetchImpl: async () => new Response(
      JSON.stringify({ success: false, code: 'ADMIN_PERMISSION_DENIED', msg: 'You do not have permission to do that.' }),
      { status: 403 },
    ),
  })
  assert.equal(permission.ok, false)
  assert.equal(permission.error.code, 'ADMIN_PERMISSION_DENIED')
  assert.equal(isAmbiguousAnonymizeError(permission.error), false)
  assert.equal(shouldCheckAnonymizeStatus(permission.error), false)

  const blocked = await executeAnonymizeAccount({
    userId: target.id,
    confirmation: 'ANONYMIZE',
    token: 'admin-token',
    fetchImpl: async () => new Response(
      JSON.stringify({
        success: false,
        code: 'ANONYMIZE_BLOCKED',
        msg: 'Blocked.',
        data: { blockers: [{ code: 'ACTIVE_BOOKINGS', message: 'Active booking.', count: 1 }] },
      }),
      { status: 409 },
    ),
  })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.error.code, 'ANONYMIZE_BLOCKED')
  assert.equal(isAmbiguousAnonymizeError(blocked.error), false)
  assert.equal(shouldCheckAnonymizeStatus(blocked.error), false)
})

test('recovery records distinguish an unknown outcome from a tombstoned account', () => {
  const unknown = anonymizeRecoveryFromError(
    { kind: 'network', message: 'offline', blockers: [], postExecution: true },
    { targetId: target.id, role: 'customer' },
  )
  assert.equal(unknown.state, 'status_unknown')
  assert.equal(unknown.identityRemoved, false)
  assert.equal(unknown.targetId, target.id)

  const tombstoned = anonymizeRecoveryFromError(
    {
      kind: 'http',
      message: 'incomplete',
      blockers: [],
      postExecution: true,
      code: 'ANONYMIZE_INCOMPLETE',
      recovery: { targetId: target.id, tombstoned: true, fullyAnonymized: false, retryable: true },
    },
    { targetId: target.id, role: 'customer' },
  )
  assert.equal(tombstoned.state, 'recovery_required')
  assert.equal(tombstoned.identityRemoved, false)
  assert.equal(tombstoned.targetId, target.id)
})

test('recovery storage is admin scoped, sanitized and purged on logout', () => {
  const storage = new MemoryStorage()
  storage.setItem(
    'fixera-admin-anonymize-recovery:customers',
    JSON.stringify([{
      target: { id: target.id, name: 'Old Name', email: 'old@example.com', avatar: 'old.jpg', role: 'customer' },
      cleanup: { pendingFiles: 2, pendingCalendarReleases: 1, deletedFiles: 0, failedFiles: 2 },
    }]),
  )
  purgeLegacyAnonymizeRecoveryStorage(storage)
  assert.equal(storage.length, 0)

  const record = {
    targetId: target.id,
    role: 'customer',
    state: 'recovery_required',
    identityRemoved: false,
    accessDisabled: true,
    needsRedaction: true,
    cleanup: {
      pendingFiles: 1,
      pendingCalendarReleases: 0,
      deletedFiles: 0,
      failedFiles: 1,
      completedAt: null,
      lastError: 'failed',
    },
    source: 'session',
    name: 'Should not persist',
    email: 'should-not@example.com',
    avatar: 'should-not.jpg',
  }
  writeAnonymizeRecoveryRecords(storage, 'admin-one', 'customers', [record])
  const key = anonymizeRecoveryStorageKey('admin-one', 'customers')
  const raw = storage.getItem(key)
  assert.ok(raw)
  assert.doesNotMatch(raw, /Should not persist|should-not@example\.com|should-not\.jpg|avatar/)

  const read = readAnonymizeRecoveryRecords(storage, 'admin-one', 'customers')
  assert.equal(read.length, 1)
  assert.equal(read[0].targetId, target.id)
  assert.equal(read[0].state, 'recovery_required')
  assert.equal(read[0].identityRemoved, false)
  assert.equal(read[0].accessDisabled, true)
  assert.equal(read[0].needsRedaction, true)
  assert.deepEqual(readAnonymizeRecoveryRecords(storage, 'admin-two', 'customers'), [])

  storage.setItem(key, '{not json')
  assert.deepEqual(readAnonymizeRecoveryRecords(storage, 'admin-one', 'customers'), [])
  assert.equal(storage.getItem(key), null)

  writeAnonymizeRecoveryRecords(storage, 'admin-one', 'customers', [record])
  assert.equal(storage.length, 1)
  purgeAllAnonymizeRecoveryStorage(storage)
  assert.equal(storage.length, 0)
})

test('conversation counterparty helper is null safe and detects canonical placeholders', () => {
  const conversation = {
    type: 'direct',
    customerId: { _id: 'customer-1', name: '[deleted user]', deletedAt: '2026-10-20T10:00:00.000Z' },
    professionalId: { _id: 'professional-1', name: 'Current Professional' },
  }
  assert.equal(conversationCounterparty(conversation, 'professional')?.name, '[deleted user]')
  assert.equal(conversationCounterparty(conversation, 'customer')?.name, 'Current Professional')
  assert.equal(conversationCounterparty(null, 'customer'), null)
  assert.equal(isConversationCounterpartyAnonymized(conversation, 'professional'), true)
  assert.equal(isConversationCounterpartyAnonymized(conversation, 'customer'), false)
  assert.equal(isConversationCounterpartyAnonymized({ type: 'support', customerId: { isAnonymized: true } }, 'customer'), false)
  assert.equal(isConversationCounterpartyAnonymized({ type: 'direct', professionalId: null }, 'customer'), false)
})

test('result announcements distinguish full, already and pending cleanup', () => {
  const partial = fixture('partial-result')
  const full = {
    ...partial,
    outcome: 'anonymized',
    fullyAnonymized: true,
    cleanup: { ...partial.cleanup, pendingFiles: 0, pendingCalendarReleases: 0, failedFiles: 0, lastError: null },
  }
  const already = {
    ...full,
    outcome: 'already_anonymized',
  }
  assert.match(anonymizeResultAnnouncement(full), /Account anonymized/)
  assert.match(anonymizeResultAnnouncement(already), /already anonymized/)
  assert.match(anonymizeResultAnnouncement(partial), /cleanup is still pending/)
  assert.doesNotMatch(anonymizeResultAnnouncement(partial), /Account anonymized\./)
})

class MemoryStorage {
  constructor() {
    this.map = new Map()
  }
  get length() {
    return this.map.size
  }
  key(index) {
    return Array.from(this.map.keys())[index] ?? null
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null
  }
  setItem(key, value) {
    this.map.set(String(key), String(value))
  }
  removeItem(key) {
    this.map.delete(key)
  }
}


test('an execute result for a different target is rejected as stale', async () => {
  const result = await executeAnonymizeAccount({
    userId: target.id,
    confirmation: 'ANONYMIZE',
    token: 'admin-token',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: { ...fixture('partial-result'), target: { ...fixture('partial-result').target, id: '665f1f77bcf86cd799439099' } },
        }),
        { status: 200 },
      ),
  })
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'invalid_response')
  assert.equal(result.error.postExecution, true)
  assert.equal(shouldCheckAnonymizeStatus(result.error), true)
  assert.match(result.error.message, /different account/i)
})

test('confirmation validation is exact, case-sensitive and does not trim', () => {
  const preview = fixture('eligible-preview')
  assert.equal(anonymizeCanAttempt(preview), true)
  assert.equal(anonymizeConfirmationError(preview, ''), 'Type ANONYMIZE exactly to confirm.')
  assert.equal(anonymizeConfirmationError(preview, 'anonymize'), 'Type ANONYMIZE exactly to confirm.')
  assert.equal(anonymizeConfirmationError(preview, 'ANONYMIZE '), 'Type ANONYMIZE exactly to confirm.')
  assert.equal(anonymizeConfirmationError(preview, 'ANONYMIZE'), null)
})

test('blocked and already-cleaned previews cannot execute while recovery cleanup can retry', () => {
  const blocked = fixture('blocked-preview')
  assert.equal(anonymizeCanAttempt(blocked), false)

  const already = {
    ...fixture('eligible-preview'),
    status: 'already_anonymized',
    eligible: false,
    alreadyAnonymized: true,
    fullyAnonymized: true,
    target: { ...fixture('eligible-preview').target, deletedAt: '2026-10-26T12:00:00.000Z', isAnonymized: true },
  }
  assert.equal(anonymizeCanAttempt(already), false)

  const pending = {
    ...already,
    fullyAnonymized: false,
    cleanup: { pendingFiles: 1, pendingCalendarReleases: 0, deletedFiles: 0, failedFiles: 1, completedAt: null, lastError: 'failed' },
  }
  assert.equal(anonymizeCanAttempt(pending), true)

  const recovery = {
    ...fixture('eligible-preview'),
    status: 'recovery_required',
    recoveryRequired: true,
    fullyAnonymized: false,
    cleanup: { pendingFiles: 0, pendingCalendarReleases: 1, deletedFiles: 0, failedFiles: 0, completedAt: null, lastError: null },
  }
  assert.equal(anonymizeCanAttempt(recovery), true)
  assert.equal(anonymizeConfirmationError(recovery, 'ANONYMIZE'), null)
})

test('partial cleanup is never treated as full success', () => {
  const partial = fixture('partial-result')
  assert.equal(isFullyAnonymizedResult(partial), false)
  assert.equal(isAnonymizedIdentity(partial.target), true)

  const full = {
    ...partial,
    outcome: 'anonymized',
    fullyAnonymized: true,
    cleanup: { ...partial.cleanup, pendingFiles: 0, pendingCalendarReleases: 0, failedFiles: 0, lastError: null },
  }
  assert.equal(isFullyAnonymizedResult(full), true)
})

test('effective user-delete permission gates both anonymization and hard deletion', () => {
  const superUser = { role: 'admin', adminRole: 'super' }
  assert.equal(canManageUserDeletion(superUser), true)

  const careNone = { role: 'admin', adminRole: 'care', adminPermissions: [] }
  assert.equal(canManageUserDeletion(careNone), false)

  const matrixWrite = {
    role: 'admin',
    adminRole: 'operations',
    adminPermissions: ['users.delete'],
    adminAccessLevels: { user_delete: 'write' },
  }
  assert.equal(canManageUserDeletion(matrixWrite), true)

  const matrixRead = {
    role: 'admin',
    adminRole: 'operations',
    adminPermissions: ['users.delete'],
    adminAccessLevels: { user_delete: 'read' },
  }
  assert.equal(canManageUserDeletion(matrixRead), false)

  const stalePack = {
    role: 'admin',
    adminRole: 'operations',
    adminPermissions: [],
    adminAccessLevels: { user_delete: 'write' },
  }
  assert.equal(canManageUserDeletion(stalePack), false)

  assert.equal(canManageUserDeletion({ role: 'customer' }), false)
  assert.equal(canManageUserDeletion(null), false)
})

test('eligible dialog exposes retained financial records, impact and a disabled execute until the phrase matches', () => {
  const empty = dialogHtml()
  assert.match(empty, /Booking and service facts/)
  assert.match(empty, /Invoice and credit-note records/)
  assert.match(empty, /External provider records/)
  assert.match(empty, /Type <code[^>]*>ANONYMIZE<\/code> to confirm/)
  assert.match(empty, /runs only when you press the button/)
  assert.doesNotMatch(empty, /<form/)
  assert.match(actionButton(empty)[0], /\sdisabled=""/)

  const exact = dialogHtml({ confirmation: 'ANONYMIZE' })
  assert.doesNotMatch(actionButton(exact)[0], /\sdisabled=""/)
  assert.match(exact, /value="ANONYMIZE"/)
})

test('blocked dialog shows every server blocker and cannot execute', () => {
  const html = dialogHtml({ preview: fixture('blocked-preview'), confirmation: 'ANONYMIZE' })
  assert.match(html, /Anonymization blocked/)
  assert.match(html, /2 bookings still have an active lifecycle state/)
  assert.match(html, /1 payment still has an open obligation/)
  assert.match(html, /confirmation field is disabled while blockers remain/)
  assert.doesNotMatch(html, /id="[^"]*-confirm"/)
  assert.match(actionButton(html)[0], /\sdisabled=""/)
})

test('pending status check suppresses retry until the server state is refreshed', () => {
  const html = dialogHtml({ confirmation: 'ANONYMIZE', statusCheckRequired: true })
  assert.match(html, /Check the account status before trying again/)
  assert.match(actionButton(html)[0], /\sdisabled=""/)
})

test('preview errors render a retryable alert without an execute action', () => {
  const html = dialogHtml({
    preview: null,
    previewError: { kind: 'network', message: 'You appear to be offline.', blockers: [] },
  })
  assert.match(html, /role="alert"/)
  assert.match(html, /Retry preview/)
  assert.doesNotMatch(html, />Anonymize account</)
  assert.match(html, />Close</)
})

test('partial cleanup result is honest and offers a cleanup retry', () => {
  const html = dialogHtml({ result: fixture('partial-result'), confirmation: 'ANONYMIZE' })
  assert.match(html, /Identity removed, but cleanup is incomplete/)
  assert.match(html, /not fully cleaned up yet/)
  assert.match(html, /1 stored file still needs deletion/)
  assert.match(html, /1 calendar cleanup task still needs a retry/)
  assert.match(html, /Retry cleanup/)
  assert.doesNotMatch(html, />Account anonymized</)
})

test('already-anonymized result never claims a new redaction', () => {
  const partial = fixture('partial-result')
  const already = {
    ...partial,
    outcome: 'already_anonymized',
    fullyAnonymized: true,
    cleanup: { ...partial.cleanup, pendingFiles: 0, pendingCalendarReleases: 0, failedFiles: 0, lastError: null },
  }
  const html = dialogHtml({ result: already, confirmation: 'ANONYMIZE' })
  assert.match(html, /Account was already anonymized/)
  assert.match(html, /No further identity changes were made/)
  assert.doesNotMatch(html, />Account anonymized</)
  assert.doesNotMatch(html, /Retry cleanup/)
})

test('recovery preview allows a confirmed retry and names it as such', () => {
  const recovery = {
    ...fixture('eligible-preview'),
    status: 'recovery_required',
    recoveryRequired: true,
    fullyAnonymized: false,
    cleanup: { pendingFiles: 1, pendingCalendarReleases: 0, deletedFiles: 0, failedFiles: 1, completedAt: null, lastError: 'failed' },
  }
  const html = dialogHtml({ preview: recovery, confirmation: 'ANONYMIZE' })
  assert.match(html, /Cleanup needs recovery/)
  assert.match(html, /identity redaction is not proven complete/)
  assert.doesNotMatch(html, /identity was already removed/)
  assert.match(html, /Retry anonymization/)
})

test('an anonymized party hides copied name, contact and address but a normal party is unchanged', () => {
  const labels = {
    name: 'Name',
    username: 'Username',
    businessName: 'Business name',
    email: 'Email',
    phone: 'Phone',
    vat: 'VAT',
    website: 'Website',
    city: 'City',
    postalCode: 'Postal code',
    country: 'Country',
    timeZone: 'Time zone',
    customerType: 'Customer type',
  }
  const anonymized = {
    id: '665f1f77bcf86cd799439011',
    isAnonymized: true,
    name: 'Old Source Name',
    username: 'oldsource',
    email: 'old@example.com',
    phone: '+32 123 45 67',
    address: { city: 'Brussels', country: 'BE', postalCode: '1000' },
  }
  const normal = {
    id: '665f1f77bcf86cd799439012',
    name: 'Current Name',
    email: 'current@example.com',
    phone: '+32 987 65 43',
    address: { city: 'Ghent', country: 'BE', postalCode: '9000' },
  }

  for (const locale of ['en', 'nl', 'fr']) {
    const deletedLabel = messagesByLocale[locale].bookings.details.partyAnonymized
    const html = renderWithMessages(
      React.createElement(PartyCard, { title: 'Customer', party: anonymized, role: 'customer', labels })
    , locale)
    assert.match(html, new RegExp(deletedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.doesNotMatch(html, /Old Source Name|old@example\.com|\+32 123 45 67|Brussels/)
    assert.match(html, new RegExp(messagesByLocale[locale].bookings.details.partyAnonymizedNote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

    const normalHtml = renderWithMessages(
      React.createElement(PartyCard, { title: 'Customer', party: normal, role: 'customer', labels })
    , locale)
    assert.match(normalHtml, /Current Name/)
    assert.match(normalHtml, /current@example\.com/)
    assert.match(normalHtml, /Ghent/)
  }
})

test('quotation actor uses the localized deleted-user label instead of a copied snapshot name', () => {
  const payload = JSON.parse(
    readFileSync(new URL('./fixtures/bookingDetails/quoted-customer.json', import.meta.url), 'utf8')
  )
  const details = structuredClone(payload.details)
  const version = details.quotation.versions[details.quotation.versions.length - 1]
  version.createdBy = {
    id: '665f1f77bcf86cd799439099',
    role: 'professional',
    name: 'Former Professional Name',
    email: 'former@example.com',
    isAnonymized: true,
    source: 'recorded',
  }

  for (const locale of ['en', 'nl', 'fr']) {
    const html = renderWithMessages(
      React.createElement(QuotationPanel, {
        booking: payload.booking,
        details,
        pathname: '/bookings/test',
        search: '?tab=quotation',
      })
    , locale)
    assert.doesNotMatch(html, /Former Professional Name|former@example\.com/)
    assert.match(html, new RegExp(messagesByLocale[locale].bookings.details.activity.deletedActor))
  }
})

test('chat list hides a deleted counterparty avatar and contact while keeping the conversation selectable', () => {
  const conversation = {
    _id: '665f1f77bcf86cd799439020',
    type: 'direct',
    initiatedBy: '665f1f77bcf86cd799439011',
    status: 'active',
    starredBy: [],
    archivedBy: [],
    labels: [],
    customerUnreadCount: 0,
    professionalUnreadCount: 0,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
    lastMessagePreview: '[deleted message]',
    customerId: {
      _id: '665f1f77bcf86cd799439011',
      name: '[deleted user]',
      email: 'deleted-665f1f77bcf86cd799439011@anon.local',
      profileImage: 'https://example.com/old-avatar.jpg',
    },
    professionalId: {
      _id: '665f1f77bcf86cd799439012',
      name: 'Current Professional',
      email: 'pro@example.com',
    },
  }

  for (const locale of ['en', 'nl', 'fr']) {
    const html = renderWithMessages(
      React.createElement(ChatList, {
        conversations: [conversation],
        selectedConversationId: null,
        currentUserRole: 'professional',
        currentUserId: conversation.professionalId._id,
        filter: 'all',
        userLabels: [],
        onSelect: () => {},
        onFilterChange: () => {},
        onToggleStar: () => {},
        onToggleArchive: () => {},
        onAddLabel: () => {},
        onRemoveLabel: () => {},
      })
    , locale, { chat: messagesByLocale[locale].chat })

    assert.match(html, new RegExp(messagesByLocale[locale].chat.common.deletedUser))
    assert.match(html, new RegExp(messagesByLocale[locale].chat.common.accountUnavailable))
    assert.match(html, new RegExp(messagesByLocale[locale].chat.common.messageDeleted))
    assert.doesNotMatch(html, /\[deleted message\]/)
    assert.doesNotMatch(html, /deleted-665f1f77bcf86cd799439011@anon\.local|old-avatar\.jpg|\[deleted user\]/)
  }
})
test('already-anonymized preview has no confirmation or execute action', () => {
  const preview = {
    ...fixture('eligible-preview'),
    status: 'already_anonymized',
    eligible: false,
    alreadyAnonymized: true,
    fullyAnonymized: true,
    target: { ...fixture('eligible-preview').target, deletedAt: '2026-10-26T12:00:00.000Z', isAnonymized: true },
  }
  const html = dialogHtml({ preview })
  assert.match(html, /Already anonymized/)
  assert.doesNotMatch(html, /id="[^"]*-confirm"/)
  assert.equal(actionButton(html), null)
  assert.match(html, /does not need a new anonymization request/)
  assert.match(html, /This account is already anonymized/)
  assert.match(html, /were already removed from active use/)
  assert.doesNotMatch(html, /will be removed from active use/)
})

test('an ambiguous execute error requires a status check before retry', () => {
  const html = dialogHtml({
    statusCheckRequired: true,
    actionError: {
      kind: 'network',
      message: 'We could not reach the server.',
      blockers: [],
      postExecution: true,
    },
  })
  assert.match(html, /We could not confirm whether the request reached the server/)
  assert.match(html, />Check account status</)
  assert.doesNotMatch(html, /id="[^"]*-confirm"/)
  assert.match(actionButton(html)[0], /\sdisabled=""/)
})

test('legacy null identities stay safe and ordinary deletedAt flags are detected', () => {
  assert.equal(isAnonymizedIdentity(null), false)
  assert.equal(isAnonymizedIdentity(undefined), false)
  assert.equal(isAnonymizedIdentity({ deletedAt: null, isAnonymized: false }), false)
  assert.equal(isAnonymizedIdentity({ deletedAt: '2026-10-26T12:00:00.000Z' }), true)
  assert.equal(isAnonymizedIdentity({ isAnonymized: true }), true)
  assert.equal(isAnonymizedIdentity({ name: 'Deleted user' }), true)
  assert.equal(isAnonymizedIdentity({ name: 'Deleted User Ltd' }), false)
})
test('recovery card states are truthful and never re-expose the old identity', () => {
  const baseCleanup = {
    pendingFiles: 2,
    pendingCalendarReleases: 1,
    deletedFiles: 1,
    failedFiles: 2,
    completedAt: null,
    lastError: 'One owned file could not be deleted.',
  }
  const entries = [
    {
      targetId: target.id,
      role: 'customer',
      state: 'already_anonymized',
      identityRemoved: true,
      cleanup: baseCleanup,
      source: 'session',
    },
    {
      targetId: '665f1f77bcf86cd799439012',
      role: 'professional',
      state: 'recovery_required',
      identityRemoved: false,
      accessDisabled: true,
      needsRedaction: true,
      cleanup: { ...baseCleanup, pendingFiles: 1, pendingCalendarReleases: 0 },
      source: 'session',
    },
    {
      targetId: '665f1f77bcf86cd799439013',
      role: 'professional',
      state: 'recovery_required',
      identityRemoved: true,
      legacyAnonymized: true,
      cleanup: { ...baseCleanup, pendingFiles: 1, pendingCalendarReleases: 0 },
      source: 'session',
    },
    {
      targetId: '665f1f77bcf86cd799439014',
      role: 'customer',
      state: 'status_unknown',
      identityRemoved: false,
      cleanup: { ...baseCleanup, pendingFiles: 0, pendingCalendarReleases: 0, failedFiles: 0, lastError: null },
      source: 'session',
    },
  ]
  const html = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries,
      onResume: () => {},
    })
  )
  assert.match(html, /Cleanup still pending for an anonymized customer account/)
  assert.match(html, /identity has already been removed/)
  assert.match(html, /Recovery still pending for a locked professional account/)
  assert.match(html, /Identity redaction is still required/)
  assert.match(html, /previously redacted professional account/)
  assert.match(html, /older flow/)
  assert.match(html, /outcome needs a status check/)
  assert.match(html, /do not repeat the request blindly/i)
  assert.match(html, /Check status and resume/)
  assert.doesNotMatch(html, /Ada Customer|ada@example\.com|Old Legacy Name/)

  const unproven = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries: [{
        targetId: '665f1f77bcf86cd799439015',
        role: 'customer',
        state: 'recovery_required',
        identityRemoved: false,
        accessDisabled: false,
        needsRedaction: false,
        cleanup: baseCleanup,
        source: 'server',
      }],
      onResume: () => {},
    })
  )
  assert.match(unproven, /server has not confirmed that account access is disabled/)
  assert.match(unproven, /identity redaction is not proven complete/)
})
test('an authoritative preview resolves a stale unknown record or preserves the real tombstone', () => {
  const eligible = fixture('eligible-preview')
  assert.deepEqual(reconcileAnonymizePreview(eligible), { kind: 'clear' })

  const blocked = fixture('blocked-preview')
  assert.deepEqual(reconcileAnonymizePreview(blocked), { kind: 'clear' })
  const blockedAccessOnly = reconcileAnonymizePreview({
    ...blocked,
    target: { ...blocked.target, accessDisabled: true, needsRedaction: true },
  })
  assert.equal(blockedAccessOnly.kind, 'recovery')
  assert.equal(blockedAccessOnly.record.identityRemoved, false)
  assert.equal(blockedAccessOnly.record.accessDisabled, true)

  const pendingCleanup = {
    pendingFiles: 2,
    pendingCalendarReleases: 1,
    deletedFiles: 0,
    failedFiles: 2,
    completedAt: null,
    lastError: 'One owned file could not be deleted.',
  }
  const tombstoneTarget = {
    ...blocked.target,
    name: null,
    email: null,
    accountStatus: 'rejected',
    deletedAt: '2026-10-26T12:00:00.000Z',
    isAnonymized: true,
    identityRemoved: false,
    accessDisabled: true,
    needsRedaction: true,
  }

  // Blockers take precedence in the handler. A blocker on a real tombstone is
  // still evidence that anonymization started, so the card must survive and
  // must not claim the identity was removed.
  const blockedTombstone = reconcileAnonymizePreview({
    ...blocked,
    target: tombstoneTarget,
    cleanup: pendingCleanup,
  })
  assert.equal(blockedTombstone.kind, 'recovery')
  assert.equal(blockedTombstone.record.state, 'recovery_required')
  assert.equal(blockedTombstone.record.identityRemoved, false)
  assert.equal(blockedTombstone.record.accessDisabled, true)
  assert.equal(blockedTombstone.record.needsRedaction, true)
  assert.equal(blockedTombstone.record.legacyAnonymized, undefined)
  assert.deepEqual(blockedTombstone.record.cleanup, pendingCleanup)

  const partialTarget = {
    ...tombstoneTarget,
    identityRemoved: true,
    needsRedaction: false,
  }
  const partial = reconcileAnonymizePreview({
    ...eligible,
    target: partialTarget,
    status: 'already_anonymized',
    eligible: false,
    alreadyAnonymized: true,
    cleanup: pendingCleanup,
  })
  assert.equal(partial.kind, 'recovery')
  assert.equal(partial.record.state, 'already_anonymized')
  assert.equal(partial.record.identityRemoved, true)
  assert.equal(partial.record.accessDisabled, true)
  assert.equal(partial.record.needsRedaction, false)
  assert.equal(partial.record.cleanup.pendingFiles, 2)
  assert.equal(partial.record.cleanup.pendingCalendarReleases, 1)
  assert.equal(partial.record.cleanup.failedFiles, 2)
  assert.equal(partial.record.cleanup.deletedFiles, 0)

  const complete = reconcileAnonymizePreview({
    ...eligible,
    target: partialTarget,
    status: 'already_anonymized',
    eligible: false,
    alreadyAnonymized: true,
    fullyAnonymized: true,
    cleanup: {
      pendingFiles: 0,
      pendingCalendarReleases: 0,
      deletedFiles: 4,
      failedFiles: 0,
      completedAt: '2026-10-26T12:05:00.000Z',
      lastError: null,
    },
  })
  assert.deepEqual(complete, { kind: 'clear' })

  const legacy = reconcileAnonymizePreview({
    ...eligible,
    target: {
      ...partialTarget,
      legacyAnonymized: true,
      needsRedaction: false,
    },
    status: 'recovery_required',
    eligible: true,
    recoveryRequired: true,
  })
  assert.equal(legacy.kind, 'recovery')
  assert.equal(legacy.record.state, 'recovery_required')
  assert.equal(legacy.record.identityRemoved, true)
  assert.equal(legacy.record.legacyAnonymized, true)
})

test('a server recovery record keeps its source and exact flags when a preview is merged', () => {
  const pendingCleanup = {
    pendingFiles: 1,
    pendingCalendarReleases: 1,
    deletedFiles: 0,
    failedFiles: 1,
    completedAt: null,
    lastError: 'One owned file could not be deleted.',
  }
  const serverRecord = {
    targetId: target.id,
    role: 'customer',
    state: 'already_anonymized',
    identityRemoved: true,
    accessDisabled: true,
    needsRedaction: false,
    cleanup: pendingCleanup,
    source: 'server',
  }
  const fromPreview = {
    targetId: target.id,
    role: null,
    state: 'already_anonymized',
    identityRemoved: true,
    accessDisabled: true,
    needsRedaction: false,
    cleanup: pendingCleanup,
    source: 'session',
  }

  const merged = mergeAnonymizeRecoveryRecord(serverRecord, fromPreview)
  assert.equal(merged.source, 'server')
  assert.equal(merged.role, 'customer')
  assert.equal(merged.identityRemoved, true)
  assert.equal(merged.accessDisabled, true)
  assert.equal(merged.needsRedaction, false)
  assert.deepEqual(merged.cleanup, pendingCleanup)

  // An absent fresh boolean must not erase a known explicit false or a zero.
  const explicitFalse = mergeAnonymizeRecoveryRecord(
    { ...serverRecord, accessDisabled: false, needsRedaction: false },
    {
      targetId: target.id,
      role: 'customer',
      state: 'recovery_required',
      identityRemoved: false,
      cleanup: {
        pendingFiles: 0,
        pendingCalendarReleases: 0,
        deletedFiles: 0,
        failedFiles: 0,
        completedAt: null,
        lastError: null,
      },
      source: 'session',
    }
  )
  assert.equal(explicitFalse.accessDisabled, false)
  assert.equal(explicitFalse.needsRedaction, false)
  assert.equal(explicitFalse.cleanup.pendingFiles, 0)

  // An ambiguous result is not proof that the previously known removal or
  // legacy provenance disappeared.
  const uncertain = mergeAnonymizeRecoveryRecord(
    { ...serverRecord, legacyAnonymized: true },
    {
      targetId: target.id,
      role: 'customer',
      state: 'status_unknown',
      identityRemoved: false,
      cleanup: pendingCleanup,
      source: 'session',
    }
  )
  assert.equal(uncertain.source, 'server')
  assert.equal(uncertain.identityRemoved, true)
  assert.equal(uncertain.legacyAnonymized, true)

  const other = {
    ...serverRecord,
    targetId: '665f1f77bcf86cd799439012',
    role: 'professional',
  }
  const next = upsertAnonymizeRecoveryRecord([serverRecord, other], {
    ...fromPreview,
    state: 'already_anonymized',
  })
  assert.equal(next.length, 2)
  assert.equal(next[0].targetId, target.id)
  assert.equal(next[0].source, 'server')
  assert.equal(next[1].targetId, other.targetId)
})


test('settled handler preview samples reconcile exactly through the real parser', async () => {
  const partialSample = wireFixture('preview-partial-cleanup')
  const partial = await requestAnonymizePreview({
    userId: partialSample.data.target.id,
    token: 'admin-token',
    fetchImpl: async () => new Response(JSON.stringify(partialSample), { status: 200 }),
  })
  assert.equal(partial.ok, true)
  const partialReconciliation = reconcileAnonymizePreview(partial.data)
  assert.equal(partialReconciliation.kind, 'recovery')
  assert.equal(partialReconciliation.record.state, 'already_anonymized')
  assert.equal(partialReconciliation.record.identityRemoved, true)
  assert.equal(partialReconciliation.record.accessDisabled, true)
  assert.equal(partialReconciliation.record.needsRedaction, false)
  assert.equal(partialReconciliation.record.cleanup.pendingFiles, 2)
  assert.equal(partialReconciliation.record.cleanup.pendingCalendarReleases, 1)
  assert.equal(partialReconciliation.record.cleanup.failedFiles, 2)
  // The settled preview handler derives cleanup through cleanupFromGuard:
  // deletedFiles is always 0 and only pending/failed files are counted.
  assert.equal(partialReconciliation.record.cleanup.deletedFiles, 0)
  assert.equal(partialSample.data.cleanup.deletedFiles, 0)
  assert.equal(partialSample.data.target.identityRemoved, true)
  assert.equal(partialSample.data.target.legacyAnonymized === true, false)
  assert.equal(
    partialSample.data.warnings.includes('2 stored files still need deletion. A repeated request will retry them.'),
    true
  )

  const tombstoneSample = wireFixture('preview-bare-tombstone')
  const tombstone = await requestAnonymizePreview({
    userId: tombstoneSample.data.target.id,
    token: 'admin-token',
    fetchImpl: async () => new Response(JSON.stringify(tombstoneSample), { status: 200 }),
  })
  assert.equal(tombstone.ok, true)
  const tombstoneReconciliation = reconcileAnonymizePreview(tombstone.data)
  assert.equal(tombstoneReconciliation.kind, 'recovery')
  assert.equal(tombstoneReconciliation.record.state, 'recovery_required')
  assert.equal(tombstoneReconciliation.record.identityRemoved, false)
  assert.equal(tombstoneReconciliation.record.accessDisabled, true)
  assert.equal(tombstoneReconciliation.record.needsRedaction, true)
  assert.equal(tombstoneReconciliation.record.legacyAnonymized, undefined)
})

test('settled handler recovery pages and party DTOs render from their actual shapes', async () => {
  const firstPage = wireFixture('recovery-list-page')
  const first = await requestAnonymizeRecoveryList({
    token: 'admin-token',
    page: 1,
    limit: 2,
    fetchImpl: async () => new Response(JSON.stringify(firstPage), { status: 200 }),
  })
  assert.equal(first.ok, true)
  assert.equal(first.data.total, 3)
  assert.equal(first.data.page, 1)
  assert.equal(first.data.limit, 2)
  assert.equal(first.data.totalPages, 2)
  assert.equal(first.data.accounts.length, 2)
  // The settled handler returns oldest deletedAt first, then the stable id.
  assert.deepEqual(
    first.data.accounts.map((entry) => entry.targetId),
    ['665f1f77bcf86cd799439017', '665f1f77bcf86cd799439016']
  )
  const legacy = first.data.accounts[0]
  assert.equal(legacy.source, 'server')
  assert.equal(legacy.state, 'recovery_required')
  assert.equal(firstPage.data.accounts[0].isAnonymized, false)
  assert.equal(legacy.accessDisabled, true)
  assert.equal(legacy.identityRemoved, true)
  assert.equal(legacy.legacyAnonymized, true)
  assert.equal(legacy.needsRedaction, false)
  assert.equal(legacy.cleanup.pendingFiles, 0)
  const tombstone = first.data.accounts[1]
  assert.equal(tombstone.identityRemoved, false)
  assert.equal(tombstone.needsRedaction, true)
  assert.equal(tombstone.accessDisabled, true)
  assert.equal(tombstone.legacyAnonymized, undefined)

  const secondPage = wireFixture('recovery-list-page-2')
  const second = await requestAnonymizeRecoveryList({
    token: 'admin-token',
    page: 2,
    limit: 2,
    fetchImpl: async () => new Response(JSON.stringify(secondPage), { status: 200 }),
  })
  assert.equal(second.ok, true)
  assert.equal(second.data.page, 2)
  assert.equal(second.data.total, 3)
  assert.equal(second.data.limit, 2)
  assert.equal(second.data.totalPages, 2)
  assert.equal(second.data.accounts.length, 1)
  const partial = second.data.accounts[0]
  assert.equal(partial.targetId, '665f1f77bcf86cd799439014')
  assert.equal(partial.source, 'server')
  assert.equal(partial.state, 'already_anonymized')
  assert.equal(partial.accessDisabled, true)
  assert.equal(partial.needsRedaction, false)
  assert.equal(partial.identityRemoved, true)
  assert.equal(partial.legacyAnonymized, undefined)
  assert.equal(partial.cleanup.pendingFiles, 2)
  assert.equal(partial.cleanup.pendingCalendarReleases, 1)

  const combined = [...first.data.accounts, ...second.data.accounts]
  assert.deepEqual(
    combined.map((entry) => entry.targetId),
    ['665f1f77bcf86cd799439017', '665f1f77bcf86cd799439016', '665f1f77bcf86cd799439014']
  )
  assert.equal(new Set(combined.map((entry) => entry.targetId)).size, 3)
  assert.equal(
    Date.parse(firstPage.data.accounts[1].deletedAt) >= Date.parse(firstPage.data.accounts[0].deletedAt),
    true
  )
  assert.equal(
    Date.parse(secondPage.data.accounts[0].deletedAt) >= Date.parse(firstPage.data.accounts[1].deletedAt),
    true
  )

  const recoveryHtml = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries: first.data.accounts,
      sync: 'synced',
      listMeta: {
        page: first.data.page,
        totalPages: first.data.totalPages,
        total: first.data.total,
        shown: first.data.accounts.length,
        paged: true,
      },
      onLoadMore: () => {},
      onResume: () => {},
    })
  )
  assert.match(recoveryHtml, /Showing 2 of 3 accounts from the server/)
  assert.match(recoveryHtml, /Recovery still pending for a previously redacted professional account/)
  assert.match(recoveryHtml, /Recovery still pending for a locked customer account/)
  assert.match(recoveryHtml, /Load more to reach the older pending accounts/)

  const continuedHtml = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries: combined,
      sync: 'synced',
      listMeta: {
        page: second.data.page,
        totalPages: second.data.totalPages,
        total: second.data.total,
        shown: combined.length,
        paged: true,
      },
      onLoadMore: () => {},
      onResume: () => {},
    })
  )
  assert.match(continuedHtml, /Recovery still pending for a previously redacted professional account/)
  assert.match(continuedHtml, /Recovery still pending for a locked customer account/)
  assert.match(continuedHtml, /Cleanup still pending for an anonymized professional account/)

  const labels = {
    name: 'Name',
    username: 'Username',
    businessName: 'Business name',
    email: 'Email',
    phone: 'Phone',
    vat: 'VAT',
    website: 'Website',
    city: 'City',
    postalCode: 'Postal code',
    country: 'Country',
    timeZone: 'Time zone',
    customerType: 'Customer type',
  }
  const parties = wireFixture('party-booking-anonymized')
  const anonymizedCustomer = renderWithMessages(
    React.createElement(PartyCard, {
      title: 'Customer',
      party: parties.customer,
      role: 'customer',
      labels,
    })
  )
  assert.equal(parties.customer.address, null)
  assert.match(anonymizedCustomer, /Deleted user/)
  assert.doesNotMatch(anonymizedCustomer, /Brussels|1000|BE/)
  const liveProfessional = renderWithMessages(
    React.createElement(PartyCard, {
      title: 'Professional',
      party: parties.professional,
      role: 'professional',
      labels,
    })
  )
  assert.match(liveProfessional, /Nora Normal/)
  assert.match(liveProfessional, /Brussels/)
  assert.match(liveProfessional, /BE/)
})

test('settled legacy support sample carries the copied anon flags and hides the link', () => {
  const legacy = wireFixture('support-legacy-anonymized')
  assert.equal(legacy.legacy, true)
  assert.equal(legacy.meeting.legacy, true)
  assert.equal(legacy.meeting.meetingLink, null)
  assert.equal(legacy.meeting.linkActive, false)
  for (const party of [legacy.requester, legacy.user, legacy.userId]) {
    assert.equal(isAnonymizedIdentity(party), true)
    assert.equal(party.id, '665f1f77bcf86cd799439021')
  }
  const current = wireFixture('support-current-anonymized')
  assert.equal(current.legacy, false)
  assert.equal(current.ticketNumber, 'SUP-2026-000031')
  assert.equal(current.meeting.status, 'scheduled')
  for (const party of [current.requester, current.user, current.userId]) {
    assert.equal(isAnonymizedIdentity(party), true)
    assert.equal(party.email, undefined)
  }
  assert.equal(current.meeting.meetingLink, null)
  assert.equal(current.meeting.linkActive, false)
})


test('recovery section distinguishes loading, unavailable, successful empty and paged results', () => {
  const empty = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries: [],
      sync: 'synced',
      onResume: () => {},
    })
  )
  assert.equal(empty, '')

  const loading = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries: [],
      sync: 'loading',
      onResume: () => {},
    })
  )
  assert.match(loading, /Loading the server recovery list/)
  assert.match(loading, /another browser or session/)
  assert.doesNotMatch(loading, /could not be loaded/)

  const unavailable = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries: [],
      sync: 'unavailable',
      onRetry: () => {},
      onResume: () => {},
    })
  )
  assert.match(unavailable, /server recovery list could not be loaded/)
  assert.match(unavailable, /pending cleanup from another browser or session may not appear/)
  assert.match(unavailable, /Retry loading/)
  assert.doesNotMatch(unavailable, /Cleanup still pending for an anonymized/)
  assert.doesNotMatch(unavailable, /no cleanup is pending\./)

  const localRecord = {
    targetId: target.id,
    role: 'customer',
    state: 'status_unknown',
    identityRemoved: false,
    cleanup: {
      pendingFiles: 0,
      pendingCalendarReleases: 0,
      deletedFiles: 0,
      failedFiles: 0,
      completedAt: null,
      lastError: null,
    },
    source: 'session',
  }
  const unavailableWithLocal = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries: [localRecord],
      sync: 'unavailable',
      onRetry: () => {},
      onResume: () => {},
    })
  )
  assert.match(unavailableWithLocal, /entries below come from this browser session only/)
  assert.match(unavailableWithLocal, /outcome needs a status check/)

  const serverRecord = { ...localRecord, source: 'server' }
  const secondServerRecord = {
    ...serverRecord,
    targetId: '665f1f77bcf86cd799439012',
  }
  const paged = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries: [serverRecord, secondServerRecord],
      sync: 'synced',
      listMeta: { page: 1, totalPages: 3, total: 251, shown: 2, paged: true },
      onLoadMore: () => {},
      onResume: () => {},
    })
  )
  assert.match(paged, /Showing 2 of 251 accounts/)
  assert.match(paged, /Load more to reach the older pending accounts/)
  assert.match(paged, />Load more</)
  assert.doesNotMatch(paged, /does not expose further paging/)

  const cappedEmpty = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries: [],
      sync: 'synced',
      listMeta: { page: 1, totalPages: 3, total: 251, shown: 0, paged: true },
      onLoadMore: () => {},
      onResume: () => {},
    })
  )
  assert.match(cappedEmpty, /Showing 0 of 251 accounts/)
  assert.match(cappedEmpty, />Load more</)

  const staleTotal = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries: [serverRecord],
      sync: 'synced',
      listMeta: { page: 3, totalPages: 3, total: 4, shown: 1, paged: true },
      onResume: () => {},
    })
  )
  assert.match(staleTotal, /Reload the list to refresh the authoritative count/)

  const sessionFallback = {
    ...localRecord,
    targetId: '665f1f77bcf86cd799439013',
    source: 'session',
  }
  const mixedSources = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries: [serverRecord, sessionFallback],
      sync: 'synced',
      listMeta: { page: 1, totalPages: 2, total: 2, shown: 1, paged: true },
      onLoadMore: () => {},
      onResume: () => {},
    })
  )
  assert.match(mixedSources, /Showing 1 of 2 accounts from the server/)
  assert.match(mixedSources, /1 session-only recovery record is also shown/)
  assert.match(mixedSources, /not included in the server total of 2/)
  assert.doesNotMatch(mixedSources, /Showing 0 of 2/)

  const noPaging = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries: [serverRecord, secondServerRecord],
      sync: 'synced',
      listMeta: { page: 1, totalPages: 1, total: 251, shown: 2, paged: false },
      onResume: () => {},
    })
  )
  assert.match(noPaging, /does not expose further paging/)

  const loadMoreFailed = renderToStaticMarkup(
    React.createElement(AnonymizeCleanupRecovery, {
      entries: [serverRecord],
      sync: 'synced',
      listMeta: { page: 1, totalPages: 3, total: 251, shown: 1, paged: true },
      loadMoreError: 'Network unavailable',
      onLoadMore: () => {},
      onResume: () => {},
    })
  )
  assert.match(loadMoreFailed, /The next recovery page could not be loaded/)
  assert.match(loadMoreFailed, /Retry loading more/)
})
test('ANONYMIZE_INCOMPLETE keeps the direct tombstone details and requires a preview', async () => {
  const result = await executeAnonymizeAccount({
    userId: target.id,
    confirmation: 'ANONYMIZE',
    token: 'admin-token',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          success: false,
          msg: 'The account is locked, but cleanup did not finish.',
          code: 'ANONYMIZE_INCOMPLETE',
          data: {
            targetId: target.id,
            tombstoned: true,
            fullyAnonymized: false,
            retryable: true,
            previewPath: `/api/admin/users/${target.id}/anonymize/preview`,
          },
        }),
        { status: 500 }
      ),
  })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'ANONYMIZE_INCOMPLETE')
  assert.equal(result.error.recovery?.tombstoned, true)
  assert.equal(result.error.recovery?.fullyAnonymized, false)
  assert.equal(result.error.recovery?.retryable, true)
  assert.match(result.error.recovery?.previewPath || '', /anonymize\/preview$/)
  assert.equal(shouldCheckAnonymizeStatus(result.error), true)
})
test('list refresh failure copy distinguishes full success from pending cleanup', () => {
  const partial = fixture('partial-result')
  const full = {
    ...partial,
    outcome: 'anonymized',
    fullyAnonymized: true,
    cleanup: { ...partial.cleanup, pendingFiles: 0, pendingCalendarReleases: 0, failedFiles: 0, lastError: null },
  }
  assert.match(anonymizeRefreshFailureMessage(full), /account was anonymized/i)
  assert.match(anonymizeRefreshFailureMessage(full), /list could not be refreshed/i)
  assert.match(anonymizeRefreshFailureMessage(partial), /identity was removed/i)
  assert.match(anonymizeRefreshFailureMessage(partial), /cleanup is still pending/i)
  assert.doesNotMatch(anonymizeRefreshFailureMessage(partial), /account was anonymized/i)
})
test('already-anonymized with no pending cleanup counts as complete for list removal', () => {
  const partial = fixture('partial-result')
  const alreadyComplete = {
    ...partial,
    outcome: 'already_anonymized',
    fullyAnonymized: true,
    cleanup: { ...partial.cleanup, pendingFiles: 0, pendingCalendarReleases: 0, failedFiles: 0, lastError: null },
  }
  assert.equal(isAnonymizationComplete(alreadyComplete), true)
  assert.equal(isFullyAnonymizedResult(alreadyComplete), false)
  assert.equal(isAnonymizationComplete(partial), false)
})
test('legacy recovery preview hides the old target identity even without isAnonymized', () => {
  const legacy = {
    ...fixture('eligible-preview'),
    status: 'recovery_required',
    recoveryRequired: true,
    target: {
      ...fixture('eligible-preview').target,
      name: 'Old Legacy Name',
      email: 'old-legacy@example.com',
      isAnonymized: false,
      legacyAnonymized: true,
    },
    cleanup: { pendingFiles: 1, pendingCalendarReleases: 0, deletedFiles: 0, failedFiles: 1, completedAt: null, lastError: 'legacy cleanup unknown' },
  }
  const html = dialogHtml({ preview: legacy, confirmation: 'ANONYMIZE' })
  assert.match(html, /Deleted user/)
  assert.doesNotMatch(html, /Old Legacy Name|old-legacy@example\.com/)
  assert.match(html, /Retry anonymization/)
  assert.match(html, /This account is already anonymized/)
  assert.match(html, /identity was already removed, but the database or file cleanup/)
  assert.doesNotMatch(html, /will be removed from active use/)
})
