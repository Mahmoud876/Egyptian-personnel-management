import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { errorMessage } from '../api/client';
import { ar } from '../i18n/ar';

export function FullPageLoader() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress aria-label={ar.common.loading} />
    </Box>
  );
}

export function FullPageError({ onRetry }: { onRetry: () => void }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={onRetry}>
            {ar.common.retry}
          </Button>
        }
      >
        {ar.common.networkError}
      </Alert>
    </Box>
  );
}

export function LoadingState() {
  return (
    <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
      <CircularProgress size={32} aria-label={ar.common.loading} />
    </Box>
  );
}

export function ErrorAlert({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert
      severity="error"
      action={
        onRetry && (
          <Button color="inherit" size="small" onClick={onRetry}>
            {ar.common.retry}
          </Button>
        )
      }
    >
      {errorMessage(error)}
    </Alert>
  );
}

export function EmptyState({ text = ar.common.noData }: { text?: string }) {
  return (
    <Typography sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>{text}</Typography>
  );
}
