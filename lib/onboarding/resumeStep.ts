import { ONBOARDING_STEPS } from '@/lib/constants/onboardingSteps';

/**
 * Visible onboarding flow ids. Step 5 (personal availability) was removed;
 * ids stay stable so persisted data and deep links keep working.
 */
export const VISIBLE_ONBOARDING_STEP_IDS: readonly number[] = [
  ONBOARDING_STEPS.ID_UPLOAD,
  ONBOARDING_STEPS.BUSINESS_INFO,
  ONBOARDING_STEPS.STRIPE,
  ONBOARDING_STEPS.COMPANY_HOURS,
  ONBOARDING_STEPS.EMPLOYEES,
  ONBOARDING_STEPS.RULES,
];

/**
 * Legacy/removed steps map to the next real step (5 -> employees). NaN and
 * values below 1 become step 1; anything above the last step, including the
 * `Infinity` an oversized all-digit `?step=` parses to, clamps to the last.
 */
export const normalizeOnboardingStep = (step: number): number => {
  if (step === ONBOARDING_STEPS.PERSONAL_HOURS) return ONBOARDING_STEPS.EMPLOYEES;
  if ((VISIBLE_ONBOARDING_STEP_IDS as readonly number[]).includes(step)) return step;
  if (Number.isNaN(step) || step < 1) return 1;
  const sorted = [...VISIBLE_ONBOARDING_STEP_IDS].sort((a, b) => a - b);
  if (step <= sorted[0]) return sorted[0];
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (step >= sorted[i]) return sorted[i];
  }
  return sorted[sorted.length - 1];
};

/**
 * Reads a `?step=` value. Only a plain non-negative integer (`3`, `03`) is a
 * step; anything else (`7junk`, `3.5`, `-1`, `1e2`, ` 3`, empty) counts as
 * absent, so it never suppresses the saved-profile resume. A valid number is
 * returned as written; normalizeOnboardingStep clamps it (0 -> 1, 99 -> 7,
 * and a digit string too long for a finite number -> Infinity -> 7).
 */
export const parseOnboardingStepParam = (value: string | null | undefined): number | null =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number.parseInt(value, 10) : null;

export interface OnboardingResumeProfile {
  idProofUrl?: string;
  idCountryOfIssue?: string;
  idExpirationDate?: string;
  businessInfo?: {
    companyName?: string;
    address?: string;
    city?: string;
    country?: string;
    postalCode?: string;
  };
  vatNumber?: string;
  username?: string;
}

const filled = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

/** Mirrors the ID step's continue gate: proof, issuing country and expiry. */
export const hasCompleteIdStep = (user: OnboardingResumeProfile): boolean =>
  filled(user.idProofUrl) && filled(user.idCountryOfIssue) && filled(user.idExpirationDate);

/**
 * Mirrors the business step's continue gate: company name, a 3–30 character
 * username, VAT number and the full business address.
 */
export const hasCompleteBusinessStep = (user: OnboardingResumeProfile): boolean => {
  const username = typeof user.username === 'string' ? user.username.trim() : '';
  const info = user.businessInfo;
  return (
    filled(info?.companyName) &&
    username.length >= 3 &&
    username.length <= 30 &&
    filled(user.vatNumber) &&
    filled(info?.address) &&
    filled(info?.city) &&
    filled(info?.country) &&
    filled(info?.postalCode)
  );
};

/**
 * Conservative resume point from saved profile data. A step counts as done
 * only when the saved profile satisfies that step's own required fields, and
 * the resume point is never past step 3 without server-side Stripe
 * verification (the Stripe step gates on it).
 */
export const deriveOnboardingResumeStep = (
  user: OnboardingResumeProfile | null | undefined,
): number => {
  if (!user) return ONBOARDING_STEPS.ID_UPLOAD;
  if (!hasCompleteIdStep(user)) return ONBOARDING_STEPS.ID_UPLOAD;
  if (!hasCompleteBusinessStep(user)) return ONBOARDING_STEPS.BUSINESS_INFO;
  return ONBOARDING_STEPS.STRIPE;
};
