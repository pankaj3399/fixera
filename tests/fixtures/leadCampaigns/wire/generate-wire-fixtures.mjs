#!/usr/bin/env node
// Generate the professional-lead / invitation-campaign wire fixtures from the
// actual backend HTTP routes and production renderers.
//
// The generator seeds a disposable, explicitly local MongoDB database with
// strict synthetic documents, starts the real Express admin router on loopback,
// and captures the actual responses consumed by the frontend:
//
//   POST /api/admin/marketing-leads/import          (lead import; canonical frontend route)
//   GET  /api/admin/marketing-leads                 (list, filters, paging, sort)
//   PATCH/DELETE /api/admin/marketing-leads/:id     (edit 409/success, delete 404/success)
//   GET  /api/admin/marketing-lead-imports          (upload history incl. failed errors)
//   GET  /api/admin/marketing-campaigns/service-options
//   POST /api/admin/marketing-campaigns             (create default/both/leads)
//   PATCH /api/admin/marketing-campaigns/:id        (edit + audience-type-away policy)
//   GET  /api/admin/marketing-campaigns             (list incl. legacy audiences)
//   POST /api/admin/marketing-campaigns/preview-audience
//   POST /api/admin/marketing-subscribers/sync
//
// The invitation footer fixtures come from the production renderMarketingFooter
// builder used by the campaign renderer.
//
// Usage (from the frontend repository):
//
//   tests/fixtures/leadCampaigns/wire/run-wire-fixtures.sh
//
// or against an already-running disposable local database:
//
//   FIXERA_TEST_MONGODB_URI=mongodb://127.0.0.1:<port>/fixera_lead_campaign_wire_fixtures_test \
//     ../fixera-server/node_modules/.bin/tsx \
//     tests/fixtures/leadCampaigns/wire/generate-wire-fixtures.mjs
//
// The URI must be loopback, mongodb://, contain "test", and use the exact
// database name fixera_lead_campaign_wire_fixtures_test. The generator drops
// only that database. The wrapper owns and removes its own Mongo container.
//
// Outbound HTTP(S)/fetch/net/tls is denied before any backend module is
// imported. Only loopback traffic (the disposable Mongo and the loopback
// Express listener) is allowed. No real provider, email, S3, Stripe, Brevo,
// Odoo, SMS or production database is used.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
const SERVER_ROOT = path.resolve(process.env.FIXERA_SERVER_DIR || path.join(FRONTEND_ROOT, '..', 'fixera-server'));
const OUT_DIR = path.resolve(process.env.FIXERA_WIRE_OUT_DIR || HERE);
const EXPECTED_DB = 'fixera_lead_campaign_wire_fixtures_test';

const fail = (message) => {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
  throw new Error(message);
};

const testUri = process.env.FIXERA_TEST_MONGODB_URI;
if (!testUri) {
  fail('FIXERA_TEST_MONGODB_URI is required (loopback disposable test database only)');
}
let parsed;
try {
  parsed = new URL(testUri);
} catch {
  fail('FIXERA_TEST_MONGODB_URI is not a valid URI');
}
if (parsed.protocol !== 'mongodb:') {
  fail('Use an explicit mongodb:// URI for the disposable local database');
}
const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
if (!localHosts.has(parsed.hostname)) {
  fail(`Refusing non-local MongoDB host ${parsed.hostname}`);
}
const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('?')[0]);
if (dbName !== EXPECTED_DB) {
  fail(`Refusing database "${dbName || '(none)'}"; expected ${EXPECTED_DB}`);
}
if (!/test/i.test(dbName)) {
  fail('The disposable database name must contain "test"');
}

if (process.env.MONGODB_URI && process.env.MONGODB_URI !== testUri) {
  console.error('IGNORING pre-set MONGODB_URI; using FIXERA_TEST_MONGODB_URI');
}
if (process.env.MONGO_URI && process.env.MONGO_URI !== testUri) {
  console.error('IGNORING pre-set MONGO_URI; using FIXERA_TEST_MONGODB_URI');
}

// The backend's dotenv.config() resolves from process.cwd(). Run from a scratch
// directory so a developer .env is never read. All values below are
// placeholders; no real provider credential is used.
const scratch = path.join(tmpdir(), `fixera-lead-campaign-wire-${process.pid}`);
mkdirSync(scratch, { recursive: true });
process.chdir(scratch);

Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: testUri,
  MONGO_URI: testUri,
  JWT_SECRET: 'wire-fixtures-local-secret',
  FRONTEND_URL: 'http://localhost:3000',
  MARKETING_CAMPAIGN_DRY_RUN: 'true',
  EMAIL_DEV_NO_SEND: 'true',
  AWS_ACCESS_KEY_ID: 'wire-fixtures-local-key',
  AWS_SECRET_ACCESS_KEY: 'wire-fixtures-local-secret',
  AWS_REGION: 'us-east-1',
  S3_BUCKET_NAME: 'fixera-wire-fixtures-local',
  BREVO_API_KEY: 'wire-fixtures-local-brevo',
  STRIPE_SECRET_KEY: 'sk_test_wire_fixtures_local',
  STRIPE_WEBHOOK_SECRET: 'whsec_wire_fixtures_local',
  ODOO_API_URL: 'https://odoo.invalid',
  ODOO_API_KEY: 'wire-fixtures-local-odoo',
  ODOO_COMPANY_ID: 'wire-fixtures-local-company',
  TWILIO_ACCOUNT_SID: 'ACwirefixtureslocal',
  TWILIO_AUTH_TOKEN: 'wire-fixtures-local-token',
  FIXERA_WIRE_FIXTURES: '1',
});
delete process.env.NODE_OPTIONS;

// ---------------------------------------------------------------------------
// Outbound network denial (installed before any backend module is imported).
// ---------------------------------------------------------------------------

const deniedNetwork = [];

const allowedHost = (host) => {
  const value = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!value) return true; // Node defaults to loopback for local calls
  return value === '127.0.0.1' || value === 'localhost' || value === '::1' || value === '0.0.0.0';
};

const deny = (kind, target) => {
  deniedNetwork.push({ kind, target: String(target) });
  const error = new Error(`EXTERNAL_NETWORK_DENIED (${kind}) ${String(target)}`);
  error.code = 'EXTERNAL_NETWORK_DENIED';
  throw error;
};

const assertAllowed = (kind, host, target) => {
  if (!allowedHost(host)) deny(kind, target || host);
};

const hostFromHttpArgs = (args) => {
  const first = args[0];
  if (typeof first === 'string' || first instanceof URL) {
    try {
      return new URL(String(first)).hostname;
    } catch {
      return '';
    }
  }
  if (first && typeof first === 'object') {
    return String(first.hostname || first.host || '').split(':')[0];
  }
  return '';
};

const hostFromNetArgs = (args) => {
  const first = args[0];
  if (first && typeof first === 'object') {
    if (first.path) return '';
    return String(first.host || first.hostname || '').split(':')[0];
  }
  if (typeof first === 'number') {
    return typeof args[1] === 'string' ? args[1].split(':')[0] : '127.0.0.1';
  }
  if (typeof first === 'string') {
    if (first.startsWith('/') || first.startsWith('\\\\')) return '';
    return first.split(':')[0];
  }
  return '';
};

const originalHttpRequest = http.request;
const originalHttpGet = http.get;
const originalHttpsRequest = https.request;
const originalHttpsGet = https.get;
const originalFetch = globalThis.fetch;
const originalNetConnect = net.Socket.prototype.connect;
const originalTlsConnect = tls.connect;

const denyHttp = (kind, original) => function guardedRequest(...args) {
  assertAllowed(kind, hostFromHttpArgs(args), args[0]);
  return original.apply(this, args);
};

http.request = denyHttp('http', originalHttpRequest);
http.get = denyHttp('http', originalHttpGet);
https.request = denyHttp('https', originalHttpsRequest);
https.get = denyHttp('https', originalHttpsGet);

globalThis.fetch = async (input, init) => {
  let host = '';
  try {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    host = raw ? new URL(raw).hostname : '';
  } catch {
    host = '';
  }
  assertAllowed('fetch', host, input?.url || input);
  return originalFetch(input, init);
};

net.Socket.prototype.connect = function guardedNetConnect(...args) {
  assertAllowed('net', hostFromNetArgs(args), args[0]);
  return originalNetConnect.apply(this, args);
};

tls.connect = function guardedTlsConnect(...args) {
  const first = args[0];
  const host = first && typeof first === 'object'
    ? String(first.host || first.hostname || '').split(':')[0]
    : typeof args[1] === 'string'
      ? args[1].split(':')[0]
      : '';
  assertAllowed('tls', host, first);
  return originalTlsConnect.apply(this, args);
};

const requireFromServer = createRequire(path.join(SERVER_ROOT, 'package.json'));
const mongoose = requireFromServer('mongoose');
const XLSX = requireFromServer('xlsx');
try {
  const s3Module = requireFromServer('@aws-sdk/client-s3');
  if (s3Module?.S3Client?.prototype?.send) {
    s3Module.S3Client.prototype.send = function deniedS3Send(command) {
      return deny('s3', command?.constructor?.name || 'S3Command');
    };
  }
} catch {
  // The route modules import S3 lazily; https/fetch denial still covers it.
}

const importServer = async (relative) => {
  const absolute = path.join(SERVER_ROOT, relative);
  const imported = await import(pathToFileURL(absolute).href);
  return imported.default ?? imported;
};

// ---------------------------------------------------------------------------
// Deterministic synthetic seed
// ---------------------------------------------------------------------------

const ID = {
  admin: '66af00000000000000000101',
  servicePlumbing: '66af00000000000000000201',
  servicePainting: '66af00000000000000000202',
  serviceSolar: '66af00000000000000000203',
  serviceElectrical: '66af00000000000000000204',
  subscriberPro: '66af00000000000000000301',
  subscriberCustomer: '66af00000000000000000302',
  subscriberOnlyCustomer: '66af00000000000000000303',
  leadSubscriberPro: '66af00000000000000000401',
  leadOne: '66af00000000000000000402',
  leadOnlyCustomer: '66af00000000000000000403',
  leadSuppressed: '66af00000000000000000404',
  leadOptedOut: '66af00000000000000000405',
  leadFrance: '66af00000000000000000406',
  leadAlpha: '66af00000000000000000407',
  leadZulu: '66af00000000000000000408',
  leadMulti: '66af00000000000000000409',
  syncProfessional: '66af00000000000000000501',
  syncCustomer: '66af00000000000000000502',
  syncOptedOut: '66af00000000000000000503',
  campaignLegacyUnknown: '66af00000000000000000601',
  campaignLegacyMissing: '66af00000000000000000602',
  campaignLegacyNewsletterBoth: '66af00000000000000000603',
  missingLead: '66af0000000000000000ffff',
};

const T = {
  seed: '2026-01-01T00:00:00.000Z',
  consent: '2026-02-01T00:00:00.000Z',
  subscribed: '2026-02-02T00:00:00.000Z',
  optOut: '2026-03-01T00:00:00.000Z',
  leadCreated: '2026-04-01T00:00:00.000Z',
  legacyCampaign: '2025-12-01T00:00:00.000Z',
};

const serviceLabels = {
  plumbing: 'Plumbing',
  painting: 'Painting',
  electrical: 'Electrical',
  'solar-panels': 'Solar Panels',
};

const createFixed = async (Model, doc) => {
  const instance = new Model(doc);
  await instance.save({ timestamps: false });
  return instance;
};

const seed = async (models) => {
  const {
    User,
    MarketingSubscriber,
    MarketingLead,
    MarketingSuppression,
    ServiceConfiguration,
    MarketingCampaign,
    leadIdentityHash,
    normalizeLeadServiceKeys,
  } = models;

  await createFixed(User, {
    _id: ID.admin,
    name: 'Wire Fixture Admin',
    email: 'wire-admin@example.com',
    phone: '+32000000001',
    password: 'wire-fixture-password',
    role: 'admin',
    adminRole: 'super',
    isEmailVerified: true,
    accountStatus: 'active',
    createdAt: T.seed,
    updatedAt: T.seed,
  });

  await Promise.all([
    createFixed(ServiceConfiguration, {
      _id: ID.servicePlumbing,
      category: 'Home',
      service: 'Plumbing',
      isActive: true,
      activeCountries: ['BE', 'NL', 'FR', 'US', 'CA'],
      createdAt: T.seed,
      updatedAt: T.seed,
    }),
    createFixed(ServiceConfiguration, {
      _id: ID.servicePainting,
      category: 'Home',
      service: 'Painting',
      isActive: true,
      activeCountries: ['BE', 'FR'],
      createdAt: T.seed,
      updatedAt: T.seed,
    }),
    createFixed(ServiceConfiguration, {
      _id: ID.serviceSolar,
      category: 'Home',
      service: 'Solar Panels',
      isActive: true,
      activeCountries: ['US', 'CA'],
      createdAt: T.seed,
      updatedAt: T.seed,
    }),
    createFixed(ServiceConfiguration, {
      _id: ID.serviceElectrical,
      category: 'Home',
      service: 'Electrical',
      isActive: true,
      activeCountries: ['BE', 'FR'],
      createdAt: T.seed,
      updatedAt: T.seed,
    }),
  ]);

  await Promise.all([
    createFixed(MarketingSuppression, {
      _id: '66af00000000000000000701',
      emailNormalized: 'suppressed@example.com',
      reason: 'provider',
      source: 'brevo',
      createdAt: T.seed,
      updatedAt: T.seed,
    }),
    createFixed(MarketingSuppression, {
      _id: '66af00000000000000000702',
      emailNormalized: 'lead.suppressed@example.com',
      reason: 'provider',
      source: 'brevo',
      createdAt: T.seed,
      updatedAt: T.seed,
    }),
  ]);

  const subscriber = (doc) => createFixed(MarketingSubscriber, {
    emailNormalized: doc.email,
    subscribedAt: T.subscribed,
    consentVerifiedAt: T.consent,
    unsubscribedAt: null,
    brevoUnsubscribedAt: null,
    role: 'professional',
    region: 'BE',
    locale: 'nl',
    localeSource: 'explicit',
    interestedServices: ['Electrical'],
    serviceKeys: ['electrical'],
    source: 'user_sync',
    unsubscribeToken: doc.token,
    createdAt: T.seed,
    updatedAt: T.seed,
    ...doc,
  });

  await Promise.all([
    subscriber({
      _id: ID.subscriberPro,
      email: 'sub.pro@example.com',
      name: 'Sub Professional',
      role: 'professional',
      unsubscribeToken: '66af00000000000000000801',
    }),
    subscriber({
      _id: ID.subscriberCustomer,
      email: 'sub.cust@example.com',
      name: 'Sub Customer',
      role: 'customer',
      unsubscribeToken: '66af00000000000000000802',
    }),
    subscriber({
      _id: ID.subscriberOnlyCustomer,
      email: 'sub.only-cust@example.com',
      name: 'Sub Only Customer',
      role: 'customer',
      unsubscribeToken: '66af00000000000000000803',
    }),
  ]);

  const seedLead = async (doc) => {
    const serviceKeys = normalizeLeadServiceKeys(doc.serviceKeys);
    const email = doc.email.toLowerCase();
    return createFixed(MarketingLead, {
      _id: doc._id,
      email,
      emailNormalized: email,
      country: doc.country,
      locale: doc.locale,
      serviceKeys,
      primaryServiceKey: serviceKeys[0],
      interestedServices: serviceKeys.map((key) => serviceLabels[key] || key),
      identityHash: leadIdentityHash({
        emailNormalized: email,
        country: doc.country,
        locale: doc.locale,
        serviceKeys,
      }),
      status: 'active',
      unsubscribedAt: doc.unsubscribedAt || null,
      lastCampaignSentAt: null,
      createdAt: doc.createdAt || T.leadCreated,
      updatedAt: doc.updatedAt || doc.createdAt || T.leadCreated,
    });
  };

  await Promise.all([
    seedLead({
      _id: ID.leadSubscriberPro,
      email: 'sub.pro@example.com',
      country: 'BE',
      locale: 'nl',
      serviceKeys: ['electrical'],
    }),
    seedLead({
      _id: ID.leadOne,
      email: 'lead.one@example.com',
      country: 'BE',
      locale: 'nl',
      serviceKeys: ['electrical'],
    }),
    seedLead({
      _id: ID.leadOnlyCustomer,
      email: 'sub.only-cust@example.com',
      country: 'BE',
      locale: 'nl',
      serviceKeys: ['electrical'],
    }),
    seedLead({
      _id: ID.leadSuppressed,
      email: 'lead.suppressed@example.com',
      country: 'BE',
      locale: 'nl',
      serviceKeys: ['electrical'],
    }),
    seedLead({
      _id: ID.leadOptedOut,
      email: 'lead.optedout@example.com',
      country: 'BE',
      locale: 'nl',
      serviceKeys: ['electrical'],
      unsubscribedAt: T.optOut,
    }),
    seedLead({
      _id: ID.leadFrance,
      email: 'lead.fr@example.com',
      country: 'FR',
      locale: 'fr',
      serviceKeys: ['electrical'],
    }),
    seedLead({
      _id: ID.leadAlpha,
      email: 'alpha.lead@example.com',
      country: 'BE',
      locale: 'de',
      serviceKeys: ['painting'],
    }),
    seedLead({
      _id: ID.leadZulu,
      email: 'zulu.lead@example.com',
      country: 'BE',
      locale: 'nl',
      serviceKeys: ['plumbing'],
    }),
    seedLead({
      _id: ID.leadMulti,
      email: 'multi.lead@example.com',
      country: 'BE',
      locale: 'nl',
      serviceKeys: ['plumbing', 'painting'],
    }),
  ]);

  const createUser = (doc) => createFixed(User, {
    password: 'wire-fixture-password',
    phone: doc.phone,
    isEmailVerified: true,
    accountStatus: 'active',
    notificationPreferences: {
      promotions: { email: doc.promotions, push: false },
    },
    marketingConsentAt: doc.consent,
    marketingLocale: 'nl',
    marketingLocaleSource: 'explicit',
    serviceCategories: ['Plumbing'],
    professionalStatus: 'approved',
    businessInfo: {
      companyName: 'Wire Fixture Company',
      country: 'Belgium',
      city: 'Ghent',
      timezone: 'Europe/Brussels',
    },
    createdAt: T.seed,
    updatedAt: T.seed,
    ...doc,
    ...doc.extra,
  });

  await Promise.all([
    createUser({
      _id: ID.syncProfessional,
      name: 'Wire Sync Professional',
      email: 'sync.pro@example.com',
      phone: '+32000000011',
      role: 'professional',
      promotions: true,
      consent: T.consent,
    }),
    createUser({
      _id: ID.syncCustomer,
      name: 'Wire Sync Customer',
      email: 'sync.customer@example.com',
      phone: '+32000000012',
      role: 'customer',
      promotions: true,
      consent: T.consent,
      extra: {
        professionalStatus: undefined,
        customerType: 'individual',
        location: {
          type: 'Point',
          coordinates: [4.35, 50.85],
          country: 'Belgium',
          city: 'Brussels',
        },
      },
    }),
    createUser({
      _id: ID.syncOptedOut,
      name: 'Wire Sync Opted Out',
      email: 'sync.off@example.com',
      phone: '+32000000013',
      role: 'professional',
      promotions: false,
      consent: null,
    }),
  ]);

  const campaignContent = {
    nl: {
      subject: 'Uitnodiging voor professionals',
      htmlContent: '<p>Werk samen met Fixtract.</p>',
    },
  };
  const campaignAudience = {
    countries: ['BE'],
    interestedServices: ['Electrical'],
    serviceKeys: ['electrical'],
    locales: ['nl'],
    roles: ['customer', 'professional'],
  };

  await Promise.all([
    createFixed(MarketingCampaign, {
      _id: ID.campaignLegacyUnknown,
      name: 'Legacy unknown audience campaign',
      type: 'invitation',
      audienceType: 'legacy_import',
      status: 'draft',
      content: campaignContent,
      audience: campaignAudience,
      autoSend: false,
      deliveries: [],
      createdAt: T.legacyCampaign,
      updatedAt: T.legacyCampaign,
    }),
    createFixed(MarketingCampaign, {
      _id: ID.campaignLegacyMissing,
      name: 'Legacy missing audience campaign',
      type: 'invitation',
      audienceType: 'subscribers',
      status: 'draft',
      content: campaignContent,
      audience: campaignAudience,
      autoSend: false,
      deliveries: [],
      createdAt: T.legacyCampaign,
      updatedAt: T.legacyCampaign,
    }),
    createFixed(MarketingCampaign, {
      _id: ID.campaignLegacyNewsletterBoth,
      name: 'Legacy newsletter combined audience',
      type: 'newsletter',
      audienceType: 'both',
      status: 'draft',
      content: campaignContent,
      audience: campaignAudience,
      autoSend: false,
      deliveries: [],
      createdAt: T.legacyCampaign,
      updatedAt: T.legacyCampaign,
    }),
  ]);

  // Simulate a legacy document that predates the audienceType field. The
  // schema default is bypassed deliberately so the handler's missing-value
  // behavior is exercised, not Mongoose's default.
  await MarketingCampaign.collection.updateOne(
    { _id: mongoose.Types.ObjectId.createFromHexString(ID.campaignLegacyMissing) },
    { $unset: { audienceType: '' } },
  );
};

// ---------------------------------------------------------------------------
// Workbook + HTTP helpers
// ---------------------------------------------------------------------------

const workbookBuffer = (rows) => {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Leads');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
};

const PARTIAL_ROWS = [
  ['Email', 'Country', 'Language', 'Service', 'Ignored'],
  ['Person@Example.com', 'Belgium', 'Nederlands', 'Plumbing', 'ignored'],
  ['person@example.com', 'France', 'French', 'Painting', 'ignored'],
  ['person@example.com', 'Belgium', 'Nederlands', 'Plumbing', 'exact duplicate'],
  ['bad-email', 'BE', 'nl', 'Plumbing', 'invalid email'],
  ['suppressed@example.com', 'BE', 'nl', 'Plumbing', 'suppressed mailbox'],
  ['us.lead@example.com', 'United States', 'English', 'Plumbing', 'US lead'],
  ['ca.lead@example.com', 'Canada', 'English', 'Solar Panels', 'CA lead'],
];

const DUPLICATE_ROWS = [
  ['Email', 'Country', 'Language', 'Service'],
  ['person@example.com', 'BE', 'nl', 'Plumbing'],
  ['person@example.com', 'FR', 'fr', 'Painting'],
];

const SUPPRESSED_ROWS = [
  ['Email', 'Country', 'Language', 'Service'],
  ['suppressed@example.com', 'BE', 'fr', 'Painting'],
  ['suppressed@example.com', 'FR', 'fr', 'Painting'],
  ['suppressed@example.com', 'US', 'en', 'Plumbing'],
  ['suppressed@example.com', 'BE', 'fr', 'Painting'],
];

const INVALID_ROWS = [
  ['Email', 'Country', 'Language', 'Service'],
  ['not-an-email', 'BE', 'nl', 'Plumbing'],
  ['also-not-an-email', 'BE', 'nl', 'Plumbing'],
];

const assertStatus = (label, response, expected) => {
  if (response.status !== expected) {
    fail(`${label} returned HTTP ${response.status} (expected ${expected}): ${JSON.stringify(response.body)}`);
  }
  return response;
};

const writeJson = async (name, value) => {
  await writeFile(path.join(OUT_DIR, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const sha256 = async (relative) => {
  const content = await readFile(path.join(SERVER_ROOT, relative));
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
};

const git = (root, args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8',
}).trim();

const revision = (root) => {
  try {
    return {
      head: git(root, ['rev-parse', 'HEAD']),
      branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
      dirty: Boolean(git(root, ['status', '--porcelain'])),
    };
  } catch {
    return null;
  }
};

const load = async () => {
  const [
    User,
    MarketingSubscriber,
    MarketingLead,
    MarketingLeadImport,
    MarketingSuppression,
    ServiceConfiguration,
    MarketingCampaign,
    adminRouter,
    errorHandler,
    { renderMarketingFooter },
    { leadIdentityHash, normalizeLeadServiceKeys },
    { MARKETING_LOCALES },
  ] = await Promise.all([
    importServer('src/models/user.ts'),
    importServer('src/models/marketingSubscriber.ts'),
    importServer('src/models/marketingLead.ts'),
    importServer('src/models/marketingLeadImport.ts'),
    importServer('src/models/marketingSuppression.ts'),
    importServer('src/models/serviceConfiguration.ts'),
    importServer('src/models/marketingCampaign.ts'),
    importServer('src/routes/Admin/index.ts'),
    importServer('src/handlers/error/index.ts'),
    importServer('src/utils/marketing/renderCampaign.ts'),
    importServer('src/utils/marketing/leadIdentity.ts'),
    importServer('src/utils/marketing/marketingCatalog.ts'),
  ]);
  return {
    User,
    MarketingSubscriber,
    MarketingLead,
    MarketingLeadImport,
    MarketingSuppression,
    ServiceConfiguration,
    MarketingCampaign,
    adminRouter,
    errorHandler,
    renderMarketingFooter,
    leadIdentityHash,
    normalizeLeadServiceKeys,
    MARKETING_LOCALES,
  };
};

let activeServer = null;

const main = async () => {
  console.log(`server         ${SERVER_ROOT}`);
  console.log(`database       ${testUri}`);
  console.log(`output         ${OUT_DIR}`);

  await mongoose.connect(testUri, { serverSelectionTimeoutMS: 10000 });
  if (mongoose.connection.readyState !== 1) fail('Mongoose is not connected');
  await mongoose.connection.dropDatabase();

  const models = await load();
  await Promise.all([
    models.User.createIndexes(),
    models.MarketingSubscriber.createIndexes(),
    models.MarketingLead.createIndexes(),
    models.MarketingLeadImport.createIndexes(),
    models.MarketingSuppression.createIndexes(),
    models.ServiceConfiguration.createIndexes(),
    models.MarketingCampaign.createIndexes(),
  ]);
  await seed(models);

  const express = requireFromServer('express');
  const cookieParser = requireFromServer('cookie-parser');
  const jwt = requireFromServer('jsonwebtoken');

  const admin = await models.User.findById(ID.admin).lean();
  if (!admin) fail('admin fixture not persisted');
  const adminCookie = `auth-token=${jwt.sign({ id: String(admin._id) }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;

  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/admin', models.adminRouter);
  app.use(models.errorHandler);
  const server = http.createServer(app);
  activeServer = server;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const request = async (method, requestPath, body) => {
    const headers = { cookie: adminCookie };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${baseUrl}${requestPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  const upload = async (buffer, filename) => {
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    const response = await fetch(`${baseUrl}/api/admin/marketing-leads/import`, {
      method: 'POST',
      headers: { cookie: adminCookie },
      body: form,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  // --- Lead imports through the actual frontend endpoint -------------------
  const partial = assertStatus(
    'import partial',
    await upload(workbookBuffer(PARTIAL_ROWS), 'lead-campaign-partial-october.xlsx'),
    201,
  );
  await writeJson('import-partial', partial);

  const duplicate = assertStatus(
    'import duplicate-only',
    await upload(workbookBuffer(DUPLICATE_ROWS), 'lead-campaign-duplicate-only.xlsx'),
    201,
  );
  await writeJson('import-duplicate-only', duplicate);

  const suppressed = assertStatus(
    'import suppressed identities',
    await upload(workbookBuffer(SUPPRESSED_ROWS), 'lead-campaign-suppressed-identities.xlsx'),
    201,
  );
  await writeJson('import-suppressed-identities', suppressed);

  const invalid = assertStatus(
    'import invalid rows',
    await upload(workbookBuffer(INVALID_ROWS), 'lead-campaign-invalid-rows.xlsx'),
    201,
  );
  await writeJson('import-invalid-rows', invalid);

  const malformed = assertStatus(
    'import malformed workbook',
    await upload(Buffer.from('this is not an Excel workbook'), 'lead-campaign-malformed.xlsx'),
    400,
  );
  await writeJson('import-malformed', malformed);

  const history = assertStatus(
    'upload history',
    await request('GET', '/api/admin/marketing-lead-imports?page=1&limit=25'),
    200,
  );
  await writeJson('import-history', history);

  // --- Service catalog (active US/CA countries) ----------------------------
  const services = assertStatus(
    'service options',
    await request('GET', '/api/admin/marketing-campaigns/service-options'),
    200,
  );
  await writeJson('service-options', services);
  const servicesUsCa = assertStatus(
    'service options US/CA',
    await request('GET', '/api/admin/marketing-campaigns/service-options?countries=US,CA'),
    200,
  );
  await writeJson('service-options-us-ca', servicesUsCa);

  // --- Leads: paging, filter, sort, edit, delete ---------------------------
  const page1 = assertStatus(
    'lead list page 1',
    await request('GET', '/api/admin/marketing-leads?page=1&limit=8&sort=email&direction=asc'),
    200,
  );
  const page2 = assertStatus(
    'lead list page 2',
    await request('GET', '/api/admin/marketing-leads?page=2&limit=8&sort=email&direction=asc'),
    200,
  );
  const page3 = assertStatus(
    'lead list page 3',
    await request('GET', '/api/admin/marketing-leads?page=3&limit=8&sort=email&direction=asc'),
    200,
  );
  await writeJson('lead-list-page-1', page1);
  await writeJson('lead-list-page-2', page2);
  await writeJson('lead-list-page-3', page3);

  const filtered = assertStatus(
    'lead list filtered',
    await request(
      'GET',
      '/api/admin/marketing-leads?page=1&limit=8&q=person&country=FR&locale=fr&serviceKey=painting&sort=email&direction=asc',
    ),
    200,
  );
  await writeJson('lead-list-filtered-person-fr', filtered);

  const sortedCountry = assertStatus(
    'lead list sorted by country',
    await request('GET', '/api/admin/marketing-leads?page=1&limit=8&sort=country&direction=desc'),
    200,
  );
  await writeJson('lead-list-sorted-country-desc', sortedCountry);

  const zuluBefore = assertStatus(
    'lead list zulu before delete',
    await request('GET', '/api/admin/marketing-leads?page=1&limit=8&q=zulu&sort=email&direction=asc'),
    200,
  );
  await writeJson('lead-list-zulu-before-delete', zuluBefore);

  const personBe = page1.body.data.leads.find(
    (lead) => lead.email === 'person@example.com' && lead.country === 'BE',
  );
  const personFr = page2.body.data.leads.find(
    (lead) => lead.email === 'person@example.com' && lead.country === 'FR',
  );
  const zulu = zuluBefore.body.data.leads.find((lead) => lead.email === 'zulu.lead@example.com');
  if (!personBe || !personFr || !zulu) {
    fail(`expected seed rows are missing from the actual list (personBe=${Boolean(personBe)}, personFr=${Boolean(personFr)}, zulu=${Boolean(zulu)})`);
  }

  const editConflict = assertStatus(
    'lead edit conflict',
    await request('PATCH', `/api/admin/marketing-leads/${personBe._id}`, {
      country: 'France',
      locale: 'fr',
      serviceKeys: ['painting'],
    }),
    409,
  );
  await writeJson('lead-edit-conflict', editConflict);

  const editSuccess = assertStatus(
    'lead edit success',
    await request('PATCH', `/api/admin/marketing-leads/${personBe._id}`, { locale: 'de' }),
    200,
  );
  await writeJson('lead-edit-success', editSuccess);

  const deleteMissing = assertStatus(
    'lead delete missing',
    await request('DELETE', `/api/admin/marketing-leads/${ID.missingLead}`),
    404,
  );
  await writeJson('lead-delete-missing', deleteMissing);

  const deleteSuccess = assertStatus(
    'lead delete success',
    await request('DELETE', `/api/admin/marketing-leads/${zulu._id}`),
    200,
  );
  await writeJson('lead-delete-success', deleteSuccess);

  const zuluAfter = assertStatus(
    'lead list zulu after delete',
    await request('GET', '/api/admin/marketing-leads?page=1&limit=8&q=zulu&sort=email&direction=asc'),
    200,
  );
  await writeJson('lead-list-zulu-after-delete', zuluAfter);

  // --- Campaign create/edit/list ------------------------------------------
  const campaignInput = (overrides = {}) => ({
    name: 'Wire invitation campaign',
    type: 'invitation',
    content: {
      nl: {
        subject: 'Uitnodiging voor professionals',
        htmlContent: '<p>Werk samen met Fixtract.</p>',
      },
    },
    audience: {
      countries: ['BE'],
      interestedServices: ['Electrical'],
      serviceKeys: ['electrical'],
      locales: ['nl'],
      roles: ['customer', 'professional'],
    },
    ...overrides,
  });

  const createDefault = assertStatus(
    'campaign create default subscribers',
    await request('POST', '/api/admin/marketing-campaigns', campaignInput({
      name: 'Wire invitation default subscribers',
    })),
    201,
  );
  await writeJson('campaign-create-default-subscribers', createDefault);

  const createBoth = assertStatus(
    'campaign create both',
    await request('POST', '/api/admin/marketing-campaigns', campaignInput({
      name: 'Wire invitation combined audience',
      audienceType: 'both',
    })),
    201,
  );
  await writeJson('campaign-create-both', createBoth);

  const createEditable = assertStatus(
    'campaign create editable',
    await request('POST', '/api/admin/marketing-campaigns', campaignInput({
      name: 'Wire invitation editable',
      audienceType: 'both',
    })),
    201,
  );
  await writeJson('campaign-create-editable', createEditable);

  const editLeads = assertStatus(
    'campaign edit leads',
    await request('PATCH', `/api/admin/marketing-campaigns/${createEditable.body.data._id}`, {
      audienceType: 'leads',
      audience: {
        countries: ['BE'],
        interestedServices: ['Electrical'],
        serviceKeys: ['electrical'],
        locales: ['nl'],
        roles: ['professional'],
      },
    }),
    200,
  );
  await writeJson('campaign-edit-leads', editLeads);

  const awayWithLeads = assertStatus(
    'campaign type away with leads',
    await request('PATCH', `/api/admin/marketing-campaigns/${createEditable.body.data._id}`, {
      type: 'newsletter',
    }),
    400,
  );
  await writeJson('campaign-type-away-with-leads', awayWithLeads);

  const awaySubscribers = assertStatus(
    'campaign type away subscribers',
    await request('PATCH', `/api/admin/marketing-campaigns/${createEditable.body.data._id}`, {
      type: 'newsletter',
      audienceType: 'subscribers',
    }),
    200,
  );
  await writeJson('campaign-type-away-subscribers', awaySubscribers);

  const campaignList = assertStatus(
    'campaign list all',
    await request('GET', '/api/admin/marketing-campaigns?page=1&limit=25'),
    200,
  );
  await writeJson('campaign-list', campaignList);

  const invitationList = assertStatus(
    'campaign list invitation',
    await request('GET', '/api/admin/marketing-campaigns?type=invitation&page=1&limit=25'),
    200,
  );
  await writeJson('campaign-list-invitation', invitationList);

  const previewBody = (audienceType, roles, extra = {}) => ({
    type: 'invitation',
    audienceType,
    audience: {
      countries: ['BE'],
      interestedServices: ['Electrical'],
      serviceKeys: ['electrical'],
      locales: ['nl'],
      roles,
    },
    contentLocales: ['nl'],
    ...extra,
  });

  const previewBoth = assertStatus(
    'preview both',
    await request('POST', '/api/admin/marketing-campaigns/preview-audience', previewBody('both', ['customer', 'professional'])),
    200,
  );
  await writeJson('campaign-preview-both', previewBoth);

  const previewBothProfessional = assertStatus(
    'preview both professional only',
    await request('POST', '/api/admin/marketing-campaigns/preview-audience', previewBody('both', ['professional'])),
    200,
  );
  await writeJson('campaign-preview-both-professional', previewBothProfessional);

  const previewLeads = assertStatus(
    'preview leads',
    await request('POST', '/api/admin/marketing-campaigns/preview-audience', previewBody('leads', ['customer', 'professional'])),
    200,
  );
  await writeJson('campaign-preview-leads', previewLeads);

  const previewSubscribers = assertStatus(
    'preview subscribers',
    await request('POST', '/api/admin/marketing-campaigns/preview-audience', previewBody('subscribers', ['customer', 'professional'])),
    200,
  );
  await writeJson('campaign-preview-subscribers', previewSubscribers);

  const previewInvalidAudience = assertStatus(
    'preview invalid audience',
    await request('POST', '/api/admin/marketing-campaigns/preview-audience', previewBody('legacy_import', ['customer', 'professional'])),
    400,
  );
  await writeJson('campaign-preview-invalid-audience', previewInvalidAudience);

  const previewCustomerOnlyLead = assertStatus(
    'preview customer-only lead audience',
    await request('POST', '/api/admin/marketing-campaigns/preview-audience', previewBody('leads', ['customer'])),
    400,
  );
  await writeJson('campaign-preview-customer-only-lead', previewCustomerOnlyLead);

  // --- Professional sync ---------------------------------------------------
  const sync = assertStatus(
    'professional sync',
    await request('POST', '/api/admin/marketing-subscribers/sync'),
    200,
  );
  await writeJson('professional-sync', sync);

  const syncSubscribers = assertStatus(
    'professional sync subscriber row',
    await request('GET', '/api/admin/marketing-subscribers?page=1&limit=8&q=sync.pro@example.com'),
    200,
  );
  await writeJson('professional-sync-subscribers', syncSubscribers);

  // --- Production footer builder ------------------------------------------
  const footers = {};
  for (const locale of models.MARKETING_LOCALES) {
    footers[locale] = models.renderMarketingFooter(locale, 'wire-fixture-token', 'invitation');
  }
  await writeJson('marketing-footer-invitation', footers);

  const sourceHashes = {};
  for (const relative of [
    'src/handlers/Admin/marketingLeads.ts',
    'src/handlers/Admin/marketingCampaigns.ts',
    'src/handlers/Admin/marketingServiceOptions.ts',
    'src/utils/marketing/leadImport.ts',
    'src/utils/marketing/audience.ts',
    'src/utils/marketing/audienceResolver.ts',
    'src/utils/marketing/renderCampaign.ts',
    'src/utils/marketing/serviceCatalog.ts',
    'src/utils/marketing/suppression.ts',
    'src/models/marketingLead.ts',
    'src/models/marketingLeadImport.ts',
    'src/models/marketingCampaign.ts',
    'src/models/marketingSubscriber.ts',
    'src/models/user.ts',
  ]) {
    sourceHashes[relative] = await sha256(relative);
  }

  const provenance = {
    generator: 'tests/fixtures/leadCampaigns/wire/generate-wire-fixtures.mjs',
    command: 'tests/fixtures/leadCampaigns/wire/run-wire-fixtures.sh',
    backendRoot: SERVER_ROOT,
    backendRevision: revision(SERVER_ROOT),
    frontendRevision: revision(FRONTEND_ROOT),
    database: EXPECTED_DB,
    ids: ID,
    seededAt: {
      seed: T.seed,
      consent: T.consent,
      subscribed: T.subscribed,
      optOut: T.optOut,
      leadCreated: T.leadCreated,
      legacyCampaign: T.legacyCampaign,
    },
    routes: {
      import: 'POST /api/admin/marketing-leads/import -> importMarketingLeads',
      list: 'GET /api/admin/marketing-leads -> listMarketingLeads',
      update: 'PATCH /api/admin/marketing-leads/:id -> updateMarketingLead',
      delete: 'DELETE /api/admin/marketing-leads/:id -> deleteMarketingLead',
      history: 'GET /api/admin/marketing-lead-imports -> listMarketingLeadImports',
      services: 'GET /api/admin/marketing-campaigns/service-options -> listMarketingServiceOptions',
      campaignCreate: 'POST /api/admin/marketing-campaigns -> createMarketingCampaign',
      campaignUpdate: 'PATCH /api/admin/marketing-campaigns/:id -> updateMarketingCampaign',
      campaignList: 'GET /api/admin/marketing-campaigns -> listMarketingCampaigns',
      preview: 'POST /api/admin/marketing-campaigns/preview-audience -> previewMarketingAudience',
      sync: 'POST /api/admin/marketing-subscribers/sync -> syncMarketingSubscribers',
      footer: 'src/utils/marketing/renderCampaign.ts renderMarketingFooter(locale, token, "invitation")',
    },
    sourceHashes,
    deniedNetwork,
  };
  await writeJson('provenance', provenance);

  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();

  if (deniedNetwork.length > 0) {
    fail(`Outbound network was denied ${deniedNetwork.length} time(s): ${JSON.stringify(deniedNetwork)}`);
  }

  console.log('WROTE import-partial, import-duplicate-only, import-suppressed-identities,');
  console.log('      import-invalid-rows, import-malformed, import-history, service-options,');
  console.log('      service-options-us-ca, lead-list-page-1/2/3, lead-list-filtered-person-fr,');
  console.log('      lead-list-sorted-country-desc, lead-edit-conflict/success, lead-delete-404/success,');
  console.log('      campaign-create-default-subscribers/both/editable, campaign-edit-leads,');
  console.log('      campaign-type-away-with-leads/subscribers, campaign-list(+invitation),');
  console.log('      campaign-preview-both/both-professional/leads/subscribers/invalid/customer-only,');
  console.log('      professional-sync, professional-sync-subscribers, marketing-footer-invitation, provenance');
  console.log(`      suppressed fixture counts: imported=${suppressed.body?.data?.import?.importedRows} duplicate=${suppressed.body?.data?.import?.duplicateRows} suppressed=${suppressed.body?.data?.import?.suppressedRows}`);
  console.log(`      denied external network/S3 attempts: ${deniedNetwork.length}`);
  return { status: 'ok' };
};

let result;
try {
  result = await main();
} catch (error) {
  if (!process.exitCode) process.exitCode = 1;
  console.error(error?.stack || error);
} finally {
  try {
    if (activeServer?.listening) {
      await new Promise((resolve) => activeServer.close(resolve));
    }
  } catch (error) {
    console.error('cleanup server close failed', error?.message || error);
  }
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
    }
  } catch (error) {
    console.error('cleanup drop failed', error?.message || error);
  }
  try {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  } catch {}
  if (process.exitCode) console.error('RESULT failed');
  else console.error('RESULT ok');
}
