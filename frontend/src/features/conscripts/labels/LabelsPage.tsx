import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError, api, errorMessage, unwrap } from '../../../shared/api/client';
import { ar } from '../../../shared/i18n/ar';
import { Barcode } from '../../../shared/ui/Barcode';
import { Mono } from '../../../shared/ui/DataText';
import { NotFoundPage } from '../../../shared/ui/ErrorPages';
import { ArrowBackIcon, EditNoteIcon, InfoIcon, PrintIcon, QrCode2Icon, TuneIcon } from '../../../shared/ui/icons';
import { useNotify } from '../../../shared/ui/notifications';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { SectionCard } from '../../../shared/ui/SectionCard';
import { ErrorAlert, LoadingState } from '../../../shared/ui/states';
import { MONO_FONT, tokens } from '../../../shared/ui/tokens';
import { type Recruit, labelUrl, useRecruitQuery } from '../api';
import { RecruitStatusBadge, RecruitTile } from '../entry/EntryPage';
import { NationalIdLookup } from '../entry/NationalIdLookup';
import { conscriptsPaths } from '../paths';

/** On-screen preview scale: the 50 × 25 mm label drawn at 2.4× so it is readable. */
const PREVIEW_SCALE = 2.4;

async function findByBarcode(barcode: string): Promise<Recruit | null> {
  const page = await unwrap(api.GET('/api/v1/recruits', { params: { query: { barcode, page: 1, page_size: 1 } } }));
  return page.items[0] ?? null;
}

/**
 * Prints the backend's label page (the authoritative 50 × 25 mm layout, recorded in the audit log)
 * through a hidden frame, so the browser's print dialog shows only the label.
 */
async function printLabel(recruitId: string): Promise<void> {
  const response = await fetch(labelUrl(recruitId), { credentials: 'same-origin' });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: unknown; code?: unknown };
    throw new ApiError(
      response.status,
      typeof body.detail === 'string' ? body.detail : ar.common.errorGeneric,
      typeof body.code === 'string' ? body.code : 'error',
    );
  }
  const html = await response.text();
  await new Promise<void>((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;inset-inline-end:0;bottom:0';
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      resolve();
      // Some browsers return from print() before the dialog closes; remove the frame later.
      setTimeout(() => frame.remove(), 60_000);
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

function LabelPreview({ recruit }: { recruit: Recruit }) {
  const mm = (value: number) => `${value * PREVIEW_SCALE}mm`;
  return (
    <Box
      sx={{
        borderRadius: 1.5,
        bgcolor: 'surface.container',
        border: 1,
        borderColor: 'divider',
        p: { xs: 2, md: 4 },
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        overflowX: 'auto',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: mm(50), color: 'text.secondary' }} dir="ltr">
        {[0, 10, 20, 30, 40, 50].map((tick) => (
          <Typography key={tick} variant="caption" sx={{ fontFamily: MONO_FONT, fontSize: 11 }}>
            {tick}
          </Typography>
        ))}
      </Box>
      <Box
        role="img"
        aria-label={ar.conscripts.labels.previewLabel(recruit.name)}
        sx={{
          width: mm(50),
          height: mm(25),
          bgcolor: '#ffffff',
          borderRadius: 1,
          boxShadow: '0 1px 3px rgba(20, 28, 40, 0.12), 0 8px 24px rgba(20, 28, 40, 0.08)',
          p: mm(1),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          color: '#000000',
          fontFamily: 'Tahoma, Arial, sans-serif',
          flexShrink: 0,
        }}
      >
        <Box sx={{ '& svg': { display: 'block', maxWidth: mm(46), maxHeight: mm(15), width: 'auto', height: 'auto' } }}>
          {recruit.barcode && <Barcode value={recruit.barcode} moduleMm={0.25 * PREVIEW_SCALE} barHeightMm={8 * PREVIEW_SCALE} />}
        </Box>
        <Typography sx={{ fontSize: `${9 * PREVIEW_SCALE}pt`, lineHeight: 1.2, fontFamily: 'inherit', fontWeight: 600 }}>
          {recruit.name}
        </Typography>
        <Typography sx={{ fontSize: `${8 * PREVIEW_SCALE}pt`, lineHeight: 1.2, fontFamily: 'inherit' }}>
          {recruit.police_number} / {recruit.enlistment_year}
        </Typography>
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <span>
          {ar.conscripts.labels.size}: <Mono>50 × 25 mm</Mono>
        </span>
        <span>
          {ar.conscripts.labels.symbology}: <Mono>Code 128</Mono>
        </span>
        <span>
          {ar.conscripts.fields.barcode}: <Mono>{recruit.barcode}</Mono>
        </span>
      </Typography>
    </Box>
  );
}

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
          findByBarcode={findByBarcode}
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
