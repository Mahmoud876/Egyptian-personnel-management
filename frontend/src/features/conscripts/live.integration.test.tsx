/// <reference types="node" />
/** Launched by backend/tests/test_frontend_live.py against its isolated test database and worker. */
import { File as NodeFile } from 'node:buffer';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Me } from '../../shared/api/client';
import { formatNumber } from '../../shared/format';
import { ar } from '../../shared/i18n/ar';
import { renderApp } from '../../test/render';

const origin = process.env.PERSONNEL_INTEGRATION_URL;
const nativeFetch = globalThis.fetch;
const clients: ReturnType<typeof renderApp>[] = [];

afterEach(() => {
  cleanup();
  clients.forEach(({ queryClient, router }) => { queryClient.clear(); router.dispose(); });
  clients.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.skipIf(!origin)('uploads, reviews, exports, approves, completes, searches and retrieves a label through the real API', async () => {
  let cookie = '';
  // jsdom lacks canvas text metrics. Keep JsBarcode's real SVG encoding; only emulate font measurement.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '', measureText: (value: string) => ({ width: value.length * 7 }),
  } as unknown as CanvasRenderingContext2D);
  // jsdom has no browser cookie jar. Keep the real server-issued session cookie for same-origin requests.
  vi.stubGlobal('fetch', async (input: Request | string, init?: RequestInit) => {
    const source = input instanceof Request ? input : new Request(new URL(input, origin), init);
    const path = new URL(source.url);
    const headers = new Headers(source.headers);
    if (cookie) headers.set('Cookie', cookie);
    const response = await nativeFetch(new URL(path.pathname + path.search, origin), {
      method: source.method, headers, signal: source.signal,
      body: ['GET', 'HEAD'].includes(source.method) ? null : await source.arrayBuffer(),
    });
    const session = response.headers.get('set-cookie');
    if (session) cookie = session.split(';')[0] ?? '';
    return response;
  });
  // Use Node's multipart implementation with its native Request/fetch in this DOM test.
  const form = await new Response('', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).formData();
  vi.stubGlobal('FormData', form.constructor);
  const request = (path: string, init?: RequestInit) => fetch(path, init);
  const login = async (username: string): Promise<Me> => {
    const response = await request('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: process.env.PERSONNEL_TEST_PASSWORD }) });
    expect(response.status).toBe(200);
    return response.json() as Promise<Me>;
  };
  const admin = await login(process.env.PERSONNEL_TEST_ADMIN!);
  const ui = renderApp('/conscripts/imports', admin);
  clients.push(ui);
  const serial = String((Math.floor(Math.random() * 5000) * 2) + 1).padStart(4, '0');
  const nationalId = `300010121${serial}0`;
  const csv = 'id,name,national_id,birth_date,gov_name,gov_id,ps_name,ps_id,type_id,type_name\n' +
    `1,أحمد محمد حسن علي,${nationalId},2000-01-01,الجيزة,21,قسم تجريبي,2101,1,عالي\n` +
    '2,سجل غير صالح,bad,2000-01-01,الجيزة,21,قسم تجريبي,2101,1,عالي\n';
  fireEvent.change(await screen.findByLabelText(ar.conscripts.upload.browse), {
    target: { files: [new NodeFile([csv], 'integration.csv', { type: 'text/csv' })] },
  });
  fireEvent.change(screen.getByLabelText(new RegExp(ar.conscripts.enlistmentYear)), { target: { value: '2026' } });
  fireEvent.click(screen.getByRole('button', { name: ar.conscripts.upload.submit }));
  await screen.findByRole('button', { name: ar.conscripts.report.approve(formatNumber(1)) }, { timeout: 45_000 });
  const jobId = ui.router.state.location.pathname.split('/').at(-1)!;
  const report = await (await request(`/api/v1/imports/${jobId}/report`)).json();
  expect(report.summary.valid_rows).toBe(1);
  expect(report.summary.invalid_rows).toBe(1);
  expect((await request(`/api/v1/imports/${jobId}/events`)).status).toBe(200);
  fireEvent.click(screen.getByRole('button', { name: ar.conscripts.report.exportRejected }));
  fireEvent.click(await screen.findByRole('menuitem', { name: ar.conscripts.report.exportXlsx }));
  const download = await screen.findByRole('link', { name: ar.conscripts.report.downloadExport }, { timeout: 30_000 });
  const workbook = await request(download.getAttribute('href')!);
  expect(workbook.status).toBe(200);
  expect(new Uint8Array(await workbook.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([80, 75]));
  fireEvent.click(await screen.findByRole('button', { name: ar.conscripts.correction.view }));
  const correction = within(await screen.findByRole('dialog'));
  expect((correction.getByLabelText(ar.conscripts.correction.fields.national_id!) as HTMLInputElement).value).toBe('bad');
  const correctedId = `300010121${String((Number(serial) + 2) % 10000).padStart(4, '0')}0`;
  fireEvent.change(correction.getByLabelText(ar.conscripts.correction.fields.national_id!), { target: { value: correctedId } });
  fireEvent.click(correction.getByRole('button', { name: ar.conscripts.correction.save }));
  const approve = await screen.findByRole('button', { name: ar.conscripts.report.approve(formatNumber(2)) }, { timeout: 45_000 });
  const correctedReport = await (await request(`/api/v1/imports/${jobId}/report`)).json();
  expect(correctedReport.summary.invalid_rows).toBe(0);
  const correctedRow = correctedReport.valid.items.find((item: { corrected_data: unknown }) => item.corrected_data);
  expect(correctedRow.raw_data.national_id).toBe('bad');
  expect(correctedRow.corrected_data.national_id).toBe(correctedId);
  fireEvent.click(approve);
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: ar.conscripts.report.approveConfirm }));
  await screen.findByText(ar.conscripts.report.approvedTitle);
  cleanup(); ui.queryClient.clear(); ui.router.dispose();
  await request('/api/v1/auth/logout', { method: 'POST' });

  const operator = await login(process.env.PERSONNEL_TEST_OPERATOR!);
  const entry = renderApp('/conscripts/entry', operator);
  clients.push(entry);
  fireEvent.change(await screen.findByLabelText(ar.conscripts.lookup.placeholder), { target: { value: nationalId } });
  fireEvent.click(screen.getByRole('button', { name: ar.conscripts.lookup.submit }));
  const end = await screen.findByLabelText(new RegExp(ar.conscripts.fields.endDate)) as HTMLInputElement;
  expect(end.value).toBe('2027-03-01');
  expect(await screen.findByText('الجيزة')).toBeTruthy();
  fireEvent.change(screen.getByLabelText(new RegExp(ar.conscripts.fields.startDate)), { target: { value: '2026-04-15' } });
  expect(end.value).toBe('2027-03-01');
  const police = `UI${Date.now()}`;
  fireEvent.change(screen.getByLabelText(new RegExp(ar.conscripts.fields.policeNumber)), { target: { value: police } });
  fireEvent.change(end, { target: { value: '2027-06-15' } });
  fireEvent.click(screen.getByRole('button', { name: ar.conscripts.entry.save }));
  await screen.findByText(ar.conscripts.entry.lockedNotice);
  const profile = await (await request(`/api/v1/recruits/by-national-id/${nationalId}`)).json();
  expect(profile.is_locked).toBe(true);
  expect(profile.enlistment_end_date).toBe('2027-06-15');
  expect(profile.barcode).toMatch(/^\d{12}$/);
  expect((await request('/api/v1/imports')).status).toBe(403);
  await entry.router.navigate(`/conscripts/search?mode=barcode&q=${profile.barcode}`);
  await waitFor(() => expect(within(screen.getByRole('table')).getByText(nationalId)).toBeTruthy());
  await entry.router.navigate(`/conscripts/labels/${profile.id}`);
  await screen.findByRole('button', { name: ar.conscripts.labels.printNow });
  const label = await request(`/api/v1/recruits/${profile.id}/barcode`);
  expect(label.status).toBe(200);
  const html = await label.text();
  expect(html).toContain('<svg');
  expect(html).toContain(police);
  expect(html).toContain('أحمد محمد حسن علي');
  cleanup(); entry.queryClient.clear(); entry.router.dispose();
  await request('/api/v1/auth/logout', { method: 'POST' });
  await login(process.env.PERSONNEL_TEST_ADMIN!);
  const audit = await (await request(`/api/v1/audit?q=${nationalId}`)).json();
  expect(audit.total).toBeGreaterThan(0);
}, 110_000);
