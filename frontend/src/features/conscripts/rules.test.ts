import { describe, expect, it } from 'vitest';
import { addMonths, batchStartDate, enlistmentEnd } from './rules';

describe('enlistment date rules (same arithmetic as the backend)', () => {
  it('starts each batch on the first day of its quarter', () => {
    expect(batchStartDate(2026, 1)).toBe('2026-01-01');
    expect(batchStartDate(2026, 3)).toBe('2026-07-01');
    expect(batchStartDate(2026, 4)).toBe('2026-10-01');
  });

  it('adds months across year ends', () => {
    expect(addMonths('2026-01-01', 14)).toBe('2027-03-01');
    expect(addMonths('2026-10-01', 38)).toBe('2029-12-01');
  });

  it('clamps to the last day of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('uses the qualification duration for the end date', () => {
    expect(enlistmentEnd('2026-01-01', 1)).toBe('2027-03-01');
    expect(enlistmentEnd('2026-01-01', 3)).toBe('2027-09-01');
    expect(enlistmentEnd('2026-01-01', 2)).toBe('2028-03-01');
    expect(enlistmentEnd('2026-01-01', 4)).toBe('2029-03-01');
  });

  it('returns null for unknown qualifications or malformed dates', () => {
    expect(enlistmentEnd('2026-01-01', 9)).toBeNull();
    expect(addMonths('01/01/2026', 1)).toBeNull();
    expect(addMonths('2026-02-30', 1)).toBeNull();
    expect(addMonths('2026-13-01', 1)).toBeNull();
    expect(addMonths('9999-12-31', 14)).toBeNull();
  });
});
