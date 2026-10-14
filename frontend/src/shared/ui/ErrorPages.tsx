import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ar } from '../i18n/ar';
import { BuildIcon, LockIcon, SearchIcon } from './icons';
import { PageHeader } from './PageHeader';
import { type Tone, tones } from './tokens';

function MessagePage({
  icon,
  tone,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  tone: Tone;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Box sx={{ py: 10, px: 2, textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 1.5 }}>
      <Box
        aria-hidden
        sx={{
          width: 72,
          height: 72,
          borderRadius: 2,
          display: 'grid',
          placeItems: 'center',
          bgcolor: tones[tone].bg,
          color: tones[tone].fg,
          mb: 1,
          '& svg': { fontSize: 36 },
        }}
      >
        {icon}
      </Box>
      <Typography variant="h5" component="h1">
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
      tone="error"
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
      tone="primary"
      title={ar.errors.notFoundTitle}
      body={ar.errors.notFoundBody}
      action={<HomeButton />}
    />
  );
}

/** Placeholder for screens outside the current scope. */
export function UnderDevelopment({ title }: { title: string }) {
  return (
    <Box>
      <PageHeader title={title} />
      <MessagePage icon={<BuildIcon />} tone="warning" title={ar.placeholder.title} body={ar.placeholder.body} />
    </Box>
  );
}
