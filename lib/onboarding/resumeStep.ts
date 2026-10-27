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

/** Legacy/removed steps map to the next real step (5 -> employees). */
export const normalizeOnboardingStep = (step: number): number => {
  if (step === ONBOARDING_STEPS.PERSONAL_HOURS) return ONBOARDING_STEPS.EMPLOYEES;
  if ((VISIBLE_ONBOARDING_STEP_IDS as readonly number[]).includes(step)) return step;
  if (!Number.isFinite(step) || step < 1) return 1;
  const sorted = [...VISIBLE_ONBOARDING_STEP_IDS].sort((a, b) => a - b);
  if (step <= sorted[0]) return sorted[0];
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (step >= sorted[i]) return sorted[i];
  }
  return sorted[sorted.length - 1];
};

export interface OnboardingResumeProfile {
  idProofUrl?: string;
  idCountryOfIssue?: string;
  idExpirationDate?: string;
  businessInfo?: { companyName?: string };
  vatNumber?: string;
  username?: string;
}

/**
 * Conservative resume point from saved profile data — never past step 3
 * without server-side Stripe verification (the Stripe step gates on it).
 */
export const deriveOnboardingResumeStep = (
  user: OnboardingResumeProfile | null | undefined,
): number => {
  if (!user) return 1;
  const hasId = Boolean(user.idProofUrl || user.idCountryOfIssue || user.idExpirationDate);
  if (!hasId) return 1;
  const hasBusiness = Boolean(user.businessInfo?.companyName || user.vatNumber || user.username);
  if (!hasBusiness) return 2;
  return ONBOARDING_STEPS.STRIPE;
};
