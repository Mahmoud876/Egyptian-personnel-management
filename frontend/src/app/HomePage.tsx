import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { NationalIdLookup } from '../features/conscripts/entry/NationalIdLookup';
import { useImportsQuery, useRecruitsQuery } from '../features/conscripts/api';
import { conscriptsPaths } from '../features/conscripts/paths';
import { importStatus } from '../features/conscripts/rules';
import { BatchYear } from '../features/conscripts/BatchYear';
import { useMe } from '../shared/auth/auth';
import { formatDateTimeNumeric, formatLongDate, formatNumber } from '../shared/format';
import { ar } from '../shared/i18n/ar';
import { usePermission } from '../shared/permissions/permissions';
import { Mono } from '../shared/ui/DataText';
import {
  CalendarIcon,
  ChevronLeftIcon,
  DatasetIcon,
  FactCheckIcon,
  HourglassIcon,
  PeopleIcon,
  RefreshIcon,
  StorageIcon,
  UploadFileIcon,
} from '../shared/ui/icons';
import { PageHeader } from '../shared/ui/PageHeader';
import { SectionCard } from '../shared/ui/SectionCard';
import { StatCard } from '../shared/ui/StatCard';
import { EmptyState, ErrorAlert, LoadingState } from '../shared/ui/states';
import { StatusBadge } from '../shared/ui/StatusBadge';
import { visibleMenu } from './menu';
import { useHealthQuery } from './useHealthQuery';

/** Table preview only; KPI totals are filtered and counted by the database. */
const RECENT_IMPORTS = 6;
const TABLE_ROWS = 6;

type Status = 'checking' | 'connected' | 'disconnected';

const statusTone = { checking: 'neutral', connected: 'success', disconnected: 'error' } as const;
const statusLabel = { checking: ar.health.checking, connected: ar.health.connected, disconnected: ar.health.disconnected };

function HealthRow({ label, status }: { label: string; status: Status }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1 }}>
      <Typography variant="body2">{label}</Typography>
      <StatusBadge tone={statusTone[status]}>{statusLabel[status]}</StatusBadge>
    </Box>
  );
}

function SystemHealth() {
  const health = useHealthQuery();
  let server: Status = 'checking';
  let database: Status = 'checking';
  let queue: Status = 'checking';
  if (health.data) {
    server = 'connected';
    database = health.data.database.reachable ? 'connected' : 'disconnected';
    queue = health.data.redis.reachable ? 'connected' : 'disconnected';
  } else if (health.isError) {
    server = 'disconnected';
    database = 'disconnected';
    queue = 'disconnected';
  }
  return (
    <SectionCard icon={<StorageIcon />} title={ar.health.heading}>
      <Box sx={{ '& > * + *': { borderTop: 1, borderColor: 'divider' } }}>
        <HealthRow label={ar.health.server} status={server} />
        <HealthRow label={ar.health.database} status={database} />
        <HealthRow label={ar.health.queue} status={queue} />
      </Box>
    </SectionCard>
  );
}

function QuickLinks() {
  const { data: me } = useMe();
  // Day-to-day operations only; the main and administration groups stay in the sidebar.
  const items = visibleMenu(me?.permissions ?? [])
    .filter((group) => group.label !== ar.menu.groups.main && group.label !== ar.menu.groups.admin)
    .flatMap((group) => group.items);
  if (items.length === 0) return null;
  return (
    <SectionCard title={ar.home.quickLinks} flush>
      <List disablePadding>
        {items.map((item) => (
          <ListItemButton
            key={item.path}
            component={Link}
            to={item.path}
            sx={{ px: 2.5, py: 1.25, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}
          >
            <ListItemIcon sx={{ minWidth: 34, color: 'primary.main' }}>
              <item.icon sx={{ fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontSize: 14 } } }} />
            <ChevronLeftIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          </ListItemButton>
        ))}
      </List>
    </SectionCard>
  );
}

function RecentImports() {
  const navigate = useNavigate();
  const imports = useImportsQuery({ page: 1, page_size: RECENT_IMPORTS });
  return (
    <SectionCard
      icon={<UploadFileIcon />}
      title={ar.home.recentImports}
      subtitle={ar.home.recentImportsHint}
      actions={
        <Button component={Link} to={conscriptsPaths.imports} variant="outlined" size="small" startIcon={<UploadFileIcon />}>
          {ar.home.newUpload}
        </Button>
      }
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
                    <TableCell>{ar.conscripts.history.records}</TableCell>
                    <TableCell>{ar.common.status}</TableCell>
                    <TableCell>{ar.conscripts.history.uploadedAt}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {imports.data.items.slice(0, TABLE_ROWS).map((job) => {
                    const status = importStatus(job.status);
                    return (
                      <TableRow
                        key={job.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => void navigate(conscriptsPaths.importReport(job.id))}
                      >
                        <TableCell sx={{ maxWidth: 240 }}>
                          <Mono sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', color: 'primary.main', fontWeight: 600 }}>
                            {job.original_filename}
                          </Mono>
                        </TableCell>
                        <TableCell>
                          <BatchYear batch={job.batch_number} year={job.enlistment_year} />
                        </TableCell>
                        <TableCell>
                          <Mono>{formatNumber(job.total_rows)}</Mono>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>
                          <Mono>{formatDateTimeNumeric(job.created_at)}</Mono>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            {imports.data.items.length === 0 && <EmptyState text={ar.conscripts.history.empty} />}
          </>
        )
      )}
    </SectionCard>
  );
}

function RecentRecruits() {
  const navigate = useNavigate();
  const canEnter = usePermission('conscripts.enter');
  const recruits = useRecruitsQuery({ page: 1, page_size: TABLE_ROWS });
  return (
    <SectionCard
      icon={<PeopleIcon />}
      title={ar.home.recentRecruits}
      actions={
        <Button component={Link} to={conscriptsPaths.search} size="small" endIcon={<ChevronLeftIcon />}>
          {ar.home.viewAll}
        </Button>
      }
      flush
    >
      {recruits.isError && (
        <Box sx={{ p: 2 }}>
          <ErrorAlert error={recruits.error} onRetry={() => void recruits.refetch()} />
        </Box>
      )}
      {recruits.isPending ? (
        <LoadingState />
      ) : (
        recruits.data && (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{ar.conscripts.fields.name}</TableCell>
                    <TableCell>{ar.conscripts.fields.nationalId}</TableCell>
                    <TableCell>{ar.conscripts.batchAndYear}</TableCell>
                    <TableCell>{ar.common.status}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recruits.data.items.map((recruit) => (
                    <TableRow
                      key={recruit.id}
                      hover
                      sx={canEnter ? { cursor: 'pointer' } : {}}
                      onClick={canEnter ? () => void navigate(conscriptsPaths.entryFor(recruit.id)) : undefined}
                    >
                      <TableCell sx={{ fontWeight: 500 }}>{recruit.name}</TableCell>
                      <TableCell>
                        <Mono>{recruit.national_id}</Mono>
                      </TableCell>
                      <TableCell>
                        <BatchYear batch={recruit.batch_number} year={recruit.enlistment_year} />
                      </TableCell>
                      <TableCell>
                        {recruit.is_locked ? (
                          <StatusBadge tone="success">{ar.conscripts.status.complete}</StatusBadge>
                        ) : (
                          <StatusBadge tone="warning">{ar.conscripts.status.incomplete}</StatusBadge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {recruits.data.items.length === 0 && <EmptyState />}
          </>
        )
      )}
    </SectionCard>
  );
}

function KpiCards({ canImports, canView }: { canImports: boolean; canView: boolean }) {
  const recruits = useRecruitsQuery({ page: 1, page_size: 1 }, canView);
  const imports = useImportsQuery({ page: 1, page_size: RECENT_IMPORTS }, canImports);
  const awaitingQuery = useImportsQuery({ page: 1, page_size: 1, status: ['READY_FOR_REVIEW'] }, canImports);
  const processingQuery = useImportsQuery({ page: 1, page_size: 1, status: ['QUEUED', 'PARSING', 'VALIDATING'] }, canImports);
  const awaiting = awaitingQuery.data?.total;
  const processing = processingQuery.data?.total;
  const value = (n: number | undefined) => (n === undefined ? '—' : formatNumber(n));

  if (!canImports && !canView) return null;
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
      {canView && (
        <StatCard
          label={ar.home.kpi.recruits}
          value={value(recruits.data?.total)}
          unit={ar.home.kpi.recruitsUnit}
          icon={<PeopleIcon />}
        />
      )}
      {canImports && (
        <>
          <StatCard
            label={ar.home.kpi.awaiting}
            value={value(awaiting)}
            unit={ar.home.kpi.filesUnit}
            icon={<FactCheckIcon />}
            tone={(awaiting ?? 0) > 0 ? 'warning' : undefined}
            badge={(awaiting ?? 0) > 0 ? <StatusBadge tone="warning" dot={false}>{ar.home.kpi.needsDecision}</StatusBadge> : undefined}
          />
          <StatCard
            label={ar.home.kpi.processing}
            value={value(processing)}
            unit={ar.home.kpi.filesUnit}
            icon={<HourglassIcon />}
            tone={(processing ?? 0) > 0 ? 'info' : undefined}
          />
          <StatCard
            label={ar.home.kpi.uploaded}
            value={value(imports.data?.total)}
            unit={ar.home.kpi.filesUnit}
            icon={<DatasetIcon />}
          />
        </>
      )}
    </Box>
  );
}

export function HomePage() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canImports = usePermission('conscripts.import.upload');
  const canView = usePermission('conscripts.view');
  const canEnter = usePermission('conscripts.enter');

  return (
    <>
      <PageHeader
        title={ar.home.title}
        subtitle={ar.home.welcome(me?.full_name ?? '')}
        actions={
          <>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                height: 36,
                px: 1.5,
                borderRadius: 1,
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                color: 'text.secondary',
              }}
            >
              <CalendarIcon sx={{ fontSize: 16 }} />
              <Typography variant="body2">{ar.home.today(formatLongDate(new Date()))}</Typography>
            </Box>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void queryClient.invalidateQueries()}>
              {ar.home.refresh}
            </Button>
          </>
        }
      />
      <Stack spacing={3}>
        <KpiCards canImports={canImports} canView={canView} />
        <Box
          sx={{
            display: 'grid',
            gap: 3,
            alignItems: 'start',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' },
          }}
        >
          <Stack spacing={3} sx={{ minWidth: 0 }}>
            {canImports && <RecentImports />}
            {canView && <RecentRecruits />}
            {!canImports && !canView && (
              <SectionCard title={ar.home.welcomeTitle}>
                <Typography sx={{ color: 'text.secondary' }}>{ar.home.intro}</Typography>
              </SectionCard>
            )}
          </Stack>
          <Stack spacing={3}>
            {canView && (
              <NationalIdLookup
                compact
                title={ar.home.quickLookup}
                subtitle={ar.home.quickLookupHint}
                onFound={(recruit) =>
                  void navigate(
                    canEnter
                      ? conscriptsPaths.entryFor(recruit.id)
                      : `${conscriptsPaths.search}?mode=national_id&q=${recruit.national_id}`,
                  )
                }
              />
            )}
            <QuickLinks />
            <SystemHealth />
          </Stack>
        </Box>
      </Stack>
    </>
  );
}
