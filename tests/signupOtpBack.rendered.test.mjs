import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const { default: DualVerificationComponent } = await import('@/components/DualVerificationComponent')
const { default: SignupContactEditor } = await import('@/components/auth/SignupContactEditor')
const { contactSaveOutcome, resendDeadlineAfterContactSave, splitSignupPhone } = await import('@/lib/auth/signupContact.ts')
const { SIGNUP_OTP_RESEND_COOLDOWN_SECONDS } = await import('@/lib/auth/signupOtpCooldown.ts')

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

test('FT2-6C: arriving from signup shows the back button and starts the 2-minute countdown', () => {
  const html = render('en', React.createElement(DualVerificationComponent, {
    email: 'typo@exmaple.com', phone: '+32470123456', onVerificationSuccess: noop,
    onContactChange: noop, codesSentAt: Date.now(),
  }))
  assert.ok(html.includes('Back: change email or phone'), html)
  // In the page flow, not absolutely positioned under the site header.
  assert.doesNotMatch(html, /absolute top-6 left-6/)
  assert.equal((html.match(/Resend code in 2:00/g) || []).length, 2, 'email and phone countdowns')
  for (const [locale, label] of [['nl', 'Terug: e-mail of telefoon wijzigen'], ['fr', 'Retour : modifier l&#x27;e-mail ou le téléphone']]) {
    assert.ok(render(locale, React.createElement(DualVerificationComponent, {
      email: 'a@b.co', phone: '+32470123456', onVerificationSuccess: noop, onContactChange: noop,
    })).includes(label), locale)
  }
})

test('without a contact editor the plain back action is kept; without a fresh send resend is available', () => {
  const html = render('en', React.createElement(DualVerificationComponent, {
    email: 'a@b.co', phone: '+32470123456', onVerificationSuccess: noop, onBack: noop,
  }))
  assert.match(html, />Back<\/button>/)
  assert.doesNotMatch(html, /Resend code in/)
})

test('the contact editor is prefilled and keeps verified channels read-only', () => {
  const html = render('en', React.createElement(SignupContactEditor, {
    email: 'typo@exmaple.com', phone: '+32470123456', emailVerified: true, phoneVerified: false,
    onSaved: noop, onCancel: noop,
  }))
  assert.match(html, /id="signup-contact-email"[^>]*value="typo@exmaple.com"|value="typo@exmaple.com"[^>]*id="signup-contact-email"/)
  assert.match(html, /disabled=""[^>]*id="signup-contact-email"|id="signup-contact-email"[^>]*disabled=""/)
  assert.match(html, /value="470123456"/)
  assert.ok(html.includes('Save and send new codes'))
  assert.ok(html.includes('Back to verification'))
})

test('stored phones split back into the form fields', () => {
  assert.deepEqual(splitSignupPhone('+32470123456'), { countryCode: '+32', national: '470123456' })
  assert.deepEqual(splitSignupPhone('+31612345678'), { countryCode: '+31', national: '612345678' })
  assert.deepEqual(splitSignupPhone('', '+33'), { countryCode: '+33', national: '' })
})

test('both signup flows let the user correct their details instead of resubmitting the form', () => {
  for (const file of ['app/[ctx]/(pages)/signup/customer/page.tsx', 'app/[ctx]/(pages)/register/page.tsx']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.match(source, /onContactChange=\{\(contact\) => \{/, file)
    assert.match(source, /codesSentAt=\{codesSentAt\}/, file)
    assert.match(source, /setCodesSentAt\(Date\.now\(\)\)/, file)
    assert.doesNotMatch(source, /onBack=\{\(\) => setCurrentStep\('form'\)\}/, file)
  }
})

test('CR: a changed contact without a sent code drops its old cooldown and gets its own message', () => {
  const fresh = () => 5_000
  // Changed and sent: a new cooldown. Changed but not sent: none, so Resend works now.
  assert.equal(resendDeadlineAfterContactSave(true, true, 1_000, fresh), 5_000)
  assert.equal(resendDeadlineAfterContactSave(true, false, 1_000, fresh), null)
  // Unchanged: the channel keeps its cooldown.
  assert.equal(resendDeadlineAfterContactSave(false, false, 1_000, fresh), 1_000)
  const base = { email: 'a@b.co', phone: '+32470123456', emailChanged: false, phoneChanged: false, emailOtpSent: false, phoneOtpSent: false }
  assert.equal(contactSaveOutcome(base), 'unchanged')
  assert.equal(contactSaveOutcome({ ...base, emailChanged: true, emailOtpSent: true }), 'sent')
  assert.equal(contactSaveOutcome({ ...base, emailChanged: true, emailOtpSent: false }), 'notSent')
  assert.equal(contactSaveOutcome({ ...base, emailChanged: true, emailOtpSent: true, phoneChanged: true, phoneOtpSent: false }), 'notSent')
  for (const locale of ['en', 'nl', 'fr']) {
    assert.ok(messages(locale).auth.dualVerification.changeContact.savedNotSentToast, locale)
  }
})
