import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ar } from '../../../shared/i18n/ar';
import { makeMe, renderApp, stubFetch } from '../../../test/render';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup() {
  stubFetch(({ path }) => {
    if (path.endsWith('/audit/facets')) return { status: 200, body: { users: [], actions: [], entities: [] } };
    if (path.endsWith('/audit')) return { status: 200, body: { items: [], total: 0, page: 1, page_size: 25 } };
    return undefined;
  });
  return renderApp('/admin/audit', makeMe(['audit.view']));
}

function auditRequests() {
  return vi.mocked(fetch).mock.calls.map(([request]) => new URL((request as Request).url))
    .filter((url) => url.pathname === '/api/v1/audit');
}

it('submits exact local times as UTC with an exclusive end and clears the filters', async () => {
  setup();
  const from = await screen.findByLabelText(ar.audit.dateFrom) as HTMLInputElement;
  const to = screen.getByLabelText(ar.audit.dateTo) as HTMLInputElement;
  expect(from.type).toBe('datetime-local');
  expect(to.type).toBe('datetime-local');
  fireEvent.change(from, { target: { value: '2026-10-15T09:30:15' } });
  fireEvent.change(to, { target: { value: '2026-10-15T11:45:30' } });
  await waitFor(() => {
    const last = auditRequests().at(-1)!;
    expect(last.searchParams.get('date_from')).toBe(new Date(2026, 9, 15, 9, 30, 15).toISOString());
    expect(last.searchParams.get('date_to')).toBe(new Date(2026, 9, 15, 11, 45, 30).toISOString());
  });
  fireEvent.change(screen.getByLabelText(ar.audit.textSearch), { target: { value: 'اعتماد' } });
  await waitFor(() => expect(auditRequests().at(-1)?.searchParams.get('q')).toBe('اعتماد'));
  fireEvent.click(screen.getByRole('button', { name: ar.common.clearFilters }));
  await waitFor(() => {
    const last = auditRequests().at(-1)!;
    expect(last.searchParams.has('q')).toBe(false);
    expect(last.searchParams.has('date_from')).toBe(false);
    expect(last.searchParams.has('date_to')).toBe(false);
  });
});

it('does not fetch or show stale results for an inverted time range', async () => {
  setup();
  const from = await screen.findByLabelText(ar.audit.dateFrom);
  const to = screen.getByLabelText(ar.audit.dateTo);
  await screen.findByRole('table');
  fireEvent.change(from, { target: { value: '2026-10-15T12:00' } });
  fireEvent.change(to, { target: { value: '2026-10-15T09:00' } });
  expect(await screen.findByText(ar.audit.invalidRange)).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
  expect((screen.getByRole('button', { name: ar.home.refresh }) as HTMLButtonElement).disabled).toBe(true);
  expect(auditRequests().some((url) => url.searchParams.has('date_to'))).toBe(false);
  fireEvent.change(to, { target: { value: '2026-10-15T13:00' } });
  await waitFor(() => expect(auditRequests().at(-1)?.searchParams.get('date_to'))
    .toBe(new Date(2026, 9, 15, 13).toISOString()));
  expect(screen.queryByText(ar.audit.invalidRange)).toBeNull();
});
