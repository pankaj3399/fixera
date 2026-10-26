#!/usr/bin/env node
// Generate the admin-anonymize wire fixtures from the real backend handlers.
//
// The script seeds a disposable, explicitly local test database with ordinary
// strict Mongoose documents and then calls the exported handlers that serve the
// routes the frontend consumes:
//
//   adminAnonymizePreview / adminAnonymizeRecoveryList  (GET preview, recovery)
//   adminGetSupportItem                                (GET support item)
//   getAdminBookingDetail                              (GET admin booking)
//
// It never calls a route-level server, Stripe, S3, Brevo, Odoo, or mail. Outbound
// HTTP/fetch and S3 sends are denied before the handler modules are imported.
//
// Usage (from the frontend repository):
//
//   FIXERA_TEST_MONGODB_URI=mongodb://127.0.0.1:27147/fixera_admin_wire_fixtures_test \
//     ../fixera-server/node_modules/.bin/tsx \
//     tests/fixtures/adminAnonymize/wire/generate-wire-fixtures.mjs
//
// The URI must point at localhost and its database must be named
// fixera_admin_wire_fixtures_test. The generator drops only that database.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { writeFile, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import http from 'node:http'
import https from 'node:https'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = path.resolve(HERE, '../../../..')
const SERVER_ROOT = path.resolve(process.env.FIXERA_SERVER_DIR || path.join(FRONTEND_ROOT, '..', 'fixera-server'))
const OUT_DIR = path.resolve(process.env.FIXERA_WIRE_OUT_DIR || HERE)
const EXPECTED_DB = 'fixera_admin_wire_fixtures_test'

const fail = (message) => {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
  throw new Error(message)
}

const testUri = process.env.FIXERA_TEST_MONGODB_URI
if (!testUri) {
  fail('FIXERA_TEST_MONGODB_URI is required (localhost disposable test database only)')
}
let parsed
try {
  parsed = new URL(testUri)
} catch {
  fail('FIXERA_TEST_MONGODB_URI is not a valid URI')
}
if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
  fail('FIXERA_TEST_MONGODB_URI must use mongodb: or mongodb+srv:')
}
const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
if (!localHosts.has(parsed.hostname)) {
  fail(`Refusing non-local MongoDB host ${parsed.hostname}`)
}
if (parsed.protocol !== 'mongodb:') {
  fail('Use an explicit mongodb:// URI for the disposable local container')
}
const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('?')[0])
if (dbName !== EXPECTED_DB) {
  fail(`Refusing database "${dbName || '(none)'}"; expected ${EXPECTED_DB}`)
}
if (!/test/i.test(dbName)) {
  fail('The disposable database name must contain "test"')
}

if (process.env.MONGODB_URI && process.env.MONGODB_URI !== testUri) {
  console.error('IGNORING pre-set MONGODB_URI; using FIXERA_TEST_MONGODB_URI')
}
if (process.env.MONGO_URI && process.env.MONGO_URI !== testUri) {
  console.error('IGNORING pre-set MONGO_URI; using FIXERA_TEST_MONGODB_URI')
}

// dotenv.config() in the backend resolves from the current working directory.
// Run from a scratch directory so the backend .env is never read.
const scratch = path.join(tmpdir(), `fixera-wire-fixtures-${process.pid}`)
mkdirSync(scratch, { recursive: true })
process.chdir(scratch)

Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: testUri,
  JWT_SECRET: 'wire-fixtures-local-secret',
  STRIPE_SECRET_KEY: 'sk_test_wire_fixtures_local',
  STRIPE_WEBHOOK_SECRET: 'whsec_wire_fixtures_local',
  S3_BUCKET_NAME: 'fixera-wire-fixtures-local',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'wire-fixtures-local-key',
  AWS_SECRET_ACCESS_KEY: 'wire-fixtures-local-secret',
  BREVO_API_KEY: 'wire-fixtures-local-brevo',
  ODOO_API_URL: 'https://odoo.invalid',
  ODOO_API_KEY: 'wire-fixtures-local-odoo',
  ODOO_COMPANY_ID: 'wire-fixtures-local-company',
  FIXERA_WIRE_FIXTURES: '1',
})
delete process.env.NODE_OPTIONS

const deniedNetwork = []
const deny = (kind, target) => {
  deniedNetwork.push({ kind, target: String(target) })
  const error = new Error(`EXTERNAL_NETWORK_DENIED (${kind}) ${String(target)}`)
  error.code = 'EXTERNAL_NETWORK_DENIED'
  throw error
}
const originalHttpRequest = http.request
const originalHttpGet = http.get
const originalHttpsRequest = https.request
const originalHttpsGet = https.get
const denyHttp = () => function deniedHttpRequest(...args) {
  const first = args[0]
  const target = typeof first === 'string'
    ? first
    : first && typeof first === 'object'
      ? `${first.hostname || first.host || '?'}:${first.port || '?'}${first.path || ''}`
      : '?'
  return deny('http', target)
}
http.request = denyHttp(originalHttpRequest)
http.get = denyHttp(originalHttpGet)
https.request = denyHttp(originalHttpsRequest)
https.get = denyHttp(originalHttpsGet)
globalThis.fetch = async (input) => deny('fetch', input?.url || input)

const requireFromServer = createRequire(path.join(SERVER_ROOT, 'package.json'))
const mongoose = requireFromServer('mongoose')
const s3Module = requireFromServer('@aws-sdk/client-s3')
if (s3Module?.S3Client?.prototype?.send) {
  s3Module.S3Client.prototype.send = function deniedS3Send(command) {
    return deny('s3', command?.constructor?.name || 'S3Command')
  }
}

const importServer = async (relative) => {
  const absolute = path.join(SERVER_ROOT, relative)
  const imported = await import(pathToFileURL(absolute).href)
  return imported.default ?? imported
}

const load = async () => {
  const [
    User,
    AccountDataGuard,
    SupportTicket,
    MeetingRequest,
    Booking,
    { adminAnonymizePreview, adminAnonymizeRecoveryList },
    { adminGetSupportItem },
    { getAdminBookingDetail },
  ] = await Promise.all([
    importServer('src/models/user.ts'),
    importServer('src/models/accountDataGuard.ts'),
    importServer('src/models/supportTicket.ts'),
    importServer('src/models/meetingRequest.ts'),
    importServer('src/models/booking.ts'),
    importServer('src/handlers/Admin/userAnonymize.ts'),
    importServer('src/handlers/Admin/supportItems.ts'),
    importServer('src/handlers/Admin/bookingDetail.ts'),
  ])
  return {
    User,
    AccountDataGuard,
    SupportTicket,
    MeetingRequest,
    Booking,
    adminAnonymizePreview,
    adminAnonymizeRecoveryList,
    adminGetSupportItem,
    getAdminBookingDetail,
  }
}

const ID = {
  admin: '665f1f77bcf86cd799439000',
  partial: '665f1f77bcf86cd799439014',
  tombstone: '665f1f77bcf86cd799439016',
  legacy: '665f1f77bcf86cd799439017',
  currentSupportTarget: '665f1f77bcf86cd799439021',
  liveProfessional: '665f1f77bcf86cd799439022',
  currentTicket: '665f1f77bcf86cd799439031',
  legacyMeeting: '665f1f77bcf86cd799439032',
  booking: '665f1f77bcf86cd799439041',
  calendarSource: '665f1f77bcf86cd799439051',
}

const T = {
  partialStarted: '2026-10-26T12:00:00.000Z',
  tombstoneDeleted: '2026-10-25T12:00:00.000Z',
  legacyDeleted: '2025-01-01T00:00:00.000Z',
  supportCreated: '2026-10-20T10:00:00.000Z',
  meetingAt: '2026-11-02T10:00:00.000Z',
  bookingCreated: '2026-10-01T08:00:00.000Z',
}

const password = 'wire-fixture-pass-123'

const createFixed = async (Model, doc) => {
  const instance = new Model(doc)
  await instance.save({ timestamps: false })
  return instance
}

const seed = async (models) => {
  const {
    User,
    AccountDataGuard,
    SupportTicket,
    MeetingRequest,
    Booking,
  } = models

  await createFixed(User, {
    _id: ID.admin,
    name: 'Super Admin',
    email: 'super@example.com',
    phone: '+32 400 00 00 00',
    password,
    role: 'admin',
    adminRole: 'super',
    isEmailVerified: true,
    accountStatus: 'active',
    createdAt: T.supportCreated,
    updatedAt: T.supportCreated,
  })

  await createFixed(User, {
    _id: ID.partial,
    name: '[deleted user]',
    email: `deleted-${ID.partial}@anon.local`,
    phone: `DELETED-${ID.partial}`,
    password,
    role: 'professional',
    professionalStatus: 'approved',
    accountStatus: 'rejected',
    isAnonymized: true,
    anonymizedAt: T.partialStarted,
    deletedAt: T.partialStarted,
    createdAt: T.partialStarted,
    updatedAt: T.partialStarted,
  })

  await createFixed(AccountDataGuard, {
    _id: ID.partial,
    state: 'anonymizing',
    writeFenceVersion: 1,
    startedAt: T.partialStarted,
    externalCleanup: {
      pendingKeys: [
        `support-attachments/${ID.partial}/fixture-pending-1.pdf`,
        `support-attachments/${ID.partial}/fixture-pending-2.pdf`,
      ],
      pendingCalendarReleases: [
        { sourceType: 'support_ticket', sourceId: ID.calendarSource },
      ],
      attempts: 1,
      lastAttemptAt: T.partialStarted,
      lastError: 'Could not delete 2 stored files. A repeated request will retry them.',
    },
    createdAt: T.partialStarted,
    updatedAt: T.partialStarted,
  })

  await createFixed(User, {
    _id: ID.tombstone,
    name: 'Tombstone Customer',
    email: `tombstone-${ID.tombstone}@example.com`,
    phone: '+32 400 00 00 16',
    password,
    role: 'customer',
    customerType: 'individual',
    accountStatus: 'active',
    isAnonymized: false,
    deletedAt: T.tombstoneDeleted,
    location: {
      type: 'Point',
      coordinates: [4.35, 50.85],
      address: 'Fixture Street 1',
      city: 'Brussels',
      postalCode: '1000',
      country: 'BE',
    },
    createdAt: T.tombstoneDeleted,
    updatedAt: T.tombstoneDeleted,
  })

  await createFixed(User, {
    _id: ID.legacy,
    name: '[deleted user]',
    email: `deleted-${ID.legacy}@anon.local`,
    phone: `DELETED-${ID.legacy}`,
    password,
    role: 'professional',
    professionalStatus: 'approved',
    accountStatus: 'rejected',
    isAnonymized: false,
    deletedAt: T.legacyDeleted,
    createdAt: T.legacyDeleted,
    updatedAt: T.legacyDeleted,
  })

  await createFixed(User, {
    _id: ID.currentSupportTarget,
    name: '[deleted user]',
    email: `deleted-${ID.currentSupportTarget}@anon.local`,
    phone: `DELETED-${ID.currentSupportTarget}`,
    password,
    role: 'professional',
    professionalStatus: 'approved',
    accountStatus: 'rejected',
    isAnonymized: true,
    anonymizedAt: T.supportCreated,
    deletedAt: T.supportCreated,
    createdAt: T.supportCreated,
    updatedAt: T.supportCreated,
  })

  await createFixed(User, {
    _id: ID.liveProfessional,
    name: 'Nora Normal',
    username: 'nora',
    email: 'nora@example.com',
    phone: '+32 470 00 00 00',
    password,
    role: 'professional',
    professionalStatus: 'approved',
    vatNumber: 'BE0123456789',
    timeZone: 'Europe/Brussels',
    businessInfo: {
      companyName: 'Live Company',
      website: 'https://live.example.com',
      address: 'Live Street 1',
      city: 'Brussels',
      country: 'BE',
      postalCode: '1000',
      timezone: 'Europe/Brussels',
    },
    location: {
      type: 'Point',
      coordinates: [4.35, 50.85],
      address: 'Live Street 1',
      city: 'Brussels',
      postalCode: '1000',
      country: 'BE',
    },
    createdAt: T.bookingCreated,
    updatedAt: T.bookingCreated,
  })

  await createFixed(SupportTicket, {
    _id: ID.currentTicket,
    userId: ID.currentSupportTarget,
    ticketNumber: 'SUP-2026-000031',
    kind: 'meeting',
    subject: 'Private support subject',
    description: 'Private support description',
    reason: 'other',
    userType: 'professional',
    locale: 'en',
    status: 'open',
    replies: [],
    meeting: {
      status: 'scheduled',
      scheduledAt: T.meetingAt,
      durationMinutes: 30,
      timeZone: 'Europe/Brussels',
      adminId: ID.admin,
      meetingLink: 'https://meet.example.com/fixture-should-not-leak',
      linkAddedAt: T.supportCreated,
      linkUpdatedAt: T.supportCreated,
      revision: 1,
    },
    createdAt: T.supportCreated,
    updatedAt: T.supportCreated,
  })

  await createFixed(MeetingRequest, {
    _id: ID.legacyMeeting,
    userId: ID.currentSupportTarget,
    topic: 'Private historical meeting request',
    preferredTimes: 'Weekdays after 17:00',
    durationMinutes: 30,
    status: 'scheduled',
    scheduledAt: T.meetingAt,
    adminResponse: 'Scheduled by support.',
    createdAt: T.supportCreated,
    updatedAt: T.supportCreated,
  })

  await createFixed(Booking, {
    _id: ID.booking,
    bookingNumber: 'BK-WIRE-0001',
    bookingType: 'professional',
    customer: ID.tombstone,
    professional: ID.liveProfessional,
    status: 'completed',
    rfqData: {
      serviceType: 'Bathroom renovation',
      description: 'Fixture booking used for the booking-details parties DTO.',
    },
    quote: {
      amount: 100,
      currency: 'EUR',
      description: 'Fixture booking',
      submittedAt: T.bookingCreated,
      submittedBy: ID.liveProfessional,
    },
    payment: {
      amount: 100,
      currency: 'EUR',
      status: 'completed',
      netAmount: 100,
      vatAmount: 21,
      totalWithVat: 121,
    },
    location: {
      type: 'Point',
      coordinates: [4.35, 50.85],
      address: 'Fixture Street 1',
      city: 'Brussels',
      postalCode: '1000',
      country: 'BE',
    },
    vatDecision: {
      action: 'standard_rate',
      standardRate: 21,
      appliedRate: 21,
      country: 'BE',
    },
    statusHistory: [{
      status: 'completed',
      timestamp: T.bookingCreated,
      updatedBy: ID.liveProfessional,
      note: 'Fixture booking created',
    }],
    createdAt: T.bookingCreated,
    updatedAt: T.bookingCreated,
  })
}

const makeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
    send(body) {
      this.body = body
      return this
    },
    setHeader() {},
    getHeader() {},
  }
  return res
}

const callHandler = (handler, req) => {
  const res = makeRes()
  return Promise.resolve(handler(req, res)).then(() => res)
}

const assertOk = (label, response) => {
  if (response.statusCode !== 200) {
    fail(`${label} returned HTTP ${response.statusCode}: ${JSON.stringify(response.body)}`)
  }
  if (!response.body?.success) {
    fail(`${label} did not return success: ${JSON.stringify(response.body)}`)
  }
  return response.body
}

const writeJson = async (name, value) => {
  await writeFile(path.join(OUT_DIR, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const sha256 = async (relative) => {
  const content = await readFile(path.join(SERVER_ROOT, relative))
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

const git = (root, args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8',
}).trim()

const revision = (root) => {
  try {
    return {
      head: git(root, ['rev-parse', 'HEAD']),
      branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
      dirty: Boolean(git(root, ['status', '--porcelain'])),
    }
  } catch {
    return null
  }
}

const main = async () => {
  console.log(`server         ${SERVER_ROOT}`)
  console.log(`database       ${testUri}`)
  console.log(`output         ${OUT_DIR}`)

  await mongoose.connect(testUri, { serverSelectionTimeoutMS: 10000 })
  const models = await load()
  if (mongoose.connection.readyState !== 1) fail('Mongoose is not connected')
  await mongoose.connection.dropDatabase()
  await seed(models)

  const admin = await models.User.findById(ID.admin).lean()
  if (!admin) fail('admin fixture not persisted')

  const previewPartial = assertOk(
    'preview partial',
    await callHandler(models.adminAnonymizePreview, {
      params: { userId: ID.partial },
      query: {},
      body: {},
      admin,
    }),
  )
  const previewTombstone = assertOk(
    'preview bare tombstone',
    await callHandler(models.adminAnonymizePreview, {
      params: { userId: ID.tombstone },
      query: {},
      body: {},
      admin,
    }),
  )

  const page1 = assertOk(
    'recovery page 1',
    await callHandler(models.adminAnonymizeRecoveryList, {
      params: {},
      query: { page: '1', limit: '2' },
      body: {},
      admin,
    }),
  )
  const page2 = assertOk(
    'recovery page 2',
    await callHandler(models.adminAnonymizeRecoveryList, {
      params: {},
      query: { page: '2', limit: '2' },
      body: {},
      admin,
    }),
  )

  const supportCurrent = assertOk(
    'support current ticket',
    await callHandler(models.adminGetSupportItem, {
      params: { kind: 'meeting', id: ID.currentTicket },
      query: {},
      body: {},
      admin,
    }),
  )
  const supportLegacy = assertOk(
    'support legacy meeting request',
    await callHandler(models.adminGetSupportItem, {
      params: { kind: 'meeting', id: ID.legacyMeeting },
      query: {},
      body: {},
      admin,
    }),
  )

  const bookingResponse = assertOk(
    'admin booking detail',
    await callHandler(models.getAdminBookingDetail, {
      params: { id: ID.booking },
      query: {},
      body: {},
      admin,
      user: admin,
    }),
  )
  const parties = bookingResponse.data?.details?.parties
  if (!parties) fail('admin booking detail did not return data.details.parties')

  const p1 = page1.data
  const p2 = page2.data
  const combined = [...p1.accounts, ...p2.accounts]
  const combinedIds = combined.map((account) => account.targetId)
  const expectedIds = [ID.legacy, ID.tombstone, ID.partial]
  const legacyPresent = combinedIds.includes(ID.legacy)
  const orderOk = combinedIds.length === expectedIds.length
    && combinedIds.every((id, index) => id === expectedIds[index])
  const dateOrderOk = combined.every((account, index) =>
    index === 0
    || new Date(combined[index - 1].deletedAt).getTime() <= new Date(account.deletedAt).getTime())
  const pagingOk = p1.total === 3
    && p1.page === 1
    && p1.limit === 2
    && p1.totalPages === 2
    && p1.accounts.length === 2
    && p2.total === 3
    && p2.page === 2
    && p2.limit === 2
    && p2.totalPages === 2
    && p2.accounts.length === 1
    && new Set(combinedIds).size === combinedIds.length

  // The preview cleanup count is a handler invariant, not a sample choice.
  if (previewPartial.data.cleanup.deletedFiles !== 0) {
    fail(`preview partial cleanup.deletedFiles must be 0, got ${previewPartial.data.cleanup.deletedFiles}`)
  }
  if (!previewPartial.data.target.identityRemoved || previewPartial.data.target.legacyAnonymized) {
    fail('preview partial target provenance is not an already-redacted non-legacy account')
  }
  if (previewTombstone.data.target.identityRemoved !== false || previewTombstone.data.cleanup.deletedFiles !== 0) {
    fail('preview bare tombstone did not report incomplete identity redaction')
  }

  await writeJson('preview-partial-cleanup', previewPartial)
  await writeJson('preview-bare-tombstone', previewTombstone)
  await writeJson('support-current-anonymized', supportCurrent.data)
  await writeJson('support-legacy-anonymized', supportLegacy.data)
  await writeJson('party-booking-anonymized', parties)

  if (!legacyPresent) {
    console.error('PENDING_BACKEND_LEGACY_GATE: listRecoverableAnonymizations did not include the redacted-without-ledger legacy account')
    console.error(`  actual total=${p1.total} page1=[${p1.accounts.map((a) => a.targetId).join(',')}] page2=[${p2.accounts.map((a) => a.targetId).join(',')}]`)
    console.error('  Recovery page fixtures were not rewritten; fix round 3 must settle the query first.')
    process.exitCode = 3
    return {
      status: 'pending-legacy-query',
      previewPartial,
      previewTombstone,
      supportCurrent,
      supportLegacy,
      parties,
      page1: p1,
      page2: p2,
    }
  }
  if (!orderOk || !dateOrderOk || !pagingOk) {
    fail(`recovery pages are not contiguous oldest-first actual pages: ids=${combinedIds.join(',')} orderOk=${orderOk} dateOrderOk=${dateOrderOk} pagingOk=${pagingOk} total=${p1.total} totalPages=${p1.totalPages}`)
  }

  await writeJson('recovery-list-page', page1)
  await writeJson('recovery-list-page-2', page2)

  const sourceHashes = {}
  for (const relative of [
    'src/utils/anonymizeUser.ts',
    'src/utils/support/serializers.ts',
    'src/utils/bookingDetails/projection.ts',
    'src/handlers/Admin/userAnonymize.ts',
    'src/handlers/Admin/supportItems.ts',
    'src/handlers/Admin/bookingDetail.ts',
    'src/models/user.ts',
    'src/models/accountDataGuard.ts',
    'src/models/supportTicket.ts',
    'src/models/meetingRequest.ts',
    'src/models/booking.ts',
  ]) {
    sourceHashes[relative] = await sha256(relative)
  }
  const provenance = {
    generator: 'tests/fixtures/adminAnonymize/wire/generate-wire-fixtures.mjs',
    command: `FIXERA_TEST_MONGODB_URI=${testUri.replace(/\/\/[^@/]+@/, '//')} ../fixera-server/node_modules/.bin/tsx tests/fixtures/adminAnonymize/wire/generate-wire-fixtures.mjs`,
    backendRoot: SERVER_ROOT,
    backendRevision: revision(SERVER_ROOT),
    frontendRevision: revision(FRONTEND_ROOT),
    database: EXPECTED_DB,
    ids: ID,
    seededAt: {
      partialStarted: T.partialStarted,
      tombstoneDeleted: T.tombstoneDeleted,
      legacyDeleted: T.legacyDeleted,
      supportCreated: T.supportCreated,
      meetingAt: T.meetingAt,
      bookingCreated: T.bookingCreated,
    },
    handlers: {
      preview: 'src/handlers/Admin/userAnonymize.ts adminAnonymizePreview -> previewAccountAnonymization',
      recovery: 'src/handlers/Admin/userAnonymize.ts adminAnonymizeRecoveryList -> listRecoverableAnonymizations',
      support: 'src/handlers/Admin/supportItems.ts adminGetSupportItem -> serializeSupportTicketAdmin/serializeLegacyMeetingRequestAdmin',
      booking: 'src/handlers/Admin/bookingDetail.ts getAdminBookingDetail -> buildDetailsForBookingDocument -> buildBookingDetails parties',
    },
    sourceHashes,
    deniedNetwork,
  }
  await writeFile(path.join(OUT_DIR, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8')
  console.log('WROTE preview-partial-cleanup, preview-bare-tombstone, recovery-list-page, recovery-list-page-2,')
  console.log('      support-current-anonymized, support-legacy-anonymized, party-booking-anonymized, provenance')
  console.log(`      recovery order ${combinedIds.join(' -> ')} (total=${p1.total}, totalPages=${p1.totalPages})`)
  console.log(`      denied external network/S3 attempts: ${deniedNetwork.length}`)
  return { status: 'ok', previewPartial, previewTombstone, page1: p1, page2: p2, supportCurrent, supportLegacy, parties }
}

let result
try {
  result = await main()
} catch (error) {
  if (!process.exitCode) process.exitCode = 1
  console.error(error?.stack || error)
} finally {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase()
    }
  } catch (error) {
    console.error('cleanup drop failed', error?.message || error)
  }
  try {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
  } catch {}
  if (result?.status === 'pending-legacy-query') {
    console.error(`RESULT ${result.status}`)
  } else if (process.exitCode) {
    console.error('RESULT failed')
  } else {
    console.error('RESULT ok')
  }
}
