import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ar } from '../i18n/ar';
import { BuildIcon, LockIcon, SearchIcon } from './icons';

function MessagePage({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <Box sx={{ py: 10, px: 2, textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 1.5 }}>
      <Box sx={{ color: 'primary.main', '& svg': { fontSize: 56 } }}>{icon}</Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography sx={{ color: 'text.secondary', maxWidth: 480 }}>{body}</Typography>
      {action}
    </Box>
  );
}

function HomeButton() {
  return (
    <Button component={Link} to="/" variant="contained" sx={{ mt: 1 }}>
      {ar.errors.backHome}
    </Button>
  );
}

export function ForbiddenPage() {
  return (
    <MessagePage
      icon={<LockIcon />}
      title={ar.errors.forbiddenTitle}
      body={ar.errors.forbiddenBody}
      action={<HomeButton />}
    />
  );
}

export function NotFoundPage() {
  return (
    <MessagePage
      icon={<SearchIcon />}
      title={ar.errors.notFoundTitle}
      body={ar.errors.notFoundBody}
      action={<HomeButton />}
    />
  );
}

/** Placeholder for screens built in a later phase. */
export function UnderDevelopment({ title }: { title: string }) {
  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        {title}
      </Typography>
      <MessagePage icon={<BuildIcon />} title={ar.placeholder.title} body={ar.placeholder.body} />
    </Box>
  );
}
