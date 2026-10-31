import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { CampaignHeaderActions } = await import('@/components/admin/marketing/CampaignHeaderActions')
const {
  LeadTable,
  LeadTableEmpty,
  LeadTableSkeleton,
  LeadLoadError,
  LeadImportHistoryTable,
} = await import('@/components/admin/marketing/LeadTable')
const { LeadImportDialogBody } = await import('@/components/admin/marketing/LeadImportDialog')
const {
  MARKETING_AUDIENCE_TYPES,
  MARKETING_AUDIENCE_TYPE_LABELS,
  MARKETING_CAMPAIGN_TYPES,
  MARKETING_CAMPAIGN_TYPE_LABELS,
  audienceIncludesLeads,
  audienceTypeLabel,
  audienceTypeOrNull,
  campaignAudienceValidation,
  campaignRoleLocked,
  campaignTypeLabel,
  invitationFooterCopy,
  marketingCountryOptions,
  normalizeAudienceType,
  subscriberSyncSummary,
} = await import('@/lib/admin/marketing.ts')
const {
  DEFAULT_LEAD_DIRECTION,
  DEFAULT_LEAD_SORT,
  clampLeadPage,
  leadFileValidation,
  leadImportErrorState,
  leadImportKind,
  leadImportOutcome,
  leadListHasFilters,
  leadListParams,
  leadSortAria,
  nextLeadSort,
  normalizeLeadRows,
  parseLeadHistoryData,
  parseLeadImportRecord,
  requestLeadDelete,
  requestLeadImport,
  requestLeadImportHistory,
  requestLeadList,
  requestLeadUpdate,
  LeadImportRequestError,
  validateLeadEditValues,
} = await import('@/lib/admin/marketingLeads.ts')
const {
  adminPageAreaForPath,
  canAccessAdminPage,
  canWriteAdminArea,
  permissionForAdminPage,
} = await import('@/lib/adminRbac.ts')
const { apiErrorFromBody, classifyApiError, getErrorMessage } = await import('@/lib/apiErrors.ts')

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')

const noop = () => {}
const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const leadRecord = (overrides = {}) => ({
  _id: 'lead-1',
  email: 'ada@example.com',
  country: 'BE',
  locale: 'nl',
  serviceKeys: ['plumbing'],
  interestedServices: ['Plumbing'],
  status: 'active',
  unsubscribedAt: null,
  lastCampaignSentAt: null,
  suppressed: false,
  suppressionReason: null,
  createdAt: '2026-10-26T10:15:00.000Z',
  updatedAt: '2026-10-26T10:15:00.000Z',
  ...overrides,
})

const importRecord = (overrides = {}) =>
  parseLeadImportRecord({
    import: {
      _id: 'import-1',
      filename: 'leads-october.xlsx',
      uploadedAt: '2026-10-26T10:15:00.000Z',
      status: 'partial',
      totalRows: 10,
      importedRows: 8,
      duplicateRows: 1,
      failedRows: 1,
      errorCount: 1,
      ...overrides,
    },
    summary: {
      totalRows: overrides.totalRows ?? 10,
      importedRows: overrides.importedRows ?? 8,
      duplicateRows: overrides.duplicateRows ?? 1,
      failedRows: overrides.failedRows ?? 1,
    },
    errors: overrides.errors ?? [
      { row: 14, field: 'email', message: 'Enter a valid email address' },
    ],
  })

test('campaign type and audience helpers keep legacy campaigns subscriber-only', () => {
  assert.deepEqual(MARKETING_CAMPAIGN_TYPES, [
    'newsletter',
    'promotion',
    'reengagement',
    'invitation',
  ])
  assert.equal(MARKETING_CAMPAIGN_TYPE_LABELS.invitation, 'Invitation')
  assert.equal(campaignTypeLabel('invitation'), 'Invitation')
  assert.deepEqual(MARKETING_AUDIENCE_TYPES, ['subscribers', 'both', 'leads'])
  assert.equal(MARKETING_AUDIENCE_TYPE_LABELS.both, 'Subscribers+Leads')
  assert.equal(normalizeAudienceType(undefined), 'subscribers')
  assert.equal(normalizeAudienceType('unexpected'), 'subscribers')
  assert.equal(audienceTypeLabel(null), 'Subscribers')
  assert.equal(audienceTypeLabel('legacy'), 'Invalid audience type')
  assert.equal(audienceTypeOrNull('legacy'), null)
  assert.equal(audienceTypeOrNull(undefined), 'subscribers')
  assert.equal(audienceIncludesLeads('subscribers'), false)
  assert.equal(audienceIncludesLeads('leads'), true)

  assert.match(
    campaignAudienceValidation('newsletter', 'leads', ['professional']),
    /only available for invitation campaigns/,
  )
  assert.equal(
    campaignAudienceValidation('invitation', 'leads', []),
    'Lead audiences require the professional role.',
  )
  assert.equal(
    campaignAudienceValidation('invitation', 'both', ['professional']),
    null,
  )
  assert.equal(campaignAudienceValidation('invitation', 'subscribers', []), null)
})

test('combined audiences can add customer subscribers after selecting Leads', () => {
  const professionalOnly = ['professional']
  assert.equal(campaignRoleLocked('leads', 'customer', professionalOnly), true)
  assert.equal(campaignRoleLocked('both', 'customer', professionalOnly), false)
  const combinedRoles = [...professionalOnly, 'customer']
  assert.equal(campaignAudienceValidation('invitation', 'both', combinedRoles), null)
  assert.equal(campaignRoleLocked('both', 'professional', combinedRoles), true)
  assert.equal(campaignRoleLocked('subscribers', 'professional', combinedRoles), false)
})

test('lead and campaign countries include non-EU service countries and retained values', () => {
  const options = marketingCountryOptions(
    [{ key: 'plumbing', label: 'Plumbing', countries: ['US', 'ca', 'BE', 'US'] }],
    ['AU'],
  )
  for (const code of ['US', 'CA', 'AU', 'BE']) {
    assert.equal(options.filter((option) => option.value === code).length, 1)
  }
  assert.match(options.find((option) => option.value === 'US').label, /United States/)
  assert.equal(validateLeadEditValues({ country: 'CA', locale: 'en', serviceKeys: ['plumbing'] }), null)
})

test('invitation footer previews follow the selected content locale', () => {
  const phrases = { en: 'professional invitation', nl: 'professionele uitnodiging', fr: 'invitation professionnelle', de: 'professionelle Einladung' }
  const unsubscribe = { en: 'Unsubscribe', nl: 'Uitschrijven', fr: 'Se désabonner', de: 'Abmelden' }
  for (const [locale, phrase] of Object.entries(phrases)) {
    const copy = invitationFooterCopy(locale)
    const html = renderToStaticMarkup(React.createElement('p', null, copy.message, ' ', React.createElement('span', null, copy.unsubscribe)))
    assert.match(html, new RegExp(phrase))
    assert.equal(copy.unsubscribe, unsubscribe[locale])
    assert.doesNotMatch(html, /because you opted in/)
  }
  assert.deepEqual(invitationFooterCopy('unsupported'), invitationFooterCopy('en'))
})

test('subscriber sync summary uses actual role counts and warns honestly', () => {
  const legacy = subscriberSyncSummary({ upserted: 42, unsubscribed: 3 })
  assert.equal(legacy.tone, 'success')
  assert.match(legacy.message, /42 synced/)
  assert.match(legacy.message, /3 unsubscribed/)
  assert.doesNotMatch(legacy.message, /professional/)

  const split = subscriberSyncSummary({
    upserted: 42,
    unsubscribed: 3,
    eligibleByRole: { customer: 31, professional: 11 },
    syncedByRole: { customer: 31, professional: 11 },
  })
  assert.equal(split.tone, 'success')
  assert.match(split.message, /42 synced \(31 customers, 11 professionals\)/)

  const gap = subscriberSyncSummary({
    upserted: 31,
    unsubscribed: 3,
    eligibleByRole: { customer: 31, professional: 11 },
    syncedByRole: { customer: 31, professional: 0 },
  })
  assert.equal(gap.tone, 'warning')
  assert.match(gap.message, /11 professionals matched but were not synced/)

  const noneSynced = subscriberSyncSummary({
    upserted: 0,
    unsubscribed: 0,
    eligibleByRole: { customer: 21, professional: 11 },
    syncedByRole: { customer: 0, professional: 0 },
  })
  assert.equal(noneSynced.tone, 'warning')
  assert.match(noneSynced.message, /21 customers and 11 professionals matched but were not synced/)
  assert.match(noneSynced.message, /0 synced/)

  const skipped = subscriberSyncSummary({
    upserted: 42,
    unsubscribed: 3,
    eligibleByRole: { customer: 31, professional: 11 },
    syncedByRole: { customer: 31, professional: 11 },
    skippedByRole: { professional: 2 },
  })
  assert.equal(skipped.tone, 'warning')
  assert.match(skipped.message, /2 professionals matched but were not synced/)
})

test('lead list parameters cover server filters, sorting and paging', () => {
  const params = leadListParams(
    {
      q: ' ada ',
      country: 'BE',
      locale: 'nl',
      service: 'plumbing',
      sort: 'service',
      direction: 'desc',
    },
    2,
    25,
  )
  assert.equal(params.get('q'), 'ada')
  assert.equal(params.get('country'), 'BE')
  assert.equal(params.get('locale'), 'nl')
  assert.equal(params.get('serviceKey'), 'plumbing')
  assert.equal(params.get('sort'), 'service')
  assert.equal(params.get('direction'), 'desc')
  assert.equal(params.get('page'), '2')
  assert.equal(params.get('limit'), '25')
  assert.equal(new URLSearchParams(leadListParams({ q: 'a', country: 'all', locale: 'all', service: 'all', sort: DEFAULT_LEAD_SORT, direction: DEFAULT_LEAD_DIRECTION }, 1, 25)).get('q'), null)
  assert.equal(leadListHasFilters({ q: 'a', country: 'all', locale: 'all', service: 'all', sort: 'email', direction: 'asc' }), false)
  assert.equal(leadListHasFilters({ q: 'ab', country: 'all', locale: 'all', service: 'all', sort: 'email', direction: 'asc' }), true)

  assert.deepEqual(nextLeadSort('email', 'asc', 'country'), { sort: 'country', direction: 'asc' })
  assert.deepEqual(nextLeadSort('email', 'asc', 'email'), { sort: 'email', direction: 'desc' })
  assert.equal(leadSortAria('email', 'email', 'asc'), 'ascending')
  assert.equal(leadSortAria('country', 'email', 'asc'), 'none')
  assert.equal(clampLeadPage(5, 2), 2)
  assert.equal(clampLeadPage(0, 2), 1)
})

test('lead file and edit validation reject unsafe input before a request', () => {
  assert.match(leadFileValidation(null), /Choose an Excel workbook/)
  assert.match(leadFileValidation({ name: 'leads.csv', size: 100 }), /\.xlsx or \.xls/)
  assert.match(leadFileValidation({ name: 'leads.xlsx', size: 6 * 1024 * 1024 }), /5 MB/)
  assert.equal(leadFileValidation({ name: 'leads.xlsx', size: 1024 }), null)
  assert.equal(leadFileValidation({ name: 'LEADS.XLS', size: 1024 }), null)
  assert.equal(validateLeadEditValues({ country: 'BE', locale: 'nl', serviceKeys: ['plumbing'] }), null)
  assert.match(validateLeadEditValues({ country: '', locale: 'nl', serviceKeys: ['plumbing'] }), /country/i)
  assert.match(validateLeadEditValues({ country: 'BE', locale: 'nl', serviceKeys: [] }), /service/i)
})

test('import outcomes distinguish success, partial, duplicate-only and failure', () => {
  const success = importRecord({
    status: 'completed',
    totalRows: 8,
    importedRows: 8,
    duplicateRows: 0,
    failedRows: 0,
    errorCount: 0,
    errors: [],
  })
  const successOutcome = leadImportOutcome(success)
  assert.equal(successOutcome.kind, 'success')
  assert.equal(successOutcome.tone, 'success')
  assert.equal(successOutcome.message, 'Imported 8 leads.')
  assert.equal(successOutcome.statusLabel, 'Imported')

  const withDuplicates = leadImportOutcome(importRecord({
    status: 'completed', totalRows: 10, importedRows: 8, duplicateRows: 2,
    failedRows: 0, errors: [], errorCount: 0,
  }))
  assert.equal(withDuplicates.kind, 'success')
  assert.equal(withDuplicates.tone, 'success')
  assert.match(withDuplicates.message, /2 duplicates skipped/)

  const suppressed = importRecord({
    status: 'completed', totalRows: 3, importedRows: 3, duplicateRows: 0,
    failedRows: 0, suppressedRows: 3, errors: [], errorCount: 0,
  })
  const suppressedOutcome = leadImportOutcome(suppressed)
  assert.equal(suppressedOutcome.tone, 'warning')
  assert.match(suppressedOutcome.message, /not eligible for campaigns/)
  assert.match(suppressedOutcome.statusLabel, /suppressed/)
  const suppressedHtml = importBody({ result: suppressed })
  assert.match(suppressedHtml, /Import complete with suppressed leads/)
  assert.match(suppressedHtml, /bg-amber-50/)
  assert.doesNotMatch(suppressedHtml, /bg-emerald-50/)

  const duplicate = importRecord({
    status: 'completed',
    totalRows: 5,
    importedRows: 0,
    duplicateRows: 5,
    failedRows: 0,
    errorCount: 0,
    errors: [],
  })
  const duplicateOutcome = leadImportOutcome(duplicate)
  assert.equal(leadImportKind(duplicate), 'duplicate')
  assert.equal(duplicateOutcome.tone, 'neutral')
  assert.equal(duplicateOutcome.title, 'No new leads')
  assert.match(duplicateOutcome.message, /Nothing was imported/)
  assert.equal(duplicateOutcome.statusLabel, 'No new leads')

  const partial = importRecord()
  const partialOutcome = leadImportOutcome(partial)
  assert.equal(partialOutcome.kind, 'partial')
  assert.equal(partialOutcome.tone, 'warning')
  assert.equal(partialOutcome.message, 'Imported 8 of 10 rows. 1 duplicate skipped. 1 row failed.')
  assert.equal(partialOutcome.statusLabel, 'Partially imported')

  const failed = importRecord({
    status: 'failed',
    totalRows: 4,
    importedRows: 0,
    duplicateRows: 0,
    failedRows: 4,
    errorCount: 4,
  })
  const failedOutcome = leadImportOutcome(failed)
  assert.equal(failedOutcome.kind, 'failed')
  assert.equal(failedOutcome.tone, 'danger')
  assert.equal(failedOutcome.title, 'Import failed')
  assert.match(failedOutcome.message, /No leads were imported/)

  const unknown = importRecord({ status: 'future_status' })
  assert.equal(leadImportKind(unknown), 'unknown')
  assert.equal(leadImportOutcome(unknown).statusLabel, 'Unknown status')
})

test('import and mutation errors stay actionable and do not leak transport noise', () => {
  const validation = apiErrorFromBody(
    { success: false, msg: 'Missing required columns: Country, Language', code: 'VALIDATION' },
    'fallback',
    { status: 400 },
  )
  const validationState = leadImportErrorState(validation)
  assert.equal(validationState.message, 'Missing required columns: Country, Language')
  assert.equal(validationState.retryable, false)
  assert.equal(validationState.ambiguous, false)

  const network = leadImportErrorState(new TypeError('Failed to fetch'))
  assert.equal(network.kind, 'network')
  assert.equal(network.retryable, true)
  assert.equal(network.ambiguous, true)
  assert.match(network.message, /offline|internet connection/i)
})

test('lead list HTTP request sends filters and does not deduplicate shared emails', async () => {
  let captured
  const fetchImpl = async (url, init) => {
    captured = { url: String(url), init }
    return jsonResponse(200, {
      success: true,
      data: {
        leads: [
          leadRecord(),
          leadRecord({ _id: 'lead-2', country: 'NL', serviceKeys: ['painting'] }),
          leadRecord({ _id: 'lead-3', suppressed: true, suppressionReason: 'unsubscribe' }),
        ],
        pagination: { page: 2, limit: 25, total: 30, totalPages: 2 },
      },
    })
  }
  const params = new URLSearchParams({ page: '2', limit: '25', sort: 'email', direction: 'asc' })
  const page = await requestLeadList(params, { apiBase: 'http://backend.test', fetchImpl })
  assert.match(captured.url, /\/api\/admin\/marketing-leads\?page=2&limit=25/)
  assert.equal(captured.init.signal, undefined)
  assert.equal(page.pagination.total, 30)
  assert.equal(page.leads.length, 3)
  assert.equal(page.leads[0].email, page.leads[1].email)
  assert.equal(page.leads[2].suppressed, true)
})

test('lead edit 409 keeps the server conflict copy and status', async () => {
  const fetchImpl = async () =>
    jsonResponse(409, {
      success: false,
      code: 'CONFLICT',
      msg: 'Another lead already has this email, country, language, and service combination',
    })
  await assert.rejects(
    () =>
      requestLeadUpdate(
        'lead-1',
        { country: 'BE', locale: 'nl', serviceKeys: ['plumbing'] },
        { apiBase: 'http://backend.test', fetchImpl },
      ),
    (error) => {
      assert.equal(classifyApiError(error).status, 409)
      assert.equal(
        getErrorMessage(error, 'fallback'),
        'Another lead already has this email, country, language, and service combination',
      )
      return true
    },
  )
})

test('lead delete treats a missing row as a 404 for a truthful refresh', async () => {
  const fetchImpl = async () =>
    jsonResponse(404, { success: false, code: 'NOT_FOUND', msg: 'Lead not found' })
  await assert.rejects(
    () => requestLeadDelete('lead-1', { apiBase: 'http://backend.test', fetchImpl }),
    (error) => {
      assert.equal(classifyApiError(error).status, 404)
      return true
    },
  )
})

test('lead import is an explicit multipart POST with no content-type override', async () => {
  let captured
  const fetchImpl = async (url, init) => {
    captured = { url: String(url), init }
    return jsonResponse(201, {
      success: true,
      data: {
        import: {
          _id: 'import-1',
          filename: 'leads.xlsx',
          uploadedAt: '2026-10-26T10:15:00.000Z',
          status: 'completed',
          totalRows: 1,
          importedRows: 1,
          duplicateRows: 0,
          failedRows: 0,
        },
        summary: { totalRows: 1, importedRows: 1, duplicateRows: 0, failedRows: 0 },
        errors: [],
      },
    })
  }
  const file = new File(['email,country,language,service'], 'leads.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const record = await requestLeadImport({ apiBase: 'http://backend.test', file, fetchImpl })
  assert.match(captured.url, /\/api\/admin\/marketing-leads\/import$/)
  assert.equal(captured.init.method, 'POST')
  assert.equal(captured.init.headers, undefined)
  assert.ok(captured.init.body instanceof FormData)
  assert.equal(captured.init.body.get('file').name, 'leads.xlsx')
  assert.equal(record.filename, 'leads.xlsx')
  assert.equal(leadImportOutcome(record).kind, 'success')
})

test('a file-level import failure keeps its failed history record and safe message', async () => {
  const fetchImpl = async () =>
    jsonResponse(400, {
      success: false,
      msg: 'Missing required columns: Country, Language',
      code: 'VALIDATION',
      data: {
        import: {
          _id: 'import-failed',
          filename: 'broken.xlsx',
          uploadedAt: '2026-10-26T10:20:00.000Z',
          status: 'failed',
          totalRows: 0,
          importedRows: 0,
          duplicateRows: 0,
          failedRows: 0,
          suppressedRows: 0,
          fileError: 'Missing required columns: Country, Language',
          errorCount: 0,
        },
      },
    })
  const file = new File(['not,a,valid,workbook'], 'broken.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  let caught
  try {
    await requestLeadImport({ apiBase: 'http://backend.test', file, fetchImpl })
  } catch (error) {
    caught = error
  }
  assert.ok(caught instanceof LeadImportRequestError)
  assert.equal(caught.record.filename, 'broken.xlsx')
  assert.equal(caught.record.fileError, 'Missing required columns: Country, Language')
  const state = leadImportErrorState(caught)
  assert.equal(state.ambiguous, false)
  assert.equal(state.retryable, false)
  assert.equal(state.message, 'Missing required columns: Country, Language')
  assert.equal(leadImportKind(caught.record), 'failed')
  assert.equal(
    leadImportOutcome(caught.record).message,
    'No leads were imported. Missing required columns: Country, Language',
  )
})

test('upload history parser and request read filename, time, status and counts', async () => {
  const body = {
    success: true,
    data: {
      imports: [
        {
          _id: 'import-1',
          filename: 'leads-october.xlsx',
          uploadedAt: '2026-10-26T10:15:00.000Z',
          status: 'completed',
          totalRows: 5,
          importedRows: 0,
          duplicateRows: 5,
          failedRows: 0,
        },
        {
          _id: 'import-2',
          filename: 'broken.xlsx',
          uploadedAt: '2026-10-25T09:00:00.000Z',
          status: 'failed',
          totalRows: 4,
          importedRows: 0,
          duplicateRows: 0,
          failedRows: 4,
          errorCount: 4,
        },
      ],
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
    },
  }
  const fetchImpl = async () => jsonResponse(200, body)
  const history = await requestLeadImportHistory(
    new URLSearchParams({ page: '1', limit: '10' }),
    { apiBase: 'http://backend.test', fetchImpl },
  )
  assert.equal(history.imports.length, 2)
  assert.equal(history.imports[0].filename, 'leads-october.xlsx')
  assert.equal(leadImportStatus(history.imports[0]), 'No new leads')
  assert.equal(history.imports[1].uploadedAt, '2026-10-25T09:00:00.000Z')
  assert.equal(leadImportStatus(history.imports[1]), 'Import failed')

  const parsed = parseLeadHistoryData({
    imports: [
      {
        filename: 'renamed.xlsx',
        uploadedAt: '2026-10-24T08:30:00.000Z',
        status: 'partial',
        totalRows: 3,
        importedRows: 2,
        duplicateRows: 0,
        failedRows: 1,
      },
    ],
  })
  assert.equal(parsed.imports[0].filename, 'renamed.xlsx')
  assert.equal(parsed.pagination.total, 1)
})

function leadImportStatus(record) {
  return leadImportOutcome(record).statusLabel
}

test('campaign header actions expose exact labels and hide write actions for read-only access', () => {
  const props = {
    syncing: false,
    onSyncSubscribers: noop,
    onSubscribers: noop,
    onImportLeads: noop,
    onOpenLeads: noop,
    onNewCampaign: noop,
  }
  const writeHtml = renderToStaticMarkup(
    React.createElement(CampaignHeaderActions, { ...props, canWrite: true }),
  )
  for (const label of [
    'Import Leads',
    'Open leads database',
    'Sync subscribers',
    'Subscribers',
    'New campaign',
  ]) {
    assert.match(writeHtml, new RegExp(`>${label}<`))
  }

  const readHtml = renderToStaticMarkup(
    React.createElement(CampaignHeaderActions, { ...props, canWrite: false }),
  )
  assert.match(readHtml, />Open leads database</)
  assert.match(readHtml, />Subscribers</)
  assert.doesNotMatch(readHtml, />Import Leads</)
  assert.doesNotMatch(readHtml, />Sync subscribers</)
  assert.doesNotMatch(readHtml, />New campaign</)
})

function importBody(overrides = {}) {
  return renderToStaticMarkup(
    React.createElement(LeadImportDialogBody, {
      fileName: null,
      fileSize: null,
      fileError: null,
      importing: false,
      result: null,
      error: null,
      onFileChange: noop,
      onRemoveFile: noop,
      onSubmit: noop,
      onTryAgain: noop,
      onChooseAnother: noop,
      onOpenLeads: noop,
      onDone: noop,
      onCancel: noop,
      ...overrides,
    }),
  )
}

test('import dialog explains exact columns, formats and limits without upload on render', () => {
  const html = importBody()
  for (const text of ['Email', 'Country', 'Language', 'Service']) {
    assert.match(html, new RegExp(`>${text}<`))
  }
  for (const text of ['.xlsx', '.xls', '5 MB', '5,000', 'professional contacts', 'Invitation campaigns', 'No file selected.']) {
    assert.match(html, new RegExp(text))
  }
  assert.doesNotMatch(html, /Import complete/)
  assert.match(html, /disabled=""/)

  const source = readSource('components/admin/marketing/LeadImportDialog.tsx')
  const start = source.indexOf('const handleFileChange')
  const end = source.indexOf('const submit', start)
  assert.ok(start >= 0 && end > start)
  const fileHandler = source.slice(start, end)
  assert.doesNotMatch(fileHandler, /requestLeadImport|submit\(/)
})

test('import dialog renders selected file, file errors, partial, duplicates and ambiguity', () => {
  const selected = importBody({ fileName: 'leads-october.xlsx', fileSize: 1200 })
  assert.match(selected, /leads-october\.xlsx/)
  assert.match(selected, /\(1 KB\)/)

  const fileError = importBody({
    fileError: 'Choose an Excel workbook (.xlsx or .xls).',
    fileName: 'leads.csv',
  })
  assert.match(fileError, /role="alert"/)
  assert.match(fileError, /Choose an Excel workbook/)

  const partial = importBody({ result: importRecord(), fileName: 'leads-october.xlsx' })
  assert.match(partial, /Partially imported/)
  assert.match(partial, /Imported 8 of 10 rows/)
  assert.match(partial, /Row 14, email: Enter a valid email address/)
  assert.match(partial, /Open leads database/)
  assert.doesNotMatch(partial, />Import complete</)

  const duplicate = importBody({
    fileName: 'leads-october.xlsx',
    result: importRecord({
      status: 'completed',
      totalRows: 5,
      importedRows: 0,
      duplicateRows: 5,
      failedRows: 0,
      errorCount: 0,
      errors: [],
    }),
  })
  assert.match(duplicate, /No new leads/)
  assert.doesNotMatch(duplicate, />Import complete</)
  assert.match(duplicate, /Done/)

  const failedRows = importBody({
    fileName: 'leads-october.xlsx',
    result: importRecord({
      status: 'failed',
      totalRows: 4,
      importedRows: 0,
      duplicateRows: 0,
      failedRows: 4,
      errorCount: 1,
      errors: [{ row: 2, field: 'service', message: 'Unknown service' }],
    }),
  })
  assert.match(failedRows, /Import failed/)
  assert.match(failedRows, /Choose another file/)
  assert.doesNotMatch(failedRows, />Done</)

  const fileLevelFailure = importBody({
    result: importRecord({
      status: 'failed',
      totalRows: 0,
      importedRows: 0,
      duplicateRows: 0,
      failedRows: 0,
      errorCount: 0,
      errors: [],
      fileError: 'Missing required columns: Country',
    }),
    error: {
      message: 'Missing required columns: Country',
      retryable: false,
      ambiguous: false,
      kind: 'validation',
    },
  })
  assert.match(fileLevelFailure, /Import failed/)
  assert.match(fileLevelFailure, /Missing required columns: Country/)
  assert.match(fileLevelFailure, /Choose another file/)
  assert.doesNotMatch(fileLevelFailure, />Done</)

  const ambiguous = importBody({
    fileName: 'leads-october.xlsx',
    error: {
      message: 'You appear to be offline. Check your internet connection and try again.',
      retryable: true,
      ambiguous: true,
      kind: 'network',
    },
  })
  assert.match(ambiguous, /The request may have completed/)
  assert.match(ambiguous, /Try again/)
  assert.match(ambiguous, /Choose another file/)

  const pending = importBody({ importing: true, fileName: 'leads-october.xlsx' })
  assert.match(pending, /Importing leads/)
  assert.match(pending, /disabled=""/)
})

test('lead table shows all rows, accessible sorting, suppression and write-only actions', () => {
  const leads = normalizeLeadRows([
    leadRecord(),
    leadRecord({ _id: 'lead-2', country: 'NL', serviceKeys: ['plumbing', 'painting'] }),
    leadRecord({ _id: 'lead-3', email: 'blocked@example.com', suppressed: true, suppressionReason: 'unsubscribe' }),
  ])
  const commonProps = {
    leads,
    services: [
      { key: 'plumbing', label: 'Plumbing' },
      { key: 'painting', label: 'Painting' },
    ],
    languages: [{ code: 'nl', label: 'Nederlands' }],
    sort: 'email',
    direction: 'asc',
    onSort: noop,
    onEdit: noop,
    onDelete: noop,
  }
  const writeHtml = renderToStaticMarkup(
    React.createElement(LeadTable, { ...commonProps, canWrite: true }),
  )
  assert.equal((writeHtml.match(/>ada@example\.com</g) || []).length, 2)
  assert.match(writeHtml, /aria-sort="ascending"/)
  assert.match(writeHtml, /Sort by Email descending/)
  assert.match(writeHtml, /Plumbing, Painting/)
  assert.match(writeHtml, /Active lead/)
  assert.match(writeHtml, /Suppressed/)
  assert.match(writeHtml, /unsubscribe/)
  assert.match(writeHtml, /Edit lead ada@example\.com/)
  assert.match(writeHtml, /Delete lead ada@example\.com/)
  assert.doesNotMatch(writeHtml, /Subscribed|Opted in/)

  const readHtml = renderToStaticMarkup(
    React.createElement(LeadTable, { ...commonProps, canWrite: false }),
  )
  assert.doesNotMatch(readHtml, /Edit lead/)
  assert.doesNotMatch(readHtml, /Delete lead/)
  assert.doesNotMatch(readHtml, /Actions/)
})

test('lead table empty, loading and error states are explicit', () => {
  const empty = renderToStaticMarkup(
    React.createElement(LeadTableEmpty, {
      hasFilters: false,
      canWrite: true,
      onImport: noop,
      onClearFilters: noop,
    }),
  )
  assert.match(empty, /No leads yet\. Import Leads to add professional contacts\./)
  assert.match(empty, /Import Leads/)

  const filtered = renderToStaticMarkup(
    React.createElement(LeadTableEmpty, {
      hasFilters: true,
      canWrite: true,
      onImport: noop,
      onClearFilters: noop,
    }),
  )
  assert.match(filtered, /No leads match these filters\./)
  assert.match(filtered, /Clear filters/)
  assert.doesNotMatch(filtered, /No leads yet/)

  const loading = renderToStaticMarkup(React.createElement(LeadTableSkeleton))
  assert.match(loading, /role="status"/)
  assert.match(loading, /Loading leads/)

  const error = renderToStaticMarkup(
    React.createElement(LeadLoadError, { message: 'Failed to load leads', onRetry: noop }),
  )
  assert.match(error, /role="alert"/)
  assert.match(error, /Retry/)
})

test('upload history renders server filename, date, truthful status and no download action', () => {
  const imports = [
    importRecord({
      status: 'completed',
      totalRows: 5,
      importedRows: 0,
      duplicateRows: 5,
      failedRows: 0,
      errorCount: 0,
      errors: [],
      filename: 'leads-october.xlsx',
    }),
    importRecord({
      status: 'failed',
      totalRows: 0,
      importedRows: 0,
      duplicateRows: 0,
      failedRows: 0,
      errorCount: 0,
      errors: [],
      fileError: 'Missing required columns: Country',
      filename: 'broken.xlsx',
    }),
  ]
  const html = renderToStaticMarkup(
    React.createElement(LeadImportHistoryTable, {
      imports,
      loading: false,
      error: null,
      page: 1,
      totalPages: 1,
      total: 2,
      onRetry: noop,
      onPageChange: noop,
      onViewDetails: noop,
    }),
  )
  assert.match(html, /leads-october\.xlsx/)
  assert.match(html, /broken\.xlsx/)
  assert.match(html, /No new leads/)
  assert.match(html, /Import failed/)
  assert.match(html, /Missing required columns: Country/)
  assert.match(html, /data-import-tone="neutral"/)
  assert.match(html, /data-import-tone="danger"/)
  assert.match(html, /2026/)
  assert.doesNotMatch(html, /download/i)
  assert.doesNotMatch(html, /Uploaded<\/th>/i.test(html) ? /$^/ : /Uploaded/)

  const errorHtml = renderToStaticMarkup(
    React.createElement(LeadImportHistoryTable, {
      imports: [],
      loading: false,
      error: 'Failed to load upload history',
      page: 1,
      totalPages: 1,
      total: 0,
      onRetry: noop,
      onPageChange: noop,
    }),
  )
  assert.match(errorHtml, /role="alert"/)
  assert.match(errorHtml, /Failed to load upload history/)
  assert.doesNotMatch(errorHtml, /No imports yet/)

  const emptyHtml = renderToStaticMarkup(
    React.createElement(LeadImportHistoryTable, {
      imports: [],
      loading: false,
      error: null,
      page: 1,
      totalPages: 1,
      total: 0,
      onRetry: noop,
      onPageChange: noop,
    }),
  )
  assert.match(emptyHtml, /No imports yet\./)
})

test('campaign pages keep invite-only policy, old defaults, audience payload and one send action', () => {
  const campaignSource = readSource('app/(pages)/admin/campaigns/page.tsx')
  assert.match(campaignSource, /audienceType: form\.audienceType/)
  assert.match(campaignSource, /audienceType: payload\.audienceType/)
  assert.match(campaignSource, /audienceType: parsedAudienceType \?\? "subscribers"/)
  assert.match(campaignSource, /setInvalidAudienceType\(Boolean\(campaign\.audienceTypeInvalid\) \|\| parsedAudienceType === null\)/)
  assert.match(
    campaignSource,
    /campaignAudienceValidation\(form\.type, form\.audienceType, form\.roles\)/,
  )
  assert.match(
    campaignSource,
    /Leads and combined audiences are available only for Invitation campaigns/,
  )
  assert.equal((campaignSource.match(/Send now/g) || []).length, 1)
  assert.doesNotMatch(campaignSource, /marketingConsentAt|notificationPreferences\.promotions/)
  assert.match(campaignSource, /Estimated total/)
  assert.match(campaignSource, /Exact total/)
  assert.match(campaignSource, /Source split unavailable/)
  assert.match(campaignSource, /Subscribers: \{audiencePreview\.bySource\.subscribers\}/)
  assert.match(campaignSource, /Leads: \{audiencePreview\.bySource\.leads\}/)
  assert.match(campaignSource, /Duplicate emails removed/)
  assert.match(campaignSource, /Suppressed or unsubscribed/)
  assert.match(campaignSource, /Footer preview/)
  assert.match(campaignSource, /does not claim the[\s\S]{0,40}recipient opted in/)
  assert.match(
    campaignSource,
    /onValueChange=\{\(type: CampaignType\) =>\s+setForm\(\(current\) => \(\{ \.\.\.current, type \}\)\)/,
  )
  for (const existingControl of [
    'countryOptions',
    'serviceOptions',
    'MARKETING_ROLES',
    'brevoTemplateId',
    'inactiveDays',
    'autoSend',
    'scheduledAt',
    'Preview audience',
    'Send test',
  ]) {
    assert.match(campaignSource, new RegExp(existingControl))
  }

  const headerSource = readSource('components/admin/marketing/CampaignHeaderActions.tsx')
  assert.match(headerSource, /Import Leads/)
  assert.match(headerSource, /Open leads database/)
  assert.match(headerSource, /canWrite \?/)
})

test('leads UI stores no history locally and never creates consent or subscribers', () => {
  const files = [
    'app/(pages)/admin/campaigns/leads/page.tsx',
    'components/admin/marketing/LeadImportDialog.tsx',
    'components/admin/marketing/LeadTable.tsx',
    'components/admin/marketing/LeadFormDialogs.tsx',
    'lib/admin/marketingLeads.ts',
  ]
  const combined = files.map(readSource).join('\n')
  assert.doesNotMatch(combined, /localStorage|sessionStorage/)
  assert.doesNotMatch(combined, /marketingConsentAt|notificationPreferences\.promotions|MarketingSubscriber/)
  assert.doesNotMatch(combined, /window\.confirm/)
  assert.match(combined, /leads are not subscribers|Leads are not subscribers|has not opted in/i)
})

test('effective marketing read/write gates allow read-only campaign and lead pages', () => {
  assert.equal(permissionForAdminPage('/admin/campaigns/leads'), 'campaigns.manage')
  assert.equal(adminPageAreaForPath('/admin/campaigns/leads'), 'campaigns')

  const readOnly = {
    role: 'admin',
    adminRole: 'marketing',
    adminPermissions: ['cms.manage'],
    adminAccessLevels: { campaigns: 'read' },
  }
  assert.equal(canAccessAdminPage(readOnly, '/admin/campaigns/leads'), true)
  assert.equal(canAccessAdminPage(readOnly, '/admin/campaigns'), true)
  assert.equal(canWriteAdminArea(readOnly, 'campaigns'), false)

  const denied = {
    ...readOnly,
    adminAccessLevels: { campaigns: 'none' },
    adminPermissions: ['campaigns.manage'],
  }
  assert.equal(canAccessAdminPage(denied, '/admin/campaigns/leads'), false)

  const legacy = {
    role: 'admin',
    adminRole: 'marketing',
    adminPermissions: ['campaigns.manage'],
  }
  assert.equal(canAccessAdminPage(legacy, '/admin/campaigns/leads'), true)

  const supportRead = {
    role: 'admin',
    adminRole: 'care',
    adminPermissions: ['dashboard.overview'],
    adminAccessLevels: { support: 'read' },
  }
  assert.equal(canAccessAdminPage(supportRead, '/admin/support'), true)

  assert.equal(canAccessAdminPage({ role: 'customer' }, '/admin/campaigns/leads'), false)
})

test('subscribers page uses the shared sync summary and never turns opt-in on', () => {
  const source = readSource('app/(pages)/admin/campaigns/subscribers/page.tsx')
  assert.match(source, /subscriberSyncSummary\(json\.data\)/)
  assert.match(source, /canWriteArea\("campaigns"\)/)
  assert.doesNotMatch(source, /marketingConsentAt|notificationPreferences\.promotions|MarketingSubscriber\b/)
})
