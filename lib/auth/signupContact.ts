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

/** Which confirmation a contact save gets: decided by the codes actually sent. */
export function contactSaveOutcome(update: SignupContactUpdate): 'unchanged' | 'sent' | 'notSent' {
  if (!update.emailChanged && !update.phoneChanged) return 'unchanged'
  if ((update.emailChanged && !update.emailOtpSent) || (update.phoneChanged && !update.phoneOtpSent)) return 'notSent'
  return 'sent'
}
