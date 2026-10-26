# Professional lead / invitation campaign wire fixtures

These fixtures are captured from the **actual** backend handlers and production
renderer, not from hand-written response shapes.

## Regenerate

From the frontend repository:

```bash
tests/fixtures/leadCampaigns/wire/run-wire-fixtures.sh
```

The wrapper starts a private `mongo:7` container with:

- a unique container name for the invocation;
- a random loopback-only host port (never the reviewer's `27027`, never a
  hard-coded integration database);
- a single-node replica set advertised as `127.0.0.1:<port>`;
- the owned database `fixera_lead_campaign_wire_fixtures_test`.

It removes the container and drops the owned database on success or failure.
Fixtures are staged and published only after the whole generator succeeds.

Prerequisites: Docker with `mongo:7` already present, and the sibling
`../fixera-server` checkout (or `FIXERA_SERVER_DIR`). The wrapper refuses to pull
an image or use a non-local database.

Direct, already-running disposable database:

```bash
FIXERA_TEST_MONGODB_URI=mongodb://127.0.0.1:<port>/fixera_lead_campaign_wire_fixtures_test \
  ../fixera-server/node_modules/.bin/tsx \
  tests/fixtures/leadCampaigns/wire/generate-wire-fixtures.mjs
```

The generator requires a `mongodb://` loopback URI and exactly that database
name. It drops only that database.

## What is exercised

Actual Express admin routes:

- `POST /api/admin/marketing-leads/import` — partial, duplicate-only,
  all-suppressed (three identities for one suppressed mailbox plus an exact
  duplicate), all-invalid rows, malformed workbook `400` with `data.import`
  and `fileError`.
- `GET /api/admin/marketing-leads` — paging, email/country/locale/service
  filters, email/country sort, same email retained with different
  country/service.
- `PATCH /api/admin/marketing-leads/:id` — identity `409`, success.
- `DELETE /api/admin/marketing-leads/:id` — missing `404`, success.
- `GET /api/admin/marketing-lead-imports` — actual upload times/names, failed
  history rows with bounded row errors, file-level failure.
- `GET /api/admin/marketing-campaigns/service-options` — active US/CA service
  countries for frontend country choices.
- `POST/PATCH/GET /api/admin/marketing-campaigns` — default `subscribers`,
  invitation `both` with Customer + Professional roles, edit to `leads`,
  audience-type-away policy error, legacy unknown/missing audiences, legacy
  recognized-but-invalid `newsletter + both`.
- `POST /api/admin/marketing-campaigns/preview-audience` — source dedupe,
  subscriber precedence, role filtering, suppression exclusions, invalid
  audience and customer-only lead policy errors.
- `POST /api/admin/marketing-subscribers/sync` — local eligible/synced/skipped
  role counts and the canonical Belgium/explicit-locale/service subscriber row.
- `renderMarketingFooter(locale, token, "invitation")` — production en/nl/fr/de
  neutral invitation HTML.

## Isolation

Before any backend module is imported, the generator replaces:

- `http.request` / `http.get`
- `https.request` / `https.get`
- `globalThis.fetch`
- `net.Socket.prototype.connect`
- `tls.connect`

Only loopback hosts are allowed. The AWS S3 client `send` is denied as well.
Any non-loopback attempt throws immediately and is recorded in
`provenance.json`; a non-empty list fails the generator. `providerIsolation.ts`
is a Vitest lifecycle setup, so this standalone generator has its own
equivalent guard. Provider credentials are placeholders, the backend `.env` is
not read (the generator changes to a scratch directory), and no real import,
campaign, provider, email, S3, Stripe, Brevo, Odoo, SMS or production database
is used.

All contacts are synthetic `@example.com` rows. The committed fixtures contain
only handler response bodies, never workbook bytes or real uploaded data.

## Determinism

Seeded document IDs and dates are fixed. Handler-created ObjectIds and upload /
campaign timestamps are the actual values the handlers returned; they are
retained as evidence and are not asserted by tests. Tests assert filenames,
counts, statuses, errors, paging, roles, source splits and copy semantics, not
absolute timestamps or source hashes. Regenerating therefore changes only
non-deterministic metadata in the JSON files.

## Tests

`tests/leadCampaignFixtures.test.mjs` feeds these JSON fixtures to the real
frontend parsers, error classifier, campaign helpers and rendered `LeadTable` /
import dialog / upload-history components.
