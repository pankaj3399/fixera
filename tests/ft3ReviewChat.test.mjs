import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hooks, loadComponent, findAll, common, ui, settle } from './reviewComponentHarness.mjs'

test('opening an older conversation keeps its selection through immediate refresh and polling', async () => {
  const previousWindow = globalThis.window
  const listeners = new Map()
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const state = hooks()
  const polls = []
  const older = { _id: 'older', type: 'support', status: 'active' }
  let page = [{ _id: 'recent', type: 'support', status: 'active' }]
  const List = () => null
  const Thread = () => null
  try {
    const Widget = loadComponent('../components/chat/ChatWidget.tsx', {
      ...common, react: state.api,
      '@/contexts/AuthContext': { useAuth: () => ({ user: { _id: 'user', role: 'professional' }, isAuthenticated: true, loading: false }) },
      '@/hooks/useChatPolling': { useChatPolling: (fn, _delay, active) => { if (active) polls.push(fn) } },
      '@/hooks/useSupportChatAccess': { useSupportChatAccess: () => ({ canWrite: true }) },
      '@/lib/support/chatAccess': {},
      '@/lib/anonymizedUsers': { isAnonymizedIdentity: () => false, conversationCounterparty: () => null, isConversationCounterpartyAnonymized: () => false },
      '@/components/chat/ChatList': { default: List, __esModule: true },
      '@/components/chat/ChatThread': { default: Thread, __esModule: true }, '@/components/chat/ChatComposer': ui,
      '@/lib/chatApi': { fetchConversations: async () => ({ conversations: page }), fetchConversationMessages: async () => ({ conversation: older, messages: [] }), markConversationAsRead: async () => {} },
      '@/lib/chatWidgetEvents': { CHAT_WIDGET_OPEN_EVENT: 'chat-open' },
      '@/lib/utils': { cn: () => '', getAuthToken: () => null },
      '@/lib/storageMigration': { getMigratedItem: () => null, removeMigratedItem() {} },
    })
    const render = () => { polls.length = 0; const tree = state.render(() => Widget()); state.flush(); return tree }
    render(); render()
    listeners.get('chat-open')({ detail: { conversationId: 'older' } })
    render(); await settle(); render(); await settle()
    let tree = render()
    const rows = () => state.values().find(v => Array.isArray(v) && v.some(c => c?._id === 'recent'))
    assert.equal(findAll(tree, node => node.type === Thread)[0]?.props.conversationId, 'older')
    assert.deepEqual(rows().map(c => c._id), ['older', 'recent'])
    // Polling must also merge the selected row; page updates win over cached data.
    page = [{ ...older, status: 'archived' }, ...page]
    await polls[0](); tree = render()
    assert.equal(rows().find(c => c._id === 'older').status, 'archived')
    assert.equal(rows().filter(c => c._id === 'older').length, 1)
    page = page.filter(c => c._id !== 'older')
    await polls[0](); tree = render()
    assert.equal(findAll(tree, node => node.type === Thread)[0]?.props.conversationId, 'older')
    assert.equal(rows().find(c => c._id === 'older').status, 'archived')
  } finally { state.unmount(); globalThis.window = previousWindow }
})

