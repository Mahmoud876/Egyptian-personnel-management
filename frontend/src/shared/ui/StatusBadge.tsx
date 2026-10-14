import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { type Tone, tones } from './tokens';

type StatusBadgeProps = {
  tone: Tone;
  children: ReactNode;
  /** A leading dot; replaced by `icon` when one is given. */
  dot?: boolean;
  icon?: ReactNode;
};

/** Small tonal label (24px, 4px radius) for record states: معتمد، مرفوض، قيد المراجعة… */
export function StatusBadge({ tone, children, dot = true, icon }: StatusBadgeProps) {
  const { fg, bg } = tones[tone];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        minHeight: 24,
        px: 1,
        borderRadius: 0.5,
        bgcolor: bg,
        color: fg,
        fontSize: 12,
        lineHeight: '16px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
        '& svg': { fontSize: 14 },
      }}
    >
      {icon ??
        (dot && <Box component="span" aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor' }} />)}
      {children}
    </Box>
  );
}
