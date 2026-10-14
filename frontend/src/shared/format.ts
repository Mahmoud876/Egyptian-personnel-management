import { ar } from './i18n/ar';

// Arabic text with Latin digits, so dates line up with IDs and codes elsewhere in the tables.
const LOCALE = 'ar-EG-u-nu-latn';

const dateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const longDate = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
const numbers = new Intl.NumberFormat('en-US');

const pad = (value: number) => String(value).padStart(2, '0');

/** Formats an ISO timestamp from the API (UTC) in the viewer's local time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ar.common.none;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? ar.common.none : dateTime.format(date);
}

/** ISO timestamp -> "DD/MM/YYYY HH:mm" in local time, for monospaced table columns. */
export function formatDateTimeNumeric(iso: string | null | undefined): string {
  if (!iso) return ar.common.none;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return ar.common.none;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Calendar date "YYYY-MM-DD" from the API -> "DD/MM/YYYY". No time zone conversion. */
export function formatDate(day: string | null | undefined): string {
  const match = day ? /^(\d{4})-(\d{2})-(\d{2})/.exec(day) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ar.common.none;
}

/** Today as "14 أكتوبر 2026". */
export function formatLongDate(date: Date): string {
  return longDate.format(date);
}

/** 1240 -> "1,240". */
export function formatNumber(value: number): string {
  return numbers.format(value);
}

/** Bytes -> "18.4 MB" style size. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Local calendar day "YYYY-MM-DD" -> ISO instant at local midnight (optionally the next day). */
export function localDayToIso(day: string, nextDay = false): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + (nextDay ? 1 : 0)).toISOString();
}
