import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../../shared/api/client';
import { ar } from '../../../shared/i18n/ar';
import { AddIcon, EditIcon } from '../../../shared/ui/icons';
import { useNotify } from '../../../shared/ui/notifications';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { EmptyState, ErrorAlert, LoadingState } from '../../../shared/ui/states';
import { type PermissionInfo, type Template, usePermissionsCatalog, useSaveTemplate, useTemplatesQuery } from '../api';
import { PermissionChecklist } from '../PermissionChecklist';

const schema = z.object({
  name_ar: z.string().trim().min(1, ar.validation.required).max(200, ar.validation.maxLength(200)),
  description_ar: z.string().trim().max(500, ar.validation.maxLength(500)),
  permissions: z.array(z.string()),
});
type FormValues = z.infer<typeof schema>;

/** `null` = closed, 'new' = create, otherwise the template being edited. */
type Editing = null | 'new' | Template;

export function TemplatesPage() {
  const templates = useTemplatesQuery();
  const catalog = usePermissionsCatalog();
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <>
      <PageHeader
        title={ar.templates.title}
        subtitle={ar.templates.hint}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')} disabled={!catalog.data}>
            {ar.templates.newTemplate}
          </Button>
        }
      />
      <Paper variant="outlined">
        {templates.isPending ? (
          <LoadingState />
        ) : templates.isError ? (
          <Box sx={{ p: 2 }}>
            <ErrorAlert error={templates.error} onRetry={() => void templates.refetch()} />
          </Box>
        ) : templates.data.length === 0 ? (
          <EmptyState />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{ar.templates.name}</TableCell>
                  <TableCell>{ar.templates.description}</TableCell>
                  <TableCell>{ar.templates.permissionCount}</TableCell>
                  <TableCell align="center">{ar.common.actions}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {templates.data.map((template) => (
                  <TableRow key={template.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{template.name_ar}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{template.description_ar ?? ar.common.none}</TableCell>
                    <TableCell>{template.permissions.length}</TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        aria-label={`${ar.common.edit} ${template.name_ar}`}
                        onClick={() => setEditing(template)}
                        disabled={!catalog.data}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      {editing !== null && catalog.data && (
        <TemplateDialog
          template={editing === 'new' ? null : editing}
          catalog={catalog.data}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function TemplateDialog({
  template,
  catalog,
  onClose,
}: {
  template: Template | null;
  catalog: PermissionInfo[];
  onClose: () => void;
}) {
  const notify = useNotify();
  const save = useSaveTemplate();
  const { register, control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name_ar: template?.name_ar ?? '',
      description_ar: template?.description_ar ?? '',
      permissions: template?.permissions ?? [],
    },
  });

  const onSubmit = handleSubmit((values) =>
    save.mutate(
      { id: template?.id ?? null, body: { ...values, description_ar: values.description_ar || null } },
      {
        onSuccess: () => {
          notify(template ? ar.templates.updated : ar.templates.created);
          onClose();
        },
      },
    ),
  );

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <Box component="form" onSubmit={onSubmit} noValidate>
        <DialogTitle>{template ? ar.templates.editTitle : ar.templates.newTitle}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {save.isError && <Alert severity="error">{errorMessage(save.error)}</Alert>}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' } }}>
              <TextField
                label={ar.templates.name}
                autoFocus
                error={!!formState.errors.name_ar}
                helperText={formState.errors.name_ar?.message}
                {...register('name_ar')}
              />
              <TextField
                label={ar.templates.description}
                error={!!formState.errors.description_ar}
                helperText={formState.errors.description_ar?.message}
                {...register('description_ar')}
              />
            </Box>
            <Controller
              control={control}
              name="permissions"
              render={({ field }) => (
                <PermissionChecklist catalog={catalog} value={field.value} onChange={field.onChange} />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{ar.common.cancel}</Button>
          <Button type="submit" variant="contained" disabled={save.isPending}>
            {save.isPending ? ar.common.saving : ar.common.save}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
