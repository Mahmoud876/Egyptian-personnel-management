/*
 * Design tokens from the Stitch design system (stitch_egyptian_personnel_management_system/DESIGN.md):
 * flat institutional navy, 1px structural borders instead of shadows, 8px radius, dense Cairo typography.
 */
export const tokens = {
  primary: '#1f3a5f',
  primaryHover: '#2b4c7e',
  primaryDeep: '#032448',
  onPrimaryContainer: '#8ba4cf',
  surface: '#f8f9ff',
  surfaceLowest: '#ffffff',
  surfaceLow: '#eff3ff',
  surfaceContainer: '#e6eeff',
  surfaceHigh: '#e1e8f9',
  surfaceHighest: '#dbe3f3',
  onSurface: '#141c28',
  onSurfaceVariant: '#43474e',
  secondary: '#545f6e',
  secondaryContainer: '#d8e3f5',
  primaryFixed: '#d5e3ff',
  outline: '#74777f',
  outlineVariant: '#c4c6cf',
  tertiaryFixed: '#ffddb0',
  tertiaryContainer: '#503400',
  tertiaryFixedDim: '#ecbf7f',
} as const;

/** Western digits in a fixed-width face, so IDs, codes and dates line up in columns. */
export const MONO_FONT = 'Consolas, "Cascadia Mono", "Courier New", monospace';

/** Status tonal pairs (badges, alerts, highlighted values): saturated text on a muted ground. */
export const tones = {
  success: { fg: '#1e7f4f', bg: '#e8f5ee' },
  error: { fg: '#b42318', bg: '#fee4e2' },
  warning: { fg: '#b54708', bg: '#fef0c7' },
  info: { fg: '#175cd3', bg: '#eff4ff' },
  primary: { fg: tokens.primary, bg: tokens.secondaryContainer },
  neutral: { fg: tokens.onSurfaceVariant, bg: tokens.surfaceHigh },
} as const;

export type Tone = keyof typeof tones;
