import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Schemas } from '../../shared/api/client';
import { ar } from '../../shared/i18n/ar';
import { makeMe, renderApp, stubFetch } from '../../test/render';
import { conscriptsKeys, mergeImportProgress } from './api';

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
    parsed_rows: 10,
    processed_rows: 10,
    valid_rows: 8,
    invalid_rows: 2,
    checkpoint_row: 10,
    retry_count: 0,
    progress_version: 3,
    validation_run: 0,
    last_error: null,
    created_at: '2026-10-14T08:45:00Z',
    approved_at: null,
    cancelled_at: null,
    ...overrides,
  };
}

const emptyPage = { items: [], total: 0, page: 1, page_size: 20 };

describe('live import snapshots', () => {
  it('retains parsed row progress on reconnect and ignores an older counter', () => {
    const job = importJob({ status: 'PARSING', parsed_rows: 250, total_rows: 250, processed_rows: 0, valid_rows: 0, invalid_rows: 0 });
    const updated = mergeImportProgress(job, { ...job, parsed_rows: 500, total_rows: 500, version: 4 });
    expect(updated.parsed_rows).toBe(500);
    expect(mergeImportProgress(updated, { ...job, version: 3 }).parsed_rows).toBe(500);
  });
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

    fireEvent.change(within(screen.getByRole('main')).getByLabelText(new RegExp(ar.conscripts.fields.policeNumber)), {
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

describe('label recruit lookup', () => {
  it.each([
    ['national_id', '30101150104521'],
    ['barcode', '202610000003'],
  ])('keeps %s lookup working', async (_kind, value) => {
    stubFetch(({ path }) => {
      if (path === '/api/v1/recruits') return { status: 200, body: { ...emptyPage, items: [recruit({ barcode: '202610000003' })], total: 1 } };
      if (path.startsWith('/api/v1/recruits/')) return { status: 200, body: recruit() };
    });
    const app = renderApp('/conscripts/labels', makeMe(OPERATOR));
    fireEvent.change(await screen.findByLabelText(ar.conscripts.lookup.placeholderEither), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: ar.conscripts.lookup.submit }));
    await waitFor(() => expect(app.router.state.location.pathname).toBe(`/conscripts/labels/${RECRUIT_ID}`));
    expect(requestedUrls().find((url) => url.pathname === '/api/v1/recruits')?.searchParams.get('search')).toBe(value);
  });

  it.each(['998781241123', '0012AB'])('looks up police number %s with its year, without guessing barcode', async (police) => {
    stubFetch(({ path }) => {
      if (path === '/api/v1/recruits') return { status: 200, body: { ...emptyPage, items: [recruit({ police_number: police })], total: 1 } };
      if (path === `/api/v1/recruits/${RECRUIT_ID}`) return { status: 200, body: recruit() };
    });
    const app = renderApp('/conscripts/labels', makeMe(OPERATOR));
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: ar.conscripts.search.searchBy }));
    fireEvent.click(screen.getByRole('option', { name: ar.conscripts.lookup.policeMode }));
    fireEvent.change(screen.getByLabelText(ar.conscripts.fields.policeNumber), { target: { value: police } });
    fireEvent.click(screen.getByRole('button', { name: ar.conscripts.lookup.submit }));
    expect(await screen.findByText(ar.conscripts.lookup.policeYearRequired)).toBeTruthy();
    expect(requestedUrls().some((url) => url.pathname === '/api/v1/recruits')).toBe(false);
    fireEvent.change(screen.getByLabelText(ar.conscripts.enlistmentYear), { target: { value: '2026' } });
    fireEvent.click(screen.getByRole('button', { name: ar.conscripts.lookup.submit }));
    await waitFor(() => expect(app.router.state.location.pathname).toBe(`/conscripts/labels/${RECRUIT_ID}`));
    const query = requestedUrls().find((url) => url.pathname === '/api/v1/recruits')!.searchParams;
    expect(query.get('police_number')).toBe(police);
    expect(query.get('enlistment_year')).toBe('2026');
    expect(query.has('barcode')).toBe(false);
  });

  it('keeps the form open and explains an unmatched police number/year', async () => {
    stubFetch(({ path }) => path === '/api/v1/recruits' ? { status: 200, body: emptyPage } : undefined);
    const app = renderApp('/conscripts/labels', makeMe(OPERATOR));
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: ar.conscripts.search.searchBy }));
    fireEvent.click(screen.getByRole('option', { name: ar.conscripts.lookup.policeMode }));
    fireEvent.change(screen.getByLabelText(ar.conscripts.fields.policeNumber), { target: { value: '998781241123' } });
    fireEvent.change(screen.getByLabelText(ar.conscripts.enlistmentYear), { target: { value: '2025' } });
    fireEvent.click(screen.getByRole('button', { name: ar.conscripts.lookup.submit }));
    expect(await screen.findByText(ar.conscripts.lookup.policeNotFound)).toBeTruthy();
    expect(app.router.state.location.pathname).toBe('/conscripts/labels');
  });
});

describe('partial recruit lookup', () => {
  it.each(['/conscripts/entry', '/conscripts/labels'])('shows all matches and opens only the selected person on %s', async (path) => {
    const second = recruit({ id: JOB_ID, name: 'مجند ثان', national_id: '30201150104521' });
    stubFetch(({ path: requestPath }) => {
      if (requestPath === '/api/v1/recruits') return { status: 200, body: { ...emptyPage, items: [recruit(), second], total: 2 } };
      if (requestPath === `/api/v1/recruits/${JOB_ID}`) return { status: 200, body: second };
      if (requestPath.startsWith('/api/v1/lookups/')) return { status: 200, body: [] };
      if (requestPath.endsWith('/documents')) return { status: 200, body: [] };
    });
    const app = renderApp(path, makeMe(OPERATOR));
    const label = path.endsWith('labels') ? ar.conscripts.lookup.placeholderEither : ar.conscripts.lookup.placeholder;
    fireEvent.change(await screen.findByLabelText(label), { target: { value: '4521' } });
    fireEvent.click(screen.getByRole('button', { name: ar.conscripts.lookup.submit }));
    expect(await screen.findByText(ar.conscripts.lookup.chooseMatch(2))).toBeTruthy();
    expect(app.router.state.location.pathname).toBe(path);
    expect(screen.getByText(second.national_id)).toBeTruthy();
    expect(screen.getByText(recruit().national_id)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: ar.conscripts.lookup.selectMatch(second.name, second.national_id) }));
    await waitFor(() => expect(app.router.state.location.pathname).toBe(`${path}/${JOB_ID}`));
  });

  it('paginates matches without silently selecting a single result on the last page', async () => {
    const items = Array.from({ length: 11 }, (_, index) => recruit({ id: `${RECRUIT_ID}-${index}`, name: `مجند ${index}` }));
    let calls = 0;
    stubFetch(({ path }) => {
      if (path === '/api/v1/recruits') {
        calls += 1;
        return { status: 200, body: { items: calls === 1 ? items.slice(0, 10) : items.slice(10), total: 11, page: calls, page_size: 10 } };
      }
    });
    const app = renderApp('/conscripts/labels', makeMe(OPERATOR));
    fireEvent.change(await screen.findByLabelText(ar.conscripts.lookup.placeholderEither), { target: { value: '4521' } });
    fireEvent.click(screen.getByRole('button', { name: ar.conscripts.lookup.submit }));
    await screen.findByText(ar.conscripts.lookup.chooseMatch(11));
    fireEvent.click(screen.getByText('2', { selector: 'button' }));
    expect(await screen.findByText('مجند 10')).toBeTruthy();
    expect(app.router.state.location.pathname).toBe('/conscripts/labels');
    expect(requestedUrls().filter((url) => url.pathname === '/api/v1/recruits').at(-1)?.searchParams.get('page')).toBe('2');
    fireEvent.change(screen.getByLabelText(ar.conscripts.lookup.placeholderEither), { target: { value: '9999' } });
    expect(screen.queryByText('مجند 10')).toBeNull();
  });
});

describe('import review', () => {
  it('shows discovered rows while parsing without presenting an estimated percentage', async () => {
    stubFetch(({ path }) => path === `/api/v1/imports/${JOB_ID}` ? { status: 200, body: importJob({
      status: 'PARSING', parsed_rows: 500, total_rows: 500, processed_rows: 0, valid_rows: 0, invalid_rows: 0,
    }) } : undefined);
    renderApp(`/conscripts/imports/${JOB_ID}`, makeMe(ADMIN));
    expect(await screen.findByText(ar.conscripts.report.discovered('500'))).toBeTruthy();
    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
    expect(screen.getByText(ar.conscripts.report.parsingHint)).toBeTruthy();
  });
  it('shows the failing field and original value, and submits only the administrator correction', async () => {
    let job = importJob();
    const record = { id: RECRUIT_ID, row_number: 4, validation_status: 'INVALID',
      raw_data: { name: 'أحمد محمد حسن علي', national_id: '30001010100010', ps_name: '' },
      corrected_data: null,
      errors: [{ field_name: 'ps_name', error_code: 'FIELD_REQUIRED', error_message: 'البيان مطلوب أو يتجاوز الطول المسموح' }] };
    const calls = stubFetch(({ method, path }) => {
      if (path === `/api/v1/imports/${JOB_ID}`) return { status: 200, body: job };
      if (path === `/api/v1/imports/${JOB_ID}/rows`) return { status: 200, body: { ...emptyPage, total: 1, items: [record] } };
      if (path === `/api/v1/imports/${JOB_ID}/rows/${RECRUIT_ID}` && method === 'PATCH') {
        job = importJob({ status: 'QUEUED', progress_version: 4, validation_run: 1 });
        return { status: 202, body: job };
      }
      return undefined;
    });
    const app = renderApp(`/conscripts/imports/${JOB_ID}`, makeMe(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: ar.conscripts.correction.view }));
    const dialog = within(await screen.findByRole('dialog'));
    const field = dialog.getByLabelText(ar.conscripts.correction.fields.ps_name!) as HTMLInputElement;
    expect(field.value).toBe('');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(field, { target: { value: 'قسم أول' } });
    fireEvent.click(dialog.getByRole('button', { name: ar.conscripts.correction.save }));
    await waitFor(() => expect(calls).toContainEqual({ method: 'PATCH',
      path: `/api/v1/imports/${JOB_ID}/rows/${RECRUIT_ID}`, body: { version: 3, changes: { ps_name: 'قسم أول' } } }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(ar.conscripts.correction.provisionalResults)).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText(record.raw_data.name)).toBeTruthy();
    // Keep the selected invalid tab even though the new validation counters reset to zero.
    expect(screen.getByRole('tab', { name: ar.conscripts.rows.invalidLabel }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: ar.conscripts.correction.view }));
    expect(within(await screen.findByRole('dialog')).queryByRole('button', { name: ar.conscripts.correction.save })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: ar.common.close }));
    job = importJob({ validation_run: 1, progress_version: 10 });
    await act(async () => { app.queryClient.setQueryData(conscriptsKeys.import(JOB_ID), job); });
    await waitFor(() => expect(screen.queryByText(ar.conscripts.correction.provisionalResults)).toBeNull());
    await waitFor(() => expect(screen.queryByRole('progressbar', { name: ar.conscripts.correction.refreshingRows })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: ar.conscripts.correction.view }));
    expect(within(await screen.findByRole('dialog')).getByRole('button', { name: ar.conscripts.correction.save })).toBeTruthy();
  });

  it.each(['QUEUED', 'PARSING', 'VALIDATING', 'FAILED'])('allows row inspection after refreshing during revalidation: %s', async (status) => {
    stubFetch(({ path }) => {
      if (path === `/api/v1/imports/${JOB_ID}`) return { status: 200, body: importJob({
        status, validation_run: 1, valid_rows: 0, invalid_rows: 0, processed_rows: 0,
      }) };
      if (path === `/api/v1/imports/${JOB_ID}/rows`) return { status: 200, body: { ...emptyPage, total: 1, items: [{
        id: RECRUIT_ID, row_number: 1, validation_status: 'INVALID', raw_data: { national_id: 'bad' }, errors: [],
      }] } };
      return undefined;
    });
    renderApp(`/conscripts/imports/${JOB_ID}`, makeMe(ADMIN));
    expect(await screen.findByText(ar.conscripts.correction.provisionalResults)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: ar.conscripts.correction.view }));
    const dialog = within(await screen.findByRole('dialog'));
    expect((dialog.getByLabelText(ar.conscripts.correction.fields.national_id!) as HTMLInputElement).readOnly).toBe(true);
    expect(dialog.queryByRole('button', { name: ar.conscripts.correction.save })).toBeNull();
    fireEvent.click(dialog.getByRole('button', { name: ar.common.close }));
    fireEvent.click(screen.getByRole('tab', { name: ar.conscripts.rows.validLabel }));
    await waitFor(() => expect(requestedUrls().some((url) => url.searchParams.get('status') === 'VALID')).toBe(true));
    expect(screen.queryByRole('button', { name: ar.conscripts.report.exportRejected })).toBeNull();
    expect(screen.queryByRole('button', { name: ar.conscripts.report.approve('0') })).toBeNull();
  });

  it('retains the table during a slow results refresh without allowing stale edits', async () => {
    let job = importJob({ status: 'VALIDATING', validation_run: 1 });
    let name = 'الاسم السابق';
    stubFetch(({ path }) => {
      if (path === `/api/v1/imports/${JOB_ID}`) return { status: 200, body: job };
      if (path.endsWith('/rows')) return { status: 200, body: { ...emptyPage, total: 1, items: [{
        id: RECRUIT_ID, row_number: 1, validation_status: 'INVALID', raw_data: { name }, errors: [],
      }] } };
      return undefined;
    });
    const app = renderApp(`/conscripts/imports/${JOB_ID}`, makeMe(ADMIN));
    await screen.findByText(name);
    const respond = globalThis.fetch;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: Request) => {
      if (new URL(input.url).pathname.endsWith('/rows')) await gate;
      return respond(input);
    }));
    job = importJob({ validation_run: 1, progress_version: 8 });
    await act(async () => { app.queryClient.setQueryData(conscriptsKeys.import(JOB_ID), job); });
    expect(within(screen.getByRole('table')).getByText(name)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: ar.conscripts.correction.view }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.queryByRole('button', { name: ar.conscripts.correction.save })).toBeNull();
    name = 'الاسم بعد التصحيح';
    await act(async () => { release(); });
    await waitFor(() => expect(within(screen.getByRole('table', { hidden: true })).getByText(name)).toBeTruthy());
    // An already-open detail snapshot must be reopened before it can be edited.
    expect(dialog.queryByRole('button', { name: ar.conscripts.correction.save })).toBeNull();
    fireEvent.click(dialog.getByRole('button', { name: ar.common.close }));
    fireEvent.click(screen.getByRole('button', { name: ar.conscripts.correction.view }));
    const fresh = within(await screen.findByRole('dialog'));
    expect((fresh.getByLabelText(ar.conscripts.correction.fields.name!) as HTMLInputElement).value).toBe(name);
    expect(fresh.getByRole('button', { name: ar.conscripts.correction.save })).toBeTruthy();
  });

  it.each(['APPROVED', 'CANCELLED'])('keeps source details read-only after %s', async (status) => {
    stubFetch(({ path }) => {
      if (path === `/api/v1/imports/${JOB_ID}`) return { status: 200, body: importJob({ status }) };
      if (path === `/api/v1/imports/${JOB_ID}/rows`) return { status: 200, body: { ...emptyPage, total: 1, items: [{
        id: RECRUIT_ID, row_number: 1, validation_status: 'INVALID', raw_data: { national_id: 'bad' }, errors: [],
      }] } };
      return undefined;
    });
    renderApp(`/conscripts/imports/${JOB_ID}`, makeMe(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: ar.conscripts.correction.view }));
    const dialog = within(await screen.findByRole('dialog'));
    expect((dialog.getByLabelText(ar.conscripts.correction.fields.national_id!) as HTMLInputElement).readOnly).toBe(true);
    expect(dialog.queryByRole('button', { name: ar.conscripts.correction.save })).toBeNull();
  });

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
