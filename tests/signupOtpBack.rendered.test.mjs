import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'
import { componentHarness } from './helpers/componentHarness.mjs'

register('./swc-loader.mjs', import.meta.url)

const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const { default: DualVerificationComponent } = await import('@/components/DualVerificationComponent')
const signupContact = await import('@/lib/auth/signupContact.ts')
const cooldown = await import('@/lib/auth/signupOtpCooldown.ts')
const libphonenumber = await import('libphonenumber-js')
const vatValidation = await import('@/lib/vatValidation.ts')
const { contactSaveMessageKey, contactSaveOutcome, resendDeadlineAfterContactSave, resendDeadlinesAfterSave, splitSignupPhone } = signupContact
const { SIGNUP_OTP_RESEND_COOLDOWN_SECONDS } = cooldown

const messages = (locale) => Object.fromEntries(['auth', 'account', 'common'].map((ns) => [
  ns,
  JSON.parse(readFileSync(new URL(`../messages/${locale}/${ns}.json`, import.meta.url), 'utf8')),
]))
const render = (locale, element) => renderToStaticMarkup(
  React.createElement(NextIntlClientProvider, { locale, messages: messages(locale), timeZone: 'UTC' }, element),
)
const noop = () => {}

test('FT2-6C: the OTP timeout (resend cooldown) is 2 minutes', () => {
  assert.equal(SIGNUP_OTP_RESEND_COOLDOWN_SECONDS, 120)
})

test('FT2-6C: the code step offers "back: change your details" and shows each channel its own countdown', () => {
  const now = Date.now()
  const html = render('en', React.createElement(DualVerificationComponent, {
    email: 'typo@exmaple.com', phone: '+32470123456', onVerificationSuccess: noop,
    onBack: noop, resendDeadlines: { email: now + 120_000, phone: now + 45_000 },
  }))
  assert.ok(html.includes('Back: change your details'), html)
  // In the page flow, not absolutely positioned under the site header.
  assert.doesNotMatch(html, /absolute top-6 left-6/)
  assert.ok(html.includes('Resend code in 2:00'), 'email countdown')
  assert.ok(html.includes('Resend code in 0:45'), 'phone countdown')
  for (const [locale, label] of [['nl', 'Terug: je gegevens wijzigen'], ['fr', 'Retour : modifier vos informations']]) {
    assert.ok(render(locale, React.createElement(DualVerificationComponent, {
      email: 'a@b.co', phone: '+32470123456', onVerificationSuccess: noop, onBack: noop,
    })).includes(label), locale)
  }
})

test('without a back action there is no back button; without a known send resend is available', () => {
  const html = render('en', React.createElement(DualVerificationComponent, {
    email: 'a@b.co', phone: '+32470123456', onVerificationSuccess: noop,
  }))
  assert.doesNotMatch(html, /Back: change your details/)
  assert.doesNotMatch(html, /Resend code in/)
})

test('a channel already verified before going back stays verified on return', () => {
  const html = render('en', React.createElement(DualVerificationComponent, {
    email: 'a@b.co', phone: '+32470123456', onVerificationSuccess: noop, onBack: noop,
    initialVerified: { email: false, phone: true },
  }))
  assert.ok(html.includes('Phone Verified!'))
  assert.ok(!html.includes('Email Verified!'))
})

test('the inline email/phone-only editor is gone', () => {
  const source = readFileSync(new URL('../components/DualVerificationComponent.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /SignupContactEditor|editingContact|onContactChange|codesSentAt/)
  for (const locale of ['en', 'nl', 'fr']) {
    const dv = messages(locale).auth.dualVerification
    assert.equal(dv.backToChangeContact, undefined, locale)
    assert.equal(dv.changeContact.title, undefined, locale)
  }
})

test('stored phones split back into the form fields', () => {
  assert.deepEqual(splitSignupPhone('+32470123456'), { countryCode: '+32', national: '470123456' })
  assert.deepEqual(splitSignupPhone('+31612345678'), { countryCode: '+31', national: '612345678' })
  assert.deepEqual(splitSignupPhone('', '+33'), { countryCode: '+33', national: '' })
})

test('only a changed channel restarts its cooldown after a save', () => {
  const fresh = () => 9_000
  assert.deepEqual(
    resendDeadlinesAfterSave({ emailChanged: true, emailOtpSent: true, phoneChanged: false, phoneOtpSent: false }, { email: 1_000, phone: 2_000 }, fresh),
    { email: 9_000, phone: 2_000 },
  )
  assert.deepEqual(
    resendDeadlinesAfterSave({ emailChanged: false, emailOtpSent: false, phoneChanged: true, phoneOtpSent: false }, { email: 1_000, phone: 2_000 }, fresh),
    { email: 1_000, phone: null },
  )
})

/** Drives a signup page's hooks and handlers (FT2-6C flow) without a DOM. */
function signupPageHarness(file, { search = '', extraImports = {} } = {}) {
  const toasts = []
  const requests = []
  const authCalls = { signup: [], checkAuth: 0 }
  const params = new URLSearchParams(search)
  const t = (key) => key
  let serverDetails
  let patchResponse
  const ui = componentHarness(new URL(file, import.meta.url), {
    'next/navigation': { useRouter: () => ({ push() {}, replace() {} }), useSearchParams: () => params },
    'next-intl': { useTranslations: () => t },
    sonner: { toast: { success: (m) => toasts.push(['success', m]), warning: (m) => toasts.push(['warning', m]), error: (m) => toasts.push(['error', m])} },
    '@/lib/i18n/useErrorMessage': { useErrorMessage: () => (error, fallback) => error?.msg ?? fallback },
    '@/contexts/AuthContext': {
      useAuth: () => ({
        signup: async (data) => { authCalls.signup.push(data); return true },
        checkAuth: async () => { authCalls.checkAuth++; return null },
      }),
    },
    '@/components/DualVerificationComponent': { __esModule: true, default: 'DualVerificationComponent' },
    '@/components/PhoneCountryCodeSelect': { PhoneCountryCodeSelect: 'PhoneCountryCodeSelect' },
    '@/lib/auth/signupContact': signupContact,
    '@/lib/auth/signupOtpCooldown': cooldown,
    'libphonenumber-js': libphonenumber,
    ...extraImports,
  })
  ui.useComponent(ui.render().props.children.type)
  const fetchMock = async (url, init = {}) => {
    const method = init.method ?? 'GET'
    requests.push({ url: String(url), method, body: init.body ? JSON.parse(init.body) : undefined })
    if (String(url).endsWith('/api/user/signup-contact')) {
      const data = method === 'PATCH' ? patchResponse(JSON.parse(init.body)) : serverDetails
      return { ok: true, json: async () => ({ success: true, data }) }
    }
    return { ok: true, json: async () => ({ success: false }) }
  }
  const byId = (id) => ui.findAll((node) => node.props.id === id)[0]
  return {
    ui, toasts, requests, authCalls, fetchMock, byId,
    setServerDetails(value) { serverDetails = value },
    onPatch(handler) { patchResponse = handler },
    verification: () => ui.findAll((node) => node.type === 'DualVerificationComponent')[0],
    type: (id, value) => { ui.render(); byId(id).props.onChange({ target: { value } }) },
    submit: async () => {
      // Handlers close over the last render's state: render the typed values first.
      ui.render()
      await ui.findAll((node) => node.type === 'form')[0].props.onSubmit({ preventDefault() {} })
      await ui.settle()
    },
  }
}

async function withClock(start, run) {
  const previous = { now: Date.now, fetch: globalThis.fetch, document: globalThis.document }
  let current = start
  Date.now = () => current
  globalThis.document = { addEventListener() {}, removeEventListener() {} }
  try {
    return await run({ advance: (ms) => { current += ms }, now: () => current })
  } finally {
    Date.now = previous.now; globalThis.fetch = previous.fetch; globalThis.document = previous.document
  }
}

test('FT2-6C /register: back → prefilled form from the server → submit updates the account → code step with the right timers', async () => {
  await withClock(1_700_000_000_000, async (clock) => {
    const page = signupPageHarness('../app/[ctx]/(pages)/register/page.tsx')
    globalThis.fetch = page.fetchMock
    const { ui } = page
    ui.render(); await ui.settle()

    // 1. Sign up: the account is created and both codes go out.
    page.type('name', 'Pro Person')
    page.type('email', 'typo@exmaple.com')
    page.type('phone', '470123456')
    page.type('password', 'secret123')
    page.type('confirmPassword', 'secret123')
    await page.submit()
    assert.equal(page.authCalls.signup.length, 1)
    const signupSentAt = clock.now()
    let otp = page.verification()
    assert.deepEqual(otp.props.resendDeadlines, { email: signupSentAt + 120_000, phone: signupSentAt + 120_000 })

    // 2. 75 seconds later: back. The form is prefilled from the server, not from memory.
    clock.advance(75_000)
    page.setServerDetails({
      role: 'professional', name: 'Pro Person (server)', email: 'typo@exmaple.com', phone: '+32470123456',
      isEmailVerified: false, isPhoneVerified: false, customerType: null, companyName: '', vatNumber: '',
      isVatVerified: false, location: null, marketingOptIn: true, marketingOptInEditable: true,
    })
    otp.props.onBack()
    await ui.settle()
    assert.equal(page.verification(), undefined, 'the signup form is shown again')
    assert.equal(page.byId('name').props.value, 'Pro Person (server)')
    assert.equal(page.byId('email').props.value, 'typo@exmaple.com')
    assert.equal(page.byId('phone').props.value, '470123456')
    assert.equal(page.byId('password').props.value, '', 'password blank = keep')
    assert.equal(page.byId('password').props.required, false)
    assert.equal(page.byId('marketingOptIn').props.checked, true)
    assert.equal(page.byId('referralCode'), undefined, 'the referral was applied at creation')
    assert.match(JSON.stringify(ui.render()), /signupEdit\.save/)

    // 3. Fix the email, leave the password blank, submit: an update, never a second signup.
    page.type('email', 'right@example.com')
    page.type('name', 'Pro Person')
    page.onPatch((body) => ({
      ...body, role: 'professional', password: undefined, customerType: null, companyName: '', vatNumber: '', isVatVerified: false,
      location: null, marketingOptInEditable: true, isEmailVerified: false, isPhoneVerified: false,
      emailChanged: body.email !== 'typo@exmaple.com', phoneChanged: false, passwordChanged: false,
      emailOtpSent: true, phoneOtpSent: false,
    }))
    await page.submit()
    const patch = page.requests.find((r) => r.method === 'PATCH')
    assert.deepEqual(patch.body, { name: 'Pro Person', email: 'right@example.com', phone: '+32470123456', marketingOptIn: true })
    assert.equal(page.authCalls.signup.length, 1, 'no second account')
    assert.equal(page.authCalls.checkAuth, 1)
    assert.deepEqual(page.toasts.at(-1), ['success', 'dualVerification.changeContact.savedToast'])

    // 4. Back on the code step: the email got a fresh 2-minute cooldown, the phone keeps its 45 s.
    otp = page.verification()
    assert.ok(otp, 'returns to the code step')
    assert.equal(otp.props.email, 'right@example.com')
    assert.equal(otp.props.phone, '+32470123456')
    assert.deepEqual(otp.props.resendDeadlines, { email: clock.now() + 120_000, phone: signupSentAt + 120_000 })
    const html = render('en', React.createElement(DualVerificationComponent, { ...otp.props, onVerificationSuccess: noop }))
    assert.ok(html.includes('Resend code in 2:00'), 'email countdown restarted')
    assert.ok(html.includes('Resend code in 0:45'), 'phone countdown kept')
    ui.unmount()
  })
})

const PRO_DETAILS = {
  role: 'professional', name: 'P Person', email: 'p@example.com', phone: '+32470123456', isEmailVerified: true, isPhoneVerified: false,
  customerType: null, companyName: '', vatNumber: '', isVatVerified: false, location: null, marketingOptIn: false, marketingOptInEditable: false,
}

test('FT2-6C /register?edit=1 (from onboarding): verified email locked, optional password follows the signup rule', async () => {
  await withClock(1_700_000_000_000, async (clock) => {
    const page = signupPageHarness('../app/[ctx]/(pages)/register/page.tsx', { search: 'edit=1' })
    globalThis.fetch = page.fetchMock
    page.setServerDetails(PRO_DETAILS)
    const { ui } = page
    ui.render(); await ui.settle()
    assert.deepEqual(page.requests.map((r) => r.method), ['GET'])
    assert.equal(page.byId('email').props.disabled, true, 'a verified email cannot change here')
    assert.equal(page.byId('phone').props.disabled, false)
    assert.equal(page.byId('marketingOptIn').props.disabled, true)

    page.type('password', '123')
    page.type('confirmPassword', '123')
    await page.submit()
    assert.deepEqual(page.toasts.at(-1), ['error', 'validation.passwordTooShort'])
    page.type('password', 'longer-secret')
    page.type('confirmPassword', 'different')
    await page.submit()
    assert.deepEqual(page.toasts.at(-1), ['error', 'validation.passwordsDoNotMatch'])
    assert.equal(page.requests.filter((r) => r.method === 'PATCH').length, 0)

    page.type('confirmPassword', 'longer-secret')
    page.type('phone', '471234567')
    page.onPatch((body) => ({
      ...PRO_DETAILS, phone: body.phone, emailChanged: false, phoneChanged: true, passwordChanged: true, emailOtpSent: false, phoneOtpSent: true,
    }))
    await page.submit()
    const patch = page.requests.find((r) => r.method === 'PATCH')
    assert.equal(patch.body.password, 'longer-secret')
    const otp = page.verification()
    assert.deepEqual(otp.props.initialVerified, { email: true, phone: false })
    // No send time was known when arriving from onboarding: only the phone, which just got a code, waits.
    assert.deepEqual(otp.props.resendDeadlines, { email: null, phone: clock.now() + 120_000 })
    ui.unmount()
  })
})

test('FT2-6C /signup/customer?edit=1: every customer field prefilled → business update → code step', async () => {
  await withClock(1_700_000_000_000, async () => {
    const details = {
      role: 'customer', name: 'Jane', email: 'jane@example.com', phone: '+32470123456', isEmailVerified: false, isPhoneVerified: false,
      customerType: 'individual', companyName: '', vatNumber: '', isVatVerified: false,
      location: { address: 'Meir 10', city: 'Antwerp', country: 'Belgium', postalCode: '2000', latitude: 51.2, longitude: 4.4 },
      marketingOptIn: false, marketingOptInEditable: true,
    }
    const edit = signupPageHarness('../app/[ctx]/(pages)/signup/customer/page.tsx', {
      search: 'edit=1',
      extraImports: {
        '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en-GB' }) },
        '@/lib/logger': { logError() {} },
        '@/lib/vatValidation': vatValidation,
        '@/components/professional/project-wizard/AddressAutocomplete': { __esModule: true, default: 'AddressAutocomplete' },
      },
    })
    globalThis.fetch = edit.fetchMock
    edit.setServerDetails(details)
    edit.ui.render(); await edit.ui.settle()
    assert.equal(edit.byId('name').props.value, 'Jane')
    assert.equal(edit.byId('email').props.value, 'jane@example.com')
    assert.equal(edit.byId('phone').props.value, '470123456')
    assert.equal(edit.byId('city').props.value, 'Antwerp')
    assert.equal(edit.byId('postalCode').props.value, '2000')
    assert.equal(edit.byId('country').props.value, 'Belgium')
    const address = edit.ui.findAll((node) => node.type === 'AddressAutocomplete')[0]
    assert.equal(address.props.value, 'Meir 10')
    assert.equal(edit.byId('password').props.required, false)

    // Become a business customer; the stored address keeps its coordinates (no re-geocode).
    edit.ui.findAll((node) => node.type === 'RadioGroup')[0].props.onValueChange('business')
    await edit.ui.settle()
    edit.type('companyName', 'Doe BV')
    edit.type('vatNumber', 'BE0123456789')
    edit.ui.findAll((node) => node.props.id === 'marketingOptIn')[0].props.onChange({ target: { checked: true } })
    edit.onPatch((body) => ({
      ...details, customerType: body.customerType, companyName: body.companyName, vatNumber: body.vatNumber, isVatVerified: true,
      marketingOptIn: body.marketingOptIn, emailChanged: false, phoneChanged: false, passwordChanged: false, emailOtpSent: false, phoneOtpSent: false,
    }))
    await edit.submit()
    const patch = edit.requests.find((r) => r.method === 'PATCH')
    assert.ok(patch, edit.toasts.map((x) => x.join(':')).join(', '))
    assert.deepEqual(patch.body, {
      name: 'Jane', email: 'jane@example.com', phone: '+32470123456', customerType: 'business',
      address: 'Meir 10', city: 'Antwerp', country: 'Belgium', postalCode: '2000', latitude: 51.2, longitude: 4.4,
      companyName: 'Doe BV', vatNumber: 'BE0123456789', marketingOptIn: true,
    })
    assert.equal(edit.requests.filter((r) => r.url.includes('validate-address')).length, 0)
    assert.deepEqual(edit.toasts.at(-1), ['success', 'dualVerification.changeContact.unchangedToast'])
    const otp = edit.verification()
    // Neither channel changed: both keep their codes and (unknown here) timers.
    assert.deepEqual(otp.props.resendDeadlines, { email: null, phone: null })
    assert.equal(edit.authCalls.signup.length, 0)
    edit.ui.unmount()
  })
})

test('FT2-6C: the professional onboarding code step goes back to the signup form, not to login', () => {
  const source = readFileSync(new URL('../app/[ctx]/(pages)/professional/onboarding/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /onBack=\{\(\) => router\.push\('\/register\?edit=1'\)\}/)
  assert.doesNotMatch(source, /onBack=\{\(\) => router\.push\('\/login'\)\}/)
})
