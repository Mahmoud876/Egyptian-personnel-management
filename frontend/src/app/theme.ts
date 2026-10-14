import { arEG } from '@mui/material/locale';
import { createTheme } from '@mui/material/styles';
import { MONO_FONT, tokens, tones } from '../shared/ui/tokens';

const POPOVER_SHADOW = '0 2px 4px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(20, 28, 40, 0.08)';

declare module '@mui/material/styles' {
  interface Palette {
    surface: { main: string; lowest: string; low: string; container: string; high: string; highest: string };
    outline: { main: string; variant: string };
  }
  interface PaletteOptions {
    surface?: Palette['surface'];
    outline?: Palette['outline'];
  }
}

const noSpacing = { letterSpacing: 0 };

export const theme = createTheme(
  {
    direction: 'rtl',
    palette: {
      primary: { main: tokens.primary, light: tokens.primaryHover, dark: tokens.primaryDeep, contrastText: '#ffffff' },
      secondary: { main: tokens.secondary, contrastText: '#ffffff' },
      error: { main: tones.error.fg, light: tones.error.bg, dark: '#93000a', contrastText: '#ffffff' },
      warning: { main: tones.warning.fg, light: tones.warning.bg, dark: '#7a2e0e', contrastText: '#ffffff' },
      success: { main: tones.success.fg, light: tones.success.bg, dark: '#14532d', contrastText: '#ffffff' },
      info: { main: tones.info.fg, light: tones.info.bg, dark: '#1849a9', contrastText: '#ffffff' },
      background: { default: tokens.surface, paper: tokens.surfaceLowest },
      text: { primary: tokens.onSurface, secondary: tokens.secondary, disabled: tokens.outline },
      divider: tokens.surfaceHighest,
      action: { hover: tokens.surfaceLow, selected: tokens.surfaceLow },
      surface: {
        main: tokens.surface,
        lowest: tokens.surfaceLowest,
        low: tokens.surfaceLow,
        container: tokens.surfaceContainer,
        high: tokens.surfaceHigh,
        highest: tokens.surfaceHighest,
      },
      outline: { main: tokens.outline, variant: tokens.outlineVariant },
    },
    shape: { borderRadius: 8 },
    typography: {
      // Cairo is bundled from @fontsource/cairo (see main.tsx); the rest are offline system fallbacks.
      fontFamily: '"Cairo", Tahoma, Arial, sans-serif',
      fontSize: 14,
      // Letter spacing stays 0 everywhere: tracking breaks the joins of cursive Arabic.
      h1: { fontSize: 28, lineHeight: '40px', fontWeight: 600, ...noSpacing },
      h2: { fontSize: 24, lineHeight: '36px', fontWeight: 600, ...noSpacing },
      h3: { fontSize: 22, lineHeight: '32px', fontWeight: 600, ...noSpacing },
      h4: { fontSize: 22, lineHeight: '32px', fontWeight: 600, ...noSpacing },
      // headline-lg: page titles.
      h5: { fontSize: 20, lineHeight: '32px', fontWeight: 600, ...noSpacing },
      // headline-md: section titles.
      h6: { fontSize: 18, lineHeight: '28px', fontWeight: 600, ...noSpacing },
      // headline-sm: card and dialog titles.
      subtitle1: { fontSize: 16, lineHeight: '24px', fontWeight: 600, ...noSpacing },
      // label-md: field labels and column headers.
      subtitle2: { fontSize: 13, lineHeight: '18px', fontWeight: 500, ...noSpacing },
      // body-md, and body-table for dense tables.
      body1: { fontSize: 14, lineHeight: '22px', ...noSpacing },
      body2: { fontSize: 13, lineHeight: '20px', ...noSpacing },
      // label-sm.
      caption: { fontSize: 12, lineHeight: '16px', fontWeight: 500, ...noSpacing },
      overline: { fontSize: 12, lineHeight: '16px', fontWeight: 500, textTransform: 'none', ...noSpacing },
      button: { fontSize: 14, lineHeight: '20px', fontWeight: 600, textTransform: 'none', ...noSpacing },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: tokens.surface },
          '::selection': { backgroundColor: tokens.primary, color: '#ffffff' },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          outlined: { borderColor: tokens.surfaceHighest },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 8,
            minHeight: 36,
            paddingBlock: 6,
            paddingInline: 16,
            whiteSpace: 'nowrap',
            '&.Mui-focusVisible': { outline: `2px solid ${tokens.primary}`, outlineOffset: 2 },
            variants: [
              { props: { size: 'small' }, style: { minHeight: 32, paddingInline: 12, fontSize: 13 } },
              { props: { size: 'large' }, style: { minHeight: 44, fontSize: 16 } },
              {
                props: { variant: 'contained', color: 'primary' },
                style: { '&:hover': { backgroundColor: tokens.primaryHover } },
              },
              {
                props: { variant: 'outlined' },
                style: {
                  backgroundColor: tokens.surfaceLowest,
                  borderColor: tokens.outlineVariant,
                  color: tokens.onSurface,
                  '&:hover': { backgroundColor: tokens.surface, borderColor: tokens.outlineVariant },
                },
              },
              {
                props: { variant: 'outlined', color: 'error' },
                style: {
                  backgroundColor: tones.error.bg,
                  borderColor: tones.error.fg,
                  color: tones.error.fg,
                  '&:hover': { backgroundColor: tones.error.fg, borderColor: tones.error.fg, color: '#ffffff' },
                },
              },
              {
                props: { variant: 'text', color: 'primary' },
                style: { '&:hover': { backgroundColor: tokens.surfaceHigh } },
              },
            ],
          },
          startIcon: { '& > *:nth-of-type(1)': { fontSize: 18 } },
          endIcon: { '& > *:nth-of-type(1)': { fontSize: 18 } },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { borderRadius: 8, '&:hover': { backgroundColor: tokens.surfaceHigh } },
        },
      },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiSelect: { defaultProps: { size: 'small' } },
      MuiFormControl: { defaultProps: { size: 'small' } },
      // Labels sit above their fields (the floating label is turned into a static one).
      MuiInputLabel: {
        defaultProps: { shrink: true },
        styleOverrides: {
          root: {
            position: 'relative',
            transform: 'none',
            maxWidth: '100%',
            marginBottom: 6,
            fontSize: 13,
            lineHeight: '18px',
            fontWeight: 500,
            color: tokens.onSurface,
            whiteSpace: 'normal',
            overflow: 'visible',
            '&.Mui-focused': { color: tokens.onSurface },
            '&.Mui-error': { color: tokens.onSurface },
            '&.Mui-disabled': { color: tokens.secondary },
          },
          asterisk: { color: tones.error.fg },
        },
      },
      MuiOutlinedInput: {
        defaultProps: { notched: false },
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundColor: tokens.surface,
            fontSize: 14,
            transition: 'background-color 120ms',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.outlineVariant },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tokens.outline },
            '&.Mui-focused': { backgroundColor: tokens.surfaceLowest },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: tokens.primary, borderWidth: 1 },
            '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: tones.error.fg },
            '&.Mui-disabled': { backgroundColor: tokens.surfaceHigh },
            '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: tokens.outlineVariant },
          },
          // No '::placeholder' rule here: the stylis prefixer crashes on it (MUI's own placeholder style applies).
          input: { '&.MuiInputBase-inputSizeSmall': { paddingBlock: 7, paddingInline: 12 } },
          notchedOutline: { top: 0, '& legend': { display: 'none' } },
        },
      },
      MuiFormHelperText: {
        styleOverrides: { root: { marginInline: 0, marginTop: 4, fontSize: 12, lineHeight: '16px' } },
      },
      MuiFormControlLabel: {
        styleOverrides: { label: { fontSize: 14 } },
      },
      MuiCheckbox: { defaultProps: { size: 'small' } },
      MuiSwitch: {
        styleOverrides: {
          switchBase: { '&.Mui-checked + .MuiSwitch-track': { opacity: 1 } },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { fontSize: 13, lineHeight: '20px', borderBottomColor: tokens.surfaceHigh, paddingBlock: 10 },
          head: {
            backgroundColor: tokens.surfaceLow,
            color: tokens.secondary,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            paddingBlock: 10,
            borderBottomColor: tokens.surfaceHighest,
          },
          sizeSmall: { paddingInline: 16 },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: { '&.MuiTableRow-hover:hover': { backgroundColor: tokens.surfaceLow } },
        },
      },
      // Status badges: tonal pairs, 4px radius (pills are reserved for avatars).
      MuiChip: {
        defaultProps: { size: 'small' },
        styleOverrides: {
          root: {
            borderRadius: 4,
            fontWeight: 500,
            fontSize: 12,
            height: 24,
            variants: [
              { props: { color: 'default' }, style: { backgroundColor: tokens.surfaceHigh, color: tokens.onSurfaceVariant } },
              { props: { color: 'primary' }, style: { backgroundColor: tokens.secondaryContainer, color: tokens.primary } },
              { props: { color: 'secondary' }, style: { backgroundColor: tokens.surfaceHigh, color: tokens.secondary } },
              { props: { color: 'success' }, style: { backgroundColor: tones.success.bg, color: tones.success.fg } },
              { props: { color: 'error' }, style: { backgroundColor: tones.error.bg, color: tones.error.fg } },
              { props: { color: 'warning' }, style: { backgroundColor: tones.warning.bg, color: tones.warning.fg } },
              { props: { color: 'info' }, style: { backgroundColor: tones.info.bg, color: tones.info.fg } },
              {
                props: { variant: 'outlined' },
                style: { backgroundColor: tokens.surfaceLowest, borderColor: tokens.outlineVariant },
              },
            ],
          },
          sizeSmall: { height: 24 },
          label: { paddingInline: 8 },
          icon: { fontSize: 16, color: 'inherit', marginInlineStart: 6 },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontSize: 14,
            alignItems: 'flex-start',
            variants: [
              { props: { variant: 'standard', severity: 'error' }, style: { backgroundColor: tones.error.bg, color: '#93000a' } },
              { props: { variant: 'standard', severity: 'warning' }, style: { backgroundColor: tones.warning.bg, color: '#7a2e0e' } },
              { props: { variant: 'standard', severity: 'success' }, style: { backgroundColor: tones.success.bg, color: '#14532d' } },
              {
                props: { variant: 'standard', severity: 'info' },
                style: { backgroundColor: tokens.surfaceLow, color: tokens.onSurface, border: `1px solid ${tokens.surfaceHighest}` },
              },
            ],
          },
          icon: { paddingBlock: 8 },
          message: { paddingBlock: 8 },
        },
      },
      MuiAlertTitle: {
        styleOverrides: { root: { fontWeight: 600, fontSize: 14, marginBottom: 2 } },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 12, boxShadow: '0 24px 48px rgba(20, 28, 40, 0.18)' },
        },
      },
      MuiDialogTitle: {
        styleOverrides: { root: { fontSize: 18, lineHeight: '28px', fontWeight: 600, paddingTop: 20 } },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            backgroundColor: tokens.surfaceLow,
            borderTop: `1px solid ${tokens.surfaceHighest}`,
            paddingBlock: 12,
            paddingInline: 24,
            gap: 8,
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: 'rgba(20, 28, 40, 0.45)' } } },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { borderRadius: 8, border: `1px solid ${tokens.surfaceHighest}`, boxShadow: POPOVER_SHADOW },
        },
      },
      MuiPopover: {
        styleOverrides: { paper: { borderRadius: 8, boxShadow: POPOVER_SHADOW } },
      },
      MuiMenuItem: {
        styleOverrides: { root: { fontSize: 14, minHeight: 36 } },
      },
      MuiTooltip: {
        styleOverrides: { tooltip: { backgroundColor: tokens.onSurface, fontSize: 12, borderRadius: 6 } },
      },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 44 },
          indicator: { height: 2, backgroundColor: tokens.primary },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 44,
            fontSize: 14,
            fontWeight: 500,
            color: tokens.secondary,
            paddingInline: 16,
            '&.Mui-selected': { color: tokens.primary, fontWeight: 600 },
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: 6, borderRadius: 3, backgroundColor: tokens.surfaceHigh },
          bar: { borderRadius: 3 },
        },
      },
      MuiPaginationItem: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            fontSize: 13,
            fontFamily: MONO_FONT,
            '&.Mui-selected': {
              backgroundColor: tokens.primary,
              color: '#ffffff',
              '&:hover': { backgroundColor: tokens.primaryHover },
            },
          },
          outlined: { borderColor: tokens.surfaceHighest, backgroundColor: tokens.surfaceLowest },
        },
      },
      MuiListSubheader: {
        styleOverrides: { root: { fontSize: 12, lineHeight: '16px', fontWeight: 500, color: tokens.secondary } },
      },
      MuiDivider: {
        styleOverrides: { root: { borderColor: tokens.surfaceHighest } },
      },
      MuiSnackbarContent: {
        styleOverrides: { root: { borderRadius: 8 } },
      },
    },
  },
  // Arabic texts for MUI's own components (pagination labels and the like).
  arEG,
);
