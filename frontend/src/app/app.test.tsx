import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ar } from '../shared/i18n/ar';
import { makeMe, renderApp, stubFetch } from '../test/render';
import { visibleMenu } from './menu';

const DATA_ENTRY = ['conscripts.view', 'conscripts.enter', 'conscripts.label.print'];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('menu', () => {
  it('shows a data-entry user only home and the three conscripts items', () => {
    const labels = visibleMenu(DATA_ENTRY).flatMap((group) => group.items.map((item) => item.label));
    expect(labels).toEqual([
      ar.menu.home,
      ar.menu.conscriptsSearch,
      ar.menu.conscriptsEntry,
      ar.menu.conscriptsLabels,
    ]);
  });

  it('drops groups with no visible items', () => {
    const groups = visibleMenu(['audit.view']).map((group) => group.label);
    expect(groups).toEqual([undefined, ar.menu.groups.admin]);
  });

  it('renders the filtered sidebar in the layout', async () => {
    stubFetch(({ path }) => (path === '/api/v1/health' ? { status: 200, body: { status: 'ok', database: { reachable: true } } } : undefined));
    renderApp('/', makeMe(DATA_ENTRY));

    const nav = await screen.findByRole('navigation', { name: ar.app.title });
    expect(within(nav).getByText(ar.menu.conscriptsEntry)).toBeTruthy();
    expect(within(nav).queryByText(ar.menu.users)).toBeNull();
    expect(within(nav).queryByText(ar.menu.conscriptsUpload)).toBeNull();
  });
});

describe('route guards', () => {
  it('sends signed-out users to the login page', async () => {
    stubFetch();
    renderApp('/admin/users', null);

    expect(await screen.findByRole('button', { name: ar.auth.login })).toBeTruthy();
  });

  it('shows 403 for a forbidden screen and reports the attempt to the backend', async () => {
    const calls = stubFetch();
    renderApp('/admin/users', makeMe(DATA_ENTRY));

    expect(await screen.findByText(ar.errors.forbiddenTitle)).toBeTruthy();
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'POST',
        path: '/api/v1/auth/permission-check',
        body: { permission: 'users.view', path: '/admin/users' },
      }),
    );
  });

  it('sends users with a temporary password to change it', async () => {
    stubFetch();
    renderApp('/admin/users', makeMe(['users.view'], { must_change_password: true }));

    expect(await screen.findByText(ar.auth.mustChangePassword)).toBeTruthy();
  });

  it('shows the 404 page for unknown paths', async () => {
    stubFetch();
    renderApp('/no/such/page', makeMe([]));

    expect(await screen.findByText(ar.errors.notFoundTitle)).toBeTruthy();
  });
});

describe('login', () => {
  it('validates required fields before calling the API', async () => {
    const calls = stubFetch();
    renderApp('/login', null);

    fireEvent.click(await screen.findByRole('button', { name: ar.auth.login }));

    expect(await screen.findAllByText(ar.validation.required)).toHaveLength(2);
    expect(calls.filter((c) => c.path === '/api/v1/auth/login')).toHaveLength(0);
  });

  it('shows the Arabic error from the backend', async () => {
    stubFetch(({ path }) =>
      path === '/api/v1/auth/login'
        ? { status: 401, body: { detail: 'اسم المستخدم أو كلمة المرور غير صحيحة', code: 'invalid_credentials' } }
        : undefined,
    );
    renderApp('/login', null);

    fireEvent.change(await screen.findByLabelText(ar.auth.username), { target: { value: 'someone' } });
    fireEvent.change(screen.getByLabelText(ar.auth.password), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: ar.auth.login }));

    expect(await screen.findByText('اسم المستخدم أو كلمة المرور غير صحيحة')).toBeTruthy();
  });
});

describe('home', () => {
  it('shows the database as disconnected when health returns 503', async () => {
    stubFetch(({ path }) =>
      path === '/api/v1/health' ? { status: 503, body: { status: 'degraded', database: { reachable: false } } } : undefined,
    );
    renderApp('/', makeMe([]));

    expect(await screen.findByText(ar.health.connected)).toBeTruthy();
    expect(await screen.findByText(ar.health.disconnected)).toBeTruthy();
  });
});
