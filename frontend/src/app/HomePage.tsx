import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ar } from '../shared/i18n/ar';
import { useHealthQuery } from './useHealthQuery';

type Status = 'checking' | 'connected' | 'disconnected';

const statusChip = {
  checking: { label: ar.health.checking, color: 'default' },
  connected: { label: ar.health.connected, color: 'success' },
  disconnected: { label: ar.health.disconnected, color: 'error' },
} as const;

function StatusRow({ label, status }: { label: string; status: Status }) {
  const chip = statusChip[status];
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', py: 1 }}>
      <Typography>{label}</Typography>
      <Chip size="small" label={chip.label} color={chip.color} />
    </Stack>
  );
}

export function HomePage() {
  const health = useHealthQuery();

  let server: Status = 'checking';
  let database: Status = 'checking';
  if (health.data) {
    server = 'connected';
    database = health.data.database.reachable ? 'connected' : 'disconnected';
  } else if (health.isError) {
    server = 'disconnected';
    database = 'disconnected';
  }

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={1} sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          {ar.app.title}
        </Typography>
        <Typography sx={{ color: 'text.secondary' }}>{ar.app.subtitle}</Typography>
      </Stack>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
          {ar.health.heading}
        </Typography>
        <StatusRow label={ar.health.server} status={server} />
        <StatusRow label={ar.health.database} status={database} />
      </Paper>
    </Container>
  );
}
