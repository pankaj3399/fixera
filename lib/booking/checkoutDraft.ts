/**
 * FT2-4B: the booking wizard's answers, kept while the customer is on the
 * payment page. No booking exists before payment, so the payment page's back
 * button returns to the wizard and the wizard restores these values instead
 * of starting over. Stored per project in sessionStorage (this tab only).
 */

export const CHECKOUT_DRAFT_VERSION = 1;
/** A draft older than this is ignored (the checkout hold is one hour). */
export const CHECKOUT_DRAFT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** Query flag the payment page's back button adds to the project URL. */
export const RESUME_BOOKING_PARAM = 'resumeBooking';

export interface CheckoutDraftValues {
  selectedPackageIndex: number | null;
  estimatedUsage: number;
  selectedDate: string;
  selectedTime: string;
  rfqAnswers: unknown[];
  vatAnswers: Record<string, unknown>;
  proceedAtStandardVat: boolean;
  selectedExtraOptions: number[];
  additionalNotes: string;
  rfqAttachments: Array<{ url: string; name: string }>;
  useProfileAddress: boolean;
  manualAddress: string;
  isServiceAddressValid: boolean;
  servicePlace?: unknown;
}

export interface CheckoutDraft extends CheckoutDraftValues {
  version: number;
  projectId: string;
  checkoutId?: string;
  savedAt: number;
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const storageKey = (projectId: string) => `fixera:checkout-draft:${projectId}`;

const browserStorage = (): DraftStorage | null => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

export function saveCheckoutDraft(
  projectId: string,
  values: CheckoutDraftValues,
  checkoutId?: string,
  storage: DraftStorage | null = browserStorage(),
  now = Date.now(),
): void {
  if (!storage || !projectId) return;
  const draft: CheckoutDraft = {
    ...values,
    version: CHECKOUT_DRAFT_VERSION,
    projectId,
    ...(checkoutId ? { checkoutId } : {}),
    savedAt: now,
  };
  try {
    storage.setItem(storageKey(projectId), JSON.stringify(draft));
  } catch {
    // Storage full or blocked: going back then starts a fresh wizard.
  }
}

export function loadCheckoutDraft(
  projectId: string,
  storage: DraftStorage | null = browserStorage(),
  now = Date.now(),
): CheckoutDraft | null {
  if (!storage || !projectId) return null;
  try {
    const raw = storage.getItem(storageKey(projectId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as CheckoutDraft;
    if (
      !draft ||
      draft.version !== CHECKOUT_DRAFT_VERSION ||
      draft.projectId !== projectId ||
      typeof draft.savedAt !== 'number' ||
      now - draft.savedAt > CHECKOUT_DRAFT_MAX_AGE_MS
    ) {
      storage.removeItem(storageKey(projectId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearCheckoutDraft(
  projectId: string,
  storage: DraftStorage | null = browserStorage(),
): void {
  if (!storage || !projectId) return;
  try {
    storage.removeItem(storageKey(projectId));
  } catch {
    // ignore
  }
}

/** The wizard URL the payment page's back button returns to. */
export function wizardResumeHref(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}?${RESUME_BOOKING_PARAM}=1`;
}
