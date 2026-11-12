import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hooks, loadComponent, findAll, textOf, common, settle } from './reviewComponentHarness.mjs'

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const response = data => ({ ok: true, json: async () => ({ success: true, data }) })

for (const staleFails of [false, true]) test(`admin reload ignores a stale same-conversation ${staleFails ? 'error' : 'response'}`, async () => {
  const previousWindow = globalThis.window
  globalThis.window = { setTimeout: () => 1, clearTimeout() {} }
  const state = hooks()
  const requests = [], errors = []
  const user = { role: 'admin' }
  const Page = loadComponent('../app/(pages)/admin/chat/page.tsx', {
    ...common, react: state.api,
    'next/navigation': { useRouter: () => ({ push() {}, replace() {} }), useSearchParams: () => new URLSearchParams('conversationId=c1') },
    '@/contexts/AuthContext': { useAuth: () => ({ user, loading: false }) },
    '@/lib/utils': { authFetch: url => {
      if (url.includes('conversations?')) return Promise.resolve(response({ items: [{ _id: 'c1', supportTargetUserId: { name: 'Selected row' } }], total: 1 }))
      const d = deferred(); requests.push({ ...d, messages: url.includes('/messages') }); return d.promise
    } },
    '@/lib/apiErrors': { getErrorMessage: e => e.message, messageFromApiBody: () => 'load failed' },
    '@/hooks/useChatPolling': { useChatPolling() {} },
    '@/hooks/useAdminUnreadCount': { setAdminActiveConversationId() {}, markAdminConversationSeen() {} },
    '@/lib/anonymizedUsers': { isAnonymizedIdentity: () => false },
    '@/components/admin/AdminSupportInfoPanel': { default: () => null },
    '@/lib/chat/closeNotice': { isChatClosedNotice: () => false, formatChatClosedAt: () => null },
    sonner: { toast: { error: message => errors.push(message) } },
  })
  const Inner = Page().props.children.type
  const render = () => { const tree = state.render(() => Inner()); state.flush(); return tree }
  const finish = (pair, text) => pair.forEach(r => r.resolve(response(r.messages
    ? { items: [{ _id: text, text, senderRole: 'system', createdAt: '2026-11-01' }] }
    : { _id: 'c1', type: 'support', status: 'active' })))
  try {
    render(); await settle(); let tree = render()
    assert.equal(requests.length, 2)
    findAll(tree, n => n.type === 'button' && textOf(n).includes('Selected row'))[0].props.onClick()
    render(); assert.equal(requests.length, 4)
    if (staleFails) requests.slice(0, 2).forEach(r => r.reject(new Error('stale failure')))
    else finish(requests.slice(0, 2), 'stale message')
    await settle(); tree = render()
    assert.doesNotMatch(textOf(tree), /stale message|stale failure/)
    assert.match(textOf(tree), /Loading conversation/ )
    assert.deepEqual(errors, [])
    finish(requests.slice(2), 'current message')
    await settle(); tree = render()
    assert.match(textOf(tree), /current message/)
    assert.doesNotMatch(textOf(tree), /stale message|stale failure/)
  } finally { state.unmount(); globalThis.window = previousWindow }
})
