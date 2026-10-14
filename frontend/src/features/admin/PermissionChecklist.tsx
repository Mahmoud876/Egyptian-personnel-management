import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ar } from '../../shared/i18n/ar';
import { Mono } from '../../shared/ui/DataText';
import { AdminPanelSettingsIcon, BadgeIcon, ShieldIcon, WorkIcon } from '../../shared/ui/icons';
import { SectionCard } from '../../shared/ui/SectionCard';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import type { PermissionInfo } from './api';

type Props = {
  catalog: PermissionInfo[];
  value: readonly string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
};

const MODULE_ICONS: Record<string, typeof ShieldIcon> = {
  conscripts: BadgeIcon,
  employees: WorkIcon,
  admin: AdminPanelSettingsIcon,
};

/** Permissions grouped by module (one card per module), with Arabic names and descriptions. */
export function PermissionChecklist({ catalog, value, onChange, disabled = false }: Props) {
  const selected = new Set(value);
  const modules = [...new Set(catalog.map((p) => p.module))];

  const toggle = (code: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(code);
    else next.delete(code);
    onChange(catalog.map((p) => p.code).filter((c) => next.has(c)));
  };

  const setGroup = (module: string, checked: boolean) => {
    const next = new Set(selected);
    for (const p of catalog) if (p.module === module) (checked ? next.add(p.code) : next.delete(p.code));
    onChange(catalog.map((p) => p.code).filter((c) => next.has(c)));
  };

  return (
    <Stack spacing={2}>
      {modules.map((module) => {
        const items = catalog.filter((p) => p.module === module);
        const count = items.filter((p) => selected.has(p.code)).length;
        const Icon = MODULE_ICONS[module] ?? ShieldIcon;
        return (
          <Box key={module} role="group" aria-label={ar.modules[module] ?? module}>
            <SectionCard
              tintedHeader
              icon={<Icon />}
              title={ar.modules[module] ?? module}
              actions={
                <>
                  <StatusBadge tone="neutral" dot={false}>
                    {ar.permissionsEditor.selected(count, items.length)}
                  </StatusBadge>
                  {!disabled && (
                    <Button size="small" onClick={() => setGroup(module, count < items.length)}>
                      {count < items.length ? ar.permissionsEditor.selectGroup : ar.permissionsEditor.clearGroup}
                    </Button>
                  )}
                </>
              }
            >
              <Box sx={{ display: 'grid', columnGap: 3, rowGap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                {items.map((p) => (
                  <FormControlLabel
                    key={p.code}
                    sx={{ display: 'flex', alignItems: 'flex-start', m: 0, gap: 0.5 }}
                    control={
                      <Checkbox
                        checked={selected.has(p.code)}
                        disabled={disabled}
                        onChange={(event) => toggle(p.code, event.target.checked)}
                        // Read-only (role-derived) grants stay navy so granted and missing are easy to tell apart.
                        sx={{ pt: 0.25, '&.Mui-disabled.Mui-checked': { color: 'primary.main', opacity: 0.8 } }}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          {p.name_ar}
                        </Typography>
                        {p.description_ar && (
                          <Typography variant="caption" component="div" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                            {p.description_ar}
                          </Typography>
                        )}
                        <Typography variant="caption" component="div" sx={{ color: 'text.disabled', fontWeight: 400 }}>
                          <Mono>{p.code}</Mono>
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </Box>
            </SectionCard>
          </Box>
        );
      })}
    </Stack>
  );
}
