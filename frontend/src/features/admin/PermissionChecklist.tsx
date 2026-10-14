import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ar } from '../../shared/i18n/ar';
import type { PermissionInfo, Template } from './api';

type Props = {
  catalog: PermissionInfo[];
  value: readonly string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  /** When given, shows "apply template", which copies a template's codes into the selection. */
  templates?: Template[];
};

/** Permissions grouped by module, with Arabic names. Used by the user editor and the template editor. */
export function PermissionChecklist({ catalog, value, onChange, disabled = false, templates }: Props) {
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
    <Box>
      {templates && !disabled && (
        <TextField
          select
          label={ar.permissionsEditor.applyTemplate}
          helperText={ar.permissionsEditor.applyTemplateHelp}
          value=""
          onChange={(event) => {
            const template = templates.find((t) => String(t.id) === event.target.value);
            if (template) onChange(catalog.map((p) => p.code).filter((c) => template.permissions.includes(c)));
          }}
          sx={{ mb: 2, minWidth: 280 }}
        >
          {templates.map((t) => (
            <MenuItem key={t.id} value={String(t.id)}>
              {t.name_ar}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' } }}>
        {modules.map((module) => {
          const items = catalog.filter((p) => p.module === module);
          const count = items.filter((p) => selected.has(p.code)).length;
          return (
            <Paper key={module} variant="outlined" sx={{ p: 2 }} role="group" aria-label={ar.modules[module] ?? module}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
                <Typography sx={{ fontWeight: 700, flex: 1 }}>{ar.modules[module] ?? module}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {ar.permissionsEditor.selected(count, items.length)}
                </Typography>
                {!disabled && (
                  <Button size="small" onClick={() => setGroup(module, count < items.length)}>
                    {count < items.length ? ar.permissionsEditor.selectGroup : ar.permissionsEditor.clearGroup}
                  </Button>
                )}
              </Box>
              {items.map((p) => (
                <FormControlLabel
                  key={p.code}
                  sx={{ display: 'flex', alignItems: 'flex-start', mx: 0, mb: 0.5 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={selected.has(p.code)}
                      disabled={disabled}
                      onChange={(event) => toggle(p.code, event.target.checked)}
                      sx={{ pt: 0.25 }}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {p.name_ar}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        {p.description_ar}
                      </Typography>
                      <Typography
                        variant="caption"
                        dir="ltr"
                        sx={{ color: 'text.disabled', fontFamily: 'monospace', display: 'inline-block' }}
                      >
                        {p.code}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
