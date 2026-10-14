import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { theme } from './theme';

// Emotion cache whose stylis plugin flips physical styles (left <-> right) for RTL.
const rtlCache = createCache({ key: 'muirtl', stylisPlugins: [prefixer, rtlPlugin] });

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false },
    },
  });
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
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ThemeProvider>
    </CacheProvider>
  );
}
