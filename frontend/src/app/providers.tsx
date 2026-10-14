import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { ApiError } from '../shared/api/client';
import { meQueryKey } from '../shared/auth/auth';
import { NotificationsProvider } from '../shared/ui/notifications';
import { theme } from './theme';

// Emotion cache whose stylis plugin flips physical styles (left <-> right) for RTL.
const rtlCache = createCache({ key: 'muirtl', stylisPlugins: [prefixer, rtlPlugin] });

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => onApiError(client, error) }),
    mutationCache: new MutationCache({ onError: (error) => onApiError(client, error) }),
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // Client errors (4xx) won't change on retry.
        retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 1,
      },
    },
  });
  return client;
}

/** Session expired or password change required: refresh "me" so the route guards redirect. */
function onApiError(client: QueryClient, error: unknown): void {
  if (!(error instanceof ApiError)) return;
  if (error.status === 401) client.setQueryData(meQueryKey, null);
  if (error.code === 'password_change_required') void client.invalidateQueries({ queryKey: meQueryKey });
}

type AppProvidersProps = {
  queryClient: QueryClient;
  children: ReactNode;
};

export function AppProviders({ queryClient, children }: AppProvidersProps) {
  return (
    <CacheProvider value={rtlCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <NotificationsProvider>{children}</NotificationsProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </CacheProvider>
  );
}
