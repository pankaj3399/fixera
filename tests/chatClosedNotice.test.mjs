import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

// The viewer's zone, fixed before any Date formatting. 00:35 UTC is 02:35 in
// Brussels on 29 Aug 2026 (CEST); the old notice showed "00:35 UTC".
process.env.TZ = 'Europe/Brussels'
register('./swc-loader.mjs', import.meta.url)

const React = (await import('react')).default
const { renderToStaticMarkup } = await import('react-dom/server')
const intl = await import('next-intl')
const { NextIntlClientProvider } = intl
const { loadComponent, ui } = await import('./reviewComponentHarness.mjs')
const { formatChatClosedAt, isChatClosedNotice, isChatClosedNoticeText } = await import('../lib/chat/closeNotice.ts')
const localeLib = await import('@/lib/i18n/useFormatLocale')
const currency = await import('@/contexts/CurrencyContext')

const chatMessages = (locale) => JSON.parse(readFileSync(new URL(`../messages/${locale}/chat.json`, import.meta.url), 'utf8'))
const closeMessage = {
  _id: 'm1', conversationId: 'c1', senderId: 'admin1', senderRole: 'system', messageType: 'text',
  text: 'Chat closed on 29 Aug 2026, 00:35 UTC', createdAt: '2026-08-29T00:35:00.000Z',
}

test('recognises only the backend close notice from the system sender', () => {
  assert.equal(isChatClosedNotice(closeMessage), true)
  assert.equal(isChatClosedNotice({ ...closeMessage, senderRole: 'customer' }), false)
  assert.equal(isChatClosedNoticeText('Chat closed tomorrow?'), false)
  assert.equal(formatChatClosedAt('not a date', 'en-GB'), null)
  assert.match(formatChatClosedAt(closeMessage.createdAt, 'en-GB'), /29 Aug 2026.*02:35/)
})

test('the chat thread shows the close notice translated and in the viewer local time', () => {
  const ChatThread = loadComponent('../components/chat/ChatThread.tsx', {
    react: React, 'next-intl': intl,
    'next/navigation': { useRouter: () => ({ push() {} }) },
    '@/lib/chat/closeNotice': { formatChatClosedAt, isChatClosedNotice },
    '@/lib/utils': { cn: (...c) => c.filter(Boolean).join(' '), getAuthToken: () => null },
    'lucide-react': ui,
    '@/lib/anonymizedUsers': { isAnonymizedIdentity: () => false, isRedactedPlaceholderText: () => false },
    '@/components/ui/button': ui, '@/components/ui/textarea': ui, '@/components/ui/dialog': ui,
    sonner: { toast: { error() {}, success() {} } },
    '@/lib/chatApi': { reportChatMessage: async () => {} },
    '@/lib/i18n/useErrorMessage': { useErrorMessage: () => (e) => String(e) },
    '@/contexts/CurrencyContext': currency,
    '@/lib/i18n/useFormatLocale': localeLib,
  })
  const render = (locale) => renderToStaticMarkup(
    React.createElement(NextIntlClientProvider, { locale, timeZone: 'Europe/Brussels', messages: { chat: chatMessages(locale) } },
      React.createElement(currency.CurrencyProvider, { initialCurrency: 'EUR', initialRates: { EUR: 1 }, refreshRates: false },
        React.createElement(ChatThread, { messages: [closeMessage], currentUserId: 'customer1', currentUserRole: 'customer', loading: false, conversationId: 'c1' }))))
  const nl = render('nl')
  assert.match(nl, /Chat gesloten op [^<]*2026[^<]*02:35/)
  assert.doesNotMatch(nl, /UTC/)
  const fr = render('fr')
  assert.match(fr, /Discussion fermée le [^<]*2026[^<]*02:35/)
  const en = render('en')
  assert.match(en, /Chat closed on [^<]*2026[^<]*02:35/)
  assert.doesNotMatch(en, /00:35 UTC/)
})

// Any participant could send "Chat closed on 1 Jan 2026, 00:00 UTC" and the
// other side's conversation list showed the translated "Chat closed" preview.
// The list now applies the thread's check: only the system message counts.
test('the conversation list shows the closed preview only for the system close notice', async () => {
  const ChatList = (await import('@/components/chat/ChatList')).default
  const spoof = 'Chat closed on 1 Jan 2026, 00:00 UTC'
  const conversation = (lastMessageSenderRole) => ({
    _id: 'c1', type: 'direct', initiatedBy: 'customer1', status: 'active', starredBy: [], archivedBy: [], labels: [],
    customerUnreadCount: 0, professionalUnreadCount: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    lastMessagePreview: spoof, lastMessageSenderId: 'customer1', lastMessageSenderRole,
    customerId: { _id: 'customer1', name: 'Customer One', email: 'customer@example.com' },
    professionalId: { _id: 'pro1', name: 'Pro One', email: 'pro@example.com' },
  })
  const render = (row) => renderToStaticMarkup(
    React.createElement(NextIntlClientProvider, { locale: 'nl', timeZone: 'UTC', messages: { chat: chatMessages('nl') } },
      React.createElement(currency.CurrencyProvider, { initialCurrency: 'EUR', initialRates: { EUR: 1 }, refreshRates: false },
        React.createElement(ChatList, {
          conversations: [row], selectedConversationId: null, currentUserRole: 'professional', currentUserId: 'pro1',
          filter: 'all', userLabels: [], onSelect() {}, onFilterChange() {}, onToggleStar() {}, onToggleArchive() {},
          onAddLabel() {}, onRemoveLabel() {},
        }))))
  for (const role of [undefined, 'customer', 'admin']) {
    const html = render(conversation(role))
    assert.match(html, /Chat closed on 1 Jan 2026, 00:00 UTC/, String(role))
    assert.doesNotMatch(html, /Chat gesloten/, String(role))
  }
  assert.match(render(conversation('system')), /Chat gesloten/)
})
