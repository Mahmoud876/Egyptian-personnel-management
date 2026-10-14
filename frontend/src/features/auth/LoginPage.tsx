import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { ApiError, errorMessage } from '../../shared/api/client';
import { useLogin, useMe } from '../../shared/auth/auth';
import { CHANGE_PASSWORD_PATH } from '../../shared/auth/RequireAuth';
import { ar } from '../../shared/i18n/ar';
import { Emblem } from '../../shared/ui/Emblem';
import {
  BadgeIcon,
  CloseIcon,
  ErrorIcon,
  GavelIcon,
  LockIcon,
  LoginIcon,
  VisibilityIcon,
  VisibilityOffIcon,
} from '../../shared/ui/icons';
import { tokens, tones } from '../../shared/ui/tokens';

const schema = z.object({
  username: z.string().trim().min(1, ar.validation.required),
  password: z.string().min(1, ar.validation.required),
});
type FormValues = z.infer<typeof schema>;

function redirectTarget(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('/login') ? from : '/';
}

const fieldIcon = (icon: ReactNode) => (
  <InputAdornment position="start" sx={{ color: 'text.secondary', '& svg': { fontSize: 20 } }}>
    {icon}
  </InputAdornment>
);

export function LoginPage() {
  const { data: me } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
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

  const inputSx = { '& .MuiOutlinedInput-root': { minHeight: 44, bgcolor: 'background.paper' } };

  return (
    <Box
      component="main"
      sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', px: 2, py: 4 }}
    >
      <Box sx={{ width: '100%', maxWidth: 460 }}>
        <Stack spacing={1} sx={{ alignItems: 'center', textAlign: 'center', mb: 3 }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: 1.5,
              bgcolor: 'surface.low',
              display: 'grid',
              placeItems: 'center',
              mb: 0.75,
              boxShadow: '0 1px 2px rgba(20, 28, 40, 0.06)',
            }}
          >
            <Emblem size={46} />
          </Box>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 0.25,
              borderRadius: 999,
              bgcolor: 'surface.high',
              color: tokens.onSurfaceVariant,
            }}
          >
            <Box component="span" aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main' }} />
            <Typography variant="caption">{ar.app.authority}</Typography>
          </Box>
          <Typography variant="h5" component="h1">
            {ar.app.title}
          </Typography>
          <Typography variant="subtitle2" sx={{ color: tokens.onSurfaceVariant, fontWeight: 500 }}>
            {ar.auth.portal}
          </Typography>
        </Stack>

        <Paper sx={{ p: { xs: 3, sm: 3.5 }, boxShadow: '0 1px 3px rgba(20, 28, 40, 0.08)' }}>
          {login.isError && (
            <Box
              role="alert"
              sx={{
                mb: 2.5,
                p: 1.75,
                borderRadius: 1,
                bgcolor: tones.error.bg,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5,
              }}
            >
              <ErrorIcon sx={{ color: tones.error.fg, fontSize: 20, mt: 0.25 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ color: '#93000a', fontWeight: 600 }}>
                  {errorMessage(login.error)}
                </Typography>
                {login.error instanceof ApiError && login.error.status === 401 && (
                  <Typography variant="caption" component="p" sx={{ color: '#93000a', opacity: 0.85, fontWeight: 400 }}>
                    {ar.auth.loginErrorHint}
                  </Typography>
                )}
              </Box>
              <IconButton size="small" aria-label={ar.common.close} onClick={() => login.reset()} sx={{ color: '#93000a' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
          <Box component="form" onSubmit={onSubmit} noValidate>
            <Stack spacing={2.25}>
              <TextField
                label={ar.auth.username}
                placeholder={ar.auth.usernamePlaceholder}
                autoComplete="username"
                autoFocus
                fullWidth
                sx={inputSx}
                slotProps={{ htmlInput: { dir: 'ltr' }, input: { startAdornment: fieldIcon(<BadgeIcon />) } }}
                error={!!formState.errors.username}
                helperText={formState.errors.username?.message}
                {...register('username')}
              />
              <TextField
                label={ar.auth.password}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                fullWidth
                sx={inputSx}
                slotProps={{
                  input: {
                    startAdornment: fieldIcon(<LockIcon />),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          edge="end"
                          aria-label={showPassword ? ar.auth.hidePassword : ar.auth.showPassword}
                          onClick={() => setShowPassword((current) => !current)}
                          sx={{ color: 'text.secondary' }}
                        >
                          {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                error={!!formState.errors.password}
                helperText={formState.errors.password?.message}
                {...register('password')}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={login.isPending}
                endIcon={<LoginIcon />}
                sx={{ mt: 0.5, '& .MuiButton-endIcon > *:nth-of-type(1)': { fontSize: 20 } }}
              >
                {login.isPending ? ar.auth.loggingIn : ar.auth.login}
              </Button>
            </Stack>
          </Box>
          <Box
            sx={{
              mt: 3,
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'surface.low',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: 'text.secondary',
            }}
          >
            <GavelIcon sx={{ fontSize: 18 }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {ar.auth.restricted}
            </Typography>
          </Box>
        </Paper>

        <Typography
          variant="caption"
          component="p"
          sx={{ mt: 2.5, px: 2, textAlign: 'center', color: 'text.secondary', fontWeight: 400, lineHeight: '20px' }}
        >
          {ar.auth.legalNotice}
        </Typography>
      </Box>
    </Box>
  );
}
