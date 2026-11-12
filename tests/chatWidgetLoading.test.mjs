import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hooks, loadComponent, findAll, common, ui, settle } from './reviewComponentHarness.mjs'

// FT3 #6: the floating widget (and a booking row's Chat button) stayed on the
// loading skeleton. The selection effect starts a busy load, then the message
// poll runs immediately on enable (as hooks/useChatPolling does) and supersedes
// it; the poll's result must also clear the loading state.
test('chat widget shows the selected conversation even when the first poll supersedes the initial load', async () => {
  const previousWindow = globalThis.window
  const listeners = new Map()
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const state = hooks()
  const conversation = { _id: 'c1', type: 'direct', status: 'active' }
  const message = { _id: 'm1', text: 'hello', senderId: 'pro' }
  let messageRequests = 0
  const Thread = () => null
  try {
    const Widget = loadComponent('../components/chat/ChatWidget.tsx', {
      ...common, react: state.api,
      '@/contexts/AuthContext': { useAuth: () => ({ user: { _id: 'user', role: 'customer' }, isAuthenticated: true, loading: false }) },
      // Same contract as the real hook: run once immediately when enabled.
      '@/hooks/useChatPolling': {
        useChatPolling: (fn, _delay, active, deps = []) => {
          state.api.useEffect(() => { if (active) void fn() }, [active, ...deps])
        },
      },
      '@/hooks/useSupportChatAccess': { useSupportChatAccess: () => ({ canWrite: true }) },
      '@/lib/support/chatAccess': {},
      '@/lib/anonymizedUsers': { isAnonymizedIdentity: () => false, conversationCounterparty: () => null, isConversationCounterpartyAnonymized: () => false },
      '@/components/chat/ChatList': { default: () => null, __esModule: true },
      '@/components/chat/ChatThread': { default: Thread, __esModule: true }, '@/components/chat/ChatComposer': ui,
      '@/lib/chatApi': {
        fetchConversations: async () => ({ conversations: [conversation] }),
        fetchConversationMessages: async () => { messageRequests += 1; await settle(); return { conversation, messages: [message] } },
        markConversationAsRead: async () => {},
        fetchProfessionalOptions: async () => ({ professionals: [] }),
      },
      '@/lib/chatWidgetEvents': { CHAT_WIDGET_OPEN_EVENT: 'chat-open' },
      '@/lib/utils': { cn: () => '', getAuthToken: () => null },
      '@/lib/storageMigration': { getMigratedItem: () => null, removeMigratedItem() {} },
    })
    const render = () => { const tree = state.render(() => Widget()); state.flush(); return tree }
    render(); render()
    listeners.get('chat-open')({ detail: { conversationId: 'c1' } })
    let tree
    for (let i = 0; i < 8; i += 1) { tree = render(); await settle() }
    tree = render()
    assert.ok(messageRequests >= 2, 'the immediate poll raced the initial load')
    const thread = findAll(tree, node => node.type === Thread)[0]
    assert.equal(thread?.props.conversationId, 'c1')
    assert.equal(thread.props.loading, false, 'the skeleton must clear once messages arrive')
    assert.deepEqual(thread.props.messages.map(m => m._id), ['m1'])
  } finally { state.unmount(); globalThis.window = previousWindow }
})
