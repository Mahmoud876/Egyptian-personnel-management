import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, type Schemas } from '../../../shared/api/client';
import { ar } from '../../../shared/i18n/ar';
import { useNotify } from '../../../shared/ui/notifications';
import { conscriptsKeys, type ImportJob, type ImportRecord, useCorrectImportRow } from '../api';

const FIELDS = ['id', 'name', 'national_id', 'birth_date', 'gov_name', 'gov_id', 'ps_name', 'ps_id', 'type_id', 'type_name'] as const;
const text = (value: unknown) => value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
export const importFieldLabel = (field: string) => ar.conscripts.correction.fields[field] ?? field;

export function ImportRowDialog({ job, record, onClose, allowEdit = true }: {
  job: ImportJob; record: ImportRecord; onClose: () => void; allowEdit?: boolean;
}) {
  const current = record.corrected_data ?? record.raw_data;
  const [values, setValues] = useState(() => Object.fromEntries(FIELDS.map((field) => [field, text(current[field])])));
  // Hold the exact version that the administrator inspected, even if a background refresh completes.
  const [version] = useState(job.progress_version);
  const save = useCorrectImportRow(job.id, record.id);
  const notify = useNotify();
  const queryClient = useQueryClient();
  const editable = job.status === 'READY_FOR_REVIEW' && allowEdit;
  const changes = Object.fromEntries(FIELDS.filter((field) => values[field] !== text(current[field]))
    .map((field) => [field, values[field] ?? ''])) as Schemas['CorrectImportRecord']['changes'];
  const extras = Object.keys(current).filter((field) => !(FIELDS as readonly string[]).includes(field));
  const submit = () => save.mutate({ version, changes }, { onSuccess: () => {
    notify(ar.conscripts.correction.saved);
    onClose();
  } });

  return (
    <Dialog open onClose={() => { if (!save.isPending) onClose(); }} maxWidth="md" fullWidth aria-labelledby="import-row-title">
      <DialogTitle id="import-row-title">{ar.conscripts.correction.title(record.row_number)}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">{editable ? ar.conscripts.correction.hint
            : ['APPROVED', 'CANCELLED'].includes(job.status) ? ar.conscripts.correction.readOnly
            : ar.conscripts.correction.pendingReview}</Alert>
          {record.errors.map((error) => (
            <Alert severity="error" key={`${error.field_name}-${error.error_code}`}>
              <strong>{importFieldLabel(error.field_name)}</strong>: {error.error_message}
            </Alert>
          ))}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {FIELDS.map((field) => {
              const errors = record.errors.filter((error) => error.field_name === field);
              return <TextField key={field} label={importFieldLabel(field)} value={values[field] ?? ''}
                error={errors.length > 0}
                disabled={save.isPending}
                onChange={(event) => setValues((old) => ({ ...old, [field]: event.target.value }))}
                slotProps={{ input: { readOnly: !editable }, htmlInput: { maxLength: 2000,
                  dir: ['id', 'national_id', 'birth_date', 'gov_id', 'ps_id', 'type_id'].includes(field) ? 'ltr' : 'rtl' } }}
                helperText={<>{errors.map((error) => <span key={error.error_code}>{error.error_message}<br /></span>)}
                  {ar.conscripts.correction.original(text(record.raw_data[field]) || ar.common.none)}</>} />;
            })}
          </Box>
          {extras.length > 0 && <Box>
            <Typography variant="subtitle2">{ar.conscripts.correction.extra}</Typography>
            {extras.map((field) => <Typography key={field} sx={{ overflowWrap: 'anywhere' }}>
              {field}: {text(current[field]) || ar.common.none}
            </Typography>)}
          </Box>}
          {save.isError && <Alert severity="error">{errorMessage(save.error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        {save.isError && <Button onClick={() => {
          void queryClient.invalidateQueries({ queryKey: conscriptsKeys.imports });
          onClose();
        }}>{ar.conscripts.correction.reload}</Button>}
        <Button onClick={onClose} disabled={save.isPending}>{ar.common.close}</Button>
        {editable && <Button variant="contained" onClick={submit} disabled={save.isPending || Object.keys(changes).length === 0}>
          {save.isPending ? ar.common.saving : ar.conscripts.correction.save}
        </Button>}
      </DialogActions>
    </Dialog>
  );
}
