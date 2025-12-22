const DEFAULT_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/**
 * Parse a date input (string, Date, or null/undefined) into a Date object
 */
const parseDateInput = (value?: string | Date | null): Date | null => {
  if (!value) return null;
  const parsed = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(parsed?.getTime())) {
    return null;
  }
  return parsed;
};

/**
 * Format a date for a specific timezone
 */
const formatDateForZone = (
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_TIME_OPTIONS
): string => {
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone,
  }).format(date);
};

/**
 * Get the viewer's timezone from their browser
 */
export const getViewerTimezone = (): string => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || 'UTC';
  } catch {
    return 'UTC';
  }
};

/**
 * Format a single date/time showing both UTC and viewer's timezone
 * Returns null if the input is invalid
 */
export const formatUtcViewerLabel = (
  value?: string | Date | null,
  viewerTimeZone?: string,
  includeTime: boolean = true
): { utcLabel: string; viewerLabel: string; viewerZone: string } | null => {
  const date = parseDateInput(value);
  if (!date) return null;
  const viewerZone = viewerTimeZone || getViewerTimezone();
  const options = includeTime ? DEFAULT_TIME_OPTIONS : DEFAULT_DATE_OPTIONS;

  return {
    utcLabel: formatDateForZone(date, 'UTC', options),
    viewerLabel: formatDateForZone(date, viewerZone, options),
    viewerZone,
  };
};

/**
 * Format a time window (start -> end) showing both UTC and viewer's timezone
 * Returns null if both start and end are invalid
 */
export const formatWindowUtcViewer = (
  window?: { start?: string | Date; end?: string | Date } | null,
  viewerTimeZone?: string,
  includeTime: boolean = true
): { utcLabel: string; viewerLabel: string; viewerZone: string } | null => {
  if (!window) return null;
  const start = parseDateInput(window.start);
  const end = parseDateInput(window.end);
  if (!start && !end) return null;
  const viewerZone = viewerTimeZone || getViewerTimezone();
  const options = includeTime ? DEFAULT_TIME_OPTIONS : DEFAULT_DATE_OPTIONS;

  const buildLabel = (timeZone: string): string | null => {
    const startLabel = start ? formatDateForZone(start, timeZone, options) : null;
    const endLabel = end ? formatDateForZone(end, timeZone, options) : null;

    if (startLabel && endLabel) {
      return `${startLabel} → ${endLabel}`;
    }
    return startLabel || endLabel || null;
  };

  const utcLabel = buildLabel('UTC');
  const viewerLabel = buildLabel(viewerZone);
  if (!utcLabel || !viewerLabel) return null;

  return { utcLabel, viewerLabel, viewerZone };
};

/**
 * Format just a date (no time) for display
 */
export const formatDateOnly = (
  value?: string | Date | null,
  viewerTimeZone?: string
): { utcLabel: string; viewerLabel: string; viewerZone: string } | null => {
  return formatUtcViewerLabel(value, viewerTimeZone, false);
};
