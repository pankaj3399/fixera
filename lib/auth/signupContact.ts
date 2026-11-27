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
