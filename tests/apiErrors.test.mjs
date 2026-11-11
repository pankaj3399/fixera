import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ApiRequestError,
  apiErrorFromBody,
  apiErrorFromUploadResponse,
  classifyApiError,
  getErrorMessage,
  messageFromApiBody,
  safeUserMessage,
} from '../lib/apiErrors.ts'

const nl = {
  network: 'Je lijkt offline te zijn.',
  timeout: 'Dit duurt langer dan verwacht.',
  server: 'Er ging iets mis aan onze kant.',
  unavailable: 'Deze dienst is tijdelijk niet beschikbaar.',
  auth: 'Je sessie is verlopen.',
  signInRequired: 'Meld je aan om verder te gaan.',
  forbidden: 'Je hebt geen toestemming om dit te doen.',
  notFound: 'We konden dat item niet vinden.',
  validation: 'Controleer de ingevoerde gegevens.',
  conflict: 'Deze actie conflicteert met de huidige status.',
  rateLimited: 'Te veel pogingen. Wacht even.',
  payloadTooLarge: 'Dat bestand is te groot.',
  invalidResponse: 'We konden die aanvraag niet afronden.',
  generic: 'Er ging iets mis.',
}

test('network and timeout runtime errors never expose browser text', () => {
  assert.equal(classifyApiError(new TypeError('Failed to fetch')).kind, 'network')
  assert.equal(
    getErrorMessage(new TypeError('Failed to fetch'), 'Fallback', nl),
    'Je lijkt offline te zijn.',
  )

  const timeout = new DOMException('The operation timed out', 'TimeoutError')
  assert.equal(classifyApiError(timeout).kind, 'timeout')
  assert.equal(getErrorMessage(timeout, 'Fallback', nl), 'Dit duurt langer dan verwacht.')
})

test('Axios-style HTTP failures are classified and sanitized', () => {
  const serverError = {
    isAxiosError: true,
    message: 'Request failed with status code 500',
    response: {
      status: 500,
      data: { success: false, msg: 'MongoServerError: E11000 duplicate key' },
    },
  }
  assert.equal(classifyApiError(serverError).kind, 'server')
  assert.equal(getErrorMessage(serverError, 'Fallback', nl), 'Er ging iets mis aan onze kant.')

  const validationError = {
    isAxiosError: true,
    message: 'Request failed with status code 422',
    response: {
      status: 422,
      data: { success: false, msg: 'VAT number BE0123456789 is invalid' },
    },
  }
  assert.equal(getErrorMessage(validationError, 'Fallback', nl), 'VAT number BE0123456789 is invalid')
})

test('api envelopes keep specific validation/business copy', () => {
  assert.equal(
    messageFromApiBody(
      { success: false, msg: 'Password must be at least 8 characters' },
      'Could not update password',
    ),
    'Password must be at least 8 characters',
  )
  assert.equal(
    messageFromApiBody(
      { success: false, error: { message: 'Project already has an active quotation' } },
      'Could not send quotation',
    ),
    'Project already has an active quotation',
  )
  assert.equal(
    messageFromApiBody({ success: false, msg: 'Invalid email or password' }, 'Login failed'),
    'Invalid email or password',
  )
})

test('missing, non-JSON and technical bodies use the readable fallback', () => {
  assert.equal(messageFromApiBody(null, 'Could not load bookings'), 'Could not load bookings')
  assert.equal(messageFromApiBody({}, 'Could not load bookings'), 'Could not load bookings')
  assert.equal(
    messageFromApiBody({ success: false, msg: 'Invalid server response (502)' }, 'Could not load bookings'),
    'This service is temporarily unavailable. Please try again shortly.',
  )
  assert.equal(
    messageFromApiBody({ success: false, msg: '[object Object]' }, 'Could not load bookings'),
    'Could not load bookings',
  )
  assert.equal(
    messageFromApiBody(
      { success: false, msg: 'at async handler (/srv/app/node_modules/express/lib/router.js:12:3)' },
      'Could not load bookings',
    ),
    'Could not load bookings',
  )
})

test('HTTP/session failures are localized while safe auth detail is kept', () => {
  assert.equal(getErrorMessage(new ApiRequestError('Unauthorized', { status: 401 }), 'Fallback', nl), 'Je sessie is verlopen.')
  assert.equal(
    getErrorMessage(
      { response: { status: 401, data: { msg: 'Please verify your email address before continuing' } } },
      'Fallback',
      nl,
    ),
    'Please verify your email address before continuing',
  )
})

test('backend stable codes map to generic localized kinds', () => {
  assert.equal(
    messageFromApiBody(
      { success: false, code: 'INTERNAL', msg: 'MongoServerError: connection refused' },
      'Could not save',
    ),
    'Something went wrong on our side. Please try again.',
  )
  assert.equal(
    getErrorMessage(
      { success: false, code: 'UNAVAILABLE', msg: 'Brevo API is down' },
      'Fallback',
      nl,
    ),
    'Deze dienst is tijdelijk niet beschikbaar.',
  )
  assert.equal(
    messageFromApiBody(
      { success: false, code: 'VALIDATION', msg: 'Please enter a valid VAT number' },
      'Could not save',
    ),
    'Please enter a valid VAT number',
  )
  assert.equal(
    messageFromApiBody(
      { success: false, code: 'FORBIDDEN', msg: 'This account is pending approval' },
      'Could not continue',
    ),
    'This account is pending approval',
  )
})

test('provider internals and environment details are blocked', () => {
  assert.equal(
    safeUserMessage('StripeInvalidRequestError: No such API key'),
    undefined,
  )
  assert.equal(
    safeUserMessage('NEXT_PUBLIC_BACKEND_URL is not configured'),
    undefined,
  )
  assert.equal(
    safeUserMessage('Image must be smaller than 5 MB'),
    'Image must be smaller than 5 MB',
  )
})

// Exact bodies produced by the current backend shared handler / auth
// middleware (fixera-server/src/utils/handlerErrors.ts, middlewares/auth.ts).
const backendResponse = (status, body) => ({ response: { status, data: body } })

test('current backend generic category bodies use localized public copy', () => {
  const cases = [
    [401, { success: false, code: 'AUTH_REQUIRED', msg: 'Your session has expired. Please sign in again.' }, nl.auth],
    [401, { success: false, code: 'AUTH_REQUIRED', msg: 'Please sign in to continue.' }, nl.signInRequired],
    [403, { success: false, code: 'FORBIDDEN', msg: 'You do not have permission to do that.' }, nl.forbidden],
    [404, { success: false, code: 'NOT_FOUND', msg: 'The requested item could not be found.' }, nl.notFound],
    [429, { success: false, code: 'RATE_LIMITED', msg: 'Too many requests. Please wait a moment and try again.' }, nl.rateLimited],
    [409, { success: false, code: 'CONFLICT', msg: 'This request conflicts with the current state. Refresh and try again.' }, nl.conflict],
    [413, { success: false, code: 'VALIDATION', msg: 'The request is too large. Reduce the amount of data and try again.' }, nl.payloadTooLarge],
  ]

  for (const [status, body, expected] of cases) {
    const error = backendResponse(status, body)
    assert.equal(getErrorMessage(error, 'Contextual fallback', nl), expected)
  }

  // Envelope-only bodies (legacy callers that dropped the HTTP status) are
  // still recognized by their known category copy.
  assert.equal(
    getErrorMessage({ success: false, msg: 'Please sign in to continue.' }, 'Contextual fallback', nl),
    nl.signInRequired,
  )
  assert.equal(
    getErrorMessage({ success: false, msg: 'You do not have permission to do that.' }, 'Contextual fallback', nl),
    nl.forbidden,
  )
  assert.equal(
    getErrorMessage({ success: false, msg: 'The requested item could not be found.' }, 'Contextual fallback', nl),
    nl.notFound,
  )

  // A default-kind ApiRequestError carries no explicit kind, so generic server
  // copy is still recognized (rather than falling back to the caller text).
  assert.equal(
    getErrorMessage(apiErrorFromBody({ success: false, msg: 'Please sign in to continue.' }, 'Contextual fallback'), 'Contextual fallback', nl),
    nl.signInRequired,
  )

  // Server copy that merely mentions the network is not transport evidence:
  // it must not classify as `network` (no offline message), though its safe
  // text still displays since the kind is genuinely unknown.
  const carrierError = apiErrorFromBody({ success: false, msg: 'Network error while contacting the carrier.' }, 'Contextual fallback');
  assert.equal(classifyApiError(carrierError).kind, 'unknown');
  assert.equal(
    getErrorMessage(carrierError, 'Contextual fallback', nl),
    'Network error while contacting the carrier.',
  )

  // Genuinely specific 403/404/validation business detail stays visible.
  assert.equal(
    getErrorMessage(
      backendResponse(403, { success: false, code: 'FORBIDDEN', msg: 'This account is suspended.' }),
      'Contextual fallback',
      nl,
    ),
    'This account is suspended.',
  )
  assert.equal(
    getErrorMessage(
      backendResponse(404, { success: false, code: 'NOT_FOUND', msg: 'This booking has already been cancelled.' }),
      'Contextual fallback',
      nl,
    ),
    'This booking has already been cancelled.',
  )
  assert.equal(
    getErrorMessage(
      backendResponse(422, { success: false, code: 'VALIDATION', msg: 'VAT number BE0123456789 is invalid.' }),
      'Contextual fallback',
      nl,
    ),
    'VAT number BE0123456789 is invalid.',
  )
})

test('actual caller patterns (support, dashboard, payments, favorites) localize generic categories', () => {
  const authBody = {
    success: false,
    code: 'AUTH_REQUIRED',
    msg: 'Your session has expired. Please sign in again.',
  }
  const forbiddenBody = {
    success: false,
    code: 'FORBIDDEN',
    msg: 'You do not have permission to do that.',
  }

  // lib/support.ts helpers keep safe detail but localize generic categories.
  assert.equal(
    getErrorMessage(apiErrorFromBody(authBody, 'The request could not be completed.', { status: 401 }), 'Support fallback', nl),
    nl.auth,
  )
  assert.equal(
    getErrorMessage(apiErrorFromBody(forbiddenBody, 'The request could not be completed.', { status: 403 }), 'Support fallback', nl),
    nl.forbidden,
  )

  // dashboard/profile receive the parsed body with code but not the HTTP
  // status; the code still resolves the category.
  assert.equal(getErrorMessage(authBody, 'Boekingen laden mislukt', nl), nl.auth)

  // Booking-detail loader receives the parsed body without the status, while
  // the payments list passes both.
  assert.equal(getErrorMessage(authBody, 'Boeking laden mislukt', nl), nl.auth)

  // payments/booking detail wrappers pass the real status.
  assert.equal(
    getErrorMessage(
      apiErrorFromBody(authBody, 'Betalingen laden mislukt', { status: 401 }),
      'Betalingen laden mislukt',
      nl,
    ),
    nl.auth,
  )

  // FavoriteButton toggle.
  assert.equal(
    getErrorMessage(
      apiErrorFromBody(authBody, 'Favoriet bijwerken mislukt', { status: 401 }),
      'Favoriet bijwerken mislukt',
      nl,
    ),
    nl.auth,
  )
})

test('locally generated client fallbacks are never displayed as server copy', () => {
  const chatNoBody = new ApiRequestError('Failed to send message (422)', { status: 422 })
  assert.equal(classifyApiError(chatNoBody).kind, 'validation')
  assert.equal(getErrorMessage(chatNoBody, 'Bericht verzenden mislukt', nl), 'Bericht verzenden mislukt')
  assert.doesNotMatch(getErrorMessage(chatNoBody, 'Bericht verzenden mislukt', nl), /\(\d{3}\)|Failed/)

  const chatForbidden = new ApiRequestError('Failed to start chat (403)', { status: 403 })
  assert.equal(getErrorMessage(chatForbidden, 'Chat starten mislukt', nl), nl.forbidden)

  const uploadAuth = new ApiRequestError('The upload failed. Please try again.', { status: 401 })
  assert.equal(getErrorMessage(uploadAuth, 'Upload mislukt', nl), nl.auth)

  const uploadTooLarge = new ApiRequestError('The upload failed. Please try again.', { status: 413 })
  assert.equal(getErrorMessage(uploadTooLarge, 'Upload mislukt', nl), nl.payloadTooLarge)

  const favoriteValidation = new ApiRequestError('Favoriet bijwerken mislukt', { status: 400 })
  assert.equal(
    getErrorMessage(favoriteValidation, 'Favoriet bijwerken mislukt', nl),
    'Favoriet bijwerken mislukt',
  )

  // A server body still outranks the caller fallback for specific 4xx detail.
  const specificValidation = apiErrorFromBody(
    { success: false, code: 'VALIDATION', msg: 'Project already has an active quotation.' },
    'Offerte versturen mislukt',
    { status: 400 },
  )
  assert.equal(getErrorMessage(specificValidation, 'Offerte versturen mislukt', nl), 'Project already has an active quotation.')
})

test('upload hook failures keep status and safe validation/limit/type bodies', () => {
  const certificationEnvelope = {
    success: false,
    code: 'VALIDATION',
    msg: 'The uploaded file is too large. Choose a smaller file and try again.',
  }
  const certification = apiErrorFromUploadResponse(400, JSON.stringify(certificationEnvelope))
  assert.equal(certification.status, 400)
  assert.equal(certification.serverMessage, certificationEnvelope.msg)
  // CertificationManager caller
  assert.equal(
    getErrorMessage(certification, 'Certificaat uploaden mislukt', nl),
    certificationEnvelope.msg,
  )

  const attachmentEnvelope = {
    success: false,
    code: 'VALIDATION',
    msg: 'File type not allowed. Upload a PDF or image.',
  }
  const attachment = apiErrorFromUploadResponse(400, JSON.stringify(attachmentEnvelope))
  // ProfessionalAttachments caller
  assert.equal(
    getErrorMessage(attachment, 'Bijlage uploaden mislukt', nl),
    attachmentEnvelope.msg,
  )

  // Malformed/non-JSON bodies never show parser text; status stays actionable.
  const malformedCertification = apiErrorFromUploadResponse(400, '<html><body>Bad Request</body></html>')
  assert.equal(
    getErrorMessage(malformedCertification, 'Certificaat uploaden mislukt', nl),
    'Certificaat uploaden mislukt',
  )

  const nonJsonAttachment = apiErrorFromUploadResponse(400, 'not-json')
  assert.equal(
    getErrorMessage(nonJsonAttachment, 'Bijlage uploaden mislukt', nl),
    'Bijlage uploaden mislukt',
  )

  const emptyTooLarge = apiErrorFromUploadResponse(413, '')
  assert.equal(getErrorMessage(emptyTooLarge, 'Upload mislukt', nl), nl.payloadTooLarge)

  const emptyAuth = apiErrorFromUploadResponse(401, '')
  assert.equal(getErrorMessage(emptyAuth, 'Upload mislukt', nl), nl.auth)

  // A JSON envelope containing parser text is not treated as safe copy.
  const parserBody = apiErrorFromUploadResponse(400, JSON.stringify({ success: false, msg: 'Unexpected end of JSON input' }))
  assert.equal(
    getErrorMessage(parserBody, 'Certificaat uploaden mislukt', nl),
    nl.invalidResponse,
  )
})

test('empty/consumed JSON bodies classify as invalidResponse without raw parser text', async () => {
  const emptyBodyError = await new Response('').json().catch((error) => error)
  assert.ok(emptyBodyError instanceof SyntaxError)

  const browserErrors = [
    emptyBodyError,
    new SyntaxError('Unexpected end of JSON input'),
    new TypeError('Body is unusable: Body has already been read'),
    new TypeError('Body stream already read'),
    'body stream already read',
    'Unexpected end of JSON input',
    'JSON.parse: unexpected end of data at line 1 column 1 of the JSON data',
    'Unexpected token \'<\', "<!doctype html>..." is not valid JSON',
  ]

  for (const error of browserErrors) {
    assert.equal(classifyApiError(error).kind, 'invalidResponse')
    assert.equal(getErrorMessage(error, 'Fallback', nl), nl.invalidResponse)
  }

  for (const message of [
    'Unexpected end of JSON input',
    'Body is unusable',
    'body stream already read',
    'JSON.parse: unexpected end of data at line 1 column 1 of the JSON data',
  ]) {
    assert.equal(safeUserMessage(message), undefined)
  }
})

test('HTML/error pages are rejected while plain field labels stay allowed', () => {
  for (const body of [
    '<!doctype html><html><body><h1>503 Service Unavailable</h1></body></html>',
    '<html><head><title>502 Bad Gateway</title></head></html>',
    '<div class="error">Internal error</div>',
    ' <p>Service unavailable</p>',
    'Bad request</body></html>',
  ]) {
    assert.equal(safeUserMessage(body), undefined)
  }

  assert.equal(safeUserMessage('VAT number is required'), 'VAT number is required')
  assert.equal(safeUserMessage('Amount must be < 100'), 'Amount must be < 100')
})

test('HTTP status is authoritative over conflicting codes', () => {
  const cases = [
    [500, 'VALIDATION', 'Please enter a valid VAT number', 'server', nl.server],
    [413, 'VALIDATION', 'The request is too large. Reduce the amount of data and try again.', 'payloadTooLarge', nl.payloadTooLarge],
    [401, 'INTERNAL', 'Your session has expired. Please sign in again.', 'auth', nl.auth],
    [403, 'AUTH_REQUIRED', 'You do not have permission to do that.', 'forbidden', nl.forbidden],
    [429, 'INTERNAL', 'Too many requests. Please wait a moment and try again.', 'rateLimited', nl.rateLimited],
  ]

  for (const [status, code, msg, kind, expected] of cases) {
    const error = backendResponse(status, { success: false, code, msg })
    assert.equal(classifyApiError(error).kind, kind)
    assert.equal(getErrorMessage(error, 'Contextual fallback', nl), expected)
  }

  // A 422 with a conflicting CONFLICT code is still a validation failure and
  // keeps its specific field message.
  const validation = backendResponse(422, {
    success: false,
    code: 'CONFLICT',
    msg: 'VAT number BE0123456789 is invalid.',
  })
  assert.equal(classifyApiError(validation).kind, 'validation')
  assert.equal(getErrorMessage(validation, 'Contextual fallback', nl), 'VAT number BE0123456789 is invalid.')

  // Without a status the code remains the only available hint.
  assert.equal(
    getErrorMessage({ success: false, code: 'UNAVAILABLE', msg: 'Brevo API is down' }, 'Fallback', nl),
    nl.unavailable,
  )
})

test('mongoose default validator text never reaches users; the new generic bodies are localized', () => {
  assert.equal(safeUserMessage('Path `email` is required.'), undefined)
  assert.equal(safeUserMessage('`bogus` is not a valid enum value for path `status`.'), undefined)
  assert.equal(safeUserMessage('Name is required'), 'Name is required')
  const body = { success: false, msg: 'One of the values has an invalid format. Check your input and try again.', code: 'VALIDATION', field: 'amount' }
  // Generic validation copy is never shown verbatim: the caller's localized
  // contextual fallback is used, else the localized validation message.
  assert.equal(getErrorMessage({ response: { status: 400, data: body } }, 'Contextuele fout', nl), 'Contextuele fout')
  assert.equal(getErrorMessage({ response: { status: 400, data: body } }, '', nl), nl.validation)
})
