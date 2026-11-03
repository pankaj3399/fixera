import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  deriveOnboardingResumeStep,
  normalizeOnboardingStep,
  type OnboardingResumeProfile,
} from './resumeStep';

interface StepSyncSearchParams {
  get(name: string): string | null;
  toString(): string;
}

interface StepSyncRouter {
  replace(href: string, options?: { scroll?: boolean }): void;
}

export interface OnboardingStepSyncOptions {
  /** Auth is still resolving; the resume decision waits for the profile. */
  loading: boolean;
  user: OnboardingResumeProfile | null | undefined;
  searchParams: StepSyncSearchParams;
  pathname: string;
  router: StepSyncRouter;
}

/**
 * Owns the onboarding `currentStep` and keeps it in sync with `?step=`.
 *
 * Initial step resolution order: a valid (numeric) `?step=` from the URL
 * wins; otherwise, including a malformed value, the step is derived from the
 * saved profile once it loads. The
 * URL is only written after that initial step is resolved, so the first
 * render (step 1) never overwrites a deep-linked `?step=3`, and a premature
 * `?step=1` never suppresses the profile-based resume.
 */
export function useOnboardingStepSync({
  loading,
  user,
  searchParams,
  pathname,
  router,
}: OnboardingStepSyncOptions): [number, Dispatch<SetStateAction<number>>] {
  const [currentStep, setCurrentStep] = useState(1);
  const stepParam = searchParams.get('step');
  // A non-numeric `?step=` (e.g. `?step=abc`) counts as absent, so it never
  // suppresses the profile-based resume.
  const parsedStepParam = stepParam ? Number.parseInt(stepParam, 10) : Number.NaN;
  const validStepParam = Number.isNaN(parsedStepParam) ? null : parsedStepParam;
  const hasValidStepParam = validStepParam !== null;

  useEffect(() => {
    if (validStepParam === null) return;
    setCurrentStep(normalizeOnboardingStep(validStepParam));
  }, [validStepParam]);

  const resumeInitializedRef = useRef(false);
  const [resumeResolved, setResumeResolved] = useState(false);
  useEffect(() => {
    if (loading || !user) return;
    if (!hasValidStepParam && !resumeInitializedRef.current) {
      resumeInitializedRef.current = true;
      setCurrentStep((prev) => (prev === 1 ? deriveOnboardingResumeStep(user) : prev));
    }
    setResumeResolved(true);
  }, [loading, user, hasValidStepParam]);

  useEffect(() => {
    if (!resumeResolved) return;
    if (stepParam === String(currentStep)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('step', String(currentStep));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [currentStep, router, pathname, searchParams, stepParam, resumeResolved]);

  return [currentStep, setCurrentStep];
}
