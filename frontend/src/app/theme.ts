import { arEG } from '@mui/material/locale';
import { createTheme } from '@mui/material/styles';

export const theme = createTheme(
  {
    direction: 'rtl',
    palette: {
      primary: { main: '#1b4f72' },
      secondary: { main: '#117864' },
      background: { default: '#f4f6f9', paper: '#ffffff' },
    },
    shape: { borderRadius: 8 },
    typography: {
      // Cairo is bundled from @fontsource/cairo (see main.tsx); the rest are offline system fallbacks.
      fontFamily: '"Cairo", Tahoma, Arial, sans-serif',
      button: { fontWeight: 600 },
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiSelect: { defaultProps: { size: 'small' } },
      MuiTableCell: { styleOverrides: { head: { fontWeight: 700, whiteSpace: 'nowrap' } } },
    },
  },
  // Arabic texts for MUI's own components (pagination labels and the like).
  arEG,
);
