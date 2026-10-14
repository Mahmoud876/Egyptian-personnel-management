import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AppProviders } from '../app/providers';
import { routes } from '../app/routes';
import type { Me } from '../shared/api/client';
import { meQueryKey } from '../shared/auth/auth';

export type FetchCall = { method: string; path: string; body: unknown };
type Handler = (call: FetchCall) => { status: number; body?: unknown } | undefined;

export function makeMe(permissions: string[], overrides: Partial<Me> = {}): Me {
  return {
    role: 'data_entry_operator',
    id: 7,
    username: 'tester',
    full_name: 'مستخدم تجريبي',
    work_entity_id: null,
    must_change_password: false,
    permissions,
    ...overrides,
  };
}

/** Stubs fetch: `handler` answers known calls, anything else gets 204. Returns the recorded calls. */
export function stubFetch(handler: Handler = () => undefined): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const url = new URL(input.url);
      const text = await input.text();
      const call = { method: input.method, path: url.pathname, body: text ? JSON.parse(text) : undefined };
      calls.push(call);
      const answer = handler(call) ?? { status: 204 };
      return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

/** Renders the real app routes at `path`, with "me" already known (null = signed out). */
export function renderApp(path: string, me: Me | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(meQueryKey, me);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, queryClient };
}
