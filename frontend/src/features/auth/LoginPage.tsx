import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { errorMessage } from '../../shared/api/client';
import { useLogin, useMe } from '../../shared/auth/auth';
import { CHANGE_PASSWORD_PATH } from '../../shared/auth/RequireAuth';
import { ar } from '../../shared/i18n/ar';
import { ShieldIcon } from '../../shared/ui/icons';

const schema = z.object({
  username: z.string().trim().min(1, ar.validation.required),
  password: z.string().min(1, ar.validation.required),
});
type FormValues = z.infer<typeof schema>;

function redirectTarget(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('/login') ? from : '/';
}

export function LoginPage() {
  const { data: me } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });

  if (me && !login.isPending) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, {
      onSuccess: (result) =>
        void navigate(result.must_change_password ? CHANGE_PASSWORD_PATH : redirectTarget(location.state), {
          replace: true,
        }),
    }),
  );

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 2 }}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 400, p: { xs: 3, sm: 4 } }}>
        <Stack spacing={1} sx={{ alignItems: 'center', mb: 3, textAlign: 'center' }}>
          <ShieldIcon color="primary" sx={{ fontSize: 52 }} />
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {ar.app.title}
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>{ar.app.subtitle}</Typography>
        </Stack>
        <Box component="form" onSubmit={onSubmit} noValidate>
          <Stack spacing={2}>
            {login.isError && <Alert severity="error">{errorMessage(login.error)}</Alert>}
            <TextField
              label={ar.auth.username}
              autoComplete="username"
              autoFocus
              fullWidth
              slotProps={{ htmlInput: { dir: 'ltr' } }}
              error={!!formState.errors.username}
              helperText={formState.errors.username?.message}
              {...register('username')}
            />
            <TextField
              label={ar.auth.password}
              type="password"
              autoComplete="current-password"
              fullWidth
              error={!!formState.errors.password}
              helperText={formState.errors.password?.message}
              {...register('password')}
            />
            <Button type="submit" variant="contained" size="large" disabled={login.isPending}>
              {login.isPending ? ar.auth.loggingIn : ar.auth.login}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
