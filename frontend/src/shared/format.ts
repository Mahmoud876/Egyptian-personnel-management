import { ar } from './i18n/ar';

// Arabic text with Latin digits, so dates line up with IDs and codes elsewhere in the tables.
const LOCALE = 'ar-EG-u-nu-latn';

const dateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/** Formats an ISO timestamp from the API (UTC) in the viewer's local time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ar.common.none;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? ar.common.none : dateTime.format(date);
}

/** Local calendar day "YYYY-MM-DD" -> ISO instant at local midnight (optionally the next day). */
export function localDayToIso(day: string, nextDay = false): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + (nextDay ? 1 : 0)).toISOString();
}
