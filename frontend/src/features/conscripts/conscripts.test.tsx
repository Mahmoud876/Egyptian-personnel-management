import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Schemas } from '../../shared/api/client';
import { ar } from '../../shared/i18n/ar';
import { makeMe, renderApp, stubFetch } from '../../test/render';
import { mergeImportProgress } from './api';

const OPERATOR = ['conscripts.view', 'conscripts.enter', 'conscripts.label.print'];
const ADMIN = [...OPERATOR, 'conscripts.import.upload', 'conscripts.edit_locked'];

const RECRUIT_ID = '0b9a4a1e-7f0c-4a39-9a43-6a1f7f2b9c11';
const JOB_ID = '5f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

function recruit(overrides: Partial<Schemas['RecruitOut']> = {}): Schemas['RecruitOut'] {
  return {
    id: RECRUIT_ID,
    import_job_id: JOB_ID,
    source_record_id: '1001',
    name: 'محمود أحمد عبد الفتاح النجار',
    national_id: '30101150104521',
    birth_date: '2001-01-15',
    gov_id: '01',
    ps_id: '0101',
    ps_name: 'قسم أول مدينة نصر',
    type_id: 1,
    police_number: null,
    enlistment_year: 2026,
    batch_number: 1,
    enlistment_start_date: null,
    enlistment_end_date: null,
    is_locked: false,
    completed_at: null,
    barcode: null,
    revision: 1,
    suggested_start_date: '2026-01-01',
    suggested_end_date: '2027-03-01',
    ...overrides,
  };
}

function importJob(overrides: Partial<Schemas['ImportOut']> = {}): Schemas['ImportOut'] {
  return {
    id: JOB_ID,
    original_filename: 'BATCH_2026_01.accdb',
    batch_number: 1,
    enlistment_year: 2026,
    status: 'READY_FOR_REVIEW',
    total_rows: 10,
    processed_rows: 10,
    valid_rows: 8,
    invalid_rows: 2,
    checkpoint_row: 10,
    retry_count: 0,
    progress_version: 3,
    last_error: null,
    created_at: '2026-10-14T08:45:00Z',
    approved_at: null,
    cancelled_at: null,
    ...overrides,
  };
}

const emptyPage = { items: [], total: 0, page: 1, page_size: 20 };

describe('live import snapshots', () => {
  it('accepts newer progress and ignores delayed, cross-job and malformed events', () => {
    const job = importJob({ status: 'VALIDATING' });
    const snapshot = { ...job, version: 4, status: 'READY_FOR_REVIEW' };
    const updated = mergeImportProgress(job, snapshot);
    expect(updated.status).toBe('READY_FOR_REVIEW');
    expect(updated.progress_version).toBe(4);
    expect(mergeImportProgress(updated, { ...snapshot, version: 3, status: 'VALIDATING' })).toBe(updated);
    expect(mergeImportProgress(updated, { ...snapshot, version: 5, id: 'another-import' })).toBe(updated);
    expect(mergeImportProgress(updated, { status: 'APPROVED', version: 5 })).toBe(updated);
  });
});

/** URLs of every request the app made (stubFetch records paths only). */
function requestedUrls(): URL[] {
  return vi.mocked(globalThis.fetch).mock.calls.map(([input]) => new URL((input as Request).url));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('enlistment data entry', () => {
  it('preserves the suggested end when start changes and requires an explicit matching end before saving', async () => {
    const calls = stubFetch(({ method, path }) => {
      if (path === `/api/v1/recruits/${RECRUIT_ID}` && method === 'GET') return { status: 200, body: recruit() };
      if (path === `/api/v1/recruits/${RECRUIT_ID}/complete`)
        return {
          status: 200,
          body: recruit({
            police_number: '12345',
            enlistment_start_date: '2026-04-15',
            enlistment_end_date: '2027-06-15',
            is_locked: true,
            barcode: '202601000001',
            revision: 2,
          }),
        };
      if (path.endsWith('/documents')) return { status: 200, body: [] };
      if (path.startsWith('/api/v1/lookups/')) return { status: 200, body: [] };
      return undefined;
    });
    renderApp(`/conscripts/entry/${RECRUIT_ID}`, makeMe(OPERATOR));

    // Suggested start (batch 1) + 14 months for a higher qualification.
    const end = await screen.findByLabelText(new RegExp(ar.conscripts.fields.endDate)) as HTMLInputElement;
    expect(end.value).toBe('2027-03-01');

    fireEvent.change(screen.getByLabelText(new RegExp(ar.conscripts.fields.startDate)), {
      target: { value: '2026-04-15' },
    });
    expect(end.value).toBe('2027-03-01');

    fireEvent.change(screen.getByLabelText(new RegExp(ar.conscripts.fields.policeNumber)), {
      target: { value: ' 12345 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: ar.conscripts.entry.save }));
    await waitFor(() => expect(end.getAttribute('aria-invalid')).toBe('true'));
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    fireEvent.change(end, { target: { value: '2027-06-15' } });
    fireEvent.click(screen.getByRole('button', { name: ar.conscripts.entry.save }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'POST',
        path: `/api/v1/recruits/${RECRUIT_ID}/complete`,
        body: {
          police_number: '12345',
          enlistment_start_date: '2026-04-15',
          enlistment_end_date: '2027-06-15',
          revision: 1,
        },
      }),
    );
  });

  it('shows a locked record read-only to an operator', async () => {
    stubFetch(({ path }) => {
      if (path === `/api/v1/recruits/${RECRUIT_ID}`)
        return {
          status: 200,
          body: recruit({
            police_number: '84920',
            enlistment_start_date: '2026-01-01',
            enlistment_end_date: '2027-03-01',
            is_locked: true,
            barcode: '202601000001',
            revision: 2,
          }),
        };
      if (path.endsWith('/documents')) return { status: 200, body: [] };
      if (path.startsWith('/api/v1/lookups/')) return { status: 200, body: [] };
      return undefined;
    });
    renderApp(`/conscripts/entry/${RECRUIT_ID}`, makeMe(OPERATOR));

    expect(await screen.findByText(ar.conscripts.entry.lockedNotice)).toBeTruthy();
    expect(screen.queryByRole('button', { name: ar.conscripts.entry.save })).toBeNull();
    // The sidebar has a link with the same text; the record's own print button is in the main area.
    expect(within(screen.getByRole('main')).getByRole('link', { name: ar.conscripts.labels.print })).toBeTruthy();
  });
});

describe('import review', () => {
  it('asks for confirmation before cancelling an import', async () => {
    const calls = stubFetch(({ method, path }) => {
      if (path === `/api/v1/imports/${JOB_ID}` && method === 'GET') return { status: 200, body: importJob() };
      if (path === `/api/v1/imports/${JOB_ID}/rows`) return { status: 200, body: emptyPage };
      if (path === `/api/v1/imports/${JOB_ID}/cancel`)
        return { status: 200, body: importJob({ status: 'CANCELLED', cancelled_at: '2026-10-14T09:00:00Z' }) };
      return undefined;
    });
    renderApp(`/conscripts/imports/${JOB_ID}`, makeMe(ADMIN));

    fireEvent.click(await screen.findByRole('button', { name: ar.conscripts.report.cancel }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(ar.conscripts.report.cancelConfirmTitle)).toBeTruthy();
    expect(calls.some((c) => c.path.endsWith('/cancel'))).toBe(false);

    fireEvent.click(within(dialog).getByRole('button', { name: ar.conscripts.report.cancelConfirm }));
    await waitFor(() =>
      expect(calls).toContainEqual({ method: 'POST', path: `/api/v1/imports/${JOB_ID}/cancel`, body: undefined }),
    );
  });

  it('is not available to operators', async () => {
    stubFetch();
    renderApp(`/conscripts/imports/${JOB_ID}`, makeMe(OPERATOR));

    expect(await screen.findByText(ar.errors.forbiddenTitle)).toBeTruthy();
  });
});

describe('upload', () => {
  it('requires a file before uploading', async () => {
    const calls = stubFetch(({ path }) => (path === '/api/v1/imports' ? { status: 200, body: emptyPage } : undefined));
    renderApp('/conscripts/imports', makeMe(ADMIN));

    fireEvent.click(await screen.findByRole('button', { name: ar.conscripts.upload.submit }));

    expect(await screen.findByText(ar.conscripts.upload.fileRequired)).toBeTruthy();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });
});

describe('search', () => {
  it('searches from the top bar', async () => {
    stubFetch(({ path }) => {
      if (path === '/api/v1/recruits') return { status: 200, body: { ...emptyPage, items: [recruit()], total: 1 } };
      if (path.startsWith('/api/v1/lookups/')) return { status: 200, body: [] };
      return undefined;
    });
    renderApp('/conscripts/search', makeMe(OPERATOR));

    const box = await screen.findByRole('textbox', { name: ar.layout.searchPlaceholder });
    fireEvent.change(box, { target: { value: '30101150104521' } });
    fireEvent.submit(box.closest('form') as HTMLFormElement);

    await waitFor(() =>
      expect(requestedUrls().some((url) => url.searchParams.get('search') === '30101150104521')).toBe(true),
    );
    expect(await screen.findByText('محمود أحمد عبد الفتاح النجار')).toBeTruthy();
  });
});
