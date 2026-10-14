import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { MONO_FONT, type Tone, tokens, tones } from './tokens';

type StatCardProps = {
  label: string;
  value: ReactNode;
  unit?: string | undefined;
  /** Short badge at the top corner. */
  badge?: ReactNode;
  /** An icon element in a tile on the far side. */
  icon?: ReactNode;
  /** Colours the value (e.g. error for rejected counts). */
  tone?: Tone | undefined;
  /** 0–100: a thin progress bar under the value. */
  progress?: number | undefined;
  footer?: { label: string; value: ReactNode } | undefined;
};

/** KPI tile: label, large tabular value, optional badge, bar and footer row. */
export function StatCard({ label, value, unit, badge, icon, tone, progress, footer }: StatCardProps) {
  const color = tone ? tones[tone].fg : tokens.onSurface;
  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="subtitle2" component="h3" sx={{ color: 'text.secondary' }}>
              {label}
            </Typography>
            {badge}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.5 }}>
            <Typography
              component="span"
              dir="ltr"
              sx={{ fontFamily: MONO_FONT, fontSize: 28, lineHeight: '36px', fontWeight: 600, color }}
            >
              {value}
            </Typography>
            {unit && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {unit}
              </Typography>
            )}
          </Box>
        </Box>
        {icon && (
          <Box
            aria-hidden
            sx={{
              width: 44,
              height: 44,
              borderRadius: 1,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              bgcolor: tone ? tones[tone].bg : tokens.surfaceLow,
              color: tone ? tones[tone].fg : tokens.primary,
              '& svg': { fontSize: 24 },
            }}
          >
            {icon}
          </Box>
        )}
      </Box>
      {progress !== undefined && (
        <LinearProgress
          variant="determinate"
          value={Math.max(0, Math.min(100, progress))}
          sx={{ '& .MuiLinearProgress-bar': { bgcolor: tone ? tones[tone].fg : tokens.primary } }}
        />
      )}
      {footer && (
        <Box
          sx={{
            mt: 'auto',
            px: 1,
            py: 0.5,
            borderRadius: 0.5,
            bgcolor: 'surface.low',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {footer.label}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 600 }}>
            {footer.value}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
