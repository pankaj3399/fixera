import { parsePhoneNumberFromString } from 'libphonenumber-js'

/** Splits a stored "+<country><number>" phone into the signup form's two fields. */
export function splitSignupPhone(phone: string, fallbackCountryCode = '+32'): { countryCode: string; national: string } {
  const parsed = parsePhoneNumberFromString(phone || '')
  if (parsed?.countryCallingCode) {
    return { countryCode: `+${parsed.countryCallingCode}`, national: String(parsed.nationalNumber) }
  }
  return { countryCode: fallbackCountryCode, national: (phone || '').replace(/^\+/, '') }
}

export type SignupContactUpdate = {
  email: string
  phone: string
  emailChanged: boolean
  phoneChanged: boolean
  emailOtpSent: boolean
  phoneOtpSent: boolean
}

/**
 * PATCH /api/user/signup-contact: correct the email/phone of the signed-in,
 * not yet verified account (FT2-6C). Throws the API body on failure so the
 * caller can show its (localized) message.
 */
export async function updateSignupContact(input: { email?: string; phone?: string }): Promise<SignupContactUpdate> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/signup-contact`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body?.success) throw body
  return body.data as SignupContactUpdate
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
export function contactSaveOutcome(update: SignupContactUpdate): ContactSaveOutcome {
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
