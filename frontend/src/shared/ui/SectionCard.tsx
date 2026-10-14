import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { tokens } from './tokens';

type SectionCardProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** An icon element, shown in a square tile before the title. */
  icon?: ReactNode;
  /** solid: white icon on navy (primary sections); soft: navy icon on a pale tile. */
  iconTone?: 'solid' | 'soft';
  actions?: ReactNode;
  children?: ReactNode;
  /** Drop the body padding, for tables that run edge to edge. */
  flush?: boolean;
  /** Header background tint, for grouped lists (e.g. permission groups). */
  tintedHeader?: boolean;
  sx?: SxProps<Theme>;
  component?: 'section' | 'div' | 'form';
};

/** White sheet with a 1px border and an optional icon/title/actions header: the main building block of every screen. */
export function SectionCard({
  title,
  subtitle,
  icon,
  iconTone = 'soft',
  actions,
  children,
  flush = false,
  tintedHeader = false,
  sx = [],
  component = 'section',
}: SectionCardProps) {
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <Paper
      variant="outlined"
      component={component}
      sx={[{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {hasHeader && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1.5,
            px: { xs: 2, md: 2.5 },
            py: 1.75,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: tintedHeader ? 'surface.low' : 'transparent',
          }}
        >
          {icon && (
            <Box
              aria-hidden
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                bgcolor: iconTone === 'solid' ? tokens.primary : tokens.surfaceLow,
                color: iconTone === 'solid' ? '#ffffff' : tokens.primary,
                '& svg': { fontSize: 20 },
              }}
            >
              {icon}
            </Box>
          )}
          {/* Basis 180px: on narrow screens the actions wrap below instead of squeezing the title. */}
          <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
            {title !== undefined && (
              <Typography variant="subtitle1" component="h2">
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {actions && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
        </Box>
      )}
      <Box sx={flush ? { flex: 1 } : { flex: 1, p: { xs: 2, md: 2.5 } }}>{children}</Box>
    </Paper>
  );
}
