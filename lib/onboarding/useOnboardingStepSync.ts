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
 * Initial step resolution order: a valid `?step=` from the URL wins;
 * otherwise the step is derived from the saved profile once it loads. The
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

  useEffect(() => {
    if (!stepParam) return;
    const parsed = Number.parseInt(stepParam, 10);
    if (Number.isNaN(parsed)) return;
    setCurrentStep(normalizeOnboardingStep(parsed));
  }, [stepParam]);

  const resumeInitializedRef = useRef(false);
  const [resumeResolved, setResumeResolved] = useState(false);
  useEffect(() => {
    if (loading || !user) return;
    if (!stepParam && !resumeInitializedRef.current) {
      resumeInitializedRef.current = true;
      setCurrentStep((prev) => (prev === 1 ? deriveOnboardingResumeStep(user) : prev));
    }
    setResumeResolved(true);
  }, [loading, user, stepParam]);

  useEffect(() => {
    if (!resumeResolved) return;
    if (stepParam === String(currentStep)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('step', String(currentStep));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [currentStep, router, pathname, searchParams, stepParam, resumeResolved]);

  return [currentStep, setCurrentStep];
}
