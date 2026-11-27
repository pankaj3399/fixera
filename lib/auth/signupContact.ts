import { parsePhoneNumberFromString } from 'libphonenumber-js'

/** Splits a stored "+<country><number>" phone into the signup form's two fields. */
export function splitSignupPhone(phone: string, fallbackCountryCode = '+32'): { countryCode: string; national: string } {
  const parsed = parsePhoneNumberFromString(phone || '')
  if (parsed?.countryCallingCode) {
    return { countryCode: `+${parsed.countryCallingCode}`, national: String(parsed.nationalNumber) }
  }
  return { countryCode: fallbackCountryCode, national: (phone || '').replace(/^\+/, '') }
}

/** The signup form's values of the signed-in, not yet verified account (FT2-6C). */
export type SignupDetails = {
  role: 'customer' | 'professional'
  name: string
  email: string
  phone: string
  isEmailVerified: boolean
  isPhoneVerified: boolean
  customerType: 'individual' | 'business' | null
  companyName: string
  vatNumber: string
  isVatVerified: boolean
  location: {
    address: string
    city: string
    country: string
    postalCode: string
    latitude: number | null
    longitude: number | null
  } | null
  marketingOptIn: boolean
  /** False once the email is verified: the opt-in then lives in the notification settings. */
  marketingOptInEditable: boolean
}

export type SignupContactUpdate = SignupDetails & {
  emailChanged: boolean
  phoneChanged: boolean
  passwordChanged: boolean
  emailOtpSent: boolean
  phoneOtpSent: boolean
}

/** What the signup form sends in edit mode. A blank password keeps the current one. */
export type SignupDetailsInput = {
  name: string
  email: string
  phone: string
  password?: string
  marketingOptIn: boolean
  customerType?: 'individual' | 'business'
  address?: string
  city?: string
  country?: string
  postalCode?: string
  latitude?: number
  longitude?: number
  companyName?: string
  vatNumber?: string
}

const signupContactUrl = () => `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/signup-contact`

async function signupContactRequest<T>(init: RequestInit): Promise<T> {
  const response = await fetch(signupContactUrl(), { ...init, credentials: 'include' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body?.success) throw body
  return body.data as T
}

/**
 * GET /api/user/signup-contact: the stored signup details, to prefill the
 * signup form when the user goes back from the code step (FT2-6C). Throws
 * the API body on failure so the caller can show its (localized) message.
 */
export function fetchSignupDetails(): Promise<SignupDetails> {
  return signupContactRequest<SignupDetails>({ method: 'GET' })
}

/**
 * PATCH /api/user/signup-contact: update the existing, not yet verified
 * account from the signup form (FT2-6C). Never creates an account. Throws the
 * API body on failure.
 */
export function updateSignupDetails(input: SignupDetailsInput): Promise<SignupContactUpdate> {
  const { password, ...rest } = input
  return signupContactRequest<SignupContactUpdate>({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(password ? { ...rest, password } : rest),
  })
}

/** Per-channel resend cooldown deadlines (epoch ms) of the code step; null = none running. */
export type SignupResendDeadlines = { email: number | null; phone: number | null }

/** Both codes were just sent (signup): both channels start a fresh cooldown. */
export function freshResendDeadlines(freshDeadline: () => number): SignupResendDeadlines {
  return { email: freshDeadline(), phone: freshDeadline() }
}

/** The deadlines after an edit-mode save: only changed channels are affected. */
export function resendDeadlinesAfterSave(
  update: Pick<SignupContactUpdate, 'emailChanged' | 'emailOtpSent' | 'phoneChanged' | 'phoneOtpSent'>,
  current: SignupResendDeadlines,
  freshDeadline: () => number,
): SignupResendDeadlines {
  return {
    email: resendDeadlineAfterContactSave(update.emailChanged, update.emailOtpSent, current.email, freshDeadline),
    phone: resendDeadlineAfterContactSave(update.phoneChanged, update.phoneOtpSent, current.phone, freshDeadline),
  }
}

/**
 * The resend deadline a channel keeps after a contact save: a fresh cooldown
 * when a code went to the changed contact; none when the contact changed but
 * no code was sent (the old cooldown belonged to the old contact, and the
 * customer must be able to request a code now); the current one otherwise.
 */
export function resendDeadlineAfterContactSave(
  changed: boolean,
  sent: boolean,
  current: number | null,
  freshDeadline: () => number,
): number | null {
  if (!changed) return current
  return sent ? freshDeadline() : null
}

export type ContactSaveOutcome = 'unchanged' | 'sent' | 'notSent' | 'emailNotSent' | 'phoneNotSent'

/**
 * Which confirmation a contact save gets: decided by the codes actually sent.
 * When both contacts changed but only one received a code, the outcome names
 * the channel that did not ('emailNotSent' / 'phoneNotSent'), so the customer
 * knows which one to resend. 'notSent' means no changed contact received one.
 */
export function contactSaveOutcome(
  update: Pick<SignupContactUpdate, 'emailChanged' | 'emailOtpSent' | 'phoneChanged' | 'phoneOtpSent'>,
): ContactSaveOutcome {
  if (!update.emailChanged && !update.phoneChanged) return 'unchanged'
  const emailMissing = update.emailChanged && !update.emailOtpSent
  const phoneMissing = update.phoneChanged && !update.phoneOtpSent
  if (!emailMissing && !phoneMissing) return 'sent'
  if (emailMissing && update.phoneChanged && update.phoneOtpSent) return 'emailNotSent'
  if (phoneMissing && update.emailChanged && update.emailOtpSent) return 'phoneNotSent'
  return 'notSent'
}

/** The auth message (under dualVerification.changeContact) for a save outcome. */
export type ContactSaveMessageKey =
  | 'unchangedToast'
  | 'savedToast'
  | 'savedNotSentToast'
  | 'savedEmailNotSentToast'
  | 'savedPhoneNotSentToast'

export function contactSaveMessageKey(outcome: ContactSaveOutcome): ContactSaveMessageKey {
  switch (outcome) {
    case 'unchanged': return 'unchangedToast'
    case 'sent': return 'savedToast'
    case 'emailNotSent': return 'savedEmailNotSentToast'
    case 'phoneNotSent': return 'savedPhoneNotSentToast'
    default: return 'savedNotSentToast'
  }
}
