import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const {
  LeadTable,
  LeadImportHistoryTable,
  LeadImportHistoryDetails,
} = await import('@/components/admin/marketing/LeadTable')
const { LeadImportDialogBody } = await import('@/components/admin/marketing/LeadImportDialog')
const {
  audienceIncludesLeads,
  audienceTypeLabel,
  audienceTypeOrNull,
  campaignAudienceValidation,
  campaignRoleLocked,
  invitationFooterCopy,
  isKnownAudienceType,
  marketingCountryOptions,
  normalizeServices,
  subscriberSyncSummary,
} = await import('@/lib/admin/marketing.ts')
const {
  leadImportKind,
  leadImportOutcome,
  leadSuppressionLabel,
  normalizeLeadRecord,
  parseLeadHistoryData,
  parseLeadImportRecord,
  parseLeadListData,
} = await import('@/lib/admin/marketingLeads.ts')
const { apiErrorFromBody, classifyApiError, getErrorMessage } = await import('@/lib/apiErrors.ts')

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/leadCampaigns/wire/${name}.json`, import.meta.url), 'utf8'))
const body = (name) => fixture(name).body
const noop = () => {}

const importRecord = (name) => parseLeadImportRecord(body(name).data)
const leadPage = (name) => parseLeadListData(body(name).data)

test('handler-derived imports parse actual partial, duplicate, suppressed and malformed results', () => {
  const partial = importRecord('import-partial')
  assert.ok(partial)
  assert.equal(partial.status, 'partial')
  assert.equal(partial.filename, 'lead-campaign-partial-october.xlsx')
  assert.equal(partial.totalRows, 7)
  assert.equal(partial.importedRows, 5)
  assert.equal(partial.duplicateRows, 1)
  assert.equal(partial.failedRows, 1)
  assert.equal(partial.suppressedRows, 1)
  assert.equal(partial.errorCount, 1)
  assert.deepEqual(partial.errors, [
    { row: 5, field: 'email', message: 'Enter a valid email address' },
  ])
  assert.equal(leadImportKind(partial), 'partial')
  assert.equal(leadImportOutcome(partial).tone, 'warning')
  assert.match(leadImportOutcome(partial).message, /Imported 5 of 7 rows/)
  assert.match(leadImportOutcome(partial).message, /Suppressed leads are not eligible/)

  const duplicates = importRecord('import-duplicate-only')
  assert.ok(duplicates)
  assert.equal(duplicates.status, 'duplicate_only')
  assert.equal(duplicates.importedRows, 0)
  assert.equal(duplicates.duplicateRows, 2)
  assert.equal(duplicates.failedRows, 0)
  assert.equal(leadImportKind(duplicates), 'duplicate')
  assert.equal(leadImportOutcome(duplicates).tone, 'neutral')
  assert.equal(leadImportOutcome(duplicates).statusLabel, 'No new leads')

  // Parent correction: three distinct suppressed identities for one mailbox
  // must count as three imported, suppressed rows, not one unique mailbox.
  const suppressed = importRecord('import-suppressed-identities')
  assert.ok(suppressed)
  assert.equal(suppressed.status, 'completed')
  assert.equal(suppressed.totalRows, 4)
  assert.equal(suppressed.importedRows, 3)
  assert.equal(suppressed.duplicateRows, 1)
  assert.equal(suppressed.failedRows, 0)
  assert.equal(suppressed.suppressedRows, 3)
  assert.equal(leadImportKind(suppressed), 'success')
  assert.equal(leadImportOutcome(suppressed).tone, 'warning')
  assert.equal(leadImportOutcome(suppressed).statusLabel, 'Imported; suppressed leads excluded')
  assert.match(leadImportOutcome(suppressed).title, /suppressed/)
  assert.match(leadImportOutcome(suppressed).message, /Imported 3 leads/)
  assert.match(leadImportOutcome(suppressed).message, /1 duplicate skipped/)
  assert.match(leadImportOutcome(suppressed).message, /not eligible for campaigns/)

  const invalidRows = importRecord('import-invalid-rows')
  assert.ok(invalidRows)
  assert.equal(invalidRows.status, 'failed')
  assert.equal(invalidRows.totalRows, 2)
  assert.equal(invalidRows.importedRows, 0)
  assert.equal(invalidRows.failedRows, 2)
  assert.equal(invalidRows.errors.length, 2)
  assert.equal(leadImportKind(invalidRows), 'failed')

  const malformedFixture = fixture('import-malformed')
  assert.equal(malformedFixture.status, 400)
  const malformed = parseLeadImportRecord(malformedFixture.body.data)
  assert.ok(malformed)
  assert.equal(malformed.status, 'failed')
  assert.equal(malformed.filename, 'lead-campaign-malformed.xlsx')
  assert.equal(malformed.totalRows, 0)
  assert.equal(malformed.errorCount, 0)
  assert.deepEqual(malformed.errors, [])
  assert.equal(
    malformed.fileError,
    'The uploaded file is not a valid .xlsx or .xls workbook',
  )
  assert.equal(leadImportKind(malformed), 'failed')
  assert.equal(leadImportOutcome(malformed).tone, 'danger')
  assert.match(leadImportOutcome(malformed).message, /not a valid \.xlsx or \.xls workbook/)

  const error = apiErrorFromBody(malformedFixture.body, 'fallback', { status: 400 })
  assert.equal(classifyApiError(error).kind, 'validation')
  assert.equal(classifyApiError(error).status, 400)
  assert.equal(
    getErrorMessage(error, 'fallback'),
    'The uploaded file is not a valid .xlsx or .xls workbook',
  )
})

test('upload history fixture preserves actual filenames, times, failed row errors and file errors', () => {
  const history = parseLeadHistoryData(body('import-history').data)
  assert.equal(history.imports.length, 5)
  assert.equal(history.pagination.total, 5)
  assert.ok(history.imports.every((row) => Number.isFinite(Date.parse(row.uploadedAt))))
  for (let index = 1; index < history.imports.length; index += 1) {
    assert.ok(
      new Date(history.imports[index - 1].uploadedAt).getTime()
        >= new Date(history.imports[index].uploadedAt).getTime(),
    )
  }

  const byName = new Map(history.imports.map((row) => [row.filename, row]))
  const invalid = byName.get('lead-campaign-invalid-rows.xlsx')
  const malformed = byName.get('lead-campaign-malformed.xlsx')
  const suppressed = byName.get('lead-campaign-suppressed-identities.xlsx')
  const duplicates = byName.get('lead-campaign-duplicate-only.xlsx')
  const partial = byName.get('lead-campaign-partial-october.xlsx')
  assert.ok(invalid && malformed && suppressed && duplicates && partial)

  assert.equal(invalid.status, 'failed')
  assert.equal(invalid.failedRows, 2)
  assert.equal(invalid.errorCount, 2)
  assert.deepEqual(invalid.errors.map((row) => row.row), [2, 3])
  assert.equal(malformed.status, 'failed')
  assert.equal(
    malformed.fileError,
    'The uploaded file is not a valid .xlsx or .xls workbook',
  )
  assert.equal(malformed.errorCount, 0)
  assert.equal(suppressed.suppressedRows, 3)
  assert.equal(duplicates.status, 'duplicate_only')
  assert.equal(partial.status, 'partial')

  // The recorded upload time is the handler's actual time, shared by the import
  // response and the history row; no placeholder date was substituted.
  assert.equal(
    malformed.uploadedAt,
    importRecord('import-malformed').uploadedAt,
  )
  assert.equal(
    invalid.uploadedAt,
    importRecord('import-invalid-rows').uploadedAt,
  )
  assert.equal(
    suppressed.uploadedAt,
    importRecord('import-suppressed-identities').uploadedAt,
  )
})

test('actual lead list pages retain the same email with different country/service and filter/sort correctly', () => {
  const page1 = leadPage('lead-list-page-1')
  const page2 = leadPage('lead-list-page-2')
  const page3 = leadPage('lead-list-page-3')

  assert.equal(page1.pagination.total, 17)
  assert.equal(page1.pagination.totalPages, 3)
  assert.equal(page1.leads.length, 8)
  assert.equal(page2.leads.length, 8)
  assert.equal(page3.leads.length, 1)

  const personRows = [...page1.leads, ...page2.leads, ...page3.leads]
    .filter((lead) => lead.email === 'person@example.com')
  assert.equal(personRows.length, 2)
  assert.deepEqual(
    personRows.map((lead) => [lead.country, lead.locale, lead.serviceKeys.join(',')]).sort(),
    [
      ['BE', 'nl', 'plumbing'],
      ['FR', 'fr', 'painting'],
    ],
  )
  assert.equal(new Set(personRows.map((lead) => lead._id)).size, 2)

  const suppressedRows = page2.leads.filter((lead) => lead.email === 'suppressed@example.com')
  assert.equal(suppressedRows.length, 4)
  assert.ok(suppressedRows.every((lead) => lead.suppressed))
  assert.ok(suppressedRows.every((lead) => lead.suppressionReason === 'provider'))
  assert.ok(suppressedRows.every((lead) => leadSuppressionLabel(lead) === 'Suppressed: provider'))

  const filtered = leadPage('lead-list-filtered-person-fr')
  assert.equal(filtered.pagination.total, 1)
  assert.equal(filtered.leads.length, 1)
  assert.equal(filtered.leads[0].email, 'person@example.com')
  assert.equal(filtered.leads[0].country, 'FR')
  assert.equal(filtered.leads[0].locale, 'fr')
  assert.deepEqual(filtered.leads[0].serviceKeys, ['painting'])

  const sorted = leadPage('lead-list-sorted-country-desc')
  const countries = sorted.leads.map((lead) => lead.country)
  assert.deepEqual(countries, [...countries].sort().reverse())
  assert.equal(countries[0], 'US')
})

test('actual edit/delete responses map to the frontend conflict, success and not-found states', () => {
  const conflictFixture = fixture('lead-edit-conflict')
  assert.equal(conflictFixture.status, 409)
  const conflict = apiErrorFromBody(conflictFixture.body, 'fallback', { status: 409 })
  assert.equal(classifyApiError(conflict).kind, 'conflict')
  assert.equal(classifyApiError(conflict).status, 409)
  assert.equal(
    getErrorMessage(conflict, 'fallback'),
    'A lead with this email, country, language and service already exists.',
  )

  const success = normalizeLeadRecord(body('lead-edit-success').data.lead)
  assert.ok(success)
  assert.equal(success.email, 'person@example.com')
  assert.equal(success.country, 'BE')
  assert.equal(success.locale, 'de')
  assert.deepEqual(success.serviceKeys, ['plumbing'])

  const missingFixture = fixture('lead-delete-missing')
  assert.equal(missingFixture.status, 404)
  const missing = apiErrorFromBody(missingFixture.body, 'fallback', { status: 404 })
  assert.equal(classifyApiError(missing).kind, 'notFound')
  assert.equal(
    getErrorMessage(missing, 'fallback'),
    'This lead was removed. Refresh the list.',
  )

  assert.equal(body('lead-delete-success').data.deleted, true)
  const afterDelete = leadPage('lead-list-zulu-after-delete')
  assert.equal(afterDelete.pagination.total, 0)
  assert.deepEqual(afterDelete.leads, [])
})

test('actual service catalog drives US/CA country choices and filtered options', () => {
  const allServices = normalizeServices(body('service-options').data.services)
  assert.deepEqual(
    allServices.map((service) => service.key),
    ['electrical', 'painting', 'plumbing', 'solar-panels'],
  )
  const usCaServices = normalizeServices(body('service-options-us-ca').data.services)
  assert.deepEqual(
    usCaServices.map((service) => service.key),
    ['plumbing', 'solar-panels'],
  )
  assert.deepEqual(
    usCaServices.find((service) => service.key === 'plumbing').countries,
    ['BE', 'NL', 'FR', 'US', 'CA'],
  )
  assert.deepEqual(
    usCaServices.find((service) => service.key === 'solar-panels').countries,
    ['US', 'CA'],
  )

  const countries = marketingCountryOptions(allServices)
  for (const code of ['BE', 'NL', 'FR', 'DE', 'US', 'CA']) {
    assert.ok(countries.some((country) => country.value === code), `missing country ${code}`)
  }
  assert.match(countries.find((country) => country.value === 'US').label, /United States/)
  assert.match(countries.find((country) => country.value === 'CA').label, /Canada/)
})

test('actual campaign create/edit/list fixtures preserve defaults, customer roles and legacy audiences', () => {
  const defaultSubscribers = body('campaign-create-default-subscribers').data
  assert.equal(defaultSubscribers.type, 'invitation')
  assert.equal(defaultSubscribers.audienceType, 'subscribers')
  assert.deepEqual(defaultSubscribers.audience.roles, ['customer', 'professional'])
  assert.equal(audienceTypeLabel(defaultSubscribers.audienceType), 'Subscribers')
  assert.equal(audienceIncludesLeads(defaultSubscribers.audienceType), false)
  assert.equal(
    campaignAudienceValidation(
      defaultSubscribers.type,
      defaultSubscribers.audienceType,
      defaultSubscribers.audience.roles,
    ),
    null,
  )

  const both = body('campaign-create-both').data
  assert.equal(both.type, 'invitation')
  assert.equal(both.audienceType, 'both')
  assert.deepEqual(both.audience.roles, ['customer', 'professional'])
  assert.equal(audienceTypeLabel(both.audienceType), 'Subscribers+Leads')
  assert.equal(audienceIncludesLeads(both.audienceType), true)
  assert.equal(
    campaignAudienceValidation(both.type, both.audienceType, both.audience.roles),
    null,
  )
  // The both audience must not lock Customer; only Leads does. A professional
  // stored role remains required and locked for a lead-inclusive audience.
  assert.equal(campaignRoleLocked('both', 'customer', ['customer', 'professional']), false)
  assert.equal(campaignRoleLocked('both', 'customer', ['professional']), false)
  assert.equal(campaignRoleLocked('both', 'professional', ['customer', 'professional']), true)
  assert.equal(campaignRoleLocked('leads', 'customer', ['professional']), true)

  const leads = body('campaign-edit-leads').data
  assert.equal(leads.type, 'invitation')
  assert.equal(leads.audienceType, 'leads')
  assert.deepEqual(leads.audience.roles, ['professional'])
  assert.equal(
    campaignAudienceValidation(leads.type, leads.audienceType, leads.audience.roles),
    null,
  )

  const awayFixture = fixture('campaign-type-away-with-leads')
  assert.equal(awayFixture.status, 400)
  assert.equal(
    getErrorMessage(apiErrorFromBody(awayFixture.body, 'fallback', { status: 400 }), 'fallback'),
    'Select Subscribers before changing this campaign type',
  )
  assert.notEqual(
    campaignAudienceValidation('newsletter', 'leads', ['professional']),
    null,
  )

  const awaySubscribers = body('campaign-type-away-subscribers').data
  assert.equal(awaySubscribers.type, 'newsletter')
  assert.equal(awaySubscribers.audienceType, 'subscribers')
  assert.equal(
    campaignAudienceValidation(
      awaySubscribers.type,
      awaySubscribers.audienceType,
      awaySubscribers.audience.roles,
    ),
    null,
  )

  const campaigns = body('campaign-list').data.campaigns
  const invitationCampaigns = body('campaign-list-invitation').data.campaigns
  assert.equal(campaigns.length, 6)
  assert.equal(invitationCampaigns.length, 4)
  assert.ok(invitationCampaigns.every((campaign) => campaign.type === 'invitation'))

  const unknown = campaigns.find((campaign) => campaign.name === 'Legacy unknown audience campaign')
  assert.ok(unknown)
  assert.equal(unknown.audienceType, 'legacy_import')
  assert.equal(unknown.audienceTypeInvalid, true)
  assert.equal(audienceTypeOrNull(unknown.audienceType), null)
  assert.equal(isKnownAudienceType(unknown.audienceType), false)
  assert.equal(audienceTypeLabel(unknown.audienceType), 'Invalid audience type')

  const missing = campaigns.find((campaign) => campaign.name === 'Legacy missing audience campaign')
  assert.ok(missing)
  assert.equal(missing.audienceType, 'subscribers')
  assert.equal(missing.audienceTypeInvalid, undefined)
  assert.equal(audienceTypeLabel(missing.audienceType), 'Subscribers')

  const newsletterBoth = campaigns.find((campaign) => campaign.name === 'Legacy newsletter combined audience')
  assert.ok(newsletterBoth)
  assert.equal(newsletterBoth.type, 'newsletter')
  assert.equal(newsletterBoth.audienceType, 'both')
  assert.notEqual(
    campaignAudienceValidation(
      newsletterBoth.type,
      newsletterBoth.audienceType,
      newsletterBoth.audience.roles,
    ),
    null,
  )
})

test('actual preview fixtures prove source dedupe, role filtering, exclusions and policy errors', () => {
  const both = body('campaign-preview-both').data
  assert.equal(both.audienceType, 'both')
  assert.equal(both.includesLeads, true)
  assert.equal(both.exactTotal, 4)
  assert.equal(both.count, 4)
  assert.equal(both.exactTotalIsEstimate, false)
  assert.equal(both.overLimit, false)
  assert.equal(both.truncated, false)
  assert.deepEqual(both.bySource, { subscribers: 3, leads: 1 })
  assert.deepEqual(both.byRole, { customer: 2, professional: 2 })
  assert.deepEqual(both.byLocale, { nl: 4 })
  assert.equal(both.deduplicated, 2)
  assert.equal(both.excluded.suppressed, 2)
  assert.equal(both.excluded.invalidEmail, 0)
  assert.equal(both.excluded.roleMismatch, 0)

  const professional = body('campaign-preview-both-professional').data
  assert.equal(professional.audienceType, 'both')
  assert.equal(professional.exactTotal, 2)
  assert.deepEqual(professional.bySource, { subscribers: 1, leads: 1 })
  assert.deepEqual(professional.byRole, { customer: 0, professional: 2 })
  assert.equal(professional.deduplicated, 2)
  assert.equal(professional.excluded.suppressed, 2)

  const leads = body('campaign-preview-leads').data
  assert.equal(leads.audienceType, 'leads')
  assert.equal(leads.includesLeads, true)
  assert.equal(leads.exactTotal, 3)
  assert.deepEqual(leads.bySource, { subscribers: 0, leads: 3 })
  assert.deepEqual(leads.byRole, { customer: 0, professional: 3 })
  assert.equal(leads.deduplicated, 0)
  assert.equal(leads.excluded.suppressed, 2)

  const subscribers = body('campaign-preview-subscribers').data
  assert.equal(subscribers.audienceType, 'subscribers')
  assert.equal(subscribers.includesLeads, false)
  assert.equal(subscribers.exactTotal, 3)
  assert.deepEqual(subscribers.bySource, { subscribers: 3, leads: 0 })
  assert.deepEqual(subscribers.byRole, { customer: 2, professional: 1 })
  assert.equal(subscribers.excluded.suppressed, 0)

  const invalidFixture = fixture('campaign-preview-invalid-audience')
  assert.equal(invalidFixture.status, 400)
  assert.equal(
    getErrorMessage(apiErrorFromBody(invalidFixture.body, 'fallback', { status: 400 }), 'fallback'),
    'Audience type must be one of: subscribers, both, leads',
  )

  const customerOnlyFixture = fixture('campaign-preview-customer-only-lead')
  assert.equal(customerOnlyFixture.status, 400)
  assert.equal(
    getErrorMessage(
      apiErrorFromBody(customerOnlyFixture.body, 'fallback', { status: 400 }),
      'fallback',
    ),
    'Lead audiences require the professional role',
  )
  assert.notEqual(
    campaignAudienceValidation('invitation', 'leads', ['customer']),
    null,
  )
})

test('actual professional sync fixture reports local role counts and canonical Belgium data', () => {
  const sync = body('professional-sync').data
  assert.deepEqual(sync.eligibleByRole, { customer: 1, professional: 1 })
  assert.deepEqual(sync.syncedByRole, { customer: 1, professional: 1 })
  assert.deepEqual(sync.skippedByRole, { customer: 0, professional: 0 })
  assert.equal(sync.upserted, 2)
  assert.equal(sync.unsubscribed, 0)

  const summary = subscriberSyncSummary(sync)
  assert.equal(summary.tone, 'success')
  assert.equal(
    summary.message,
    'Subscriber sync complete: 2 synced (1 customer, 1 professional), 0 unsubscribed.',
  )
  assert.deepEqual(summary.counts.eligibleByRole, sync.eligibleByRole)
  assert.deepEqual(summary.counts.syncedByRole, sync.syncedByRole)
  assert.deepEqual(summary.counts.skippedByRole, sync.skippedByRole)
  assert.doesNotMatch(summary.message, /brevo|provider|contact/i)

  const subscribers = body('professional-sync-subscribers').data.subscribers
  const professional = subscribers.find((subscriber) => subscriber.email === 'sync.pro@example.com')
  assert.ok(professional)
  assert.equal(professional.role, 'professional')
  assert.equal(professional.region, 'BE')
  assert.equal(professional.locale, 'nl')
  assert.equal(professional.localeSource, 'explicit')
  assert.deepEqual(professional.serviceKeys, ['plumbing'])
  assert.deepEqual(professional.interestedServices, ['Plumbing'])
  assert.equal(professional.unsubscribedAt, null)
  assert.equal(professional.suppressed, false)
})

test('production invitation footer HTML matches the frontend neutral copy in all locales', () => {
  const footers = fixture('marketing-footer-invitation')
  for (const locale of ['en', 'nl', 'fr', 'de']) {
    const html = footers[locale]
    const copy = invitationFooterCopy(locale)
    assert.ok(html.includes(copy.message), `${locale} invitation message missing`)
    assert.ok(html.includes(copy.unsubscribe), `${locale} unsubscribe label missing`)
    assert.match(html, /data-fixera-marketing-footer="true"/)
    assert.match(html, /\/unsubscribe\?token=wire-fixture-token/)
    assert.doesNotMatch(html, /profile\?tab=notifications/)
    assert.doesNotMatch(html, /opted in/i)
    assert.doesNotMatch(html, /Notification preferences/i)
    assert.doesNotMatch(html, /Meldingsvoorkeuren/i)
    assert.doesNotMatch(html, /Préférences de notification/i)
    assert.doesNotMatch(html, /Benachrichtigungseinstellungen/i)
  }
})

test('fixture-derived rows and history feed the actual lead table and import components', () => {
  const page2 = leadPage('lead-list-page-2')
  const services = normalizeServices(body('service-options').data.services)
  const languages = [
    { code: 'nl', label: 'Nederlands', countries: [] },
    { code: 'fr', label: 'Français', countries: [] },
    { code: 'en', label: 'English', countries: [] },
  ]
  const common = {
    leads: page2.leads,
    services,
    languages,
    sort: 'email',
    direction: 'asc',
    onSort: noop,
    onEdit: noop,
    onDelete: noop,
  }
  const readOnly = renderToStaticMarkup(
    React.createElement(LeadTable, { ...common, canWrite: false }),
  )
  assert.equal((readOnly.match(/>suppressed@example\.com</g) || []).length, 4)
  assert.match(readOnly, /Suppressed/)
  assert.match(readOnly, /provider/)
  assert.match(readOnly, /Active lead/)
  assert.doesNotMatch(readOnly, /Edit lead/)
  assert.doesNotMatch(readOnly, /Delete lead/)

  const writable = renderToStaticMarkup(
    React.createElement(LeadTable, { ...common, canWrite: true }),
  )
  assert.match(writable, /Edit lead suppressed@example\.com/)
  assert.match(writable, /Delete lead suppressed@example\.com/)

  const suppressedResult = importRecord('import-suppressed-identities')
  const dialog = renderToStaticMarkup(
    React.createElement(LeadImportDialogBody, {
      fileName: suppressedResult.filename,
      fileSize: 1200,
      fileError: null,
      importing: false,
      result: suppressedResult,
      error: null,
      onFileChange: noop,
      onRemoveFile: noop,
      onSubmit: noop,
      onTryAgain: noop,
      onChooseAnother: noop,
      onOpenLeads: noop,
      onDone: noop,
      onCancel: noop,
    }),
  )
  assert.match(dialog, /Import complete with suppressed leads/)
  assert.match(dialog, /Suppressed leads are not eligible for campaigns/)
  assert.match(dialog, /Imported 3 leads/)
  assert.match(dialog, /1 duplicate skipped/)
  assert.match(dialog, /lead-campaign-suppressed-identities\.xlsx/)

  const history = parseLeadHistoryData(body('import-history').data)
  const historyHtml = renderToStaticMarkup(
    React.createElement(LeadImportHistoryTable, {
      imports: history.imports,
      loading: false,
      error: null,
      page: 1,
      totalPages: 1,
      total: history.imports.length,
      onRetry: noop,
      onPageChange: noop,
      onViewDetails: noop,
    }),
  )
  assert.match(historyHtml, /lead-campaign-invalid-rows\.xlsx/)
  assert.match(historyHtml, /lead-campaign-malformed\.xlsx/)
  assert.match(historyHtml, /No new leads/)
  assert.match(historyHtml, /Imported; suppressed leads excluded/)
  assert.match(historyHtml, /data-import-tone="warning"/)
  assert.match(historyHtml, /View errors for lead-campaign-invalid-rows\.xlsx/)
  assert.doesNotMatch(historyHtml, /download/i)

  const invalidHistory = history.imports.find(
    (row) => row.filename === 'lead-campaign-invalid-rows.xlsx',
  )
  const details = renderToStaticMarkup(
    React.createElement(LeadImportHistoryDetails, { record: invalidHistory }),
  )
  assert.match(details, /lead-campaign-invalid-rows\.xlsx/)
  assert.match(details, /Row 2, email: Enter a valid email address/)
  assert.match(details, /Row 3, email: Enter a valid email address/)
})

test('fixture provenance shows loopback-only generation and no outbound attempts', () => {
  const provenance = fixture('provenance')
  assert.equal(provenance.database, 'fixera_lead_campaign_wire_fixtures_test')
  assert.deepEqual(provenance.deniedNetwork, [])
  assert.match(provenance.routes.import, /POST \/api\/admin\/marketing-leads\/import/)
  assert.match(provenance.routes.footer, /renderMarketingFooter/)
  assert.equal(provenance.backendRevision.branch, 'feat/professional-lead-campaigns')
  assert.equal(provenance.frontendRevision.branch, 'feat/professional-lead-campaigns')
})
