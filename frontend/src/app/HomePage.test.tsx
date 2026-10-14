import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import type { HealthResponse } from '../shared/api/client';
import { ar } from '../shared/i18n/ar';
import { AppProviders } from './providers';
import { routes } from './routes';

function stubHealth(status: number, body: HealthResponse) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })),
  );
}

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: ['/'] });
  render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders the Arabic title and shows server and database as connected', async () => {
  stubHealth(200, { status: 'ok', database: { reachable: true } });

  renderHome();

  expect(screen.getByRole('heading', { level: 1, name: ar.app.title })).toBeTruthy();
  expect(await screen.findAllByText(ar.health.connected)).toHaveLength(2);
});

it('shows the database as disconnected when health returns 503', async () => {
  stubHealth(503, { status: 'degraded', database: { reachable: false } });

  renderHome();

  expect(await screen.findByText(ar.health.connected)).toBeTruthy();
  expect(await screen.findByText(ar.health.disconnected)).toBeTruthy();
});
