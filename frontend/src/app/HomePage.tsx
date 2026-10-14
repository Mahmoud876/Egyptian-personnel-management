import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMe } from '../shared/auth/auth';
import { ar } from '../shared/i18n/ar';
import { PageHeader } from '../shared/ui/PageHeader';
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
  const { data: me } = useMe();
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
    <>
      <PageHeader title={ar.home.welcome(me?.full_name ?? '')} subtitle={ar.home.intro} />
      <Paper variant="outlined" sx={{ p: 3, maxWidth: 480 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
          {ar.health.heading}
        </Typography>
        <StatusRow label={ar.health.server} status={server} />
        <StatusRow label={ar.health.database} status={database} />
      </Paper>
    </>
  );
}
