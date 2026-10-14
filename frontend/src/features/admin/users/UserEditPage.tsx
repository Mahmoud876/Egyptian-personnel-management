import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { type ReactNode, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { errorMessage } from '../../../shared/api/client';
import { formatDateTime } from '../../../shared/format';
import { ar } from '../../../shared/i18n/ar';
import { usePermission } from '../../../shared/permissions/permissions';
import { NotFoundPage } from '../../../shared/ui/ErrorPages';
import { KeyIcon } from '../../../shared/ui/icons';
import { useNotify } from '../../../shared/ui/notifications';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { ErrorAlert, LoadingState } from '../../../shared/ui/states';
import {
  type PermissionInfo,
  type Template,
  type UserDetail,
  type WorkEntity,
  useCreateUser,
  usePermissionsCatalog,
  useResetPassword,
  useSetUserPermissions,
  useTemplatesQuery,
  useUpdateUser,
  useUserQuery,
  useWorkEntities,
} from '../api';
import { PermissionChecklist } from '../PermissionChecklist';
import { adminPaths } from '../paths';

const PASSWORD_MIN = 8;

const fullName = z.string().trim().min(1, ar.validation.required).max(200, ar.validation.maxLength(200));
const password = z.string().min(PASSWORD_MIN, ar.validation.minLength(PASSWORD_MIN)).max(128, ar.validation.maxLength(128));

const createSchema = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9._-]{3,50}$/, ar.validation.username),
  full_name: fullName,
  password,
  work_entity_id: z.string(),
  is_active: z.boolean(),
  permissions: z.array(z.string()),
});
type CreateValues = z.infer<typeof createSchema>;

const detailsSchema = z.object({ full_name: fullName, work_entity_id: z.string(), is_active: z.boolean() });
type DetailsValues = z.infer<typeof detailsSchema>;

const toEntityId = (value: string): number | null => (value === '' ? null : Number(value));

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 2 }}>
        <Typography variant="h6" component="h2" sx={{ flex: 1 }}>
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Paper>
  );
}

function WorkEntitySelect({ entities, ...props }: { entities: WorkEntity[] } & Omit<TextFieldProps, 'select' | 'children'>) {
  return (
    <TextField
      select
      label={ar.users.workEntity}
      fullWidth
      // Show "no work entity" for the empty value instead of a blank field.
      slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
      {...props}
    >
      <MenuItem value="">{ar.users.noWorkEntity}</MenuItem>
      {entities.map((e) => (
        <MenuItem key={e.id} value={String(e.id)} disabled={!e.is_active}>
          {e.name_ar}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function UserEditPage() {
  const { userId } = useParams();
  if (userId === undefined) return <CreateUser />;
  const id = Number(userId);
  return Number.isInteger(id) && id > 0 ? <EditUser id={id} /> : <NotFoundPage />;
}

function CreateUser() {
  const navigate = useNavigate();
  const notify = useNotify();
  const catalog = usePermissionsCatalog();
  const templates = useTemplatesQuery();
  const entities = useWorkEntities();
  const create = useCreateUser();
  const { register, control, handleSubmit, formState } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { username: '', full_name: '', password: '', work_entity_id: '', is_active: true, permissions: [] },
  });

  const onSubmit = handleSubmit((values) =>
    create.mutate(
      { ...values, work_entity_id: toEntityId(values.work_entity_id) },
      {
        onSuccess: (user) => {
          notify(ar.users.created);
          void navigate(adminPaths.user(user.id), { replace: true });
        },
      },
    ),
  );

  if (catalog.isPending) return <LoadingState />;
  if (catalog.isError) return <ErrorAlert error={catalog.error} onRetry={() => void catalog.refetch()} />;

  return (
    <Box component="form" onSubmit={onSubmit} noValidate>
      <PageHeader
        title={ar.users.newTitle}
        actions={
          <Button type="submit" variant="contained" disabled={create.isPending}>
            {create.isPending ? ar.common.saving : ar.common.save}
          </Button>
        }
      />
      <Stack spacing={3}>
        {create.isError && <Alert severity="error">{errorMessage(create.error)}</Alert>}
        <Section title={ar.users.details}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <TextField
              label={ar.users.username}
              autoComplete="off"
              slotProps={{ htmlInput: { dir: 'ltr' } }}
              error={!!formState.errors.username}
              helperText={formState.errors.username?.message ?? ar.validation.username}
              {...register('username')}
            />
            <TextField
              label={ar.users.fullName}
              error={!!formState.errors.full_name}
              helperText={formState.errors.full_name?.message}
              {...register('full_name')}
            />
            <TextField
              label={ar.users.password}
              type="password"
              autoComplete="new-password"
              error={!!formState.errors.password}
              helperText={formState.errors.password?.message ?? ar.users.passwordHelp}
              {...register('password')}
            />
            <Controller
              control={control}
              name="work_entity_id"
              render={({ field: { ref, ...field } }) => (
                <WorkEntitySelect entities={entities.data ?? []} inputRef={ref} {...field} />
              )}
            />
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                  label={ar.users.isActive}
                />
              )}
            />
          </Box>
        </Section>
        <Section title={ar.users.permissions}>
          <Controller
            control={control}
            name="permissions"
            render={({ field }) => (
              <PermissionChecklist
                catalog={catalog.data}
                value={field.value}
                onChange={field.onChange}
                templates={templates.data ?? []}
              />
            )}
          />
        </Section>
      </Stack>
    </Box>
  );
}

function EditUser({ id }: { id: number }) {
  const user = useUserQuery(id);
  const catalog = usePermissionsCatalog();
  const canManage = usePermission('users.manage');
  const templates = useTemplatesQuery(canManage);
  const entities = useWorkEntities();

  if (user.isPending || catalog.isPending) return <LoadingState />;
  if (user.isError) return <ErrorAlert error={user.error} onRetry={() => void user.refetch()} />;
  if (catalog.isError) return <ErrorAlert error={catalog.error} onRetry={() => void catalog.refetch()} />;

  return (
    <>
      <PageHeader
        title={user.data.full_name}
        subtitle={`${user.data.username} · ${ar.users.lastLogin}: ${
          user.data.last_login_at ? formatDateTime(user.data.last_login_at) : ar.users.never
        }`}
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {user.data.must_change_password && <Chip color="warning" size="small" label={ar.users.mustChange} />}
            <Chip
              size="small"
              label={user.data.is_active ? ar.common.active : ar.common.inactive}
              color={user.data.is_active ? 'success' : 'default'}
            />
            {canManage && <ResetPasswordButton userId={id} />}
          </Stack>
        }
      />
      <Stack spacing={3}>
        <DetailsSection user={user.data} entities={entities.data ?? []} canManage={canManage} />
        <PermissionsSection
          user={user.data}
          catalog={catalog.data}
          templates={templates.data ?? []}
          canManage={canManage}
        />
      </Stack>
    </>
  );
}

function DetailsSection({ user, entities, canManage }: { user: UserDetail; entities: WorkEntity[]; canManage: boolean }) {
  const notify = useNotify();
  const update = useUpdateUser(user.id);
  const { register, control, handleSubmit, formState, reset } = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      full_name: user.full_name,
      work_entity_id: user.work_entity_id === null ? '' : String(user.work_entity_id),
      is_active: user.is_active,
    },
  });

  const onSubmit = handleSubmit((values) =>
    update.mutate(
      { ...values, work_entity_id: toEntityId(values.work_entity_id) },
      {
        onSuccess: (saved) => {
          notify(ar.common.saved);
          reset({
            full_name: saved.full_name,
            work_entity_id: saved.work_entity_id === null ? '' : String(saved.work_entity_id),
            is_active: saved.is_active,
          });
        },
      },
    ),
  );

  return (
    <Box component="form" onSubmit={onSubmit} noValidate>
      <Section
        title={ar.users.details}
        action={
          canManage && (
            <Button type="submit" variant="contained" disabled={update.isPending || !formState.isDirty}>
              {update.isPending ? ar.common.saving : ar.common.save}
            </Button>
          )
        }
      >
        {update.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMessage(update.error)}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <TextField label={ar.users.username} value={user.username} disabled slotProps={{ htmlInput: { dir: 'ltr' } }} />
          <TextField
            label={ar.users.fullName}
            disabled={!canManage}
            error={!!formState.errors.full_name}
            helperText={formState.errors.full_name?.message}
            {...register('full_name')}
          />
          <Controller
            control={control}
            name="work_entity_id"
            render={({ field: { ref, ...field } }) => (
              <WorkEntitySelect entities={entities} inputRef={ref} {...field} disabled={!canManage} />
            )}
          />
          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Switch
                    checked={field.value}
                    disabled={!canManage}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                }
                label={ar.users.isActive}
              />
            )}
          />
        </Box>
      </Section>
    </Box>
  );
}

function PermissionsSection({
  user,
  catalog,
  templates,
  canManage,
}: {
  user: UserDetail;
  catalog: PermissionInfo[];
  templates: Template[];
  canManage: boolean;
}) {
  const notify = useNotify();
  const save = useSetUserPermissions(user.id);
  const [codes, setCodes] = useState<string[]>(user.permissions);

  useEffect(() => setCodes(user.permissions), [user.permissions]);

  const dirty = codes.length !== user.permissions.length || codes.some((c) => !user.permissions.includes(c));

  return (
    <Section
      title={ar.users.permissions}
      action={
        canManage && (
          <Button
            variant="contained"
            disabled={save.isPending || !dirty}
            onClick={() => save.mutate(codes, { onSuccess: () => notify(ar.users.permissionsSaved) })}
          >
            {save.isPending ? ar.common.saving : ar.users.savePermissions}
          </Button>
        )
      }
    >
      {save.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage(save.error)}
        </Alert>
      )}
      <PermissionChecklist
        catalog={catalog}
        value={codes}
        onChange={setCodes}
        disabled={!canManage}
        {...(canManage ? { templates } : {})}
      />
    </Section>
  );
}

const resetSchema = z.object({ new_password: password });

function ResetPasswordButton({ userId }: { userId: number }) {
  const notify = useNotify();
  const reset = useResetPassword(userId);
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { new_password: '' },
  });

  const close = () => {
    setOpen(false);
    form.reset();
    reset.reset();
  };

  const onSubmit = form.handleSubmit(({ new_password }) =>
    reset.mutate(new_password, {
      onSuccess: () => {
        notify(ar.users.passwordReset);
        close();
      },
    }),
  );

  return (
    <>
      <Button variant="outlined" startIcon={<KeyIcon />} onClick={() => setOpen(true)}>
        {ar.users.resetPassword}
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <Box component="form" onSubmit={onSubmit} noValidate>
          <DialogTitle>{ar.users.resetPassword}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {ar.users.resetPasswordBody}
              </Typography>
              {reset.isError && <Alert severity="error">{errorMessage(reset.error)}</Alert>}
              <TextField
                label={ar.auth.newPassword}
                type="password"
                autoComplete="new-password"
                fullWidth
                autoFocus
                error={!!form.formState.errors.new_password}
                helperText={form.formState.errors.new_password?.message ?? ar.auth.passwordHint(PASSWORD_MIN)}
                {...form.register('new_password')}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>{ar.common.cancel}</Button>
            <Button type="submit" variant="contained" disabled={reset.isPending}>
              {reset.isPending ? ar.common.saving : ar.common.save}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
}
