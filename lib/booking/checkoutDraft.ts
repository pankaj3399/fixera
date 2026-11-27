/**
 * FT2-4B: the booking wizard's answers, kept while the customer is on the
 * payment page. No booking exists before payment, so the payment page's back
 * button returns to the wizard and the wizard restores these values instead
 * of starting over. Stored per project in sessionStorage (this tab only).
 *
 * A draft belongs to the signed-in customer who saved it: it records their
 * user id and is never restored for another account, and every draft is
 * removed on logout or when the signed-in account changes.
 */

/** v2: drafts carry the owner's user id and the package's stable identity. */
export const CHECKOUT_DRAFT_VERSION = 2;
/** A draft older than this is ignored (the checkout hold is one hour). */
export const CHECKOUT_DRAFT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** Query flag the payment page's back button adds to the project URL. */
export const RESUME_BOOKING_PARAM = 'resumeBooking';

export interface CheckoutDraftValues {
  selectedPackageIndex: number | null;
  /** The package's id. Restore finds the package by it, never by position. */
  selectedPackageId?: string;
  /** The package's name: identifies it for a record without an id. */
  selectedPackageName?: string;
  /** VAT inputs the standard-VAT choice was made for (see vatInputsKey). */
  vatInputsKey?: string;
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
  /** The customer who saved the draft. */
  userId: string;
  checkoutId?: string;
  savedAt: number;
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type EnumerableStorage = Pick<Storage, 'key' | 'removeItem' | 'length'>;

const STORAGE_PREFIX = 'fixera:checkout-draft:';
const storageKey = (projectId: string) => `${STORAGE_PREFIX}${projectId}`;

const browserStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

export function saveCheckoutDraft(
  projectId: string,
  userId: string | null | undefined,
  values: CheckoutDraftValues,
  checkoutId?: string,
  storage: DraftStorage | null = browserStorage(),
  now = Date.now(),
): void {
  if (!storage || !projectId || !userId) return;
  const draft: CheckoutDraft = {
    ...values,
    version: CHECKOUT_DRAFT_VERSION,
    projectId,
    userId,
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
  userId: string | null | undefined,
  storage: DraftStorage | null = browserStorage(),
  now = Date.now(),
): CheckoutDraft | null {
  if (!storage || !projectId || !userId) return null;
  try {
    const raw = storage.getItem(storageKey(projectId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as CheckoutDraft;
    if (
      !draft ||
      draft.version !== CHECKOUT_DRAFT_VERSION ||
      draft.projectId !== projectId ||
      draft.userId !== userId ||
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

/**
 * Removes every checkout draft in this tab. Called on logout and when the
 * signed-in account changes, so no draft outlives the account that saved it.
 */
export function clearAllCheckoutDrafts(
  storage: EnumerableStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // ignore
  }
}

/**
 * The current position of the draft's package, found by its id (or, when the
 * saved or current record has no id, by a name only one such package has). A
 * name match whose id differs from the saved id is rejected. Null when the
 * package is gone: the wizard must not reopen with a different package.
 */
export function findDraftPackageIndex(
  subprojects: ReadonlyArray<{ _id?: string; name?: string } | null | undefined>,
  draft: Pick<CheckoutDraftValues, 'selectedPackageId' | 'selectedPackageName'>,
): number | null {
  if (draft.selectedPackageId) {
    const byId = subprojects.findIndex((pkg) => pkg?._id === draft.selectedPackageId);
    if (byId >= 0) return byId;
  }
  if (draft.selectedPackageName) {
    const savedId = draft.selectedPackageId;
    const matches = subprojects.reduce<number[]>((found, pkg, index) => {
      if (pkg?.name !== draft.selectedPackageName) return found;
      // Same name but a different id is a different package, not the saved one.
      if (savedId && pkg?._id && pkg._id !== savedId) return found;
      found.push(index);
      return found;
    }, []);
    if (matches.length === 1) return matches[0];
  }
  return null;
}

/**
 * Identifies the inputs a VAT preview depends on. A standard-VAT choice holds
 * only while this key is unchanged.
 */
export function vatInputsKey(vatAnswers: unknown[], serviceCountry: string | null | undefined): string {
  return JSON.stringify({ vatAnswers, serviceCountry: serviceCountry || null });
}

/** The hourly start time a restored draft asks for, on its date. */
export interface RestoredHourlyTime {
  date: string;
  time: string;
}

/**
 * The hourly slot to select for a date: the restored time while that date
 * offers it, otherwise the current choice if offered, otherwise the first slot.
 */
export function pickHourlySlot(
  slots: readonly string[],
  selectedTime: string,
  selectedDate: string,
  restored: RestoredHourlyTime | null,
): string {
  if (slots.length === 0) return '';
  if (restored && restored.date === selectedDate && slots.includes(restored.time)) return restored.time;
  if (selectedTime && slots.includes(selectedTime)) return selectedTime;
  return slots[0];
}

/** The wizard URL the payment page's back button returns to. */
export function wizardResumeHref(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}?${RESUME_BOOKING_PARAM}=1`;
}
