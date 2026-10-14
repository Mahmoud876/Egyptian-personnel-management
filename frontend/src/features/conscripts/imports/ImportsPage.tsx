import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { type DragEvent, type FormEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../../shared/api/client';
import { formatDate, formatDateTimeNumeric, formatFileSize, formatNumber } from '../../../shared/format';
import { ar } from '../../../shared/i18n/ar';
import { Mono } from '../../../shared/ui/DataText';
import {
  CloudUploadIcon,
  DatasetIcon,
  DeleteIcon,
  DescriptionIcon,
  FolderZipIcon,
  HistoryIcon,
  InfoIcon,
  LockIcon,
  PlaylistAddCheckIcon,
  VerifiedUserIcon,
  VisibilityIcon,
} from '../../../shared/ui/icons';
import { useNotify } from '../../../shared/ui/notifications';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { SectionCard } from '../../../shared/ui/SectionCard';
import { EmptyState, ErrorAlert, LoadingState } from '../../../shared/ui/states';
import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { TablePager } from '../../../shared/ui/TablePager';
import { tokens, tones } from '../../../shared/ui/tokens';
import { type ImportJob, useImportsQuery, useUploadImport } from '../api';
import { BatchYear } from '../BatchYear';
import { conscriptsPaths } from '../paths';
import { BATCHES, batchLabel, batchStartDate, importStatus } from '../rules';

const ACCEPTED_EXTENSIONS = ['.accdb', '.mdb', '.xlsx', '.xls', '.csv'] as const;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const extensionOf = (name: string) => name.slice(name.lastIndexOf('.')).toLowerCase();

type Errors = { year?: string | undefined; file?: string | undefined };

function UploadForm() {
  const navigate = useNavigate();
  const notify = useNotify();
  const upload = useUploadImport();
  const inputRef = useRef<HTMLInputElement>(null);
  const [batch, setBatch] = useState(1);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const yearNumber = Number(year);
  const yearValid = Number.isInteger(yearNumber) && yearNumber >= MIN_YEAR && yearNumber <= MAX_YEAR;

  const pick = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extensionOf(candidate.name))) {
      setErrors((current) => ({ ...current, file: ar.conscripts.upload.badExtension }));
      return;
    }
    setFile(candidate);
    setErrors((current) => ({ ...current, file: undefined }));
    upload.reset();
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0]);
  };

  const clear = () => {
    setFile(null);
    setBatch(1);
    setYear(String(new Date().getFullYear()));
    setErrors({});
    upload.reset();
    if (inputRef.current) inputRef.current.value = '';
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Errors = {};
    if (!yearValid) found.year = ar.validation.numberRange(MIN_YEAR, MAX_YEAR);
    if (!file) found.file = ar.conscripts.upload.fileRequired;
    setErrors(found);
    if (found.year || found.file || !file) return;
    upload.mutate(
      { file, batch_number: batch, enlistment_year: yearNumber },
      {
        onSuccess: (job) => {
          notify(ar.conscripts.upload.started);
          void navigate(conscriptsPaths.importReport(job.id));
        },
      },
    );
  };

  return (
    <SectionCard
      icon={<CloudUploadIcon />}
      iconTone="solid"
      title={ar.conscripts.upload.formTitle}
      subtitle={ar.conscripts.upload.formSubtitle}
      actions={
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1,
            py: 0.5,
            borderRadius: 0.5,
            bgcolor: 'surface.high',
            border: 1,
            borderColor: 'outline.variant',
            color: tokens.onSurfaceVariant,
          }}
        >
          <DatasetIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="caption">{ar.conscripts.upload.formats}</Typography>
        </Box>
      }
    >
      <Box component="form" onSubmit={submit} noValidate>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, mb: 3 }}>
          <TextField
            select
            required
            label={ar.conscripts.batch}
            value={String(batch)}
            onChange={(event) => setBatch(Number(event.target.value))}
          >
            {BATCHES.map((value) => (
              <MenuItem key={value} value={String(value)}>
                {batchLabel(value)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            required
            label={ar.conscripts.enlistmentYear}
            value={year}
            onChange={(event) => setYear(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            error={!!errors.year}
            helperText={errors.year}
            slotProps={{ htmlInput: { dir: 'ltr', inputMode: 'numeric' } }}
          />
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="subtitle2" component="span">
                {ar.conscripts.startDate}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
              >
                <LockIcon sx={{ fontSize: 13 }} />
                {ar.conscripts.computed}
              </Typography>
            </Box>
            <Box
              sx={{
                height: 36,
                px: 1.5,
                borderRadius: 1,
                bgcolor: 'surface.high',
                border: 1,
                borderColor: 'outline.variant',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Mono sx={{ fontWeight: 600 }}>{yearValid ? formatDate(batchStartDate(yearNumber, batch)) : '—'}</Mono>
              <InfoIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            </Box>
          </Box>
        </Box>

        <Box
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          sx={{
            p: { xs: 3, md: 4 },
            border: 2,
            borderStyle: 'dashed',
            borderColor: errors.file ? tones.error.fg : dragging ? 'primary.main' : 'outline.variant',
            borderRadius: 1.5,
            bgcolor: dragging ? 'surface.low' : 'surface.main',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            transition: 'background-color 120ms, border-color 120ms',
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: tokens.secondaryContainer,
              color: 'primary.main',
              display: 'grid',
              placeItems: 'center',
              mb: 0.5,
            }}
          >
            <FolderZipIcon sx={{ fontSize: 30 }} />
          </Box>
          <Typography variant="subtitle1">{ar.conscripts.upload.dropTitle}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography sx={{ color: 'text.secondary' }}>{ar.conscripts.upload.supported}</Typography>
            {ACCEPTED_EXTENSIONS.map((extension) => (
              <Box
                key={extension}
                component="span"
                sx={{ px: 0.75, borderRadius: 0.5, bgcolor: 'surface.high', color: 'primary.main', fontWeight: 600 }}
              >
                <Mono sx={{ fontSize: 13 }}>{extension}</Mono>
              </Box>
            ))}
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {ar.conscripts.upload.dropHint}
          </Typography>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept={ACCEPTED_EXTENSIONS.join(',')}
            aria-label={ar.conscripts.upload.browse}
            onChange={(event) => pick(event.target.files?.[0])}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<DescriptionIcon />}
            onClick={() => inputRef.current?.click()}
            sx={{ mt: 1, color: 'primary.main' }}
          >
            {ar.conscripts.upload.browse}
          </Button>
          {errors.file && (
            <Typography variant="body2" sx={{ color: tones.error.fg, mt: 0.5 }}>
              {errors.file}
            </Typography>
          )}
        </Box>

        {file && (
          <Box
            sx={{
              mt: 2,
              p: 2,
              borderRadius: 1,
              bgcolor: 'surface.low',
              border: 1,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1,
                bgcolor: 'primary.main',
                color: '#ffffff',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <DescriptionIcon />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Mono sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {file.name}
                </Mono>
                <StatusBadge tone="success" dot={false}>
                  {ar.conscripts.upload.ready}
                </StatusBadge>
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {ar.conscripts.upload.size}: <Mono>{formatFileSize(file.size)}</Mono>
              </Typography>
            </Box>
            <IconButton aria-label={ar.conscripts.upload.removeFile} onClick={() => setFile(null)}>
              <DeleteIcon />
            </IconButton>
          </Box>
        )}

        {upload.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorMessage(upload.error)}
          </Alert>
        )}

        <Box
          sx={{
            mt: 3,
            pt: 2,
            borderTop: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 0.75 }}
          >
            <InfoIcon sx={{ fontSize: 16 }} />
            {ar.conscripts.upload.footnote}
          </Typography>
          <Button variant="outlined" onClick={clear} disabled={upload.isPending}>
            {ar.conscripts.upload.clear}
          </Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={<PlaylistAddCheckIcon />}
            disabled={upload.isPending}
          >
            {upload.isPending ? ar.conscripts.upload.uploading : ar.conscripts.upload.submit}
          </Button>
        </Box>
      </Box>
    </SectionCard>
  );
}

function RecordCounts({ job }: { job: ImportJob }) {
  return (
    <Box>
      <Mono sx={{ fontWeight: 600 }}>{formatNumber(job.total_rows)}</Mono>
      <Typography variant="caption" component="div" sx={{ color: 'text.secondary', fontWeight: 400 }}>
        <Box component="span" sx={{ color: tones.success.fg }}>
          {ar.conscripts.validShort} <Mono>{formatNumber(job.valid_rows)}</Mono>
        </Box>
        {' • '}
        <Box component="span" sx={{ color: job.invalid_rows > 0 ? tones.error.fg : 'inherit' }}>
          {ar.conscripts.invalidShort} <Mono>{formatNumber(job.invalid_rows)}</Mono>
        </Box>
      </Typography>
    </Box>
  );
}

function ImportHistory() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const imports = useImportsQuery({ page: page + 1, page_size: pageSize });

  return (
    <SectionCard
      icon={<HistoryIcon />}
      title={ar.conscripts.history.title}
      subtitle={ar.conscripts.history.subtitle}
      flush
    >
      {imports.isError && (
        <Box sx={{ p: 2 }}>
          <ErrorAlert error={imports.error} onRetry={() => void imports.refetch()} />
        </Box>
      )}
      {imports.isPending ? (
        <LoadingState />
      ) : (
        imports.data && (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{ar.conscripts.history.file}</TableCell>
                    <TableCell>{ar.conscripts.batchAndYear}</TableCell>
                    <TableCell>{ar.conscripts.history.uploadedAt}</TableCell>
                    <TableCell>{ar.conscripts.history.records}</TableCell>
                    <TableCell>{ar.common.status}</TableCell>
                    <TableCell align="center">{ar.common.actions}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {imports.data.items.map((job) => {
                    const status = importStatus(job.status);
                    return (
                      <TableRow
                        key={job.id}
                        hover
                        sx={{
                          cursor: 'pointer',
                          ...(job.status === 'FAILED' && { bgcolor: `${tones.error.bg}66` }),
                        }}
                        onClick={() => void navigate(conscriptsPaths.importReport(job.id))}
                      >
                        <TableCell sx={{ maxWidth: 280 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DatasetIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
                            <Mono sx={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                              {job.original_filename}
                            </Mono>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <BatchYear batch={job.batch_number} year={job.enlistment_year} />
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>
                          <Mono>{formatDateTimeNumeric(job.created_at)}</Mono>
                        </TableCell>
                        <TableCell>
                          <RecordCounts job={job} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                        </TableCell>
                        <TableCell align="center">
                          <Button
                            size="small"
                            startIcon={<VisibilityIcon />}
                            onClick={(event) => {
                              event.stopPropagation();
                              void navigate(conscriptsPaths.importReport(job.id));
                            }}
                          >
                            {ar.conscripts.history.openReport}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            {imports.data.items.length === 0 && <EmptyState text={ar.conscripts.history.empty} />}
            <TablePager
              page={page}
              pageSize={pageSize}
              total={imports.data.total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(0);
              }}
              pageSizeOptions={[10, 20, 50]}
            />
          </>
        )
      )}
    </SectionCard>
  );
}

export function ImportsPage() {
  return (
    <>
      <PageHeader title={ar.conscripts.upload.title} subtitle={ar.conscripts.upload.subtitle} />
      <Stack spacing={3}>
        <Alert severity="info" icon={<VerifiedUserIcon sx={{ color: 'primary.main' }} />}>
          <Box component="strong" sx={{ color: 'primary.main' }}>
            {ar.conscripts.upload.noticeTitle}
          </Box>{' '}
          {ar.conscripts.upload.noticeBody}
        </Alert>
        <UploadForm />
        <ImportHistory />
      </Stack>
    </>
  );
}
