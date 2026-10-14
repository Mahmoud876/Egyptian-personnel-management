import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { Fragment, useEffect, useState } from 'react';
import { formatDateTime, localDayToIso } from '../../../shared/format';
import { ar } from '../../../shared/i18n/ar';
import { ExpandLessIcon, ExpandMoreIcon } from '../../../shared/ui/icons';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { EmptyState, ErrorAlert, LoadingState } from '../../../shared/ui/states';
import { type AuditEntry, type AuditQuery, useAuditFacets, useAuditQuery } from '../api';

type Filters = { userId: string; action: string; entity: string; dateFrom: string; dateTo: string };
const EMPTY_FILTERS: Filters = { userId: '', action: '', entity: '', dateFrom: '', dateTo: '' };

const actionLabel = (action: string) => ar.audit.actions[action] ?? action;
const entityLabel = (entity: string) => ar.audit.entities[entity] ?? entity;

const ACTION_COLORS: Record<string, 'error' | 'warning' | 'success' | 'info' | 'default'> = {
  denied: 'error',
  login_failed: 'warning',
  login: 'success',
  create: 'info',
  update: 'info',
  update_permissions: 'info',
};

function toQuery(filters: Filters, page: number, pageSize: number): AuditQuery {
  const query: AuditQuery = { page: page + 1, page_size: pageSize };
  if (filters.userId) query.user_id = Number(filters.userId);
  if (filters.action) query.action = filters.action;
  if (filters.entity) query.entity = filters.entity;
  if (filters.dateFrom) query.date_from = localDayToIso(filters.dateFrom);
  if (filters.dateTo) query.date_to = localDayToIso(filters.dateTo, true);
  return query;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return ar.common.none;
  if (Array.isArray(value)) return value.join('، ');
  if (typeof value === 'boolean') return value ? ar.common.yes : ar.common.no;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Old and new values side by side; changed fields are highlighted. */
function ValuesDiff({ entry }: { entry: AuditEntry }) {
  const oldValues = entry.old_values ?? {};
  const newValues = entry.new_values ?? {};
  const keys = [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])].sort();
  if (keys.length === 0) return <Typography sx={{ color: 'text.secondary', py: 1 }}>{ar.audit.noValues}</Typography>;

  return (
    <Table size="small" sx={{ my: 1, bgcolor: 'background.paper' }}>
      <TableHead>
        <TableRow>
          <TableCell>{ar.audit.field}</TableCell>
          <TableCell>{ar.audit.oldValue}</TableCell>
          <TableCell>{ar.audit.newValue}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {keys.map((key) => {
          const before = formatValue(oldValues[key]);
          const after = formatValue(newValues[key]);
          const changed = entry.old_values !== null && entry.new_values !== null && before !== after;
          return (
            <TableRow
              key={key}
              sx={changed ? { bgcolor: (t) => alpha(t.palette.warning.main, 0.12), '& td': { fontWeight: 600 } } : {}}
            >
              <TableCell dir="ltr" sx={{ fontFamily: 'monospace', textAlign: 'right' }}>
                {key}
              </TableCell>
              <TableCell sx={{ wordBreak: 'break-word' }}>{before}</TableCell>
              <TableCell sx={{ wordBreak: 'break-word' }}>{after}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <TableRow hover sx={{ '& > td': { borderBottom: open ? 0 : undefined } }}>
        <TableCell padding="checkbox">
          <IconButton size="small" aria-label={ar.audit.details} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.at)}</TableCell>
        <TableCell>{entry.full_name ?? (entry.user_id === null ? ar.audit.systemUser : ar.common.none)}</TableCell>
        <TableCell>
          <Chip size="small" label={actionLabel(entry.action)} color={ACTION_COLORS[entry.action] ?? 'default'} />
        </TableCell>
        <TableCell>
          {entry.entity ? entityLabel(entry.entity) : ar.common.none}
          {entry.entity_id && (
            <Typography component="span" variant="caption" dir="ltr" sx={{ color: 'text.secondary', mx: 0.5 }}>
              {entry.entity_id}
            </Typography>
          )}
        </TableCell>
        <TableCell dir="ltr" sx={{ fontFamily: 'monospace', textAlign: 'right' }}>
          {entry.permission_code ?? ''}
        </TableCell>
        <TableCell dir="ltr" sx={{ textAlign: 'right' }}>
          {entry.ip ?? ''}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0, bgcolor: 'grey.50' }}>
          <Collapse in={open} unmountOnExit>
            <ValuesDiff entry={entry} />
          </Collapse>
        </TableCell>
      </TableRow>
    </Fragment>
  );
}

export function AuditLogPage() {
  const facets = useAuditFacets();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const audit = useAuditQuery(toQuery(filters, page, pageSize));

  useEffect(() => setPage(0), [filters]);

  const set = (key: keyof Filters) => (event: { target: { value: string } }) =>
    setFilters((current) => ({ ...current, [key]: event.target.value }));

  return (
    <>
      <PageHeader title={ar.audit.title} />
      <Paper variant="outlined">
        <Box
          sx={{
            p: 2,
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(5, 1fr) auto' },
            alignItems: 'center',
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
            type="date"
            label={ar.audit.dateFrom}
            value={filters.dateFrom}
            onChange={set('dateFrom')}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            label={ar.audit.dateTo}
            value={filters.dateTo}
            onChange={set('dateTo')}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Button onClick={() => setFilters(EMPTY_FILTERS)}>{ar.common.clearFilters}</Button>
        </Box>
        {audit.isError && (
          <Box sx={{ px: 2, pb: 2 }}>
            <ErrorAlert error={audit.error} onRetry={() => void audit.refetch()} />
          </Box>
        )}
        {audit.isPending ? (
          <LoadingState />
        ) : (
          audit.data && (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" />
                      <TableCell>{ar.audit.at}</TableCell>
                      <TableCell>{ar.audit.user}</TableCell>
                      <TableCell>{ar.audit.action}</TableCell>
                      <TableCell>{ar.audit.entity}</TableCell>
                      <TableCell>{ar.audit.permission}</TableCell>
                      <TableCell>{ar.audit.ip}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {audit.data.items.map((entry) => (
                      <AuditRow key={entry.id} entry={entry} />
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {audit.data.items.length === 0 && <EmptyState />}
              <TablePagination
                component="div"
                count={audit.data.total}
                page={page}
                rowsPerPage={pageSize}
                rowsPerPageOptions={[25, 50, 100]}
                onPageChange={(_, next) => setPage(next)}
                onRowsPerPageChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(0);
                }}
              />
            </>
          )
        )}
      </Paper>
    </>
  );
}
