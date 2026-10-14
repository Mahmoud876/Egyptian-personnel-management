import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { errorMessage } from '../../../shared/api/client';
import { formatDateTimeNumeric } from '../../../shared/format';
import { ar } from '../../../shared/i18n/ar';
import { usePermission } from '../../../shared/permissions/permissions';
import { Mono } from '../../../shared/ui/DataText';
import { NotFoundPage } from '../../../shared/ui/ErrorPages';
import { AdminPanelSettingsIcon, KeyIcon, PersonIcon, PlaylistAddCheckIcon, ScheduleIcon } from '../../../shared/ui/icons';
import { useNotify } from '../../../shared/ui/notifications';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { SectionCard } from '../../../shared/ui/SectionCard';
import { ErrorAlert, LoadingState } from '../../../shared/ui/states';
import { StatusBadge } from '../../../shared/ui/StatusBadge';
import {
  type PermissionInfo,
  type UserDetail,
  type WorkEntity,
  useCreateUser,
  usePermissionsCatalog,
  useResetPassword,
  useUpdateUser,
  useUserQuery,
  useWorkEntities,
} from '../api';
import { PermissionChecklist } from '../PermissionChecklist';
import { adminPaths } from '../paths';
import { ActiveBadge, RoleBadge } from './UsersListPage';

const PASSWORD_MIN = 8;

const fullName = z.string().trim().min(1, ar.validation.required).max(200, ar.validation.maxLength(200));
const password = z.string().min(PASSWORD_MIN, ar.validation.minLength(PASSWORD_MIN)).max(128, ar.validation.maxLength(128));
const role = z.enum(['system_administrator', 'data_entry_operator']);

const createSchema = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9._-]{3,50}$/, ar.validation.username),
  full_name: fullName,
  password,
  work_entity_id: z.string(),
  is_active: z.boolean(),
  role,
});
type CreateValues = z.infer<typeof createSchema>;

const detailsSchema = z.object({ full_name: fullName, work_entity_id: z.string(), is_active: z.boolean(), role });
type DetailsValues = z.infer<typeof detailsSchema>;

const toEntityId = (value: string): number | null => (value === '' ? null : Number(value));

function WorkEntitySelect({ entities, ...props }: { entities: WorkEntity[] } & Omit<TextFieldProps, 'select' | 'children'>) {
  return (
    <TextField
      select
      label={ar.users.workEntity}
      fullWidth
      // Show "no work entity" for the empty value instead of a blank field.
      slotProps={{ select: { displayEmpty: true } }}
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

function RoleSelect(props: Omit<TextFieldProps, 'select' | 'children'>) {
  return (
    <TextField select fullWidth label={ar.users.role} helperText={ar.users.rolePermissionsHelp} {...props}>
      <MenuItem value="data_entry_operator">{ar.users.operatorRole}</MenuItem>
      <MenuItem value="system_administrator">{ar.users.adminRole}</MenuItem>
    </TextField>
  );
}

function ActiveSwitch({ value, onChange, disabled = false }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Box
      sx={{
        px: 1.5,
        py: 0.5,
        borderRadius: 1,
        border: 1,
        borderColor: 'outline.variant',
        bgcolor: 'surface.main',
        alignSelf: 'end',
        minHeight: 36,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <FormControlLabel
        sx={{ m: 0, flex: 1, justifyContent: 'space-between', gap: 1 }}
        labelPlacement="start"
        control={<Switch checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />}
        label={ar.users.isActive}
      />
    </Box>
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
  const entities = useWorkEntities();
  const create = useCreateUser();
  const { register, control, handleSubmit, formState } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { username: '', full_name: '', password: '', work_entity_id: '', is_active: true, role: 'data_entry_operator' },
  });

  const onSubmit = handleSubmit((values) =>
    create.mutate(
      { ...values, permissions: [], work_entity_id: toEntityId(values.work_entity_id) },
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
        subtitle={ar.users.newSubtitle}
        actions={
          <Button type="submit" variant="contained" disabled={create.isPending}>
            {create.isPending ? ar.common.saving : ar.common.save}
          </Button>
        }
      />
      <Stack spacing={3}>
        {create.isError && <Alert severity="error">{errorMessage(create.error)}</Alert>}
        <SectionCard icon={<PersonIcon />} iconTone="solid" title={ar.users.details} subtitle={ar.users.detailsHint}>
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <TextField
              label={ar.users.username}
              required
              autoComplete="off"
              slotProps={{ htmlInput: { dir: 'ltr' } }}
              error={!!formState.errors.username}
              helperText={formState.errors.username?.message ?? ar.validation.username}
              {...register('username')}
            />
            <TextField
              label={ar.users.fullName}
              required
              error={!!formState.errors.full_name}
              helperText={formState.errors.full_name?.message}
              {...register('full_name')}
            />
            <TextField
              label={ar.users.password}
              required
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
            <Controller control={control} name="role" render={({ field }) => <RoleSelect {...field} />} />
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => <ActiveSwitch value={field.value} onChange={field.onChange} />}
            />
          </Box>
        </SectionCard>
      </Stack>
    </Box>
  );
}

function ProfileCard({ user, canManage }: { user: UserDetail; canManage: boolean }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
      <Box
        aria-hidden
        sx={{
          width: 64,
          height: 64,
          borderRadius: 1.5,
          bgcolor: 'primary.main',
          color: '#ffffff',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <PersonIcon sx={{ fontSize: 36 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 220 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6" component="h2">
            {user.full_name}
          </Typography>
          <Box
            component="span"
            sx={{ px: 1, py: 0.25, borderRadius: 0.5, bgcolor: 'surface.high', fontSize: 12, color: 'text.secondary' }}
          >
            <Mono>{user.username}</Mono>
          </Box>
          <RoleBadge role={user.role} />
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {user.work_entity_name ?? ar.users.noWorkEntity}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', fontWeight: 400, display: 'flex', gap: 2, flexWrap: 'wrap', mt: 0.5 }}
        >
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <ScheduleIcon sx={{ fontSize: 14 }} />
            {ar.users.lastLogin}:{' '}
            {user.last_login_at ? <Mono>{formatDateTimeNumeric(user.last_login_at)}</Mono> : ar.users.never}
          </Box>
          <span>
            {ar.users.createdAt}: <Mono>{formatDateTimeNumeric(user.created_at)}</Mono>
          </span>
        </Typography>
      </Box>
      <Stack spacing={1} sx={{ alignItems: { xs: 'flex-start', sm: 'flex-end' } }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {user.must_change_password && <StatusBadge tone="warning">{ar.users.mustChange}</StatusBadge>}
          <ActiveBadge active={user.is_active} />
        </Box>
        {canManage && <ResetPasswordButton userId={user.id} />}
      </Stack>
    </Paper>
  );
}

function EditUser({ id }: { id: number }) {
  const user = useUserQuery(id);
  const catalog = usePermissionsCatalog();
  const canManage = usePermission('users.manage');
  const entities = useWorkEntities();

  if (user.isPending || catalog.isPending) return <LoadingState />;
  if (user.isError) return <ErrorAlert error={user.error} onRetry={() => void user.refetch()} />;
  if (catalog.isError) return <ErrorAlert error={catalog.error} onRetry={() => void catalog.refetch()} />;

  return (
    <>
      <PageHeader title={ar.users.editTitle} crumbs={[user.data.full_name]} subtitle={ar.users.editSubtitle} />
      <Stack spacing={3}>
        <ProfileCard user={user.data} canManage={canManage} />
        <DetailsSection user={user.data} entities={entities.data ?? []} canManage={canManage} />
        <PermissionsSection user={user.data} catalog={catalog.data} />
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
      role: user.role,
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
            role: saved.role,
          });
        },
      },
    ),
  );

  return (
    <Box component="form" onSubmit={onSubmit} noValidate>
      <SectionCard
        icon={<AdminPanelSettingsIcon />}
        iconTone="solid"
        title={ar.users.details}
        subtitle={ar.users.detailsHint}
        actions={
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
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <TextField
            label={ar.users.username}
            value={user.username}
            disabled
            slotProps={{ htmlInput: { dir: 'ltr' } }}
          />
          <TextField
            label={ar.users.fullName}
            disabled={!canManage}
            error={!!formState.errors.full_name}
            helperText={formState.errors.full_name?.message}
            {...register('full_name')}
          />
          <Controller
            control={control}
            name="role"
            render={({ field }) => <RoleSelect disabled={!canManage} {...field} />}
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
            render={({ field }) => <ActiveSwitch value={field.value} onChange={field.onChange} disabled={!canManage} />}
          />
        </Box>
      </SectionCard>
    </Box>
  );
}

function PermissionsSection({ user, catalog }: { user: UserDetail; catalog: PermissionInfo[] }) {
  const granted = catalog.filter((p) => user.permissions.includes(p.code)).length;
  return (
    <Stack spacing={2}>
      <Paper
        variant="outlined"
        sx={{ p: 2, bgcolor: 'surface.low', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}
      >
        <PlaylistAddCheckIcon sx={{ color: 'primary.main' }} />
        <Typography variant="subtitle1" component="h2">
          {ar.users.permissionsSummary}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {ar.users.grantedOf(granted, catalog.length)}
        </Typography>
        <Box sx={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: 1 }}>
          <LinearProgress
            variant="determinate"
            value={catalog.length ? (granted / catalog.length) * 100 : 0}
            sx={{ flex: 1, bgcolor: 'background.paper' }}
            aria-label={ar.users.permissionsSummary}
          />
          <Mono sx={{ fontSize: 12, color: 'text.secondary' }}>
            {catalog.length ? Math.round((granted / catalog.length) * 100) : 0}%
          </Mono>
        </Box>
      </Paper>
      <Alert severity="info" icon={<KeyIcon sx={{ color: 'primary.main' }} />}>
        {ar.users.rolePermissionsHelp}
      </Alert>
      <PermissionChecklist catalog={catalog} value={user.permissions} onChange={() => {}} disabled />
    </Stack>
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
      <Button variant="outlined" size="small" startIcon={<KeyIcon />} onClick={() => setOpen(true)}>
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
            <Button variant="outlined" onClick={close}>
              {ar.common.cancel}
            </Button>
            <Button type="submit" variant="contained" disabled={reset.isPending}>
              {reset.isPending ? ar.common.saving : ar.common.save}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
}
