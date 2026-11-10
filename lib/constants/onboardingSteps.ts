export const ONBOARDING_STEPS = {
  ID_UPLOAD: 1,
  BUSINESS_INFO: 2,
  STRIPE: 3,
  COMPANY_HOURS: 4,
  PERSONAL_HOURS: 5,
  EMPLOYEES: 6,
  RULES: 7,
} as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS]

/** Deep link into the onboarding wizard at a given step (`?step=` is read by useOnboardingStepSync). */
export const onboardingStepPath = (step: OnboardingStep): string => `/professional/onboarding?step=${step}`

/** Where the Stripe return/refresh pages send the professional back to. */
export const stripeReturnPath = (isFromOnboarding: boolean): string =>
  isFromOnboarding ? onboardingStepPath(ONBOARDING_STEPS.STRIPE) : '/dashboard'
