import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { type ReactNode, useEffect, useState } from 'react';
import { formatDateTimeNumeric, formatNumber, localDateTimeToIso } from '../../../shared/format';
import { ar } from '../../../shared/i18n/ar';
import { Mono } from '../../../shared/ui/DataText';
import { CloseIcon, CompareArrowsIcon, FilterListIcon, HistoryIcon, RefreshIcon, SearchIcon } from '../../../shared/ui/icons';
import { InitialsAvatar } from '../../../shared/ui/InitialsAvatar';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { SectionCard } from '../../../shared/ui/SectionCard';
import { EmptyState, ErrorAlert, LoadingState } from '../../../shared/ui/states';
import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { TablePager } from '../../../shared/ui/TablePager';
import { type Tone, tokens, tones } from '../../../shared/ui/tokens';
import { type AuditEntry, type AuditQuery, useAuditFacets, useAuditQuery } from '../api';

type Filters = { q: string; userId: string; action: string; entity: string; dateFrom: string; dateTo: string };
const EMPTY_FILTERS: Filters = { q: '', userId: '', action: '', entity: '', dateFrom: '', dateTo: '' };

const actionLabel = (action: string) => ar.audit.actions[action] ?? action;
const entityLabel = (entity: string) => ar.audit.entities[entity] ?? entity;

const ACTION_TONES: Record<string, Tone> = {
  denied: 'error',
  login_failed: 'warning',
  job_failed: 'error',
  login: 'success',
  create: 'success',
  approve: 'success',
  complete: 'success',
  validation_complete: 'success',
  export_complete: 'success',
  cancel: 'warning',
  update: 'info',
  update_permissions: 'info',
  reset_password: 'warning',
  upload: 'primary',
  document_upload: 'primary',
  export_requested: 'primary',
  label: 'primary',
};

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function toQuery(filters: Filters, q: string, page: number, pageSize: number): AuditQuery {
  const query: AuditQuery = { page: page + 1, page_size: pageSize };
  if (q) query.q = q;
  if (filters.userId) query.user_id = Number(filters.userId);
  if (filters.action) query.action = filters.action;
  if (filters.entity) query.entity = filters.entity;
  const from = localDateTimeToIso(filters.dateFrom);
  const to = localDateTimeToIso(filters.dateTo);
  if (from) query.date_from = from;
  if (to) query.date_to = to;
  return query;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return ar.common.none;
  if (Array.isArray(value)) return value.join('، ');
  if (typeof value === 'boolean') return value ? ar.common.yes : ar.common.no;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function ActionBadge({ action }: { action: string }) {
  return <StatusBadge tone={ACTION_TONES[action] ?? 'neutral'}>{actionLabel(action)}</StatusBadge>;
}

/** Old and new values side by side: removed values struck through in red, new ones in green. */
function ChangesPanel({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  if (!entry) {
    return (
      <SectionCard icon={<CompareArrowsIcon />} title={ar.audit.compareTitle}>
        <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>{ar.audit.selectHint}</Typography>
      </SectionCard>
    );
  }

  const oldValues = entry.old_values ?? {};
  const newValues = entry.new_values ?? {};
  const keys = [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])].sort();
  const meta: [string, ReactNode][] = [
    [ar.audit.action, <ActionBadge key="a" action={entry.action} />],
    [ar.audit.user, entry.full_name ?? (entry.user_id === null ? ar.audit.systemUser : ar.common.none)],
    [ar.audit.at, <Mono key="t">{formatDateTimeNumeric(entry.at)}</Mono>],
    [ar.audit.ip, entry.ip ? <Mono key="i">{entry.ip}</Mono> : ar.common.none],
    [
      ar.audit.entity,
      <span key="e">
        {entry.entity ? entityLabel(entry.entity) : ar.common.none}
        {entry.entity_id && (
          <Typography component="div" variant="caption" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
            <Mono sx={{ whiteSpace: 'normal' }}>{entry.entity_id}</Mono>
          </Typography>
        )}
      </span>,
    ],
  ];
  if (entry.permission_code) meta.push([ar.audit.permission, <Mono key="p">{entry.permission_code}</Mono>]);

  return (
    <SectionCard
      icon={<CompareArrowsIcon />}
      title={ar.audit.compareTitle}
      actions={
        <>
          <StatusBadge tone="primary" dot={false}>
            #<Mono>{entry.id}</Mono>
          </StatusBadge>
          <IconButton size="small" aria-label={ar.common.close} onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </>
      }
      flush
    >
      <Box sx={{ p: 2, bgcolor: 'surface.low', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 1 }}>
        {meta.map(([label, value]) => (
          <Box key={label} sx={{ display: 'contents' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', alignSelf: 'center' }}>
              {label}
            </Typography>
            <Typography variant="body2" component="div" sx={{ fontWeight: 500, minWidth: 0, wordBreak: 'break-word' }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ px: 2, py: 1.25, borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {ar.audit.affectedFields(keys.length)}
        </Typography>
      </Box>
      {keys.length === 0 ? (
        <Typography sx={{ color: 'text.secondary', p: 2 }}>{ar.audit.noValues}</Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{ar.audit.field}</TableCell>
                <TableCell sx={{ color: `${tones.error.fg} !important` }}>{ar.audit.oldValue}</TableCell>
                <TableCell sx={{ color: `${tones.success.fg} !important` }}>{ar.audit.newValue}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.map((key) => {
                const before = formatValue(oldValues[key]);
                const after = formatValue(newValues[key]);
                const changed = entry.old_values !== null && entry.new_values !== null && before !== after;
                return (
                  <TableRow key={key} sx={changed ? { bgcolor: tokens.surfaceLow } : {}}>
                    <TableCell sx={{ color: 'text.secondary' }}>
                      <Mono sx={{ fontSize: 12 }}>{key}</Mono>
                    </TableCell>
                    <TableCell sx={{ wordBreak: 'break-word' }}>
                      {changed ? (
                        <Box
                          component="span"
                          sx={{ color: tones.error.fg, textDecoration: 'line-through', bgcolor: tones.error.bg, px: 0.5, borderRadius: 0.5 }}
                        >
                          {before}
                        </Box>
                      ) : (
                        before
                      )}
                    </TableCell>
                    <TableCell sx={{ wordBreak: 'break-word' }}>
                      {changed ? (
                        <Box
                          component="span"
                          sx={{ color: tones.success.fg, fontWeight: 600, bgcolor: tones.success.bg, px: 0.5, borderRadius: 0.5 }}
                        >
                          {after}
                        </Box>
                      ) : (
                        after
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionCard>
  );
}

export function AuditLogPage() {
  const facets = useAuditFacets();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const q = useDebounced(filters.q.trim(), 300);
  const query = toQuery(filters, q, page, pageSize);
  const invalidRange = Boolean((filters.dateFrom && !query.date_from) || (filters.dateTo && !query.date_to)
    || (query.date_from && query.date_to && query.date_from >= query.date_to));
  const audit = useAuditQuery(query, !invalidRange);

  useEffect(() => setPage(0), [filters.userId, filters.action, filters.entity, filters.dateFrom, filters.dateTo, q]);

  const set = (key: keyof Filters) => (event: { target: { value: string } }) =>
    setFilters((current) => ({ ...current, [key]: event.target.value }));

  return (
    <>
      <PageHeader
        title={ar.audit.title}
        subtitle={ar.audit.subtitle}
        actions={
          <Button disabled={invalidRange} variant="outlined" startIcon={<RefreshIcon />} onClick={() => void audit.refetch()}>
            {ar.home.refresh}
          </Button>
        }
      />
      <Box sx={{ display: 'grid', gap: 3 }}>
        <SectionCard
          icon={<FilterListIcon />}
          title={ar.audit.filtersTitle}
          actions={
            audit.data && !invalidRange && (
              <StatusBadge tone="primary" dot={false}>
                {ar.audit.matches(formatNumber(audit.data.total))}
              </StatusBadge>
            )
          }
        >
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(5, 1fr)' },
              alignItems: 'end',
            }}
          >
            <TextField select label={ar.audit.user} value={filters.userId} onChange={set('userId')}>
              <MenuItem value="">{ar.common.all}</MenuItem>
              {facets.data?.users.map((u) => (
                <MenuItem key={u.id} value={String(u.id)}>
                  {u.full_name} ({u.username})
                </MenuItem>
              ))}
            </TextField>
            <TextField select label={ar.audit.action} value={filters.action} onChange={set('action')}>
              <MenuItem value="">{ar.common.all}</MenuItem>
              {facets.data?.actions.map((a) => (
                <MenuItem key={a} value={a}>
                  {actionLabel(a)}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label={ar.audit.entity} value={filters.entity} onChange={set('entity')}>
              <MenuItem value="">{ar.common.all}</MenuItem>
              {facets.data?.entities.map((e) => (
                <MenuItem key={e} value={e}>
                  {entityLabel(e)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="datetime-local"
              label={ar.audit.dateFrom}
              value={filters.dateFrom}
              onChange={set('dateFrom')}
              error={invalidRange}
              slotProps={{ htmlInput: { dir: 'ltr', step: 1 }, inputLabel: { shrink: true } }}
            />
            <TextField
              type="datetime-local"
              label={ar.audit.dateTo}
              value={filters.dateTo}
              onChange={set('dateTo')}
              error={invalidRange}
              slotProps={{ htmlInput: { dir: 'ltr', step: 1 }, inputLabel: { shrink: true } }}
            />
          </Box>
          <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
            {ar.audit.timeRangeHint(Intl.DateTimeFormat().resolvedOptions().timeZone)}
          </Typography>
          {invalidRange && <Alert severity="error" sx={{ mt: 1 }}>{ar.audit.invalidRange}</Alert>}
          <Box sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <TextField
              label={ar.audit.textSearch}
              placeholder={ar.audit.textSearchPlaceholder}
              value={filters.q}
              onChange={set('q')}
              sx={{ flex: 1, minWidth: 260 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => setFilters(EMPTY_FILTERS)}>
              {ar.common.clearFilters}
            </Button>
          </Box>
        </SectionCard>

        <Box
          sx={{
            display: 'grid',
            gap: 3,
            alignItems: 'start',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 400px' },
          }}
        >
          <SectionCard icon={<HistoryIcon />} title={ar.audit.tableTitle} flush sx={{ minWidth: 0 }}>
            {audit.isError && (
              <Box sx={{ p: 2 }}>
                <ErrorAlert error={audit.error} onRetry={() => void audit.refetch()} />
              </Box>
            )}
            {invalidRange ? null : audit.isPending ? (
              <LoadingState />
            ) : (
              audit.data && (
                <>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{ar.audit.at}</TableCell>
                          <TableCell>{ar.audit.user}</TableCell>
                          <TableCell>{ar.audit.action}</TableCell>
                          <TableCell>{ar.audit.entity}</TableCell>
                          <TableCell>{ar.audit.ip}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {audit.data.items.map((entry) => {
                          const isSelected = selected?.id === entry.id;
                          const name = entry.full_name ?? (entry.user_id === null ? ar.audit.systemUser : ar.common.none);
                          const denied = entry.action === 'denied' || entry.action === 'login_failed';
                          return (
                            <TableRow
                              key={entry.id}
                              hover
                              selected={isSelected}
                              aria-selected={isSelected}
                              tabIndex={0}
                              onClick={() => setSelected(entry)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setSelected(entry);
                                }
                              }}
                              sx={{
                                cursor: 'pointer',
                                ...(denied && { bgcolor: `${tones.error.bg}59` }),
                                '&.Mui-selected': { bgcolor: tokens.surfaceContainer, boxShadow: `inset 3px 0 0 ${tokens.primary}` },
                                '&.Mui-selected:hover': { bgcolor: tokens.surfaceContainer },
                              }}
                            >
                              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                <Mono sx={{ fontWeight: 600, color: denied ? tones.error.fg : 'text.primary' }}>
                                  {formatDateTimeNumeric(entry.at)}
                                </Mono>
                              </TableCell>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <InitialsAvatar name={name} size={28} soft={!denied} />
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                      {name}
                                    </Typography>
                                    {entry.username && (
                                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                                        <Mono>{entry.username}</Mono>
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                              </TableCell>
                              <TableCell>
                                <ActionBadge action={entry.action} />
                              </TableCell>
                              <TableCell>{entry.entity ? entityLabel(entry.entity) : ar.common.none}</TableCell>
                              <TableCell sx={{ color: 'text.secondary' }}>
                                {entry.ip ? <Mono>{entry.ip}</Mono> : ar.common.none}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {audit.data.items.length === 0 && <EmptyState />}
                  <TablePager
                    page={page}
                    pageSize={pageSize}
                    total={audit.data.total}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(0);
                    }}
                    pageSizeOptions={[25, 50, 100]}
                  />
                </>
              )
            )}
          </SectionCard>
          <Box sx={{ position: { lg: 'sticky' }, top: { lg: 88 } }}>
            <ChangesPanel entry={selected} onClose={() => setSelected(null)} />
          </Box>
        </Box>
      </Box>
    </>
  );
}
