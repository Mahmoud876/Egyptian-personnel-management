import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { ar } from '../i18n/ar';
import { MONO_FONT } from './tokens';

/** Numbers, IDs and codes: Western digits, fixed width, isolated left-to-right inside Arabic text. */
export function Mono({ children, sx = [] }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box
      component="span"
      dir="ltr"
      sx={[{ fontFamily: MONO_FONT, unicodeBidi: 'isolate', whiteSpace: 'nowrap' }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </Box>
  );
}

/** A read-only field: small label above its value. Empty values show a dash. */
export function KeyValue({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" component="div" sx={{ color: 'text.secondary', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography component="div" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
        {empty ? ar.common.none : mono ? <Mono>{value}</Mono> : value}
      </Typography>
    </Box>
  );
}
