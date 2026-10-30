export type SearchDateDraftResult = { date: Date | undefined; error: 'invalid' | null };

export const formatSearchDateDraft = (date?: Date) =>
  date ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-') : '';

export const parseSearchDateDraft = (value: string): SearchDateDraftResult => {
  const text = value.trim();
  if (!text) return { date: undefined, error: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { date: undefined, error: 'invalid' };
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return { date: undefined, error: 'invalid' };
  return { date, error: null };
};

export const isSearchDateRangeValid = (from?: Date, to?: Date) => !from || !to || from.getTime() <= to.getTime();
