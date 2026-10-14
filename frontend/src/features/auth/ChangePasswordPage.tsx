import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { errorMessage } from '../../shared/api/client';
import { useChangePassword, useMe } from '../../shared/auth/auth';
import { ar } from '../../shared/i18n/ar';
import { KeyIcon } from '../../shared/ui/icons';
import { useNotify } from '../../shared/ui/notifications';
import { PageHeader } from '../../shared/ui/PageHeader';
import { SectionCard } from '../../shared/ui/SectionCard';

const MIN_LENGTH = 8;

const schema = z
  .object({
    current_password: z.string().min(1, ar.validation.required),
    new_password: z.string().min(MIN_LENGTH, ar.validation.minLength(MIN_LENGTH)).max(128, ar.validation.maxLength(128)),
    confirm: z.string().min(1, ar.validation.required),
  })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: ar.validation.passwordsMismatch });
type FormValues = z.infer<typeof schema>;

export function ChangePasswordPage() {
  const { data: me } = useMe();
  const change = useChangePassword();
  const navigate = useNavigate();
  const notify = useNotify();
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(({ current_password, new_password }) =>
    change.mutate(
      { current_password, new_password },
      {
        onSuccess: () => {
          notify(ar.auth.passwordChanged);
          void navigate('/', { replace: true });
        },
      },
    ),
  );

  return (
    <Box>
      <PageHeader title={ar.auth.changePassword} subtitle={ar.auth.changePasswordIntro} />
      <SectionCard
        icon={<KeyIcon />}
        iconTone="solid"
        title={ar.auth.newPasswordSection}
        subtitle={ar.auth.passwordHint(MIN_LENGTH)}
        sx={{ maxWidth: 560 }}
      >
        <Box component="form" onSubmit={onSubmit} noValidate>
          <Stack spacing={2}>
            {me?.must_change_password && <Alert severity="warning">{ar.auth.mustChangePassword}</Alert>}
            {change.isError && <Alert severity="error">{errorMessage(change.error)}</Alert>}
            <TextField
              label={ar.auth.currentPassword}
              type="password"
              autoComplete="current-password"
              fullWidth
              error={!!formState.errors.current_password}
              helperText={formState.errors.current_password?.message}
              {...register('current_password')}
            />
            <TextField
              label={ar.auth.newPassword}
              type="password"
              autoComplete="new-password"
              fullWidth
              error={!!formState.errors.new_password}
              helperText={formState.errors.new_password?.message ?? ar.auth.passwordHint(MIN_LENGTH)}
              {...register('new_password')}
            />
            <TextField
              label={ar.auth.confirmPassword}
              type="password"
              autoComplete="new-password"
              fullWidth
              error={!!formState.errors.confirm}
              helperText={formState.errors.confirm?.message}
              {...register('confirm')}
            />
            <Box>
              <Button type="submit" variant="contained" disabled={change.isPending}>
                {change.isPending ? ar.common.saving : ar.common.save}
              </Button>
            </Box>
          </Stack>
        </Box>
      </SectionCard>
    </Box>
  );
}
