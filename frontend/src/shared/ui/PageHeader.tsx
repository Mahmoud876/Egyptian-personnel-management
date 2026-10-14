import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { createContext, type ReactNode, useContext } from 'react';
import { ar } from '../i18n/ar';
import { ChevronLeftIcon } from './icons';

/** The section › screen trail of the current route; the layout provides it from the menu. */
const BreadcrumbContext = createContext<readonly string[]>([]);
export const BreadcrumbProvider = BreadcrumbContext.Provider;

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Extra crumbs after the menu trail, e.g. the record being viewed. */
  crumbs?: readonly string[];
  /** Badges or short facts shown next to the title. */
  meta?: ReactNode;
};

export function PageHeader({ title, subtitle, actions, crumbs = [], meta }: PageHeaderProps) {
  const trail = [...useContext(BreadcrumbContext), ...crumbs];
  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: { md: 'flex-end' },
        flexDirection: { xs: 'column', md: 'row' },
        gap: 2,
        pb: 2,
        mb: 3,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {trail.length > 0 && (
          <Box
            component="nav"
            aria-label={ar.layout.breadcrumbs}
            sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}
          >
            {trail.map((crumb, index) => {
              const last = index === trail.length - 1;
              return (
                <Box key={`${crumb}-${index}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography
                    variant="caption"
                    aria-current={last ? 'page' : undefined}
                    sx={{ color: last ? 'primary.main' : 'text.secondary', fontWeight: last ? 600 : 500 }}
                  >
                    {crumb}
                  </Typography>
                  {!last && <ChevronLeftIcon sx={{ fontSize: 14, color: 'text.secondary' }} />}
                </Box>
              );
            })}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5 }}>
          <Typography variant="h5" component="h1" sx={{ color: 'primary.main' }}>
            {title}
          </Typography>
          {meta}
        </Box>
        {subtitle && (
          <Typography component="div" sx={{ color: 'text.secondary', mt: 0.25 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', flexShrink: 0 }}>{actions}</Box>
      )}
    </Box>
  );
}
