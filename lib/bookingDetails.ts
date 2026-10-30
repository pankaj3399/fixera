import type {
  ActivityItem,
  AttachmentDto,
  BookingDetailsDto,
  DetailViewerRole,
  DetailsNotice,
  PaymentRecordDto,
  QuotationVersionDto,
  RefundDto,
  SnapshotQuestion,
} from "../types/bookingDetails.ts";

export const DETAIL_TABS = ["overview", "booking", "quotation", "payments", "activity"] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

/** Valid `?tab=` values only; anything else (including absent) opens Overview. */
export function resolveDetailTab(value: string | null | undefined): DetailTab {
  return DETAIL_TABS.includes(value as DetailTab) ? (value as DetailTab) : "overview";
}

/**
 * Add/replace only `tab` in the existing query string, preserving every action
 * flag and the current hash unless an explicit anchor is requested.
 */
export function buildDetailHref(
  pathname: string,
  currentSearch: string | URLSearchParams | null | undefined,
  tab: DetailTab,
  hash?: string | null
): string {
  const params = new URLSearchParams(currentSearch || "");
  if (tab === "overview") params.delete("tab");
  else params.set("tab", tab);
  const query = params.toString();
  const normalizedHash = hash && hash !== "#" ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  return `${pathname}${query ? `?${query}` : ""}${normalizedHash}`;
}

export interface QuoteAnchor {
  overview: string;
  version: string;
}

/** Stable deep links (quotation number is display-only; anchors use the version number). */
export function buildQuoteAnchors(pathname: string, search: string | URLSearchParams | null | undefined, version?: number | null): QuoteAnchor {
  return {
    overview: buildDetailHref(pathname, search, "quotation", "#quotation"),
    version: version
      ? buildDetailHref(pathname, search, "quotation", `#quotation-v${version}`)
      : buildDetailHref(pathname, search, "quotation", "#quotation"),
  };
}

/** Explicit hash (`#quotation-v2`) wins over `?tab=` when both are present. */
export function detailTabFromHash(hash: string | null | undefined): DetailTab | null {
  if (!hash) return null;
  if (hash.startsWith("#quotation")) return "quotation";
  if (hash.startsWith("#payments")) return "payments";
  if (hash.startsWith("#activity")) return "activity";
  if (hash.startsWith("#booking")) return "booking";
  return null;
}

/** Hash wins, then `?tab=`, then the page default. Used for mount and popstate. */
export function resolveTabFromUrl(
  search: string | URLSearchParams | null | undefined,
  hash: string | null | undefined,
  defaultTab?: DetailTab | null
): DetailTab {
  const hashTab = detailTabFromHash(hash);
  if (hashTab) return hashTab;
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search || "");
  return resolveDetailTab(params.get("tab") || defaultTab || "overview");
}

export function quotationVersionLabel(
  quotationNumber: string | null | undefined,
  version?: number | string | null
): string | null {
  if (!quotationNumber) return version != null ? `v${version}` : null;
  if (version == null) return quotationNumber;
  const suffix = `-v${version}`;
  return quotationNumber.toLowerCase().endsWith(suffix.toLowerCase())
    ? quotationNumber
    : `${quotationNumber}${suffix}`;
}

/**
 * Resolve the quotation version from the complete URL. An explicit
 * `#quotation-vN` target wins; when the hash is removed (browser Back to
 * `?tab=quotation`) the panel returns to the current version instead of
 * keeping a stale selection.
 */
export function resolveQuotationVersionFromUrl(
  hash: string | null | undefined,
  currentVersion: number | null | undefined,
  fallbackVersion?: number | null
): number | null {
  const match = /^#quotation-v(\d+)$/.exec(hash || "");
  if (match) return Number(match[1]);
  if (currentVersion != null) return currentVersion;
  if (fallbackVersion != null) return fallbackVersion;
  return null;
}

/**
 * Currency recorded on this record itself. `currencySource:"not_recorded"`
 * (and legacy `currencyRecorded:false`) means the API value is a default, not
 * a recorded fact; callers must not label an amount with it.
 */
export function ownRecordedCurrency(
  record:
    | {
        currency?: string | null;
        currencySource?: string | null;
        currencyRecorded?: boolean | null;
      }
    | null
    | undefined
): string | null {
  if (!record) return null;
  if (record.currencySource === "not_recorded" || record.currencyRecorded === false) return null;
  return record.currency || null;
}

/**
 * The schedule zone the UI may present as recorded. A backend
 * `timeZoneRecorded:false` is authoritative: never fall back to a raw/inferred
 * booking field in that case. If both detail sections are silent (older wire),
 * the raw booking field is the only legacy evidence.
 */
export function recordedScheduleTimeZone(
  details: BookingDetailsDto | null | undefined,
  rawTimeZone?: string | null
): string | null {
  const overview = details?.booking?.schedule;
  const snapshot = details?.bookingSnapshot?.schedule;
  if (overview?.timeZoneRecorded === true && overview.timeZone) return overview.timeZone;
  if (snapshot?.timeZoneRecorded === true && snapshot.timeZone) return snapshot.timeZone;
  if (overview?.timeZoneRecorded === false || snapshot?.timeZoneRecorded === false) return null;
  return overview?.timeZone || snapshot?.timeZone || rawTimeZone || null;
}

export interface RecordedAnswerInput {
  questionId?: string | null;
  question?: string | null;
  answer?: unknown;
  fieldType?: string | null;
  answerType?: string | null;
  options?: string[] | null;
}

export interface MergedQuestionAnswer {
  key: string;
  questionId: string | null;
  label: string | null;
  labelSource: "recorded_answer" | "question_definition" | "none";
  questionSource: string | null;
  options: string[];
  type: string | null;
  isRequired: boolean;
  answer: unknown;
  hasAnswer: boolean;
  professionalAttachments: AttachmentDto[];
}

/** A recorded answer is present for 0, false, arrays and files; only null/blank is absent. */
export function answerRecorded(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

const normalizedQuestionType = (type: string | null | undefined): string | null => {
  if (!type) return null;
  if (type === "dropdown" || type === "checkbox" || type === "multiple-choice") return "multiple_choice";
  if (type === "file") return "attachment";
  return type;
};

/**
 * Union of returned question definitions and every stored answer. Questions
 * keep their order; answers whose definition is missing are appended with the
 * wording that was actually recorded with the answer. When a definition and a
 * stored answer disagree, the answer's recorded wording/options win - a live
 * project question must never be presented as the historical question.
 */
export function mergeQuestionAnswers(
  questions: SnapshotQuestion[],
  answers: RecordedAnswerInput[]
): MergedQuestionAnswer[] {
  const usedAnswers = new Set<number>();
  const rows: MergedQuestionAnswer[] = [];

  const findAnswerIndex = (question: SnapshotQuestion): number => {
    const questionId = question.questionId ? String(question.questionId) : null;
    if (questionId) {
      const byId = answers.findIndex(
        (answer, index) =>
          !usedAnswers.has(index) && answer.questionId != null && String(answer.questionId) === questionId
      );
      if (byId >= 0) return byId;
    }
    const definitionText = question.question?.trim();
    if (!definitionText) return -1;
    return answers.findIndex(
      (answer, index) =>
        !usedAnswers.has(index) && String(answer.question || "").trim() === definitionText
    );
  };

  questions.forEach((question, index) => {
    const answerIndex = findAnswerIndex(question);
    const answerEntry = answerIndex >= 0 ? answers[answerIndex] : null;
    if (answerIndex >= 0) usedAnswers.add(answerIndex);

    const recordedLabel = answerEntry?.question?.trim() ? answerEntry.question : null;
    const definitionLabel = question.question?.trim() ? question.question : null;
    const label = recordedLabel || definitionLabel || null;
    const labelSource: MergedQuestionAnswer["labelSource"] = recordedLabel
      ? "recorded_answer"
      : definitionLabel
        ? "question_definition"
        : "none";

    const answer = answerEntry ? answerEntry.answer : question.answer;
    const hasAnswer = answerRecorded(answer) && (answerEntry ? true : question.answered !== false);

    const storedOptions = Array.isArray(answerEntry?.options)
      ? answerEntry.options.filter((option): option is string => typeof option === "string")
      : [];
    const definitionOptions = Array.isArray(question.options)
      ? question.options.filter((option): option is string => typeof option === "string")
      : [];
    // A live definition's options are not evidence for an answer that carries
    // its own recorded wording. Stored question options are recorded facts.
    const options =
      storedOptions.length > 0
        ? storedOptions
        : answerEntry && question.source === "live_project"
          ? []
          : definitionOptions;

    rows.push({
      key: `question:${question.questionId || label || index}:${index}`,
      questionId: question.questionId || null,
      label,
      labelSource,
      questionSource: question.source || null,
      options,
      type: normalizedQuestionType(answerEntry?.fieldType || question.type),
      // Live-project required/type metadata is not historical truth when the
      // answer itself supplies the recorded question. Keep the live badge and
      // metadata only for genuinely unanswered live fallback questions.
      isRequired: answerEntry && question.source === "live_project" ? false : Boolean(question.isRequired),
      answer,
      hasAnswer,
      professionalAttachments: Array.isArray(question.professionalAttachments)
        ? question.professionalAttachments
        : [],
    });
  });

  answers.forEach((answer, index) => {
    if (usedAnswers.has(index) || !answerRecorded(answer.answer)) return;
    const label = answer.question?.trim() ? answer.question : null;
    rows.push({
      key: `answer:${answer.questionId || label || index}:${index}`,
      questionId: answer.questionId || null,
      label,
      labelSource: label ? "recorded_answer" : "none",
      questionSource: null,
      options: Array.isArray(answer.options)
        ? answer.options.filter((option): option is string => typeof option === "string")
        : [],
      type: normalizedQuestionType(answer.fieldType),
      isRequired: false,
      answer: answer.answer,
      hasAnswer: true,
      professionalAttachments: [],
    });
  });

  return rows;
}

export interface PostBookingFormQuestion {
  _id: string | null;
  id: string | null;
  question: string;
  type: "text" | "multiple_choice" | "attachment";
  options: string[];
  isRequired: boolean;
  source: string | null;
}

export interface PostBookingFormQuestionSource {
  questions: PostBookingFormQuestion[];
  legacyFallback: boolean;
  /**
   * True when a captured booking snapshot recorded no post-booking section and
   * the form is offering definitions that were added to the live project
   * later. They are submitted and frozen as `post_booking_submission`; they are
   * never presented as part of the original snapshot.
   */
  laterProjectQuestions: boolean;
  source: "booking_snapshot" | "post_booking_submission" | "live_project" | "details" | "none";
}

const formQuestionType = (
  type: string | null | undefined,
  options: string[]
): PostBookingFormQuestion["type"] => {
  if (type === "attachment" || type === "file") return "attachment";
  if (type === "multiple_choice" || type === "dropdown" || type === "checkbox") {
    return options.length > 0 ? "multiple_choice" : "text";
  }
  return "text";
};

const normalizeFormQuestion = (question: {
  _id?: string | null;
  id?: string | null;
  questionId?: string | null;
  question?: string | null;
  type?: string | null;
  options?: string[] | null;
  isRequired?: boolean | null;
  source?: string | null;
}): PostBookingFormQuestion => {
  const id = question.questionId || question._id || question.id || null;
  const options = Array.isArray(question.options)
    ? question.options.filter((option): option is string => typeof option === "string")
    : [];
  return {
    _id: id,
    id,
    question: String(question.question || ""),
    type: formQuestionType(question.type, options),
    options,
    isRequired: Boolean(question.isRequired),
    source: question.source || null,
  };
};

/**
 * The post-booking form must ask the same questions the submission handler
 * validates: the recorded snapshot when one exists, otherwise the live project
 * questions for a legacy record (explicitly flagged). `details` is the
 * authoritative read model; raw live questions are used only when no details
 * payload is available at all.
 *
 * A captured snapshot that recorded no post-booking questions is not a reason
 * to hide the form. The settled backend accepts the submission-time
 * definitions and freezes them as `post_booking_submission`; those later
 * questions are returned as a separate live collection and are labelled as
 * such by the form/read card. A captured snapshot that did record questions
 * remains authoritative, so later live wording/options can never replace them.
 */
export function resolvePostBookingFormQuestions(
  details: BookingDetailsDto | null | undefined,
  liveQuestions: Array<{
    _id?: string | null;
    id?: string | null;
    question?: string | null;
    type?: string | null;
    options?: string[] | null;
    isRequired?: boolean | null;
  }>
): PostBookingFormQuestionSource {
  if (details && Array.isArray(details.postBooking?.questions)) {
    const snapshotCaptured = Boolean(
      details.bookingSnapshot?.immutable || details.bookingSnapshot?.capturedAt
    );
    const normalized = details.postBooking.questions.map(normalizeFormQuestion);
    if (snapshotCaptured) {
      // A captured snapshot is authoritative. Questions the current project
      // added later are not part of the recorded set and must never be
      // presented as snapshot questions.
      const recorded = normalized.filter((question) => question.source === "booking_snapshot");
      if (recorded.length > 0) {
        return {
          questions: recorded,
          legacyFallback: false,
          laterProjectQuestions: false,
          source: "booking_snapshot",
        };
      }
      // A later submission freezes the definitions it accepted. Keep that
      // provenance distinct from both the original snapshot and the live set.
      const submitted = normalized.filter((question) => question.source === "post_booking_submission");
      if (submitted.length > 0) {
        return {
          questions: submitted,
          legacyFallback: false,
          laterProjectQuestions: false,
          source: "post_booking_submission",
        };
      }
      // The backend handler uses the submission-time definitions when the
      // captured snapshot had no post-booking section. Offer exactly those,
      // clearly labelled as later/current, and let the submission freeze them.
      const later = normalized.filter((question) => question.source === "live_project");
      return {
        questions: later,
        legacyFallback: false,
        laterProjectQuestions: later.length > 0,
        source: later.length > 0 ? "live_project" : "none",
      };
    }
    const live = normalized.filter((question) => question.source === "live_project");
    return {
      questions: live,
      legacyFallback: live.length > 0,
      laterProjectQuestions: false,
      source: live.length > 0 ? "live_project" : "none",
    };
  }
  const questions = (liveQuestions || []).map((question) =>
    normalizeFormQuestion({ ...question, source: "live_project" })
  );
  return {
    questions,
    legacyFallback: questions.length > 0,
    laterProjectQuestions: false,
    source: questions.length > 0 ? "live_project" : "none",
  };
}

/** Required question indexes with no non-blank answer. Used by the form. */
export function missingRequiredPostBookingQuestionIndexes(
  questions: PostBookingFormQuestion[],
  answers: Record<number, string | undefined> | string[]
): number[] {
  return questions
    .map((question, index) => {
      const raw = answers[index];
      const answer = typeof raw === "string" ? raw.trim() : "";
      return question.isRequired && !answer ? index : null;
    })
    .filter((index): index is number => index != null);
}

/**
 * Build the POST payload for the recorded/offered question set. Blank optional
 * answers are omitted exactly as before; every emitted row keeps the
 * authoritative question id and wording.
 */
export function buildPostBookingAnswerPayload(
  questions: PostBookingFormQuestion[],
  answers: Record<number, string | undefined> | string[]
): Array<{ questionId: string; question: string; answer: string }> {
  return questions
    .map((question, index) => {
      const raw = answers[index];
      return {
        questionId: question._id || question.id || `q-${index}`,
        question: question.question,
        answer: typeof raw === "string" ? raw : "",
      };
    })
    .filter((answer) => answer.answer.trim() !== "");
}

const STANDARD_VAT_ANSWER_FIELDS = new Set([
  "propertyNature",
  "article47_immovable",
  "building_age",
  "is_residence",
  "is_social_housing",
  "private_housing",
  "work_types",
  "occupancy",
]);

/** Locale key for a standard VAT answer field; custom fields stay as recorded text. */
export function vatAnswerFieldLabelKey(fieldName: string | null | undefined): string | null {
  const normalized = fieldName?.trim();
  if (!normalized || !STANDARD_VAT_ANSWER_FIELDS.has(normalized)) return null;
  return `details.enums.vatAnswerField.${normalized}`;
}

const STANDARD_VAT_QUESTION_LABELS: Record<string, string[]> = {
  propertyNature: ["property nature", "property type", "nature of the property"],
  article47_immovable: ["immovable property", "immovable property (article 47)", "article 47 immovable"],
  building_age: ["building age"],
  is_residence: ["residential use", "is residence", "residence"],
  is_social_housing: ["social housing", "is social housing"],
  private_housing: ["private housing"],
  work_types: ["work types"],
  occupancy: ["occupancy"],
};

/**
 * A recorded VAT question is the standard label when it matches a known
 * default for that field. Custom wording is kept as the user configured it.
 */
export function isStandardVatQuestionLabel(
  fieldName: string | null | undefined,
  question: string | null | undefined
): boolean {
  const field = fieldName?.trim();
  const text = question?.trim().toLowerCase().replace(/[.?!:]+$/g, "");
  if (!field || !text) return false;
  return (STANDARD_VAT_QUESTION_LABELS[field] || []).includes(text);
}

const STANDARD_VAT_ANSWER_VALUES = new Set([
  "standard_rate",
  "reduced_rate",
  "rfq",
  "movable",
  "immovable",
]);

/** Locale key for a known VAT enum value; unknown/custom values stay untouched. */
export function vatAnswerValueKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!STANDARD_VAT_ANSWER_VALUES.has(normalized)) return null;
  return `details.enums.vatAnswerValue.${normalized}`;
}

export function isCalendarDate(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Date-only schedule fields are calendar dates. Parsing them as local parts
 * avoids the UTC-midnight shift that `new Date("2026-06-24")` causes west of UTC.
 */
export function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) return null;
  return parsed;
}

export function formatCalendarDate(value: string | null | undefined, intl: string): string | null {
  const parsed = parseCalendarDate(value);
  return parsed ? parsed.toLocaleDateString(intl) : null;
}

export function formatInstant(
  value: string | null | undefined,
  intl: string,
  timeZone?: string | null
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(intl, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return date.toLocaleString(intl);
  }
}

export function isValidInstant(value: string | null | undefined): boolean {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** The runtime's current IANA zone; null when the environment cannot report one. */
export function viewerTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Localized generic zone name (not a DST-specific abbreviation) plus the IANA
 * identifier. The identifier is the stable fallback when Intl lacks a name.
 */
export function formatTimeZoneLabel(timeZone: string | null | undefined, intl: string): string | null {
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat(intl, {
      timeZone,
      timeZoneName: "longGeneric",
    }).formatToParts(new Date());
    const name = parts.find((part) => part.type === "timeZoneName")?.value;
    return name && name !== timeZone ? `${name} (${timeZone})` : timeZone;
  } catch {
    return timeZone;
  }
}

/**
 * Calendar day key for a recorded instant. Uses the recorded booking zone when
 * one exists, otherwise the viewer's zone, exactly like formatInstant. The
 * fallback never uses UTC directly, so a near-midnight event cannot be shown
 * as 25 Jun but grouped under 24 Jun.
 */
export function activityDayKey(
  item: Pick<ActivityItem, "occurredAt" | "timestampRecorded">,
  timeZone?: string | null
): string {
  if (!item.occurredAt || item.timestampRecorded === false) return "undated";
  const date = new Date(item.occurredAt);
  if (Number.isNaN(date.getTime())) return "undated";
  const zone = timeZone || viewerTimeZone();
  if (zone) {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    } catch {
      // Invalid/unavailable zone: fall through to the runtime local date.
    }
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export interface ActivityDayGroup {
  key: string;
  undated: boolean;
  items: ActivityItem[];
}

/**
 * Day-group events ascending; undated legacy records go last in a dedicated
 * group. No timestamp is ever invented for sorting.
 */
export function groupActivityByDay(items: ActivityItem[], timeZone?: string | null): ActivityDayGroup[] {
  const groups = new Map<string, ActivityDayGroup>();
  for (const item of items) {
    const key = activityDayKey(item, timeZone);
    const existing = groups.get(key);
    if (existing) existing.items.push(item);
    else groups.set(key, { key, undated: key === "undated", items: [item] });
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => {
      const aMs = instantMs(a.occurredAt);
      const bMs = instantMs(b.occurredAt);
      if (aMs == null && bMs == null) return a.id.localeCompare(b.id);
      if (aMs == null) return 1;
      if (bMs == null) return -1;
      return aMs - bMs || a.id.localeCompare(b.id);
    });
  }
  const dated = [...groups.values()]
    .filter((group) => !group.undated)
    .sort((a, b) => a.key.localeCompare(b.key));
  const undated = groups.get("undated");
  return undated ? [...dated, undated] : dated;
}

function instantMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Deduplicate real events by stable id, then suppress generic status rows that
 * duplicate a richer event for the same target status within 5 seconds.
 */
export function dedupeActivity(items: ActivityItem[]): ActivityItem[] {
  const seen = new Set<string>();
  const unique: ActivityItem[] = [];
  for (const item of items) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }

  const richSignatures = new Set<string>();
  for (const item of unique) {
    if (item.type === "status_changed" || item.type === "status_note" || item.type === "booking_created") continue;
    const target = item.metadata?.statusTo || item.statusTo;
    const ms = instantMs(item.occurredAt);
    if (!target || ms == null) continue;
    richSignatures.add(`${target}:${Math.floor(ms / 5000)}`);
  }

  return unique.filter((item) => {
    if (item.type !== "status_changed") return true;
    const target = item.metadata?.statusTo || item.statusTo;
    const ms = instantMs(item.occurredAt);
    if (!target || ms == null) return true;
    return !richSignatures.has(`${target}:${Math.floor(ms / 5000)}`);
  });
}

export function sortActivity(items: ActivityItem[]): ActivityItem[] {
  return [...items].sort((a, b) => {
    const aMs = instantMs(a.occurredAt);
    const bMs = instantMs(b.occurredAt);
    if (aMs == null && bMs == null) return a.id.localeCompare(b.id);
    if (aMs == null) return 1;
    if (bMs == null) return -1;
    return aMs - bMs || a.id.localeCompare(b.id);
  });
}

/**
 * Backend activity sends one `amounts` object; the legacy fallback emits rows.
 * Normalize both without inventing a currency or a zero.
 */
export function activityAmountRows(
  item: Pick<ActivityItem, "amounts" | "amountLines">
): NonNullable<ActivityItem["amountLines"]> {
  if (Array.isArray(item.amounts)) return item.amounts;
  const rows: NonNullable<ActivityItem["amountLines"]> = [];
  const seen = new Set<string>();
  const push = (kind: string, amount: number | null | undefined, currency: string | null | undefined) => {
    if (typeof amount !== "number" || !Number.isFinite(amount)) return;
    // The backend emits the same recorded figure once in `amounts` and once in
    // `amountLines` under a different kind (total vs professional). Identical
    // amount+currency pairs are one fact, not two.
    const key = `${amount}:${currency || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ kind, amount, currency: currency || null, recorded: true });
  };
  // Explicit component lines are the richer shape; prefer them.
  for (const line of item.amountLines || []) {
    if (line.amount == null) continue;
    push(line.kind || "amount", line.amount, line.currency);
  }
  const amounts = item.amounts;
  if (amounts && typeof amounts === "object") {
    const currency = amounts.currency || null;
    push("net", amounts.netAmount, currency);
    push("vat", amounts.vatAmount, currency);
    if (typeof amounts.totalAmount === "number") {
      push("total", amounts.totalAmount, currency);
    } else if (typeof amounts.amount === "number") {
      push("total", amounts.amount, currency);
    }
    if (typeof amounts.amount === "number" && amounts.amount !== amounts.totalAmount) {
      push("amount", amounts.amount, currency);
    }
  }
  return rows;
}

/** Stable i18n key for backend activity data-quality codes. */
export function activityQualityNoteKey(code: string): string {
  return `activity.qualityNotes.${code.toLowerCase()}`;
}

/** Hide accidentally-sent admin-only events from participant viewers. */
export function visibleActivity(items: ActivityItem[], viewerRole: DetailViewerRole): ActivityItem[] {
  if (viewerRole === "admin") return items;
  return items.filter((item) => item.visibility !== "admin");
}

export interface LegacyActorLike {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  role?: string;
}

function actorFromValue(value: unknown, role?: string): { actor: ActivityItem["actor"]; recorded: boolean } {
  if (!value) return { actor: null, recorded: false };
  if (typeof value === "string") {
    return {
      actor: { id: value, role: role || "unknown", name: null, source: "recorded" },
      recorded: true,
    };
  }
  if (typeof value === "object") {
    const record = value as LegacyActorLike;
    const id = record._id || record.id || null;
    if (!id && !record.name) return { actor: null, recorded: false };
    return {
      actor: {
        id,
        role: record.role || role || "unknown",
        name: record.name || null,
        email: record.email || null,
        source: "recorded",
      },
      recorded: true,
    };
  }
  return { actor: null, recorded: false };
}

function event(
  id: string,
  type: string,
  occurredAt: string | null | undefined,
  options: Partial<ActivityItem> = {}
): ActivityItem | null {
  if (!occurredAt || !isValidInstant(occurredAt)) return null;
  return {
    id,
    type,
    category: options.category || activityCategory(type),
    occurredAt,
    timestampRecorded: true,
    actor: options.actor ?? null,
    actorRecorded: options.actorRecorded ?? Boolean(options.actor),
    description: options.description ?? null,
    attachments: options.attachments || [],
    amounts: options.amounts || [],
    metadata: options.metadata || null,
    references: options.references || null,
    visibility: options.visibility || "participants",
    dataQuality: options.dataQuality,
  };
}

/**
 * Fallback timeline from raw booking fields when the backend `details.activity`
 * is absent (legacy/older backend). Only records with a real timestamp are
 * emitted and no actor is attributed to the current viewer.
 */
export function buildLegacyActivity(booking: LegacyBookingLike | null | undefined): ActivityItem[] {
  if (!booking) return [];
  const items: ActivityItem[] = [];

  const history = Array.isArray(booking.statusHistory) ? booking.statusHistory : [];
  history.forEach((entry, index) => {
    const actor = actorFromValue(entry.updatedBy);
    const added = event(
      `status:${entry.timestamp || "undated"}:${index}`,
      "status_changed",
      entry.timestamp,
      {
        actor: actor.actor,
        actorRecorded: actor.recorded,
        description: entry.note || null,
        statusTo: entry.status || null,
        metadata: { statusTo: entry.status || null },
      }
    );
    if (added) items.push(added);
  });

  if (history.length === 0 && booking.createdAt) {
    const added = event("booking:created", "booking_created", booking.createdAt, {
      description: null,
    });
    if (added) items.push(added);
  }

  if (booking.quote?.submittedAt) {
    const actor = actorFromValue(booking.quote.submittedBy);
    const added = event("quote:legacy", "quotation_submitted", booking.quote.submittedAt, {
      actor: actor.actor,
      actorRecorded: actor.recorded,
      description: booking.quote.description || null,
    });
    if (added) items.push(added);
  }

  if (booking.rfqResponse?.respondedAt) {
    const type = booking.rfqResponse.action === "rejected" ? "rfq_rejected" : "rfq_accepted";
    const added = event(`rfq:response`, type, booking.rfqResponse.respondedAt, {
      description: booking.rfqResponse.rejectionReason || null,
    });
    if (added) items.push(added);
  }

  (Array.isArray(booking.quoteVersions) ? booking.quoteVersions : []).forEach((version) => {
    const actor = actorFromValue(version.createdBy);
    const added = event(
      `quote:v${version.version}`,
      version.version > 1 ? "quotation_revised" : "quotation_submitted",
      version.createdAt,
      {
        actor: actor.actor,
        actorRecorded: actor.recorded,
        description: version.changeNote || null,
        references: {
          quotationNumber: version.quotationNumber || null,
          version: version.version,
        },
        metadata: {
          quotationNumber: version.quotationNumber || null,
          version: version.version,
        },
      }
    );
    if (added) items.push(added);
  });

  const payment = booking.payment;
  if (payment) {
    // A refund timestamp or refunded payment status does not prove how much was
    // refunded. Only the stored refund amount is evidence; the original charge
    // (totalWithVat) stays on the payment events and is never reused here.
    const refundedAmount = recordedNumber(payment.refundAmount);
    const paymentEvents: Array<[string, string, string | null | undefined, number | null | undefined]> = [
      ["payment:authorized", "payment_authorized", payment.authorizedAt, null],
      ["payment:captured", "payment_captured", payment.capturedAt, payment.totalWithVat],
      ["payment:paid", "payment_captured", payment.paidAt, payment.totalWithVat],
      ["payment:transferred", "payment_released", payment.transferredAt, payment.professionalPayout],
      ["payment:failed", "payment_failed", payment.failedAt, null],
      ["payment:canceled", "payment_canceled", payment.canceledAt, null],
      ["payment:refunded", "refund_issued", payment.refundedAt, refundedAmount],
      ["extra:paid", "extra_costs_paid", payment.extraCostPaidAt, payment.extraCostAmount],
    ];
    paymentEvents.forEach(([id, type, occurredAt, amount]) => {
      // Legacy extra-cost fields live on booking.payment but are a separate
      // charge; the base payment currency is not evidence for that record.
      const currency = type === "extra_costs_paid" ? null : ownRecordedCurrency(payment);
      const added = event(id, type, occurredAt, {
        description: type === "refund_issued" ? payment.refundReason || null : null,
        amounts:
          typeof amount === "number"
            ? [{ kind: type === "payment_released" ? "payout" : "total", amount, currency, recorded: true }]
            : [],
      });
      if (added) items.push(added);
    });
  }

  const paymentRows: PaymentRecordDto[] = Array.isArray(booking.paymentRecords) ? booking.paymentRecords : []
  for (const [index, record] of paymentRows.entries()) {
    const recordId = record.paymentId || `record-${index}`
    const currency = ownRecordedCurrency(record)
    const stamp = record.timestamps
    const addAmount = (kind: string, amount: number | null | undefined) =>
      typeof amount === "number" ? [{ kind, amount, currency, recorded: true as const }] : []
    const paymentEvents: Array<[string, string, string | null | undefined, ActivityItem["amounts"]]> = [
      [`payment:${recordId}:authorized`, "payment_authorized", stamp?.authorizedAt, []],
      [`payment:${recordId}:captured`, "payment_captured", stamp?.capturedAt, addAmount("total", record.totalWithVat)],
      [`payment:${recordId}:paid`, "payment_captured", stamp?.paidAt, addAmount("total", record.totalWithVat)],
      [`payment:${recordId}:transferred`, "payment_released", stamp?.transferredAt, addAmount("payout", record.professionalPayout)],
      [`payment:${recordId}:failed`, "payment_failed", stamp?.failedAt, []],
      [`payment:${recordId}:canceled`, "payment_canceled", stamp?.canceledAt, []],
      [`payment:${recordId}:disputed`, "payment_disputed", stamp?.disputeOpenedAt, []],
    ]
    paymentEvents.forEach(([id, type, occurredAt, amounts]) => {
      const added = event(id, type, occurredAt, { amounts: amounts || [] })
      if (added) items.push(added)
    })
    if (!(Array.isArray(booking.refunds) && booking.refunds.length > 0) && stamp?.refundedAt) {
      const added = event(`payment:${recordId}:refunded`, "refund_issued", stamp.refundedAt, {
        // The payment record's totalWithVat is the original charge. Only a
        // stored refundAmount can prove the refunded amount.
        amounts: addAmount("refund", recordedNumber(record.refundAmount)),
        description: record.refundReason || null,
      })
      if (added) items.push(added)
    }
  }

  const refundRows: RefundDto[] = Array.isArray(booking.refunds) ? booking.refunds : []
  for (const refund of refundRows) {
    const added = event(`refund:${refund.id}`, "refund_issued", refund.refundedAt, {
      description: refund.justification || null,
      amounts:
        typeof refund.amount === "number"
          ? [{ kind: "refund", amount: refund.amount, currency: ownRecordedCurrency(refund), recorded: true }]
          : [],
    })
    if (added) items.push(added)
  }

  (Array.isArray(booking.rescheduleHistory) ? booking.rescheduleHistory : []).forEach((entry, index) => {
    const requested = actorFromValue(entry.requestedBy);
    const requestedAt = entry.requestedAt;
    const requestedEvent = event(
      `reschedule:${requestedAt || "undated"}:${index}:requested`,
      "reschedule_requested",
      requestedAt,
      {
        actor: requested.actor,
        actorRecorded: requested.recorded,
        description: entry.description || entry.note || entry.reason || null,
        metadata: {
          previousSchedule: entry.previousSchedule || null,
          proposedSchedule: entry.proposedSchedule || null,
          timeZone: entry.timeZone || null,
        },
      }
    );
    if (requestedEvent) items.push(requestedEvent);

    const responded = actorFromValue(entry.respondedBy);
    const responseType =
      entry.status === "declined" ? "reschedule_declined" : entry.status === "accepted" ? "reschedule_accepted" : null;
    if (responseType && entry.respondedAt) {
      const respondedEvent = event(
        `reschedule:${entry.respondedAt}:${index}:response`,
        responseType,
        entry.respondedAt,
        {
          actor: responded.actor,
          actorRecorded: responded.recorded,
          description: entry.responseNote || null,
          metadata: {
            previousSchedule: entry.previousSchedule || null,
            proposedSchedule: entry.proposedSchedule || null,
            timeZone: entry.timeZone || null,
          },
        }
      );
      if (respondedEvent) items.push(respondedEvent);
    }
  });

  if (booking.rescheduleRequest && !(Array.isArray(booking.rescheduleHistory) && booking.rescheduleHistory.length > 0)) {
    const actor = actorFromValue(booking.rescheduleRequest.requestedBy);
    const added = event("reschedule:latest", "reschedule_requested", booking.rescheduleRequest.requestedAt, {
      actor: actor.actor,
      actorRecorded: actor.recorded,
      description: booking.rescheduleRequest.description || booking.rescheduleRequest.reason || null,
      metadata: {
        previousSchedule: booking.rescheduleRequest.previousSchedule || null,
        proposedSchedule: booking.rescheduleRequest.proposedSchedule || null,
      },
    });
    if (added) items.push(added);
  }

  (Array.isArray(booking.cancellationRequests) ? booking.cancellationRequests : []).forEach((request, index) => {
    const requested = actorFromValue(request.requestedBy);
    const id = request.id || request._id || `cancellation-${index}`;
    const requestedEvent = event(`cancellation:${id}:requested`, "cancellation_requested", request.createdAt, {
      actor: requested.actor,
      actorRecorded: requested.recorded,
      description: request.reason || request.reasonCategory || null,
      attachments: (request.evidence || []).map((entry) =>
        typeof entry === "string" ? { url: entry, source: "cancellation" } : { ...entry, source: "cancellation" }
      ),
      metadata: { reasonCategory: request.reasonCategory || null },
      references: { cancellationRequestId: id },
    });
    if (requestedEvent) items.push(requestedEvent);

    const resolved = actorFromValue(request.resolvedBy);
    if (request.status === "approved" && request.resolvedAt) {
      const approved = event(`cancellation:${id}:approved`, "cancellation_approved", request.resolvedAt, {
        actor: resolved.actor,
        actorRecorded: resolved.recorded,
        description: request.professionalNote || null,
        amounts:
          typeof request.refundAmount === "number"
            ? [{ kind: "refund", amount: request.refundAmount, currency: request.currency || null, recorded: true }]
            : [],
        references: { cancellationRequestId: id },
      });
      if (approved) items.push(approved);
    }
    if (request.status === "denied" && request.resolvedAt) {
      const denied = event(`cancellation:${id}:denied`, "cancellation_denied", request.resolvedAt, {
        actor: resolved.actor,
        actorRecorded: resolved.recorded,
        description: request.denyReason || null,
        references: { cancellationRequestId: id },
      });
      if (denied) items.push(denied);
    }
    if (request.escalatedAt) {
      const escalated = event(`cancellation:${id}:escalated`, "refund_escalated", request.escalatedAt, {
        description: request.escalationReason || null,
        references: { cancellationRequestId: id },
      });
      if (escalated) items.push(escalated);
    }
  });

  if (booking.cancellation?.cancelledAt) {
    const actor = actorFromValue(booking.cancellation.cancelledBy);
    const added = event("cancellation:final", "cancellation_approved", booking.cancellation.cancelledAt, {
      actor: actor.actor,
      actorRecorded: actor.recorded,
      description: booking.cancellation.reason || null,
      amounts:
        typeof booking.cancellation.refundAmount === "number"
          ? [{ kind: "refund", amount: booking.cancellation.refundAmount, currency: booking.cancellation.currency || null, recorded: true }]
          : [],
    });
    if (added) items.push(added);
  }

  if (booking.dispute?.raisedAt) {
    const actor = actorFromValue(booking.dispute.raisedBy);
    const opened = event("dispute:opened", "dispute_opened", booking.dispute.raisedAt, {
      actor: actor.actor,
      actorRecorded: actor.recorded,
      description: booking.dispute.description || booking.dispute.reason || null,
      metadata: { disputeType: booking.dispute.type || null },
      attachments: (booking.dispute.attachments || []).map((url) => ({ url, source: "dispute" })),
    });
    if (opened) items.push(opened);
  }
  if (booking.dispute?.resolvedAt) {
    const actor = actorFromValue(booking.dispute.resolvedBy);
    const resolved = event("dispute:resolved", "dispute_resolved", booking.dispute.resolvedAt, {
      actor: actor.actor,
      actorRecorded: actor.recorded,
      description: booking.dispute.resolution || null,
    });
    if (resolved) items.push(resolved);
  }

  if (booking.completionAttestation?.confirmedAt) {
    const actor = actorFromValue(booking.completionAttestation.confirmedBy);
    const confirmed = event("completion:confirmed", "completion_confirmed", booking.completionAttestation.confirmedAt, {
      actor: actor.actor,
      actorRecorded: actor.recorded,
      description: booking.completionAttestation.notes || null,
      attachments: (booking.completionAttestation.attachments || []).map((url) => ({
        url,
        source: "completion",
      })),
    });
    if (confirmed) items.push(confirmed);
  }

  if (booking.postBookingSubmittedAt) {
    const actor = actorFromValue(booking.postBookingSubmittedBy);
    const submitted = event("post-booking:submitted", "post_booking_answers_submitted", booking.postBookingSubmittedAt, {
      actor: actor.actor,
      actorRecorded: actor.recorded,
    });
    if (submitted) items.push(submitted);
  }

  (Array.isArray(booking.warrantyClaims) ? booking.warrantyClaims : []).forEach((claim, index) => {
    const opened = event(`warranty:${claim.id || index}:opened`, "warranty_claim_opened", claim.openedAt, {
      description: claim.reason || null,
      references: { claimNumber: claim.claimNumber || null },
      metadata: { claimNumber: claim.claimNumber || null },
    });
    if (opened) items.push(opened);
  });

  return sortActivity(dedupeActivity(items));
}

/**
 * Apply a successful post-booking POST to the existing details so the Booking
 * tab updates before (and independently of) the authoritative refresh. The
 * response is the stored answer list; no timestamp or actor is invented.
 */
export function withSubmittedPostBookingAnswers(
  details: BookingDetailsDto | null | undefined,
  answers: Array<{ questionId: string; question: string; answer: string }>
): BookingDetailsDto | null {
  if (!details) return null;
  return {
    ...details,
    postBooking: {
      ...(details.postBooking || {}),
      answers: answers.map((answer) => ({
        ...answer,
        answerType: isSafeHttpUrl(answer.answer) ? "file" : "text",
      })),
      complete: true,
    },
  };
}

export function resolveActivityItems(
  details: BookingDetailsDto | null | undefined,
  booking: LegacyBookingLike | null | undefined,
  viewerRole: DetailViewerRole
): ActivityItem[] {
  // The backend-normalized timeline is authoritative, including a real empty
  // result. Raw-booking fallback is only for an older backend without details.
  if (details?.activity && Array.isArray(details.activity.items)) {
    return sortActivity(dedupeActivity(visibleActivity(details.activity.items, viewerRole)));
  }
  const quotation = details?.quotation;
  const merged: LegacyBookingLike = {
    ...(booking || {}),
    rescheduleHistory:
      booking?.rescheduleHistory && booking.rescheduleHistory.length > 0
        ? booking.rescheduleHistory
        : details?.reschedules,
    cancellationRequests:
      booking?.cancellationRequests && booking.cancellationRequests.length > 0
        ? booking.cancellationRequests
        : (details?.cancellations as LegacyBookingLike["cancellationRequests"]),
    quoteVersions:
      booking?.quoteVersions && booking.quoteVersions.length > 0
        ? booking.quoteVersions
        : quotation?.versions,
    warrantyClaims: booking?.warrantyClaims?.length ? booking.warrantyClaims : details?.warrantyClaims,
    paymentRecords: details?.payments?.records,
    refunds: details?.payments?.refunds,
    payment:
      booking?.payment ||
      (details?.payments?.base
        ? {
            currency: ownRecordedCurrency(details.payments.base),
            totalWithVat: details.payments.base.totalWithVat,
            professionalPayout: details.payments.base.professionalPayout,
            authorizedAt: details.payments.base.timestamps?.authorizedAt,
            capturedAt: details.payments.base.timestamps?.capturedAt,
            paidAt: details.payments.base.timestamps?.paidAt,
            transferredAt: details.payments.base.timestamps?.transferredAt,
            refundedAt: details.payments.base.timestamps?.refundedAt,
            // Carry the recorded refund evidence into the legacy fallback; the
            // base totalWithVat is the original charge and is never a refund.
            refundAmount: details.payments.base.refundAmount,
            refundReason: details.payments.base.refundReason,
            failedAt: details.payments.base.timestamps?.failedAt,
            canceledAt: details.payments.base.timestamps?.canceledAt,
          }
        : null),
  };
  const source = buildLegacyActivity(merged);
  return sortActivity(dedupeActivity(visibleActivity(source, viewerRole)));
}

export interface LegacySchedule {
  preferredStartDate?: string | null;
  scheduledStartDate?: string | null;
  scheduledStartTime?: string | null;
  scheduledExecutionEndDate?: string | null;
  scheduledBufferStartDate?: string | null;
  scheduledBufferEndDate?: string | null;
  scheduledEndDate?: string | null;
}

export interface LegacyBookingLike {
  _id?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  statusHistory?: Array<{ status?: string; timestamp?: string; updatedBy?: unknown; note?: string }>;
  rfqResponse?: { action?: string; respondedAt?: string; rejectionReason?: string } | null;
  quoteVersions?: Array<
    QuotationVersionDto & {
      createdBy?: unknown;
      customerPricing?: unknown;
      customerTotals?: unknown;
    }
  >;
  payment?: {
    currency?: string | null;
    totalWithVat?: number | null;
    refundAmount?: number | null;
    refundReason?: string | null;
    authorizedAt?: string | null;
    capturedAt?: string | null;
    paidAt?: string | null;
    transferredAt?: string | null;
    refundedAt?: string | null;
    failedAt?: string | null;
    canceledAt?: string | null;
    extraCostPaidAt?: string | null;
    extraCostAmount?: number | null;
    professionalPayout?: number | null;
  } | null;
  rescheduleHistory?: Array<{
    requestedAt?: string | null;
    requestedBy?: unknown;
    respondedBy?: unknown;
    respondedAt?: string | null;
    reason?: string | null;
    description?: string | null;
    note?: string | null;
    responseNote?: string | null;
    status?: string | null;
    timeZone?: string | null;
    previousSchedule?: LegacySchedule | null;
    proposedSchedule?: LegacySchedule | null;
  }>;
  rescheduleRequest?: {
    requestedAt?: string;
    requestedBy?: unknown;
    reason?: string;
    description?: string;
    previousSchedule?: LegacySchedule | null;
    proposedSchedule?: LegacySchedule | null;
  } | null;
  cancellationRequests?: Array<{
    id?: string;
    _id?: string;
    status?: string | null;
    reason?: string | null;
    reasonCategory?: string | null;
    evidence?: Array<string | { url?: string | null; fileName?: string | null }>;
    requestedBy?: unknown;
    createdAt?: string | null;
    resolvedAt?: string | null;
    resolvedBy?: unknown;
    denyReason?: string | null;
    professionalNote?: string | null;
    refundAmount?: number | null;
    currency?: string | null;
    escalatedAt?: string | null;
    escalationReason?: string | null;
  }>;
  cancellation?: {
    cancelledBy?: unknown;
    reason?: string;
    cancelledAt?: string;
    refundAmount?: number;
    currency?: string | null;
  } | null;
  quote?: {
    amount?: number;
    currency?: string;
    description?: string;
    validUntil?: string;
    submittedAt?: string;
    submittedBy?: unknown;
  } | null;
  dispute?: {
    raisedBy?: unknown;
    resolvedBy?: unknown;
    reason?: string;
    description?: string;
    raisedAt?: string;
    resolvedAt?: string;
    resolution?: string;
    type?: string;
    attachments?: string[];
  } | null;
  completionAttestation?: {
    confirmedAt?: string;
    confirmedBy?: unknown;
    attachments?: string[];
    notes?: string;
  } | null;
  postBookingSubmittedAt?: string | null;
  postBookingSubmittedBy?: unknown;
  warrantyClaims?: Array<{
    id?: string;
    claimNumber?: string | null;
    status?: string | null;
    reason?: string | null;
    openedAt?: string | null;
  }>;
  paymentRecords?: PaymentRecordDto[];
  refunds?: RefundDto[];
}

export function activityCategory(type: string): string {
  if (type.startsWith("rfq")) return "rfq";
  if (type.startsWith("quotation") || type.startsWith("quote")) return "quotation";
  if (type.startsWith("refund")) return "refund";
  if (type.startsWith("payment")) return "payment";
  if (type.startsWith("reschedule") || type.startsWith("schedule") || type.startsWith("execution") || type.startsWith("planning")) return "schedule";
  if (type.startsWith("completion") || type.startsWith("work") || type.startsWith("milestone")) return "completion";
  if (type.startsWith("extra_cost")) return "extra_cost";
  if (type.startsWith("cancellation")) return "cancellation";
  if (type.startsWith("warranty")) return "warranty";
  if (type.startsWith("dispute")) return "dispute";
  if (type.startsWith("review")) return "review";
  if (type === "booking_created" || type === "status_changed" || type === "status_note") return "lifecycle";
  return "system";
}

/** i18n key for a stable activity type; unknown future types fall back to a readable label. */
export function activityTitleKey(type: string): string {
  return `details.activity.types.${type}`;
}

export function activityTypeFallback(type: string): string {
  return type.replace(/_/g, " ");
}

export function describeAnswer(value: unknown):
  | { kind: "empty" }
  | { kind: "empty_array" }
  | { kind: "boolean"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "date"; value: string }
  | { kind: "file"; value: string }
  | { kind: "array"; items: unknown[] }
  | { kind: "object"; entries: Array<{ key: string; value: unknown }> }
  | { kind: "text"; value: string } {
  if (value === null || value === undefined || value === "") return { kind: "empty" };
  if (typeof value === "boolean") return { kind: "boolean", value };
  if (typeof value === "number") return { kind: "number", value };
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: "empty_array" };
    return { kind: "array", items: value };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => ({
      key,
      value: entryValue,
    }));
    if (entries.length === 0) return { kind: "empty" };
    return { kind: "object", entries };
  }
  const text = String(value);
  const trimmed = text.trim();
  // Older RFQ answers store arrays/objects as JSON text. Parse only a complete
  // JSON array/object so a normal bracketed answer remains plain text.
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.length === 0 ? { kind: "empty_array" } : { kind: "array", items: parsed };
      }
      if (parsed && typeof parsed === "object") {
        const entries = Object.entries(parsed as Record<string, unknown>).map(([key, entryValue]) => ({
          key,
          value: entryValue,
        }));
        return entries.length === 0 ? { kind: "empty" } : { kind: "object", entries };
      }
    } catch {
      // Not JSON; keep the stored text.
    }
  }
  if (trimmed === "true" || trimmed === "false") {
    return { kind: "boolean", value: trimmed === "true" };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { kind: "date", value: trimmed };
  if (isSafeHttpUrl(text)) return { kind: "file", value: text };
  return { kind: "text", value: text };
}

export function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function safeAttachments(
  attachments: Array<{ url?: string | null; fileName?: string | null; source?: string }> | null | undefined
): Array<{ url: string; fileName?: string | null; source?: string }> {
  return (attachments || []).filter(
    (attachment): attachment is { url: string; fileName?: string | null; source?: string } =>
      isSafeHttpUrl(attachment.url)
  );
}

export function fileLabel(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return decodeURIComponent(segments[segments.length - 1] || fallback);
  } catch {
    return fallback;
  }
}

export function recordedNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export interface AdminLinkPermissions {
  bookingsRead: boolean;
  disputesManage: boolean;
  warrantyManage: boolean;
  paymentsManage: boolean;
}

export interface AdminDetailLink {
  key: string;
  href: string;
}

/**
 * Admin-only links, gated by the actual area permission (never role alone) and
 * omitted entirely for participants. Only stable routes are returned.
 */
export function buildAdminDetailLinks(input: {
  viewerRole: DetailViewerRole | null | undefined;
  bookingId: string | null | undefined;
  permissions: AdminLinkPermissions;
  claimNumber?: string | null;
  hasDispute?: boolean;
  hasPayment?: boolean;
}): AdminDetailLink[] {
  if (input.viewerRole !== "admin" || !input.bookingId) return [];
  const links: AdminDetailLink[] = [];
  if (input.permissions.bookingsRead) {
    links.push({ key: "booking", href: `/admin/bookings/${input.bookingId}` });
  }
  if (input.permissions.warrantyManage) {
    const href = input.claimNumber
      ? `/admin/warranty-claims?search=${encodeURIComponent(input.claimNumber)}`
      : "/admin/warranty-claims";
    links.push({ key: "warranty", href });
  }
  if (input.permissions.disputesManage && input.hasDispute) {
    links.push({ key: "disputes", href: "/admin/disputes" });
  }
  if (input.permissions.paymentsManage && input.hasPayment) {
    links.push({ key: "payments", href: "/admin/payments" });
  }
  return links;
}

const NOTICE_KEYS: Record<string, string> = {
  BOOKING_SNAPSHOT_NOT_RECORDED: "termsSnapshotNotRecorded",
  TERMS_SNAPSHOT_NOT_RECORDED: "termsSnapshotNotRecorded",
  LIVE_PROJECT_MAY_HAVE_CHANGED: "liveProjectMayHaveChanged",
  PARTY_PROFILE_IS_CURRENT: "partyProfileIsCurrent",
  QUOTE_ACTOR_NOT_RECORDED: "quoteActorNotRecorded",
  ACCEPTED_VERSION_INFERRED: "acceptedVersionInferred",
  QUOTE_CUSTOMER_TOTALS_NOT_RECORDED: "quoteCustomerPricingNotRecorded",
  QUOTE_CUSTOMER_PRICING_NOT_RECORDED: "quoteCustomerPricingNotRecorded",
  QUOTE_SERVICE_LOCATION_NOT_RECORDED: "quoteServiceLocationNotRecorded",
  POST_BOOKING_TIMESTAMP_NOT_RECORDED: "postBookingTimestampNotRecorded",
  SCHEDULE_TIMEZONE_NOT_RECORDED: "scheduleTimeZoneNotRecorded",
  REFUND_VAT_SPLIT_NOT_RECORDED: "refundVatSplitNotRecorded",
  REFUND_BREAKDOWN_INCOMPLETE: "refundBreakdownIncomplete",
  PAYMENT_ROW_MISSING: "paymentRowMissing",
  PAYMENT_CURRENCY_NOT_RECORDED: "paymentCurrencyNotRecorded",
  MILESTONE_PAYMENT_ROW_MISSING: "milestonePaymentRowMissing",
  EXTRA_COST_PAYMENT_NOT_RECORDED: "extraCostPaymentNotRecorded",
  CHECKOUT_SNAPSHOT_INCOMPLETE: "checkoutSnapshotIncomplete",
  ATTACHMENT_UNAVAILABLE: "attachmentUnavailable",
};

export function noticeKey(code: string): string | null {
  return NOTICE_KEYS[code] ? `details.notices.${NOTICE_KEYS[code]}` : null;
}

export function noticeFallback(code: string): string {
  return code.replace(/_/g, " ").toLowerCase();
}

export function dedupeNotices(notices: DetailsNotice[] | null | undefined): DetailsNotice[] {
  const seen = new Set<string>();
  const result: DetailsNotice[] = [];
  for (const notice of notices || []) {
    if (!notice?.code || seen.has(notice.code)) continue;
    seen.add(notice.code);
    result.push(notice);
  }
  return result;
}



/**
 * Status from per-version provenance, not from whichever timestamp happens to
 * be present. An accepted/current version can carry a legacy rejection
 * timestamp from an older version; that contradiction is surfaced separately,
 * never used to label the version rejected.
 */
export function quoteVersionStatus(
  version: QuotationVersionDto,
  details: BookingDetailsDto | null | undefined
): "accepted" | "rejected" | "current" | "historical" {
  const quotation = details?.quotation;
  const acceptedVersion = quotation?.acceptedVersion;
  const accepted =
    version.accepted === true ||
    (acceptedVersion?.version === version.version &&
      (acceptedVersion.source === "recorded" || acceptedVersion.source === "inferred_current"));
  if (accepted) return "accepted";

  const quoteStatus = quotation?.status || details?.booking?.quote?.status || null;
  const currentVersion =
    quotation?.currentVersion ?? details?.booking?.quote?.currentVersion ?? null;
  const isCurrent = currentVersion === version.version;

  if (quoteStatus === "rejected" && (isCurrent || Boolean(version.rejectedAt))) return "rejected";
  if ((quoteStatus === "quoted" || quoteStatus === "draft") && isCurrent) return "current";
  if (version.rejectedAt) return "rejected";
  return "historical";
}

export function durationLabel(
  duration: { value?: number | null; unit?: string | null } | null | undefined
): { value: number; unit: string } | null {
  if (!duration || typeof duration.value !== "number" || !Number.isFinite(duration.value)) return null;
  return { value: duration.value, unit: duration.unit || "hours" };
}

/**
 * Hour-mode detection (client task 23a). Hour-mode bookings show the start
 * and end time alongside the date; day-mode bookings never show times.
 * An explicit execution unit wins over the coarse project time mode, and
 * recorded snapshot values win over live project data.
 */
export function resolveScheduleHourMode(
  input: { timeMode?: string | null; executionUnit?: string | null } | null | undefined
): boolean {
  if (!input) return false;
  const unit = (input.executionUnit || "").toLowerCase();
  if (unit === "hours") return true;
  if (unit === "days") return false;
  return (input.timeMode || "").toLowerCase() === "hours";
}

export function resolveBookingHourMode(
  input: {
    snapshotExecutionUnit?: string | null;
    snapshotTimeMode?: string | null;
    bookingExecutionUnit?: string | null;
    bookingTimeMode?: string | null;
  } | null | undefined
): boolean {
  if (!input) return false;
  const unit = input.snapshotExecutionUnit || input.bookingExecutionUnit || null;
  if (unit) return resolveScheduleHourMode({ executionUnit: unit });
  return resolveScheduleHourMode({
    timeMode: input.snapshotTimeMode || input.bookingTimeMode || null,
  });
}

/** "14:00–16:00" range; null unless both times are recorded. */
export function formatScheduleTimeRange(
  startTime?: string | null,
  endTime?: string | null
): string | null {
  if (!startTime || !endTime) return null;
  return `${startTime}–${endTime}`;
}

interface PanelHourModeBooking {
  project?: {
    timeMode?: string | null;
    executionDuration?: { value?: number; unit?: string | null } | null;
    subprojects?: Array<{
      executionDuration?: { value?: number; unit?: string | null } | null;
    } | null> | null;
  } | null;
  selectedSubprojectIndex?: number | null;
}

interface PanelHourModeDetails {
  bookingSnapshot?: {
    project?: { timeMode?: string | null } | null;
    selectedSubproject?: {
      executionDuration?: { value?: number; unit?: string | null } | null;
    } | null;
  } | null;
}

/**
 * Single hour-mode rule for every booking-info surface (task 23a): a booking
 * shows wall times only when positively hour mode. Execution unit beats the
 * coarse project time mode, and the recorded booking snapshot beats live
 * project data. Unknown mode means date-only (showing a wrong time is worse
 * than showing none).
 */
export function resolvePanelHourMode(
  booking?: PanelHourModeBooking | null,
  details?: PanelHourModeDetails | null
): boolean {
  const subprojects = booking?.project?.subprojects;
  const selectedIndex = booking?.selectedSubprojectIndex;
  let bookingUnit: string | null = null;
  if (Array.isArray(subprojects) && subprojects.length > 0) {
    const sub =
      typeof selectedIndex === "number"
        ? subprojects[selectedIndex]
        : subprojects.length === 1
          ? subprojects[0]
          : undefined;
    bookingUnit = sub?.executionDuration?.unit ?? null;
  }
  if (!bookingUnit) bookingUnit = booking?.project?.executionDuration?.unit ?? null;
  return resolveBookingHourMode({
    snapshotExecutionUnit:
      details?.bookingSnapshot?.selectedSubproject?.executionDuration?.unit ?? null,
    snapshotTimeMode: details?.bookingSnapshot?.project?.timeMode ?? null,
    bookingExecutionUnit: bookingUnit,
    bookingTimeMode: booking?.project?.timeMode ?? null,
  });
}
