import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../../../shared/api/client';
import { formatDateTime, formatDateTimeNumeric, formatNumber } from '../../../shared/format';
import { ar } from '../../../shared/i18n/ar';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { Mono } from '../../../shared/ui/DataText';
import { NotFoundPage } from '../../../shared/ui/ErrorPages';
import {
  ArrowBackIcon,
  CancelIcon,
  CheckCircleIcon,
  DatasetIcon,
  DownloadIcon,
  ErrorIcon,
  FactCheckIcon,
  HourglassIcon,
  TaskAltIcon,
} from '../../../shared/ui/icons';
import { useNotify } from '../../../shared/ui/notifications';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { SectionCard } from '../../../shared/ui/SectionCard';
import { StatCard } from '../../../shared/ui/StatCard';
import { EmptyState, ErrorAlert, LoadingState } from '../../../shared/ui/states';
import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { TablePager } from '../../../shared/ui/TablePager';
import { tones } from '../../../shared/ui/tokens';
import {
  type ImportJob,
  type ImportRecord,
  type RowStatus,
  exportDownloadUrl,
  hasReport,
  isActiveImport,
  useApproveImport,
  useCancelImport,
  useCreateExport,
  useExportQuery,
  useImportProgress,
  useImportQuery,
  useImportRowsQuery,
  useRevalidateImport,
} from '../api';
import { ImportRowDialog, importFieldLabel } from './ImportRowDialog';
import { conscriptsPaths } from '../paths';
import { batchLabel, importStatus } from '../rules';

const PROCESSING_STEPS = ['QUEUED', 'PARSING', 'VALIDATING', 'READY_FOR_REVIEW'] as const;

const percent = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

/** Raw values from the uploaded file, as text. */
const raw = (record: ImportRecord, field: string) => {
  const value = (record.corrected_data ?? record.raw_data)[field];
  return value === null || value === undefined || value === '' ? ar.common.none : String(value);
};

function ProgressCard({ job }: { job: ImportJob }) {
  const step = PROCESSING_STEPS.indexOf(job.status as (typeof PROCESSING_STEPS)[number]);
  const parsing = job.status === 'PARSING';
  const determinate = !parsing && job.total_rows > 0;
  return (
    <SectionCard
      icon={<HourglassIcon />}
      iconTone="solid"
      title={ar.conscripts.report.processingTitle}
      subtitle={ar.conscripts.report.processingSubtitle}
    >
      <Stepper activeStep={Math.max(step, 0)} alternativeLabel sx={{ mb: 3 }}>
        {PROCESSING_STEPS.map((status) => (
          <Step key={status}>
            <StepLabel>{importStatus(status).label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      <LinearProgress
        variant={determinate ? 'determinate' : 'indeterminate'}
        value={percent(job.processed_rows, job.total_rows)}
        aria-label={ar.conscripts.report.processingTitle}
      />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {parsing ? ar.conscripts.report.discovered(formatNumber(job.parsed_rows ?? 0)) : determinate
            ? ar.conscripts.report.processed(formatNumber(job.processed_rows), formatNumber(job.total_rows))
            : ar.conscripts.report.counting}
        </Typography>
        <Typography variant="body2">
          <Box component="span" sx={{ color: tones.success.fg }}>
            {ar.conscripts.validShort} <Mono>{formatNumber(job.valid_rows)}</Mono>
          </Box>
          {' • '}
          <Box component="span" sx={{ color: tones.error.fg }}>
            {ar.conscripts.invalidShort} <Mono>{formatNumber(job.invalid_rows)}</Mono>
          </Box>
        </Typography>
      </Box>
      {parsing && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{ar.conscripts.report.parsingHint}</Typography>}
    </SectionCard>
  );
}

function Summary({ job }: { job: ImportJob }) {
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
      <StatCard
        label={ar.conscripts.report.total}
        value={formatNumber(job.total_rows)}
        unit={ar.conscripts.recordsUnit}
        icon={<DatasetIcon />}
        progress={100}
      />
      <StatCard
        label={ar.conscripts.report.valid}
        value={formatNumber(job.valid_rows)}
        unit={ar.conscripts.report.ofTotal(percent(job.valid_rows, job.total_rows))}
        icon={<CheckCircleIcon />}
        tone="success"
        progress={percent(job.valid_rows, job.total_rows)}
      />
      <StatCard
        label={ar.conscripts.report.invalid}
        value={formatNumber(job.invalid_rows)}
        unit={ar.conscripts.report.ofTotal(percent(job.invalid_rows, job.total_rows))}
        icon={<ErrorIcon />}
        tone="error"
        progress={percent(job.invalid_rows, job.total_rows)}
      />
    </Box>
  );
}

/** Export rejected rows (with their reasons) to Excel or Access, then offer the download. */
function ExportRejected({ job }: { job: ImportJob }) {
  const create = useCreateExport(job.id);
  const [exportId, setExportId] = useState<string | null>(null);
  const exportJob = useExportQuery(exportId);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const start = (format: 'xlsx' | 'accdb') => {
    setAnchor(null);
    create.mutate(format, { onSuccess: (created) => setExportId(created.id) });
  };

  const status = exportJob.data?.status;
  const working = create.isPending || (exportId !== null && status !== 'COMPLETED' && status !== 'FAILED');

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Button
        variant="outlined"
        startIcon={<DownloadIcon />}
        disabled={job.invalid_rows === 0 || working}
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-haspopup="menu"
      >
        {working ? ar.conscripts.report.exporting : ar.conscripts.report.exportRejected}
      </Button>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => start('xlsx')}>
          <ListItemIcon>
            <DatasetIcon fontSize="small" />
          </ListItemIcon>
          {ar.conscripts.report.exportXlsx}
        </MenuItem>
        <MenuItem onClick={() => start('accdb')}>
          <ListItemIcon>
            <DatasetIcon fontSize="small" />
          </ListItemIcon>
          {ar.conscripts.report.exportAccdb}
        </MenuItem>
      </Menu>
      {status === 'COMPLETED' && exportId && (
        <Button component="a" href={exportDownloadUrl(exportId)} download variant="contained" startIcon={<DownloadIcon />}>
          {ar.conscripts.report.downloadExport}
        </Button>
      )}
      {(status === 'FAILED' || create.isError) && (
        <Typography variant="body2" sx={{ color: tones.error.fg }}>
          {exportJob.data?.last_error ?? ar.conscripts.report.exportFailed}
        </Typography>
      )}
      {exportJob.isError && (
        <ErrorAlert error={exportJob.error} onRetry={() => void exportJob.refetch()} />
      )}
    </Box>
  );
}

function Decision({ job }: { job: ImportJob }) {
  const notify = useNotify();
  const approve = useApproveImport(job.id);
  const cancel = useCancelImport(job.id);
  const revalidate = useRevalidateImport(job.id);
  const [dialog, setDialog] = useState<'approve' | 'cancel' | null>(null);

  const close = () => {
    setDialog(null);
    approve.reset();
    cancel.reset();
  };

  if (job.status === 'APPROVED') {
    return (
      <Alert severity="success" icon={<TaskAltIcon />} action={<ExportRejected job={job} />}>
        <AlertTitle>{ar.conscripts.report.approvedTitle}</AlertTitle>
        {ar.conscripts.report.approvedBody(formatDateTime(job.approved_at), formatNumber(job.valid_rows))}
      </Alert>
    );
  }
  if (job.status === 'CANCELLED') {
    return (
      <Alert severity="warning" icon={<CancelIcon />} action={<ExportRejected job={job} />}>
        <AlertTitle>{ar.conscripts.report.cancelledTitle}</AlertTitle>
        {ar.conscripts.report.cancelledBody(formatDateTime(job.cancelled_at))}
      </Alert>
    );
  }

  return (
    <SectionCard
      icon={<FactCheckIcon />}
      iconTone="solid"
      title={ar.conscripts.report.decisionTitle}
      subtitle={ar.conscripts.report.decisionSubtitle(formatNumber(job.valid_rows))}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={<TaskAltIcon />}
          disabled={job.valid_rows === 0}
          onClick={() => setDialog('approve')}
        >
          {ar.conscripts.report.approve(formatNumber(job.valid_rows))}
        </Button>
        <ExportRejected job={job} />
        <Button variant="outlined" disabled={revalidate.isPending}
          title={ar.conscripts.correction.revalidateHint}
          onClick={() => revalidate.mutate(job.progress_version)}>
          {revalidate.isPending ? ar.conscripts.correction.revalidating : ar.conscripts.correction.revalidate}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" color="error" startIcon={<CancelIcon />} onClick={() => setDialog('cancel')}>
          {ar.conscripts.report.cancel}
        </Button>
      </Box>
      {revalidate.isError && <ErrorAlert error={revalidate.error} />}
      <ConfirmDialog
        open={dialog === 'approve'}
        tone="primary"
        title={ar.conscripts.report.approveConfirmTitle}
        subtitle={job.original_filename}
        confirmLabel={ar.conscripts.report.approveConfirm}
        confirmIcon={<TaskAltIcon />}
        pending={approve.isPending}
        error={approve.error}
        onClose={close}
        onConfirm={() =>
          approve.mutate(undefined, {
            onSuccess: (result) => {
              notify(ar.conscripts.report.approvedNotice(formatNumber(result.inserted_count)));
              close();
            },
          })
        }
      >
        <p>{ar.conscripts.report.approveConfirmBody(formatNumber(job.valid_rows), formatNumber(job.invalid_rows))}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'cancel'}
        tone="error"
        title={ar.conscripts.report.cancelConfirmTitle}
        subtitle={ar.conscripts.report.cancelConfirmSubtitle}
        confirmLabel={ar.conscripts.report.cancelConfirm}
        confirmIcon={<CancelIcon />}
        cancelLabel={ar.conscripts.report.backToReport}
        note={{ title: ar.conscripts.report.cancelNoteTitle, body: ar.conscripts.report.cancelNoteBody }}
        pending={cancel.isPending}
        error={cancel.error}
        onClose={close}
        onConfirm={() =>
          cancel.mutate(undefined, {
            onSuccess: () => {
              notify(ar.conscripts.report.cancelledNotice);
              close();
            },
          })
        }
      >
        <p>
          {ar.conscripts.report.cancelConfirmBody} <Mono sx={{ fontWeight: 600 }}>{job.original_filename}</Mono>
        </p>
        <p>{ar.conscripts.report.cancelConfirmEffect(formatNumber(job.total_rows))}</p>
      </ConfirmDialog>
    </SectionCard>
  );
}

function RowsTable({ status, records, onInspect }: { status: RowStatus; records: ImportRecord[]; onInspect: (record: ImportRecord) => void }) {
  const invalid = status === 'INVALID';
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{ar.conscripts.rows.row}</TableCell>
            <TableCell>{ar.conscripts.fields.name}</TableCell>
            <TableCell>{ar.conscripts.fields.nationalId}</TableCell>
            {!invalid && <TableCell>{ar.conscripts.fields.birthDate}</TableCell>}
            <TableCell>{ar.conscripts.fields.governorate}</TableCell>
            {!invalid && <TableCell>{ar.conscripts.fields.policeStation}</TableCell>}
            {!invalid && <TableCell>{ar.conscripts.fields.qualification}</TableCell>}
            {invalid && <TableCell>{ar.conscripts.rows.reasons}</TableCell>}
            <TableCell>{ar.common.actions}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id} hover sx={invalid ? { bgcolor: `${tones.error.bg}59` } : {}}>
              <TableCell sx={{ color: 'text.secondary' }}>
                <Mono>{record.row_number}</Mono>
              </TableCell>
              <TableCell sx={{ fontWeight: 500 }}>{raw(record, 'name')}</TableCell>
              <TableCell>
                <Mono>{raw(record, 'national_id')}</Mono>
              </TableCell>
              {!invalid && (
                <TableCell>
                  <Mono>{raw(record, 'birth_date')}</Mono>
                </TableCell>
              )}
              <TableCell>{raw(record, 'gov_name')}</TableCell>
              {!invalid && <TableCell>{raw(record, 'ps_name')}</TableCell>}
              {!invalid && <TableCell>{raw(record, 'type_name')}</TableCell>}
              {invalid && (
                <TableCell>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
                    {record.errors.map((error) => (
                      <StatusBadge key={`${error.error_code}-${error.field_name}`} tone="error" icon={<ErrorIcon />}>
                        {importFieldLabel(error.field_name)}: {error.error_message}
                      </StatusBadge>
                    ))}
                  </Box>
                </TableCell>
              )}
              <TableCell>
                <Button size="small" onClick={() => onInspect(record)}>{ar.conscripts.correction.view}</Button>
                {record.corrected_data && <StatusBadge tone="info">{ar.conscripts.correction.corrected}</StatusBadge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function RowsSection({ job }: { job: ImportJob }) {
  const [selected, setSelected] = useState<{ record: ImportRecord; version: number } | null>(null);
  const provisional = !hasReport(job.status);
  const [status, setStatus] = useState<RowStatus>(provisional || job.invalid_rows > 0 ? 'INVALID' : 'VALID');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const rows = useImportRowsQuery(job.id, status, page, pageSize, true, job.progress_version);
  // A corrected row may leave the final page. Move to the last remaining page.
  useEffect(() => {
    if (rows.data && !rows.isPlaceholderData && !rows.isFetching) {
      const last = Math.max(0, Math.ceil(rows.data.total / pageSize) - 1);
      if (page > last) setPage(last);
    }
  }, [rows.data, rows.isPlaceholderData, rows.isFetching, page, pageSize]);

  return (
    <SectionCard flush>
      {provisional && <Alert severity="info">{ar.conscripts.correction.provisionalResults}</Alert>}
      <Box sx={{ px: { xs: 1, md: 2 }, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
        <Tabs
          value={status}
          onChange={(_, next: RowStatus) => {
            setStatus(next);
            setPage(0);
          }}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab value="INVALID" label={provisional ? ar.conscripts.rows.invalidLabel : ar.conscripts.rows.invalidTab(formatNumber(job.invalid_rows))} />
          <Tab value="VALID" label={provisional ? ar.conscripts.rows.validLabel : ar.conscripts.rows.validTab(formatNumber(job.valid_rows))} />
        </Tabs>
      </Box>
      {rows.isFetching && rows.data && <LinearProgress aria-label={ar.conscripts.correction.refreshingRows} />}
      {rows.isError && (
        <Box sx={{ p: 2 }}>
          <ErrorAlert error={rows.error} onRetry={() => void rows.refetch()} />
        </Box>
      )}
      {rows.isPending ? (
        <LoadingState />
      ) : (
        rows.data && (
          <>
            <RowsTable status={status} records={rows.data.items}
              onInspect={(record) => setSelected({ record, version: rows.isPlaceholderData ? -1 : job.progress_version })} />
            {rows.data.items.length === 0 && (
              <EmptyState text={provisional ? ar.conscripts.correction.noProvisionalRows
                : status === 'INVALID' ? ar.conscripts.rows.noInvalid : ar.conscripts.rows.noValid} />
            )}
            <TablePager
              page={page}
              pageSize={pageSize}
              total={rows.data.total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(0);
              }}
              pageSizeOptions={[20, 50, 100]}
            />
          </>
        )
      )}
      {status === 'INVALID' && job.invalid_rows > 0 && (
        <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1, alignItems: 'center' }}>
          <ErrorIcon sx={{ fontSize: 18, color: tones.error.fg }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {ar.conscripts.rows.invalidNote}
          </Typography>
        </Box>
      )}
      {selected && <ImportRowDialog key={selected.record.id} job={job} record={selected.record}
        allowEdit={!rows.isPlaceholderData && !rows.isFetching && !rows.isError && selected.version === job.progress_version}
        onClose={() => setSelected(null)} />}
    </SectionCard>
  );
}

function Report({ id }: { id: string }) {
  const job = useImportQuery(id);
  const retry = useRevalidateImport(id);
  const active = job.data ? isActiveImport(job.data.status) : false;
  useImportProgress(id, active);

  if (job.isPending) return <LoadingState />;
  if (job.isError) {
    if (job.error instanceof ApiError && job.error.status === 404) return <NotFoundPage />;
    return <ErrorAlert error={job.error} onRetry={() => void job.refetch()} />;
  }

  const data = job.data;
  const status = importStatus(data.status);
  return (
    <>
      <PageHeader
        title={ar.conscripts.report.title}
        crumbs={[data.original_filename]}
        meta={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
        subtitle={
          <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mt: 0.5 }}>
            <span>
              {ar.conscripts.report.file}: <Mono sx={{ color: 'text.primary', fontWeight: 600 }}>{data.original_filename}</Mono>
            </span>
            <span>
              {ar.conscripts.batch}: {batchLabel(data.batch_number)} / <Mono>{data.enlistment_year}</Mono>
            </span>
            <span>
              {ar.conscripts.history.uploadedAt}: <Mono>{formatDateTimeNumeric(data.created_at)}</Mono>
            </span>
          </Box>
        }
        actions={
          <Button component={Link} to={conscriptsPaths.imports} variant="outlined" startIcon={<ArrowBackIcon />}>
            {ar.conscripts.report.backToImports}
          </Button>
        }
      />
      <Stack spacing={3}>
        {active && <ProgressCard job={data} />}
        {data.status === 'FAILED' && (
          <Alert severity="error">
            <AlertTitle>{ar.conscripts.report.failedTitle}</AlertTitle>
            {data.last_error ?? ar.conscripts.report.failedBody}
            {(data.validation_run ?? 0) > 0 && <Button disabled={retry.isPending}
              onClick={() => retry.mutate(data.progress_version)}>{ar.conscripts.correction.revalidate}</Button>}
            {retry.isError && <ErrorAlert error={retry.error} />}
          </Alert>
        )}
        {hasReport(data.status) && (
          <>
            <Summary job={data} />
            <Decision job={data} />
          </>
        )}
        {(hasReport(data.status) || (data.validation_run ?? 0) > 0) && <RowsSection job={data} />}
      </Stack>
    </>
  );
}

export function ImportReportPage() {
  const { importId } = useParams();
  return importId ? <Report key={importId} id={importId} /> : <NotFoundPage />;
}
