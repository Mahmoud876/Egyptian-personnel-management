import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { ApiError, errorMessage } from '../../../shared/api/client';
import { formatDate, formatDateTime, formatDateTimeNumeric, formatFileSize, formatNumber } from '../../../shared/format';
import { ar } from '../../../shared/i18n/ar';
import { usePermission } from '../../../shared/permissions/permissions';
import { KeyValue, Mono } from '../../../shared/ui/DataText';
import { NotFoundPage } from '../../../shared/ui/ErrorPages';
import {
  ArrowBackIcon,
  AssignmentIcon,
  AttachFileIcon,
  DownloadIcon,
  FingerprintIcon,
  GavelIcon,
  InfoIcon,
  LockIcon,
  LockOpenIcon,
  PrintIcon,
  RefreshIcon,
  VerifiedUserIcon,
  WarningIcon,
} from '../../../shared/ui/icons';
import { useNotify } from '../../../shared/ui/notifications';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { SectionCard } from '../../../shared/ui/SectionCard';
import { ErrorAlert, LoadingState } from '../../../shared/ui/states';
import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { MONO_FONT, tokens, tones } from '../../../shared/ui/tokens';
import {
  type Recruit,
  documentDownloadUrl,
  useGovernorates,
  useQualifications,
  useRecruitDocuments,
  useRecruitQuery,
  useSaveRecruit,
  useUploadDocument,
} from '../api';
import { conscriptsPaths } from '../paths';
import { SERVICE_MONTHS, addMonths, batchLabel, enlistmentEnd } from '../rules';
import { NationalIdLookup } from './NationalIdLookup';

const DOCUMENT_TYPES = '.pdf,.png,.jpg,.jpeg';

function useQualificationName() {
  const qualifications = useQualifications();
  return (typeId: number) =>
    qualifications.data?.find((row) => row.id === typeId)?.name_ar ?? ar.conscripts.qualifications[typeId] ?? String(typeId);
}

function ageInYears(birthDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const today = new Date();
  let age = today.getFullYear() - Number(match[1]);
  const beforeBirthday =
    today.getMonth() + 1 < Number(match[2]) || (today.getMonth() + 1 === Number(match[2]) && today.getDate() < Number(match[3]));
  if (beforeBirthday) age -= 1;
  return age;
}

export function RecruitStatusBadge({ recruit }: { recruit: Recruit }) {
  return recruit.is_locked ? (
    <StatusBadge tone="success" icon={<LockIcon />}>
      {ar.conscripts.status.complete}
    </StatusBadge>
  ) : (
    <StatusBadge tone="warning" icon={<LockOpenIcon />}>
      {ar.conscripts.status.incomplete}
    </StatusBadge>
  );
}

/** Qualification -> mandatory service duration, with the recruit's own row highlighted. */
function ServiceRulesCard({ highlight }: { highlight?: number }) {
  const qualificationName = useQualificationName();
  return (
    <SectionCard icon={<GavelIcon />} title={ar.conscripts.rules.title} sx={{ bgcolor: 'surface.low' }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
        {ar.conscripts.rules.body}
      </Typography>
      <Stack spacing={0.75}>
        {Object.entries(SERVICE_MONTHS)
          .sort(([, a], [, b]) => a - b)
          .map(([id, months]) => {
            const current = Number(id) === highlight;
            return (
              <Box
                key={id}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 1,
                  bgcolor: current ? 'primary.main' : 'background.paper',
                  color: current ? '#ffffff' : 'text.primary',
                  border: 1,
                  borderColor: current ? 'primary.main' : 'divider',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: current ? 600 : 400 }}>
                  {qualificationName(Number(id))}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  <Mono>{months}</Mono> {ar.conscripts.rules.months}
                </Typography>
              </Box>
            );
          })}
      </Stack>
    </SectionCard>
  );
}

// --- lookup screen -------------------------------------------------------------------------

export function EntryLookupPage() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title={ar.conscripts.entry.title} subtitle={ar.conscripts.entry.subtitle} />
      <Stack spacing={3}>
        <NationalIdLookup
          title={ar.conscripts.lookup.title}
          subtitle={ar.conscripts.lookup.subtitle}
          onFound={(recruit) => void navigate(conscriptsPaths.entryFor(recruit.id))}
        />
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, alignItems: 'start' }}>
          <SectionCard icon={<InfoIcon />} title={ar.conscripts.entry.stepsTitle}>
            <Stack component="ol" spacing={1.5} sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {ar.conscripts.entry.steps.map((step, index) => (
                <Box component="li" key={step} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                  <Box
                    aria-hidden
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: 0.5,
                      bgcolor: 'surface.low',
                      color: 'primary.main',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                      fontFamily: MONO_FONT,
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Typography>{step}</Typography>
                </Box>
              ))}
            </Stack>
          </SectionCard>
          <ServiceRulesCard />
        </Box>
      </Stack>
    </>
  );
}

// --- recruit profile -----------------------------------------------------------------------

function ImportedDataCard({ recruit }: { recruit: Recruit }) {
  const governorates = useGovernorates();
  const qualificationName = useQualificationName();
  const governorate = governorates.data?.find((row) => row.code === recruit.gov_id)?.name_ar;
  const age = ageInYears(recruit.birth_date);
  return (
    <SectionCard
      icon={<FingerprintIcon />}
      title={ar.conscripts.entry.importedTitle}
      subtitle={ar.conscripts.entry.importedSubtitle}
      actions={
        <StatusBadge tone="neutral" icon={<LockIcon />}>
          {ar.conscripts.entry.readOnly}
        </StatusBadge>
      }
    >
      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', xl: 'repeat(3, 1fr)' } }}>
        <KeyValue label={ar.conscripts.fields.name} value={recruit.name} />
        <KeyValue label={ar.conscripts.fields.nationalId} value={recruit.national_id} mono />
        <KeyValue
          label={ar.conscripts.fields.birthDate}
          value={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <Mono>{formatDate(recruit.birth_date)}</Mono>
              {age !== null && (
                <StatusBadge tone="primary" dot={false}>
                  {ar.conscripts.entry.age(age)}
                </StatusBadge>
              )}
            </Box>
          }
        />
        <KeyValue label={ar.conscripts.fields.governorate} value={governorate ?? recruit.gov_id} />
        <KeyValue label={ar.conscripts.fields.policeStation} value={recruit.ps_name} />
        <KeyValue label={ar.conscripts.fields.qualification} value={qualificationName(recruit.type_id)} />
        <KeyValue
          label={ar.conscripts.batchAndYear}
          value={
            <>
              {batchLabel(recruit.batch_number)} / <Mono>{recruit.enlistment_year}</Mono>
            </>
          }
        />
        <KeyValue label={ar.conscripts.fields.sourceId} value={recruit.source_record_id} mono />
      </Box>
      <Typography
        variant="caption"
        component="p"
        sx={{ mt: 2.5, pt: 1.5, borderTop: 1, borderColor: 'divider', color: 'text.secondary', display: 'flex', gap: 0.75 }}
      >
        <InfoIcon sx={{ fontSize: 15 }} />
        {ar.conscripts.entry.importedNote}
      </Typography>
    </SectionCard>
  );
}

type ServiceValues = { name: string; police_number: string; start: string; end: string };

function ServiceForm({ recruit, edit }: { recruit: Recruit; edit: boolean }) {
  const notify = useNotify();
  const save = useSaveRecruit(recruit.id);
  const schema = useMemo(
    () =>
      z.object({
        name: edit
          ? z.string().trim().min(1, ar.validation.required).max(200, ar.validation.maxLength(200))
          : z.string(),
        police_number: z.string().trim().min(1, ar.validation.required).max(20, ar.validation.maxLength(20)),
        start: z.string().refine((value) => addMonths(value, 0) !== null, ar.conscripts.entry.invalidDate),
        end: z.string().refine((value) => addMonths(value, 0) !== null, ar.conscripts.entry.invalidDate),
      }).superRefine((values, context) => {
        const expected = enlistmentEnd(values.start, recruit.type_id);
        if (!expected || values.end !== expected) {
          context.addIssue({ code: 'custom', path: ['end'], message: expected
            ? ar.conscripts.entry.expectedEnd(formatDate(expected))
            : ar.conscripts.entry.unknownDuration });
        }
      }),
    [edit, recruit.type_id],
  );
  const defaults = (source: Recruit): ServiceValues => ({
    name: source.name,
    police_number: source.police_number ?? '',
    start: source.enlistment_start_date ?? source.suggested_start_date ?? '',
    end: source.enlistment_end_date ?? source.suggested_end_date ?? '',
  });
  const { register, handleSubmit, formState, watch, reset } = useForm<ServiceValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(recruit),
  });

  const start = watch('start');
  const expectedEnd = start ? enlistmentEnd(start, recruit.type_id) : null;

  const onSubmit = handleSubmit((values) => {
    const base = {
      police_number: values.police_number.trim(),
      enlistment_start_date: values.start,
      enlistment_end_date: values.end,
      revision: recruit.revision,
    };
    const name = values.name.trim();
    save.mutate(
      edit ? { edit: true, body: name !== recruit.name ? { ...base, name } : base } : { edit: false, body: base },
      {
        onSuccess: (saved) => {
          notify(edit ? ar.conscripts.entry.updated : ar.conscripts.entry.completed(saved.barcode ?? ''));
          reset(defaults(saved));
        },
      },
    );
  });

  return (
    <SectionCard
      icon={<AssignmentIcon />}
      iconTone="solid"
      title={ar.conscripts.entry.serviceTitle}
      subtitle={ar.conscripts.entry.serviceSubtitle}
      actions={
        edit ? (
          <StatusBadge tone="warning" icon={<WarningIcon />}>
            {ar.conscripts.entry.adminEdit}
          </StatusBadge>
        ) : (
          <StatusBadge tone="error" icon={<InfoIcon />}>
            {ar.conscripts.entry.requiredBadge}
          </StatusBadge>
        )
      }
    >
      <Box component="form" onSubmit={onSubmit} noValidate>
        <Stack spacing={2.5}>
          {edit && (
            <TextField
              label={ar.conscripts.fields.name}
              required
              error={!!formState.errors.name}
              helperText={formState.errors.name?.message ?? ar.conscripts.entry.nameEditHint}
              {...register('name')}
            />
          )}
          <TextField
            label={ar.conscripts.fields.policeNumber}
            required
            placeholder={ar.conscripts.entry.policePlaceholder}
            error={!!formState.errors.police_number}
            helperText={formState.errors.police_number?.message ?? ar.conscripts.entry.policeHint}
            slotProps={{ htmlInput: { dir: 'ltr', maxLength: 20 } }}
            {...register('police_number')}
          />
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <TextField
              type="date"
              label={ar.conscripts.fields.startDate}
              required
              error={!!formState.errors.start}
              helperText={
                formState.errors.start?.message ??
                ar.conscripts.entry.suggested(formatDate(recruit.suggested_start_date ?? null))
              }
              slotProps={{ htmlInput: { dir: 'ltr' } }}
              {...register('start')}
            />
            <TextField
              type="date"
              label={ar.conscripts.fields.endDate}
              required
              error={!!formState.errors.end}
              helperText={formState.errors.end?.message ?? (expectedEnd
                ? ar.conscripts.entry.expectedEnd(formatDate(expectedEnd))
                : ar.conscripts.entry.unknownDuration)}
              slotProps={{ htmlInput: { dir: 'ltr' } }}
              {...register('end')}
            />
          </Box>
          <Typography variant="body2" color="text.secondary">{ar.conscripts.entry.independentDates}</Typography>

          <Box
            sx={{
              p: 2,
              borderRadius: 1,
              bgcolor: 'surface.low',
              border: 1,
              borderColor: 'divider',
              display: 'flex',
              gap: 2,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ display: 'flex', gap: 1.25, flex: 1, minWidth: 260 }}>
              <WarningIcon sx={{ color: tones.warning.fg, fontSize: 20, mt: 0.25 }} />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {ar.conscripts.entry.lockTitle}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {edit ? ar.conscripts.entry.editBody : ar.conscripts.entry.lockBody}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => {
                  reset(defaults(recruit));
                  save.reset();
                }}
                disabled={save.isPending}
              >
                {ar.common.reset}
              </Button>
              <Button type="submit" variant="contained" startIcon={<VerifiedUserIcon />} disabled={save.isPending}>
                {save.isPending ? ar.common.saving : edit ? ar.conscripts.entry.saveEdit : ar.conscripts.entry.save}
              </Button>
            </Box>
          </Box>
          {save.isError && <Alert severity="error">{errorMessage(save.error)}</Alert>}
        </Stack>
      </Box>
    </SectionCard>
  );
}

function ServiceReadOnly({ recruit }: { recruit: Recruit }) {
  return (
    <SectionCard icon={<AssignmentIcon />} iconTone="solid" title={ar.conscripts.entry.serviceTitle}>
      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, mb: 2 }}>
        <KeyValue label={ar.conscripts.fields.policeNumber} value={recruit.police_number} mono />
        <KeyValue label={ar.conscripts.fields.startDate} value={formatDate(recruit.enlistment_start_date)} mono />
        <KeyValue label={ar.conscripts.fields.endDate} value={formatDate(recruit.enlistment_end_date)} mono />
      </Box>
      <Alert severity="info" icon={<LockIcon sx={{ color: 'primary.main' }} />}>
        {ar.conscripts.entry.lockedNotice}
      </Alert>
    </SectionCard>
  );
}

function RecordStatusCard({ recruit }: { recruit: Recruit }) {
  const canPrint = usePermission('conscripts.label.print');
  const canImports = usePermission('conscripts.import.upload');
  const tone = recruit.is_locked ? tones.success : tones.warning;
  return (
    <SectionCard icon={<VerifiedUserIcon />} title={ar.conscripts.entry.statusTitle}>
      <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: tone.bg, color: tone.fg, display: 'flex', gap: 1.25, mb: 2 }}>
        {recruit.is_locked ? <LockIcon sx={{ fontSize: 20 }} /> : <LockOpenIcon sx={{ fontSize: 20 }} />}
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {recruit.is_locked ? ar.conscripts.status.complete : ar.conscripts.status.incomplete}
          </Typography>
          <Typography variant="caption" component="p" sx={{ fontWeight: 400 }}>
            {recruit.is_locked ? ar.conscripts.entry.lockedHint : ar.conscripts.entry.unlockedHint}
          </Typography>
        </Box>
      </Box>
      <Stack spacing={1.5}>
        <KeyValue
          label={ar.conscripts.fields.barcode}
          value={recruit.barcode ?? ar.conscripts.entry.barcodePending}
          mono={recruit.barcode !== null}
        />
        <KeyValue label={ar.conscripts.entry.completedAt} value={recruit.completed_at ? formatDateTime(recruit.completed_at) : null} />
        <KeyValue label={ar.conscripts.entry.revision} value={formatNumber(recruit.revision)} mono />
      </Stack>
      {(canPrint && recruit.is_locked) || canImports ? (
        <Stack spacing={1} sx={{ mt: 2.5 }}>
          {canPrint && recruit.is_locked && (
            <Button
              component={Link}
              to={conscriptsPaths.labelFor(recruit.id)}
              variant="contained"
              startIcon={<PrintIcon />}
              fullWidth
            >
              {ar.conscripts.labels.print}
            </Button>
          )}
          {canImports && (
            <Button component={Link} to={conscriptsPaths.importReport(recruit.import_job_id)} variant="outlined" fullWidth>
              {ar.conscripts.entry.sourceFile}
            </Button>
          )}
        </Stack>
      ) : null}
    </SectionCard>
  );
}

function DocumentsCard({ recruit }: { recruit: Recruit }) {
  const canUpload = usePermission('conscripts.edit_locked');
  const documents = useRecruitDocuments(recruit.id);
  const upload = useUploadDocument(recruit.id);
  const notify = useNotify();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <SectionCard
      icon={<AttachFileIcon />}
      title={ar.conscripts.documents.title}
      actions={
        documents.data && (
          <StatusBadge tone="primary" dot={false}>
            {formatNumber(documents.data.length)}
          </StatusBadge>
        )
      }
    >
      {documents.isError && <ErrorAlert error={documents.error} onRetry={() => void documents.refetch()} />}
      {documents.isPending ? (
        <LoadingState />
      ) : (
        documents.data && (
          <Stack spacing={1}>
            {documents.data.length === 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }}>
                {ar.conscripts.documents.empty}
              </Typography>
            )}
            {documents.data.map((document) => (
              <Box
                key={document.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <AttachFileIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 500 }} title={document.original_filename}>
                    {document.original_filename}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                    <Mono>{formatFileSize(document.file_size_bytes)}</Mono> • <Mono>{formatDateTimeNumeric(document.created_at)}</Mono>
                  </Typography>
                </Box>
                <Tooltip title={ar.common.download}>
                  <IconButton
                    size="small"
                    component="a"
                    href={documentDownloadUrl(recruit.id, document.id)}
                    download
                    aria-label={`${ar.common.download} ${document.original_filename}`}
                  >
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Stack>
        )
      )}
      {canUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept={DOCUMENT_TYPES}
            aria-label={ar.conscripts.documents.attach}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file, { onSuccess: () => notify(ar.conscripts.documents.uploaded) });
              event.target.value = '';
            }}
          />
          <Button
            variant="outlined"
            fullWidth
            startIcon={<AttachFileIcon />}
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
            sx={{ mt: 1.5 }}
          >
            {upload.isPending ? ar.conscripts.documents.uploading : ar.conscripts.documents.attach}
          </Button>
          {upload.isError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {errorMessage(upload.error)}
            </Alert>
          )}
        </>
      )}
    </SectionCard>
  );
}

function RecruitProfile({ id }: { id: string }) {
  const navigate = useNavigate();
  const recruit = useRecruitQuery(id);
  const canEditLocked = usePermission('conscripts.edit_locked');

  if (recruit.isPending) return <LoadingState />;
  if (recruit.isError) {
    if (recruit.error instanceof ApiError && [404, 422].includes(recruit.error.status)) return <NotFoundPage />;
    return <ErrorAlert error={recruit.error} onRetry={() => void recruit.refetch()} />;
  }

  const data = recruit.data;
  const editable = !data.is_locked || canEditLocked;
  return (
    <>
      <PageHeader
        title={ar.conscripts.entry.title}
        crumbs={[data.name]}
        meta={<RecruitStatusBadge recruit={data} />}
        subtitle={
          <>
            {data.name} — {ar.conscripts.fields.nationalId}: <Mono>{data.national_id}</Mono>
          </>
        }
        actions={
          <Button component={Link} to={conscriptsPaths.search} variant="outlined" startIcon={<ArrowBackIcon />}>
            {ar.conscripts.entry.backToSearch}
          </Button>
        }
      />
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          alignItems: 'start',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' },
        }}
      >
        <Stack spacing={3} sx={{ minWidth: 0 }}>
          <NationalIdLookup
            title={ar.conscripts.lookup.title}
            subtitle={ar.conscripts.lookup.subtitle}
            onFound={(found) => void navigate(conscriptsPaths.entryFor(found.id))}
          />
          <ImportedDataCard recruit={data} />
          {editable ? (
            <ServiceForm key={`${data.id}-${data.revision}`} recruit={data} edit={data.is_locked} />
          ) : (
            <ServiceReadOnly recruit={data} />
          )}
        </Stack>
        <Stack spacing={3}>
          <RecordStatusCard recruit={data} />
          <DocumentsCard recruit={data} />
          <ServiceRulesCard highlight={data.type_id} />
        </Stack>
      </Box>
    </>
  );
}

export function RecruitEntryPage() {
  const { recruitId } = useParams();
  return recruitId ? <RecruitProfile key={recruitId} id={recruitId} /> : <NotFoundPage />;
}

/** Shown in the label screen header and elsewhere: the recruit's name on a navy tile. */
export function RecruitTile({ recruit }: { recruit: Recruit }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        borderRadius: 1,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 44,
          height: 44,
          borderRadius: 1,
          bgcolor: tokens.secondaryContainer,
          color: 'primary.main',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <FingerprintIcon />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>{recruit.name}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 400 }}>
          {ar.conscripts.batch}: {batchLabel(recruit.batch_number)} / <Mono>{recruit.enlistment_year}</Mono>
          {recruit.police_number && (
            <>
              {' • '}
              {ar.conscripts.fields.policeNumber}: <Mono>{recruit.police_number}</Mono>
            </>
          )}
        </Typography>
      </Box>
    </Box>
  );
}
