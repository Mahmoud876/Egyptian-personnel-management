import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError, errorMessage } from '../../../shared/api/client';
import { ar } from '../../../shared/i18n/ar';
import { LabelPreview } from './LabelPreview';
import { printLabel } from './printing';
import { Mono } from '../../../shared/ui/DataText';
import { NotFoundPage } from '../../../shared/ui/ErrorPages';
import { ArrowBackIcon, EditNoteIcon, InfoIcon, PrintIcon, QrCode2Icon, TuneIcon } from '../../../shared/ui/icons';
import { useNotify } from '../../../shared/ui/notifications';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { SectionCard } from '../../../shared/ui/SectionCard';
import { ErrorAlert, LoadingState } from '../../../shared/ui/states';
import { tokens } from '../../../shared/ui/tokens';
import { type Recruit, useRecruitQuery } from '../api';
import { RecruitStatusBadge, RecruitTile } from '../entry/EntryPage';
import { NationalIdLookup } from '../entry/NationalIdLookup';
import { conscriptsPaths } from '../paths';


function PrintPanel({ recruit }: { recruit: Recruit }) {
  const notify = useNotify();
  const print = useMutation({ mutationFn: () => printLabel(recruit.id) });

  const rows: [string, ReactNode][] = [
    [ar.conscripts.labels.size, <Mono key="size">50 × 25 mm</Mono>],
    [ar.conscripts.labels.symbology, <Mono key="code">Code 128</Mono>],
    [ar.conscripts.labels.margins, ar.conscripts.labels.noMargins],
  ];

  return (
    <SectionCard
      icon={<TuneIcon />}
      iconTone="solid"
      title={ar.conscripts.labels.settingsTitle}
      subtitle={ar.conscripts.labels.settingsSubtitle}
    >
      <Stack spacing={1} sx={{ mb: 2 }}>
        {rows.map(([label, value]) => (
          <Box
            key={label}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              px: 1.5,
              py: 1,
              borderRadius: 1,
              bgcolor: 'surface.low',
            }}
          >
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {label}
            </Typography>
            <Typography variant="body2" component="div" sx={{ fontWeight: 600 }}>
              {value}
            </Typography>
          </Box>
        ))}
        <Box sx={{ px: 1.5, py: 1, borderRadius: 1, bgcolor: 'surface.low' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {ar.conscripts.labels.content}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {ar.conscripts.labels.contentValue}
          </Typography>
        </Box>
      </Stack>
      {print.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage(print.error)}
        </Alert>
      )}
      <Button
        variant="contained"
        size="large"
        fullWidth
        startIcon={<PrintIcon />}
        disabled={print.isPending}
        onClick={() => print.mutate(undefined, { onSuccess: () => notify(ar.conscripts.labels.sent) })}
        sx={{ minHeight: 52, fontSize: 16 }}
      >
        {print.isPending ? ar.conscripts.labels.preparing : ar.conscripts.labels.printNow}
      </Button>
      <Button
        component={Link}
        to={conscriptsPaths.entryFor(recruit.id)}
        variant="outlined"
        fullWidth
        startIcon={<EditNoteIcon />}
        sx={{ mt: 1 }}
      >
        {ar.conscripts.labels.openRecord}
      </Button>
      <Typography
        variant="caption"
        component="p"
        sx={{ mt: 2, color: 'text.secondary', fontWeight: 400, display: 'flex', gap: 0.75 }}
      >
        <InfoIcon sx={{ fontSize: 15, mt: 0.125 }} />
        {ar.conscripts.labels.auditNote}
      </Typography>
    </SectionCard>
  );
}

function LabelForRecruit({ id }: { id: string }) {
  const recruit = useRecruitQuery(id);

  if (recruit.isPending) return <LoadingState />;
  if (recruit.isError) {
    if (recruit.error instanceof ApiError && [404, 422].includes(recruit.error.status)) return <NotFoundPage />;
    return <ErrorAlert error={recruit.error} onRetry={() => void recruit.refetch()} />;
  }

  const data = recruit.data;
  return (
    <>
      <PageHeader
        title={ar.conscripts.labels.title}
        crumbs={[data.name]}
        meta={<RecruitStatusBadge recruit={data} />}
        subtitle={ar.conscripts.labels.subtitle}
        actions={
          <Button component={Link} to={conscriptsPaths.labels} variant="outlined" startIcon={<ArrowBackIcon />}>
            {ar.conscripts.labels.another}
          </Button>
        }
      />
      {!data.is_locked || !data.barcode ? (
        <Stack spacing={2}>
          <RecruitTile recruit={data} />
          <Alert
            severity="warning"
            action={
              <Button component={Link} to={conscriptsPaths.entryFor(data.id)} color="inherit" size="small">
                {ar.conscripts.labels.completeFirst}
              </Button>
            }
          >
            {ar.conscripts.labels.incomplete}
          </Alert>
        </Stack>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 3,
            alignItems: 'start',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 380px' },
          }}
        >
          <Stack spacing={3} sx={{ minWidth: 0 }}>
            <RecruitTile recruit={data} />
            <SectionCard icon={<QrCode2Icon />} title={ar.conscripts.labels.previewTitle}>
              <LabelPreview recruit={data} />
            </SectionCard>
            <Alert severity="info" icon={<InfoIcon sx={{ color: tokens.primary }} />}>
              {ar.conscripts.labels.guidance}
              <Typography variant="body2" sx={{ mt: 1 }}>{ar.conscripts.labels.verifyScan}</Typography>
            </Alert>
          </Stack>
          <PrintPanel recruit={data} />
        </Box>
      )}
    </>
  );
}

export function LabelLookupPage() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title={ar.conscripts.labels.title} subtitle={ar.conscripts.labels.subtitle} />
      <Stack spacing={3}>
        <NationalIdLookup
          title={ar.conscripts.labels.lookupTitle}
          subtitle={ar.conscripts.labels.lookupSubtitle}
          onFound={(recruit) => void navigate(conscriptsPaths.labelFor(recruit.id))}
          allowIdentifiers
        />
        <Alert severity="info" icon={<InfoIcon sx={{ color: tokens.primary }} />}>
          {ar.conscripts.labels.lookupNote}
        </Alert>
      </Stack>
    </>
  );
}

export function LabelPage() {
  const { recruitId } = useParams();
  return recruitId ? <LabelForRecruit key={recruitId} id={recruitId} /> : <NotFoundPage />;
}
