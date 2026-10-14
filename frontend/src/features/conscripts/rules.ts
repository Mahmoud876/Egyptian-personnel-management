import { ar } from '../../shared/i18n/ar';
import type { Tone } from '../../shared/ui/tokens';

/**
 * Enlistment duration in months by qualification ID. These IDs are fixed contract identifiers; the backend
 * (app/recruits/validation.py SERVICE_MONTHS) and a SQL trigger enforce the same table.
 */
export const SERVICE_MONTHS: Readonly<Record<number, number>> = { 1: 14, 3: 20, 2: 26, 4: 38 };

export const BATCHES = [1, 2, 3, 4] as const;

export const NATIONAL_ID_PATTERN = /^[0-9]{14}$/;
export const BARCODE_PATTERN = /^[0-9]{12}$/;

const pad = (value: number) => String(value).padStart(2, '0');

/** Batch 1/2/3/4 starts on 1 January/April/July/October of the year ("YYYY-MM-DD"). */
export function batchStartDate(year: number, batch: number): string {
  return `${year}-${pad((batch - 1) * 3 + 1)}-01`;
}

/**
 * "YYYY-MM-DD" plus whole months, clamping to the last day of a shorter month (31 Jan + 1 month = 28/29 Feb).
 * Same arithmetic as the backend's add_months, so the computed end date is the one it accepts.
 */
export function addMonths(day: string, months: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const parsed = new Date(`${day}T00:00:00Z`);
  if (year < 1 || !Number.isInteger(months) || Number.isNaN(parsed.getTime()) ||
      parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== date) return null;
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  if (targetYear < 1 || targetYear > 9999) return null;
  const targetMonth = (total % 12) + 1;
  const target = new Date(0);
  target.setUTCFullYear(targetYear, targetMonth, 0);
  const lastDay = target.getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${pad(targetMonth)}-${pad(Math.min(date, lastDay))}`;
}

/** End of service for a start date and qualification, or null if either is unknown. */
export function enlistmentEnd(start: string, typeId: number): string | null {
  const months = SERVICE_MONTHS[typeId];
  return months === undefined ? null : addMonths(start, months);
}

export function batchLabel(batch: number): string {
  return ar.conscripts.batchNames[batch - 1] ?? String(batch);
}

const IMPORT_TONES: Record<string, Tone> = {
  QUEUED: 'neutral',
  PARSING: 'info',
  VALIDATING: 'info',
  READY_FOR_REVIEW: 'warning',
  APPROVED: 'success',
  CANCELLED: 'neutral',
  FAILED: 'error',
};

export function importStatus(status: string): { label: string; tone: Tone } {
  return { label: ar.conscripts.importStatus[status] ?? status, tone: IMPORT_TONES[status] ?? 'neutral' };
}
