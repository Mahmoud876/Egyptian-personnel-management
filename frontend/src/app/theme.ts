import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  direction: 'rtl',
  typography: {
    // Cairo is bundled from @fontsource/cairo (see main.tsx); the rest are offline system fallbacks.
    fontFamily: '"Cairo", Tahoma, Arial, sans-serif',
  },
});
