import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../../shared/api/client';
import { ar } from '../../../shared/i18n/ar';
import { AddIcon, EditIcon } from '../../../shared/ui/icons';
import { useNotify } from '../../../shared/ui/notifications';
import { Mono } from '../../../shared/ui/DataText';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { SectionCard } from '../../../shared/ui/SectionCard';
import { EmptyState, ErrorAlert, LoadingState } from '../../../shared/ui/states';
import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { adminKeys } from '../api';
import { type LookupDef, type LookupField, type LookupRow, lookupDefs, validateField } from './lookupDefs';

type FormValues = Record<string, string | boolean>;

const governoratesDef = lookupDefs.find((d) => d.key === 'governorates') as LookupDef;

function useLookup(def: LookupDef, enabled = true) {
  return useQuery({ queryKey: adminKeys.lookup(def.key), queryFn: def.list, enabled });
}

function cellText(field: string, row: LookupRow, governorates: LookupRow[]): string {
  const value = row[field];
  if (field === 'governorate_id') return String(governorates.find((g) => g.id === value)?.name_ar ?? value ?? '');
  if (field === 'start_month' && typeof value === 'number') return ar.lookups.months[value - 1] ?? String(value);
  return value === null || value === undefined ? ar.common.none : String(value);
}

function columnLabel(def: LookupDef, column: string): string {
  if (column === 'batch_no') return ar.lookups.batchNo;
  return def.fields.find((f) => f.name === column)?.label ?? column;
}

function initialValues(def: LookupDef, row: LookupRow | null): FormValues {
  const values: FormValues = {};
  for (const field of def.fields) {
    const current = row?.[field.name];
    values[field.name] =
      field.kind === 'boolean' ? (typeof current === 'boolean' ? current : true) : current === null || current === undefined ? '' : String(current);
  }
  return values;
}

function toBody(def: LookupDef, values: FormValues): LookupRow {
  const body: LookupRow = {};
  for (const field of def.fields) {
    const value = values[field.name] ?? '';
    if (field.kind === 'boolean') body[field.name] = Boolean(value);
    else if (['number', 'governorate', 'month', 'day'].includes(field.kind)) body[field.name] = Number(value);
    else body[field.name] = String(value).trim();
  }
  return body;
}

function FieldInput({
  field,
  value,
  error,
  onChange,
  governorates,
}: {
  field: LookupField;
  value: string | boolean;
  error: string | null;
  onChange: (value: string | boolean) => void;
  governorates: LookupRow[];
}) {
  if (field.kind === 'boolean') {
    return (
      <FormControlLabel
        control={<Switch checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />}
        label={field.label}
      />
    );
  }
  const common = {
    label: field.label,
    value: String(value),
    error: error !== null,
    helperText: error ?? ' ',
    fullWidth: true,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };
  if (field.kind === 'governorate') {
    return (
      <TextField select {...common}>
        {governorates.map((g) => (
          <MenuItem key={String(g.id)} value={String(g.id)}>
            {String(g.code)} - {String(g.name_ar)}
          </MenuItem>
        ))}
      </TextField>
    );
  }
  if (field.kind === 'month') {
    return (
      <TextField select {...common}>
        {ar.lookups.months.map((month, index) => (
          <MenuItem key={month} value={String(index + 1)}>
            {month}
          </MenuItem>
        ))}
      </TextField>
    );
  }
  const numeric = field.kind !== 'text';
  return <TextField {...common} slotProps={{ htmlInput: numeric ? { dir: 'ltr', inputMode: 'numeric' } : {} }} />;
}

function LookupDialog({
  def,
  row,
  governorates,
  onClose,
}: {
  def: LookupDef;
  row: LookupRow | null;
  governorates: LookupRow[];
  onClose: () => void;
}) {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<FormValues>(() => initialValues(def, row));
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const save = useMutation({
    mutationFn: (body: LookupRow) => (row ? def.update(Number(row[def.idField]), body) : def.create(body)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.lookup(def.key) });
      notify(ar.common.saved);
      onClose();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string | null> = {};
    for (const field of def.fields) found[field.name] = validateField(field, values[field.name] ?? '', values);
    setErrors(found);
    if (Object.values(found).every((e) => e === null)) save.mutate(toBody(def, values));
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={submit} noValidate>
        <DialogTitle>{`${row ? ar.lookups.editTitle : ar.lookups.addTitle}: ${def.label}`}</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 1 }}>
            {save.isError && <Alert severity="error">{errorMessage(save.error)}</Alert>}
            {def.fields.map((field) => (
              <FieldInput
                key={field.name}
                field={field}
                value={values[field.name] ?? ''}
                error={errors[field.name] ?? null}
                governorates={governorates}
                onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={onClose}>
            {ar.common.cancel}
          </Button>
          <Button type="submit" variant="contained" disabled={save.isPending}>
            {save.isPending ? ar.common.saving : ar.common.save}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function LookupTable({ def }: { def: LookupDef }) {
  const query = useLookup(def);
  const needsGovernorates = def.fields.some((f) => f.kind === 'governorate');
  const governorates = useLookup(governoratesDef, needsGovernorates);
  const [editing, setEditing] = useState<LookupRow | 'new' | null>(null);

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <Box sx={{ p: 2 }}>
        <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />
      </Box>
    );
  }

  const governorateRows = governorates.data ?? [];
  return (
    <>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ flex: 1 }}>
          {def.hint ? (
            <Alert severity="info">{def.hint}</Alert>
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {ar.lookups.rowsCount(query.data.length)}
            </Typography>
          )}
        </Box>
        {def.creatable && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>
            {ar.common.add}
          </Button>
        )}
      </Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {def.columns.map((column) => (
                <TableCell key={column}>{columnLabel(def, column)}</TableCell>
              ))}
              <TableCell align="center">{ar.common.actions}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {query.data.map((row) => (
              <TableRow key={String(row[def.idField])} hover>
                {def.columns.map((column) => (
                  <TableCell key={column}>
                    {column === 'is_active' ? (
                      row.is_active ? (
                        <StatusBadge tone="success">{ar.common.active}</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">{ar.common.inactive}</StatusBadge>
                      )
                    ) : column === 'code' ? (
                      <Mono>{cellText(column, row, governorateRows)}</Mono>
                    ) : (
                      cellText(column, row, governorateRows)
                    )}
                  </TableCell>
                ))}
                <TableCell align="center">
                  <IconButton
                    size="small"
                    aria-label={ar.common.edit}
                    onClick={() => setEditing(row)}
                    sx={{ bgcolor: 'surface.low', color: 'primary.main' }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {query.data.length === 0 && <EmptyState />}
      {editing !== null && (
        <LookupDialog
          def={def}
          row={editing === 'new' ? null : editing}
          governorates={governorateRows}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

export function LookupsPage() {
  const [tab, setTab] = useState(0);
  const def = lookupDefs[tab] ?? governoratesDef;

  return (
    <>
      <PageHeader title={ar.lookups.title} subtitle={ar.lookups.subtitle} />
      <SectionCard flush>
        <Tabs
          value={tab}
          onChange={(_, next: number) => setTab(next)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}
        >
          {lookupDefs.map((d) => (
            <Tab key={d.key} label={d.label} />
          ))}
        </Tabs>
        <LookupTable key={def.key} def={def} />
      </SectionCard>
    </>
  );
}
