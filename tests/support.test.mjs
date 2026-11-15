import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  SUPPORT_REASONS,
  buildSupportReasonOptions,
  supportReasonKey,
} from '../lib/support/reasons.ts'
import { resolveSupportChannels, adminSuppliesMeetingLink } from '../lib/support/channels.ts'
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_MEETING_LINK_MAX_LENGTH,
  isSafeSupportMeetingLink,
  isSafeSupportUrl,
  supportAttachmentMimeForName,
  validateSupportAttachment,
  validateSupportMeetingLink,
} from '../lib/support/validation.ts'
import {
  resolveAdminAreaLevel,
  canReadAdminArea,
  canWriteAdminArea,
} from '../lib/adminRbac.ts'
import { adminSupportItemMatchesFilters } from '../lib/support/adminFilters.ts'
import {
  resolveSupportChatWriteState,
  supportChatBlockReasonFromError,
} from '../lib/support/chatAccess.ts'
import { ApiRequestError } from '../lib/apiErrors.ts'
import { fromZonedTime } from 'date-fns-tz'
import {
  canAdminSetSupportMeetingLink,
  canCancelSupportMeeting,
  canCompleteSupportMeeting,
  canRescheduleSupportMeeting,
  supportMeetingJoinUrl,
  supportMeetingPhase,
} from '../lib/support/meetingState.ts'
import {
  addSupportDays,
  formatSupportTime,
  groupSupportSlotsByDate,
  supportDateWindow,
} from '../lib/support/dates.ts'
import {
  adminSupportMeetingPath,
  buildAdminSupportMeetingBody,
} from '../lib/support/meetingActions.ts'
import { supportCalendarDisplayEvents, supportCalendarWarning } from '../lib/support/calendar.ts'

const EXACT_REASONS = [
  ['booking', 'Booking'],
  ['project_creation', 'Project creation'],
  ['customer', 'Customer'],
  ['payment_payout', 'Payment / payout'],
  ['cancellation', 'Cancellation'],
  ['dispute', 'Dispute'],
  ['warranty_complaint', 'Warranty / complaint'],
  ['account_profile', 'Account / profile'],
  ['verification_documents', 'Verification / documents'],
  ['services_pricing', 'Services & pricing'],
  ['availability_service_area', 'Availability / service area'],
  ['technical_problem', 'Technical problem'],
  ['other', 'Other'],
]

test('support reasons expose the exact stable IDs and English labels', () => {
  assert.deepEqual(
    SUPPORT_REASONS.map((reason) => [reason.id, reason.label]),
    EXACT_REASONS,
  )
  assert.equal(new Set(SUPPORT_REASONS.map((reason) => reason.id)).size, 13)
  assert.equal(new Set(SUPPORT_REASONS.map((reason) => reason.key)).size, 13)
})

test('reason options keep canonical order, merge server labels and unknown future reasons', () => {
  const options = buildSupportReasonOptions([
    { id: 'booking', label: 'Booking (server)' },
    { id: 'future_reason', label: 'Future reason' },
  ])
  assert.equal(options.length, 14)
  assert.equal(options[0].id, 'booking')
  assert.equal(options[0].label, 'Booking (server)')
  assert.equal(options[12].id, 'other')
  assert.deepEqual(options[13], {
    id: 'future_reason',
    key: null,
    label: 'Future reason',
  })
  assert.equal(supportReasonKey('payment_payout'), 'paymentPayout')
  assert.equal(supportReasonKey('Technical problem'), 'technicalProblem')
  assert.equal(supportReasonKey('removed_reason'), null)
})

test('channel visibility keeps meeting history for owners and creation professional-only', () => {
  assert.deepEqual(resolveSupportChannels('customer'), {
    ticket: true,
    meeting: true,
    meetingCreation: false,
    chat: false,
  })
  assert.deepEqual(resolveSupportChannels('professional', null), {
    ticket: true,
    meeting: true,
    meetingCreation: true,
    chat: false,
  })
  assert.deepEqual(
    resolveSupportChannels('customer', { canPlanMeeting: true, canUseSupportChat: true }),
    { ticket: true, meeting: true, meetingCreation: false, chat: false },
  )
  assert.deepEqual(
    resolveSupportChannels('professional', {
      canCreateTicket: true,
      canPlanMeeting: true,
      canUseSupportChat: false,
      supportChatEnabled: true,
    }),
    { ticket: true, meeting: true, meetingCreation: true, chat: false },
  )
  assert.deepEqual(
    resolveSupportChannels('professional', {
      canPlanMeeting: true,
      meetingBookingAvailable: false,
    }),
    { ticket: true, meeting: true, meetingCreation: false, chat: false },
  )
  assert.deepEqual(
    resolveSupportChannels('professional', {
      canPlanMeeting: true,
      meetingBookingAvailable: true,
    }),
    { ticket: true, meeting: true, meetingCreation: true, chat: false },
  )
  assert.deepEqual(
    resolveSupportChannels('professional', { canPlanMeeting: true, canUseSupportChat: true }),
    { ticket: true, meeting: true, meetingCreation: true, chat: true },
  )
  assert.deepEqual(resolveSupportChannels('admin', { canPlanMeeting: true }), {
    ticket: false,
    meeting: false,
    meetingCreation: false,
    chat: false,
  })
  assert.equal(adminSuppliesMeetingLink(null), true)
  assert.equal(adminSuppliesMeetingLink({ meetingLinkMode: 'manual' }), true)
  assert.equal(adminSuppliesMeetingLink({ meetingLinkMode: 'provider' }), false)
  assert.equal(adminSuppliesMeetingLink({ meetingLinkSuppliedByAdmin: false }), false)
  assert.equal(adminSuppliesMeetingLink({ meetingLinkSuppliedByAdmin: true }), true)
})

test('attachment validation matches the 10 MB and rfqUpload file rules', () => {
  assert.equal(SUPPORT_ATTACHMENT_MAX_BYTES, 10 * 1024 * 1024)
  assert.equal(
    validateSupportAttachment({
      name: 'report.pdf',
      type: 'application/pdf',
      size: SUPPORT_ATTACHMENT_MAX_BYTES,
    }),
    null,
  )
  assert.equal(
    validateSupportAttachment({
      name: 'report.pdf',
      type: 'application/pdf',
      size: SUPPORT_ATTACHMENT_MAX_BYTES + 1,
    }),
    'size',
  )
  assert.equal(
    validateSupportAttachment({ name: 'payload.exe', type: 'application/zip', size: 50 }),
    'type',
  )
  // Allowed extension with an explicitly disallowed MIME must not pass.
  assert.equal(
    validateSupportAttachment({
      name: 'report.pdf',
      type: 'application/zip',
      size: 500,
    }),
    'type',
  )
  assert.equal(
    validateSupportAttachment({
      name: 'payload.exe',
      type: 'application/pdf',
      size: 500,
    }),
    'type',
  )
  assert.equal(
    validateSupportAttachment({ name: 'payload.exe', type: '', size: 500 }),
    'type',
  )
  assert.equal(
    validateSupportAttachment({
      name: 'unexpected.pdf',
      type: 'application/octet-stream',
      size: 500,
    }),
    'type',
  )
  // A browser can omit the MIME type; the extension is the only signal and the
  // server still validates magic bytes.
  assert.equal(
    validateSupportAttachment({ name: 'scan.docx', type: '', size: 500 }),
    null,
  )
  assert.equal(
    validateSupportAttachment({ name: 'forged.pdf', type: '', size: 500 }),
    null,
  )
  assert.equal(
    validateSupportAttachment({ name: 'no-extension', type: '', size: 500 }),
    'type',
  )
  assert.equal(
    validateSupportAttachment({ name: 'scan.docx', type: undefined, size: 500 }),
    null,
  )
  assert.equal(
    validateSupportAttachment({ name: 'photo.JPG', type: 'image/jpeg', size: 500 }),
    null,
  )
  assert.equal(
    validateSupportAttachment({ name: 'photo.jpg', type: 'image/jpg', size: 500 }),
    null,
  )
  assert.equal(
    validateSupportAttachment({ name: 'photo.webp', type: 'image/webp', size: 500 }),
    null,
  )
  assert.equal(validateSupportAttachment({ name: 'empty.pdf', type: 'application/pdf', size: 0 }), 'type')

  // The upload helper only fills a realistic missing type from the extension;
  // an explicit (wrong) MIME is never rewritten.
  assert.equal(supportAttachmentMimeForName('scan.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  assert.equal(supportAttachmentMimeForName('photo.JPG'), 'image/jpeg')
  assert.equal(supportAttachmentMimeForName('payload.exe'), null)
  const supportClient = readFileSync(new URL('../lib/support.ts', import.meta.url), 'utf8')
  assert.match(supportClient, /if \(file\.type \|\| !file\.name\) return file/)
  assert.match(supportClient, /supportAttachmentMimeForName\(file\.name\)/)
})

test('only absolute http(s) links are rendered as external URLs', () => {
  assert.equal(isSafeSupportUrl('https://example.test/file.pdf'), true)
  assert.equal(isSafeSupportUrl('http://localhost:4000/file.pdf'), true)
  assert.equal(isSafeSupportUrl('/relative/file.pdf'), false)
  assert.equal(isSafeSupportUrl('javascript:alert(1)'), false)
  assert.equal(isSafeSupportUrl(null), false)
})

test('slot grouping uses the viewer timezone across a DST change', () => {
  const slots = [
    { start: '2026-03-29T01:30:00.000Z', end: '2026-03-29T02:00:00.000Z' },
    { start: '2026-03-29T00:30:00.000Z', end: '2026-03-29T01:00:00.000Z' },
  ]
  const grouped = groupSupportSlotsByDate(slots, 'Europe/Brussels')
  assert.deepEqual([...grouped.keys()], ['2026-03-29'])
  assert.deepEqual(
    grouped.get('2026-03-29')?.map((slot) => slot.start),
    ['2026-03-29T00:30:00.000Z', '2026-03-29T01:30:00.000Z'],
  )
  assert.equal(formatSupportTime(slots[0].start, 'Europe/Brussels', 'en-GB'), '03:30')
})

test('date windows are inclusive local dates and never browser-UTC slices', () => {
  assert.equal(addSupportDays('2026-03-28', 1), '2026-03-29')
  assert.equal(addSupportDays('2026-10-31', 1), '2026-11-01')
  const window = supportDateWindow(
    'Europe/Brussels',
    3,
    new Date('2026-10-24T22:30:00.000Z'),
  )
  assert.equal(window.from, '2026-10-25')
  assert.equal(window.to, '2026-10-27')
  assert.deepEqual(window.dates, ['2026-10-25', '2026-10-26', '2026-10-27'])
})

test('a 31-date support window stays 31 calendar dates across spring and fall DST', () => {
  const zone = 'Europe/Brussels'

  const fall = supportDateWindow(zone, 31, new Date('2026-10-25T10:00:00.000Z'))
  assert.equal(fall.from, '2026-10-25')
  assert.equal(fall.to, '2026-11-24')
  assert.equal(fall.dates.length, 31)
  const fallStart = fromZonedTime(`${fall.from}T00:00:00`, zone)
  const fallEndExclusive = fromZonedTime(`${addSupportDays(fall.to, 1)}T00:00:00`, zone)
  // 31 calendar dates across the fall-back are 31d + 1h of absolute time.
  assert.equal(
    fallEndExclusive.getTime() - fallStart.getTime(),
    31 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000,
  )

  const spring = supportDateWindow(zone, 31, new Date('2026-03-01T10:00:00.000Z'))
  assert.equal(spring.from, '2026-03-01')
  assert.equal(spring.to, '2026-03-31')
  assert.equal(spring.dates.length, 31)
  const springStart = fromZonedTime(`${spring.from}T00:00:00`, zone)
  const springEndExclusive = fromZonedTime(`${addSupportDays(spring.to, 1)}T00:00:00`, zone)
  // Spring-forward is 31d - 1h; the backend range guard compares calendar days
  // so the documented 31-day window remains requestable.
  assert.equal(
    springEndExclusive.getTime() - springStart.getTime(),
    31 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000,
  )

  // The request contract is inclusive local dates; the last requested date is
  // the 31st date, not a blindly shortened 30th date.
  assert.equal(
    addSupportDays(fall.from, 30),
    fall.to,
  )
  assert.equal(supportDateWindow(zone, 99, new Date('2026-10-25T10:00:00.000Z')).dates.length, 31)
})

test('effective admin support access uses /me levels, overrides and legacy fallbacks', () => {
  const realMeSupportRead = {
    role: 'admin',
    adminRole: 'care',
    adminPermissions: ['dashboard.overview', 'bookings.read', 'bookings.write'],
    adminAccessLevels: {
      support: 'read',
      bookings: 'write',
      customers: 'write',
    },
    adminPermissionLevels: { support: 'read', bookings: 'write' },
    supportAccessLevel: 'read',
  }
  assert.equal(resolveAdminAreaLevel(realMeSupportRead, 'support'), 'read')
  assert.equal(canReadAdminArea(realMeSupportRead, 'support'), true)
  assert.equal(canWriteAdminArea(realMeSupportRead, 'support'), false)

  // Effective role-matrix levels alone (no persisted adminPermissionLevels)
  // must drive the support gate for read, none and write.
  const roleMatrixUser = (support) => ({
    role: 'admin',
    adminRole: 'care',
    adminPermissions: ['dashboard.overview', 'bookings.read'],
    adminAccessLevels: { support },
    supportAccessLevel: support,
  })
  assert.equal(resolveAdminAreaLevel(roleMatrixUser('read'), 'support'), 'read')
  assert.equal(canWriteAdminArea(roleMatrixUser('read'), 'support'), false)
  assert.equal(resolveAdminAreaLevel(roleMatrixUser('none'), 'support'), 'none')
  assert.equal(canReadAdminArea(roleMatrixUser('none'), 'support'), false)
  assert.equal(resolveAdminAreaLevel(roleMatrixUser('write'), 'support'), 'write')
  assert.equal(canWriteAdminArea(roleMatrixUser('write'), 'support'), true)

  // New /me wins even if a legacy payload disagrees.
  assert.equal(
    resolveAdminAreaLevel(
      {
        ...realMeSupportRead,
        adminAccessLevels: { support: 'none' },
        adminPermissionLevels: { support: 'write' },
        adminPermissions: ['support.tickets'],
      },
      'support',
    ),
    'none',
  )

  // Explicit persisted overrides (older backend without adminAccessLevels).
  assert.equal(
    resolveAdminAreaLevel(
      { role: 'admin', adminRole: 'care', adminPermissionLevels: { support: 'read' } },
      'support',
    ),
    'read',
  )
  assert.equal(
    resolveAdminAreaLevel(
      { role: 'admin', adminRole: 'care', adminPermissionLevels: { support: 'none' } },
      'support',
    ),
    'none',
  )
  assert.equal(
    resolveAdminAreaLevel(
      { role: 'admin', adminRole: 'care', adminPermissionLevels: { support: 'write' } },
      'support',
    ),
    'write',
  )
  // A populated matrix missing the area means no access, not the role default.
  assert.equal(
    resolveAdminAreaLevel(
      { role: 'admin', adminRole: 'care', adminPermissionLevels: { bookings: 'write' } },
      'support',
    ),
    'none',
  )

  // Legacy permission pack / role fallbacks.
  assert.equal(
    resolveAdminAreaLevel(
      { role: 'admin', adminRole: 'care', adminPermissions: ['support.tickets'] },
      'support',
    ),
    'write',
  )
  assert.equal(
    resolveAdminAreaLevel(
      { role: 'admin', adminRole: 'care', adminPermissions: ['bookings.read'] },
      'support',
    ),
    'none',
  )
  assert.equal(
    resolveAdminAreaLevel({ role: 'admin', adminRole: 'care' }, 'support'),
    'write',
  )
  assert.equal(
    resolveAdminAreaLevel({ role: 'admin', adminRole: 'finance' }, 'support'),
    'none',
  )
  assert.equal(
    resolveAdminAreaLevel(
      { role: 'admin', adminRole: 'super', adminAccessLevels: { support: 'none' } },
      'support',
    ),
    'write',
  )
  assert.equal(resolveAdminAreaLevel({ role: 'customer' }, 'support'), 'none')
  assert.equal(resolveAdminAreaLevel(null, 'support'), 'none')
})

test('auth session preserves additive effective admin access fields', () => {
  const auth = readFileSync(
    new URL('../contexts/AuthContext.tsx', import.meta.url),
    'utf8',
  )
  // `/api/auth/me` now returns these additive fields; the provider keeps the
  // whole server user object instead of rebuilding a partial profile.
  assert.match(auth, /adminAccessLevels\?:/)
  assert.match(auth, /adminPermissionLevels\?:/)
  assert.match(auth, /supportAccessLevel\?:/)
  assert.match(auth, /\/api\/auth\/me/)
  assert.match(auth, /return \{ status: 'ok', user: data\.user \}/)
  assert.match(auth, /setUser\(data\.user\)/)
})


test('admin inbox card matching mirrors the requested server filters', () => {
  const ticketOpen = {
    kind: 'ticket',
    status: 'open',
    ticketStatus: 'open',
    requesterRole: 'customer',
    reason: 'booking',
    booking: { _id: 'b1', id: 'b1', bookingNumber: 'BK-1' },
    meeting: null,
  }
  const meetingPending = {
    kind: 'meeting',
    status: 'pending',
    ticketStatus: 'open',
    requesterRole: 'professional',
    reason: 'payment_payout',
    booking: null,
    meeting: { status: 'pending', scheduledAt: '2026-11-04T08:30:00.000Z' },
  }
  const meetingScheduled = {
    ...meetingPending,
    status: 'scheduled',
    meeting: { status: 'scheduled', scheduledAt: '2026-11-04T08:30:00.000Z' },
  }
  const meetingCancelled = {
    ...meetingPending,
    status: 'cancelled',
    meeting: { status: 'cancelled', scheduledAt: '2026-11-04T08:30:00.000Z' },
  }

  assert.equal(adminSupportItemMatchesFilters(ticketOpen, { status: 'open' }), true)
  // Ticket lifecycle statuses never match meeting rows (scheduled meetings
  // keep ticketStatus=open internally).
  assert.equal(adminSupportItemMatchesFilters(meetingPending, { status: 'open' }), false)
  assert.equal(adminSupportItemMatchesFilters(meetingPending, { status: 'pending' }), true)
  assert.equal(adminSupportItemMatchesFilters(meetingPending, { status: 'scheduled' }), false)
  assert.equal(adminSupportItemMatchesFilters(meetingScheduled, { status: 'pending' }), false)
  assert.equal(adminSupportItemMatchesFilters(meetingScheduled, { status: 'scheduled' }), true)
  assert.equal(adminSupportItemMatchesFilters(meetingCancelled, { status: 'scheduled' }), false)
  assert.equal(adminSupportItemMatchesFilters(meetingScheduled, { kind: 'meeting' }), true)
  assert.equal(adminSupportItemMatchesFilters(meetingScheduled, { kind: 'ticket' }), false)
  assert.equal(adminSupportItemMatchesFilters(meetingScheduled, { meeting: 'with' }), true)
  assert.equal(adminSupportItemMatchesFilters(ticketOpen, { meeting: 'without' }), true)
  assert.equal(adminSupportItemMatchesFilters(meetingCancelled, { meeting: 'without' }), false)
  assert.equal(adminSupportItemMatchesFilters(ticketOpen, { booking: 'BK-1' }), true)
  assert.equal(adminSupportItemMatchesFilters(ticketOpen, { booking: 'other' }), false)
  assert.equal(adminSupportItemMatchesFilters(ticketOpen, { userType: 'professional' }), false)
  assert.equal(adminSupportItemMatchesFilters(meetingScheduled, { reason: 'payment_payout' }), true)
  assert.equal(adminSupportItemMatchesFilters(ticketOpen, { reason: 'payment_payout' }), false)
})

test('support chat writes are professional and flag gated, with fresh 403 handling', () => {
  const enabled = { canUseSupportChat: true, supportChatEnabled: true }
  assert.deepEqual(resolveSupportChatWriteState('customer', enabled), {
    canWrite: false,
    reason: 'role',
  })
  assert.deepEqual(resolveSupportChatWriteState('professional', enabled), {
    canWrite: true,
    reason: null,
  })
  assert.deepEqual(resolveSupportChatWriteState('professional', null), {
    canWrite: false,
    reason: 'unavailable',
  })
  assert.deepEqual(resolveSupportChatWriteState('professional', enabled, { loading: true }), {
    canWrite: false,
    reason: 'checking',
  })
  assert.deepEqual(
    resolveSupportChatWriteState('professional', { supportChatEnabled: false, canUseSupportChat: false }),
    { canWrite: false, reason: 'disabled' },
  )
  // An old capability payload must not keep an enabled composer after a 403.
  assert.deepEqual(resolveSupportChatWriteState('professional', enabled, { blockedReason: 'disabled' }), {
    canWrite: false,
    reason: 'blocked',
  })
  // A role-scoped 403 keeps the role notice instead of the generic one.
  assert.deepEqual(resolveSupportChatWriteState('professional', enabled, { blockedReason: 'role' }), {
    canWrite: false,
    reason: 'role',
  })

  assert.equal(
    supportChatBlockReasonFromError(
      new ApiRequestError('Forbidden', {
        status: 403,
        serverMessage: 'Support chat is only available for professionals.',
      }),
    ),
    'role',
  )
  assert.equal(
    supportChatBlockReasonFromError(
      new ApiRequestError('Forbidden', {
        status: 403,
        serverMessage: 'Support chat is currently disabled.',
      }),
    ),
    'disabled',
  )
  assert.equal(
    supportChatBlockReasonFromError(
      new ApiRequestError('Not found', { status: 404 }),
    ),
    null,
  )
})

test('user support client never calls private notes; admin notes stay on the admin path', () => {
  const source = readFileSync(new URL('../lib/support.ts', import.meta.url), 'utf8')
  const [userSection] = source.split('/* Admin')
  assert.ok(userSection.length > 0)
  assert.doesNotMatch(userSection, /\/notes/)
  assert.doesNotMatch(userSection, /internalNotes/)
  assert.match(source, /\/api\/admin\/support\/items\/\$\{kind\}\/\$\{encodeURIComponent\(id\)\}\/notes/)
  assert.match(source, /\/api\/admin\/support\/items\/\$\{kind\}\/\$\{encodeURIComponent\(id\)\}\/replies/)
})

test('admin manual meeting links accept only real credential-free HTTPS URLs', () => {
  assert.equal(validateSupportMeetingLink('https://meet.example.com/room'), null)
  assert.equal(validateSupportMeetingLink('https://meet.example.com/room?p=123'), null)
  assert.equal(validateSupportMeetingLink('  https://zoom.us/j/123  '), null)
  assert.equal(validateSupportMeetingLink(''), 'required')
  assert.equal(validateSupportMeetingLink('http://meet.example.com/room'), 'https')
  assert.equal(validateSupportMeetingLink('meet.example.com/room'), 'invalid')
  assert.equal(validateSupportMeetingLink('javascript:alert(1)'), 'https')
  assert.equal(validateSupportMeetingLink('https://user:pass@meet.example.com/room'), 'credentials')
  assert.equal(
    validateSupportMeetingLink(`https://meet.example.com/${'a'.repeat(SUPPORT_MEETING_LINK_MAX_LENGTH)}`),
    'length',
  )
  assert.equal(isSafeSupportMeetingLink('https://meet.example.com/room'), true)
  assert.equal(isSafeSupportMeetingLink('http://meet.example.com/room'), false)
})

test('manual meeting wire payload and endpoint match the backend contract', () => {
  assert.deepEqual(
    buildAdminSupportMeetingBody({
      action: 'set_link',
      meetingLink: 'https://meet.example.com/room',
    }),
    {
      meeting: {
        action: 'set_link',
        meetingLink: 'https://meet.example.com/room',
      },
    },
  )
  assert.equal(
    adminSupportMeetingPath('meeting', 'abc 123'),
    '/api/admin/support/items/meeting/abc%20123/meeting',
  )
  assert.deepEqual(buildAdminSupportMeetingBody({ action: 'reschedule', scheduledAt: '2026-11-05T09:00:00.000Z', timeZone: 'Europe/Brussels' }), {
    meeting: { action: 'reschedule', scheduledAt: '2026-11-05T09:00:00.000Z', timeZone: 'Europe/Brussels' },
  })
  assert.deepEqual(buildAdminSupportMeetingBody({ action: 'cancel', reason: 'Admin unavailable' }), {
    meeting: { action: 'cancel', reason: 'Admin unavailable' },
  })
  assert.deepEqual(buildAdminSupportMeetingBody({ action: 'complete' }), {
    meeting: { action: 'complete' },
  })
})

test('pending-link and scheduled meeting states stay honest', () => {
  const base = {
    legacy: false,
    scheduledAt: '2026-11-04T08:30:00.000Z',
    durationMinutes: 30,
    timeZone: 'Europe/Brussels',
    assignedAdminName: null,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    preferredTimes: null,
    adminResponse: null,
    endAt: '2026-11-04T09:00:00.000Z',
  }
  const pending = { ...base, status: 'pending', meetingLink: null, linkActive: false }
  const confirmed = {
    ...base,
    status: 'scheduled',
    meetingLink: 'https://meet.example.com/room',
    linkActive: true,
  }
  const scheduledWithoutLink = { ...base, status: 'scheduled', meetingLink: null, linkActive: false }
  const inactive = {
    ...base,
    status: 'scheduled',
    meetingLink: 'https://meet.example.com/room',
    linkActive: false,
  }

  assert.equal(supportMeetingPhase(pending), 'awaiting_link')
  assert.equal(supportMeetingPhase(confirmed), 'confirmed')
  assert.equal(supportMeetingPhase(scheduledWithoutLink), 'missing_link')
  assert.equal(supportMeetingPhase(inactive), 'missing_link')
  assert.equal(supportMeetingPhase({ ...pending, status: 'cancelled' }), 'cancelled')
  assert.equal(supportMeetingPhase({ ...pending, legacy: true }), 'legacy')

  assert.equal(supportMeetingJoinUrl(pending), null)
  assert.equal(supportMeetingJoinUrl(confirmed), 'https://meet.example.com/room')
  assert.equal(supportMeetingJoinUrl(inactive), null)
  assert.equal(supportMeetingJoinUrl(scheduledWithoutLink), null)
})

test('admin meeting-link and completion permissions mirror the server state', () => {
  const now = new Date('2026-10-25T12:00:00.000Z')
  const future = '2026-11-04T08:30:00.000Z'
  const past = '2026-10-20T08:30:00.000Z'
  const pending = { status: 'pending', meetingLink: null, linkActive: false, legacy: false, scheduledAt: future }
  const scheduled = {
    status: 'scheduled',
    meetingLink: 'https://meet.example.com/room',
    linkActive: true,
    legacy: false,
    scheduledAt: future,
  }
  const pendingPast = { ...pending, scheduledAt: past }
  const scheduledPast = { ...scheduled, scheduledAt: past }
  const legacy = { ...pending, legacy: true }

  assert.equal(canAdminSetSupportMeetingLink({ itemKind: 'meeting', meeting: pending, canWrite: true, now }), true)
  assert.equal(canAdminSetSupportMeetingLink({ itemKind: 'meeting', meeting: scheduled, canWrite: true, now }), true)
  assert.equal(canAdminSetSupportMeetingLink({ itemKind: 'meeting', meeting: pending, canWrite: false, now }), false)
  assert.equal(canAdminSetSupportMeetingLink({ itemKind: 'ticket', meeting: pending, canWrite: true, now }), false)
  assert.equal(canAdminSetSupportMeetingLink({ itemKind: 'meeting', meeting: pendingPast, canWrite: true, now }), false)
  assert.equal(canAdminSetSupportMeetingLink({ itemKind: 'meeting', meeting: legacy, canWrite: true, now }), false)

  assert.equal(canCompleteSupportMeeting(scheduled), true)
  assert.equal(canCompleteSupportMeeting(pending), false)
  assert.equal(canCompleteSupportMeeting({ ...scheduled, linkActive: false }), false)

  assert.equal(canCancelSupportMeeting({ meeting: pending, asAdmin: true, now }), true)
  assert.equal(canCancelSupportMeeting({ meeting: pendingPast, asAdmin: true, now }), true)
  assert.equal(canCancelSupportMeeting({ meeting: scheduledPast, asAdmin: true, now }), true)
  assert.equal(canCancelSupportMeeting({ meeting: scheduledPast, asAdmin: false, now }), false)
  assert.equal(canRescheduleSupportMeeting({ meeting: pendingPast, asAdmin: true, now }), true)
  assert.equal(canRescheduleSupportMeeting({ meeting: scheduledPast, asAdmin: true, now }), false)
})

test('provider-pending 503 UI and guidance are gone from the user meeting flow', () => {
  const panel = readFileSync(
    new URL('../components/support/SupportMeetingsPanel.tsx', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(panel, /SUPPORT_MEETING_LINK_UNAVAILABLE/)
  assert.doesNotMatch(panel, /providerUnavailable|providerNote|openTicket/)
  assert.match(panel, /awaitingLink/)
  assert.match(panel, /supportMeetingJoinUrl/)

  const admin = readFileSync(
    new URL('../components/admin/SupportInbox.tsx', import.meta.url),
    'utf8',
  )
  assert.match(admin, /set_link/)
  assert.match(admin, /validateSupportMeetingLink/)
  assert.match(admin, /already saved/)
  assert.match(admin, /email could not be sent/)
})

test('pending-meeting acknowledgement copy is truthful in all locales', () => {
  const en = JSON.parse(
    readFileSync(new URL('../messages/en/support.json', import.meta.url), 'utf8'),
  )
  const nl = JSON.parse(
    readFileSync(new URL('../messages/nl/support.json', import.meta.url), 'utf8'),
  )
  const fr = JSON.parse(
    readFileSync(new URL('../messages/fr/support.json', import.meta.url), 'utf8'),
  )
  for (const key of ['ackFailed', 'ackFailedGeneric', 'ackEmailSent', 'ackEmailFailed']) {
    assert.ok(en.meeting[key])
    assert.ok(nl.meeting[key])
    assert.ok(fr.meeting[key])
    assert.doesNotMatch(nl.meeting[key], /bevestigingsmail/i)
  }
  assert.match(nl.meeting.ackEmailSent, /ontvangstbevestiging/i)
  assert.match(nl.meeting.ackEmailSent, /vergaderlink volgt/i)
  assert.match(en.meeting.ackEmailSent, /acknowledgement/i)
  assert.match(fr.meeting.ackEmailSent, /accusé de réception/i)
  assert.doesNotMatch(en.meeting.ackEmailSent, /confirmed|meeting is confirmed/i)
  assert.doesNotMatch(fr.meeting.ackEmailSent, /confirmé/i)
})

test('owner meeting history is available without exposing customer creation or chat', () => {
  const center = readFileSync(
    new URL('../components/support/SupportCenter.tsx', import.meta.url),
    'utf8',
  )
  assert.match(center, /tabs\.meetingHistory/)
  assert.match(center, /canCreate=\{channels\.meetingCreation\}/)
  assert.match(center, /channels\.meetingCreation/)

  const panel = readFileSync(
    new URL('../components/support/SupportMeetingsPanel.tsx', import.meta.url),
    'utf8',
  )
  assert.match(panel, /canCreate = true/)
  assert.match(panel, /\{canCreate \?\s*\(/)
  assert.match(panel, /historyHint/)
  assert.match(panel, /cancelSupportMeeting/)
  assert.match(panel, /supportMeetingJoinUrl/)
})

test('admin reschedule picker sends the selected meeting and owner context', () => {
  const picker = readFileSync(
    new URL('../components/admin/AdminSupportSlotPicker.tsx', import.meta.url),
    'utf8',
  )
  assert.match(picker, /professionalId\?: string \| null/)
  assert.match(picker, /professionalId: professionalId \|\| undefined/)
  assert.match(picker, /excludeItemId: itemId/)
  assert.match(picker, /onSelect\(null\)/)
  assert.match(picker, /slots\.some\(\(slot\) => slot\.start === selected\.start\)/)

  const inbox = readFileSync(
    new URL('../components/admin/SupportInbox.tsx', import.meta.url),
    'utf8',
  )
  assert.match(inbox, /professionalId=\{ownerId\}/)
  assert.match(inbox, /itemId=\{item\._id \|\| item\.id\}/)

  const client = readFileSync(new URL('../lib/support.ts', import.meta.url), 'utf8')
  assert.match(client, /query\.set\("professionalId", params\.professionalId\)/)
})

test('support conversation write UI is capability gated on every chat surface', () => {
  const page = readFileSync(
    new URL('../app/[ctx]/(pages)/chat/page.tsx', import.meta.url),
    'utf8',
  )
  assert.match(page, /useSupportChatAccess/)
  assert.match(page, /isSupportReadOnly/)
  assert.match(page, /supportChatAccess\.blockFor/)
  assert.match(page, /supportReadOnlyNotice/)

  const widget = readFileSync(
    new URL('../components/chat/ChatWidget.tsx', import.meta.url),
    'utf8',
  )
  assert.match(widget, /useSupportChatAccess/)
  assert.match(widget, /isSupportReadOnly/)
  assert.match(widget, /supportChatAccess\.blockFor/)

  const panel = readFileSync(
    new URL('../components/support/SupportChatPanel.tsx', import.meta.url),
    'utf8',
  )
  assert.match(panel, /canWrite = true/)
  assert.match(panel, /writeBlocked/)
  assert.match(panel, /supportChatBlockReasonFromError/)
})

test('admin inbox reconciles filters and counts after a successful mutation', () => {
  const inbox = readFileSync(
    new URL('../components/admin/SupportInbox.tsx', import.meta.url),
    'utf8',
  )
  assert.match(inbox, /adminSupportItemMatchesFilters/)
  assert.match(inbox, /setReloadKey\(\(value\) => value \+ 1\)/)
  assert.match(inbox, /result\.pagination\.totalPages < page/)
  assert.match(inbox, /setPage\(Math\.max\(1, result\.pagination\.totalPages\)\)/)
  assert.match(inbox, /canWrite=\{canWriteSupport\}/)
  assert.match(inbox, /supportAccess === "read"/)
})

test('set-link feedback survives a filtered-out row and keeps an email retry', () => {
  const inbox = readFileSync(
    new URL('../components/admin/SupportInbox.tsx', import.meta.url),
    'utf8',
  )
  // The row is removed before the inline notice could render, so the parent
  // owns the persistent outcome and retry for the same saved link.
  assert.match(inbox, /const stillVisible = onUpdated\(result\.item\)/)
  assert.match(inbox, /onLinkPersisted\(/)
  assert.match(inbox, /setDroppedLinkNotice/)
  assert.match(inbox, /droppedLinkNotice\.meetingLink/)
  assert.match(inbox, /adminSetSupportMeetingLink\(\s*droppedLinkNotice\.kind/)
  assert.match(inbox, /Retry email/)
  assert.match(inbox, /Meeting link saved, but the email could not be sent\./)
  assert.match(inbox, /It no longer matches the current filter/)
  assert.match(inbox, /Show scheduled items/)
  assert.match(inbox, /Reschedule the same time again to retry the email\./)
})

test('calendar consumers surface support feed failures instead of hiding them', () => {
  const admin = readFileSync(
    new URL('../components/AdminAvailability.tsx', import.meta.url),
    'utf8',
  )
  assert.match(admin, /supportDateWindow\(resolvedTimeZone, 31\)/)
  assert.match(admin, /setSupportEventsError/)
  assert.match(admin, /supportCalendarWarning/)
  // The warning is now localized through the calendar namespace.
  assert.match(admin, /availabilityCalendar\.supportMeetingsLoadFailed/)

  const profile = readFileSync(
    new URL('../app/[ctx]/(pages)/profile/page.tsx', import.meta.url),
    'utf8',
  )
  assert.match(profile, /supportDateWindow\(timeZone, 31\)/)
  assert.match(profile, /setSupportMeetingEventsError/)
  assert.match(profile, /supportCalendarWarning/)
  assert.match(profile, /supportEventsFailed/)
})

test('calendar failure warnings print one heading plus a distinct safe detail', () => {
  const heading = 'Support meetings could not be loaded, so this calendar may be incomplete.'
  assert.equal(supportCalendarWarning(heading, heading), heading)
  assert.equal(supportCalendarWarning(heading, `  ${heading}  `), heading)
  assert.equal(supportCalendarWarning(heading, null), heading)
  assert.equal(supportCalendarWarning(heading, '   '), heading)
  assert.equal(
    supportCalendarWarning(heading, 'You appear to be offline. Check your internet connection.'),
    `${heading} You appear to be offline. Check your internet connection.`,
  )
})

test('calendar feed shows reserved pending and scheduled support meetings only', () => {
  const event = (overrides = {}) => ({
    source: 'support',
    kind: 'meeting',
    id: 'a',
    ticketNumber: 'SUP-2026-000001',
    subject: 'Support meeting',
    status: 'pending',
    ticketStatus: 'open',
    start: '2026-11-04T08:30:00.000Z',
    end: '2026-11-04T09:00:00.000Z',
    localStart: '2026-11-04T09:30:00.000+01:00',
    localEnd: '2026-11-04T10:00:00.000+01:00',
    displayTimeZone: 'Europe/Brussels',
    timeZone: 'Europe/Brussels',
    durationMinutes: 30,
    meetingLink: null,
    legacy: false,
    admin: { id: 'admin-1', name: 'Admin' },
    ...overrides,
  })

  const events = supportCalendarDisplayEvents([
    event({ id: 'pending' }),
    event({ id: 'scheduled', status: 'scheduled', meetingLink: 'https://meet.example.com/room' }),
    event({ id: 'cancelled', status: 'cancelled' }),
    event({ id: 'completed', status: 'completed' }),
    event({ id: 'other-admin', admin: { id: 'admin-2', name: 'Other' } }),
    event({ id: 'invalid', end: '2026-11-04T08:00:00.000Z' }),
  ])
  assert.deepEqual(
    events.map((item) => [item.id, item.status, item.pending]),
    [
      ['other-admin', 'pending', true],
      ['pending', 'pending', true],
      ['scheduled', 'scheduled', false],
    ],
  )
  assert.equal(events[0].ticketNumber, 'SUP-2026-000001')

  const adminEvents = supportCalendarDisplayEvents(
    [event({ id: 'mine' }), event({ id: 'theirs', admin: { id: 'admin-2', name: 'Other' } })],
    { assignedAdminId: 'admin-1' },
  )
  assert.deepEqual(adminEvents.map((item) => item.id), ['mine'])
})
