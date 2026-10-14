import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
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
import Tooltip from '@mui/material/Tooltip';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { formatDate, formatNumber } from '../../../shared/format';
import { ar } from '../../../shared/i18n/ar';
import { usePermission } from '../../../shared/permissions/permissions';
import { Mono } from '../../../shared/ui/DataText';
import {
  CloseIcon,
  FilterListIcon,
  InfoIcon,
  PersonIcon,
  QrCode2Icon,
  RefreshIcon,
  SearchIcon,
  VisibilityIcon,
} from '../../../shared/ui/icons';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { SectionCard } from '../../../shared/ui/SectionCard';
import { EmptyState, ErrorAlert, LoadingState } from '../../../shared/ui/states';
import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { TablePager } from '../../../shared/ui/TablePager';
import { type Recruit, type RecruitsQuery, useQualifications, useRecruitsQuery } from '../api';
import { conscriptsPaths } from '../paths';
import { BatchYear } from '../BatchYear';
import { BARCODE_PATTERN, NATIONAL_ID_PATTERN } from '../rules';

const MODES = ['search', 'national_id', 'barcode', 'name', 'police_number'] as const;
type Mode = (typeof MODES)[number];

const isMode = (value: string | null): value is Mode => MODES.includes(value as Mode);

/** Criteria live in the URL (?mode=&q=&year=&page=), so a search can be bookmarked or reached from the top bar. */
function useCriteria() {
  const [params, setParams] = useSearchParams();
  const mode: Mode = isMode(params.get('mode')) ? (params.get('mode') as Mode) : 'search';
  const q = params.get('q') ?? '';
  const year = params.get('year') ?? '';
  const page = Math.max(0, Number(params.get('page') ?? '0') || 0);
  return { mode, q, year, page, setParams };
}

function validate(mode: Mode, q: string, year: string): string | null {
  if (mode === 'national_id' && q && !NATIONAL_ID_PATTERN.test(q)) return ar.conscripts.search.invalidNationalId;
  if (mode === 'barcode' && q && !BARCODE_PATTERN.test(q)) return ar.conscripts.search.invalidBarcode;
  if (mode === 'police_number' && q && !/^[0-9]{4}$/.test(year)) return ar.conscripts.search.yearRequired;
  return null;
}

function toQuery(mode: Mode, q: string, year: string, page: number, pageSize: number): RecruitsQuery {
  const query: RecruitsQuery = { page: page + 1, page_size: pageSize };
  if (!q) return query;
  if (mode === 'police_number') return { ...query, police_number: q, enlistment_year: Number(year) };
  return { ...query, [mode]: q };
}

function SearchForm() {
  const { mode, q, year, setParams } = useCriteria();
  const [draft, setDraft] = useState({ mode, q, year });
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.q.trim();
    const problem = validate(draft.mode, value, draft.year.trim());
    setError(problem);
    if (problem) return;
    const next = new URLSearchParams();
    if (value) {
      next.set('mode', draft.mode);
      next.set('q', value);
      if (draft.mode === 'police_number') next.set('year', draft.year.trim());
    }
    setParams(next);
  };

  const reset = () => {
    setDraft({ mode: 'search', q: '', year: '' });
    setError(null);
    setParams(new URLSearchParams());
  };

  const police = draft.mode === 'police_number';
  return (
    <SectionCard icon={<FilterListIcon />} title={ar.conscripts.search.criteria} subtitle={ar.conscripts.search.criteriaHint}>
      <Box component="form" onSubmit={submit} noValidate role="search">
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            alignItems: 'start',
            gridTemplateColumns: { xs: '1fr', md: police ? '220px 1fr 160px auto' : '220px 1fr auto' },
          }}
        >
          <TextField
            select
            label={ar.conscripts.search.searchBy}
            value={draft.mode}
            onChange={(event) => setDraft((current) => ({ ...current, mode: event.target.value as Mode }))}
          >
            {MODES.map((value) => (
              <MenuItem key={value} value={value}>
                {ar.conscripts.search.modes[value]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={ar.conscripts.search.value}
            value={draft.q}
            placeholder={ar.conscripts.search.placeholders[draft.mode]}
            onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
            error={error !== null}
            helperText={error ?? ' '}
            slotProps={{
              htmlInput: draft.mode === 'name' || draft.mode === 'search' ? {} : { dir: 'ltr', inputMode: 'numeric' },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 20 }} />
                  </InputAdornment>
                ),
                endAdornment: draft.q ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      edge="end"
                      aria-label={ar.common.clear}
                      onClick={() => setDraft((current) => ({ ...current, q: '' }))}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
          />
          {police && (
            <TextField
              required
              label={ar.conscripts.enlistmentYear}
              value={draft.year}
              onChange={(event) =>
                setDraft((current) => ({ ...current, year: event.target.value.replace(/[^0-9]/g, '').slice(0, 4) }))
              }
              slotProps={{ htmlInput: { dir: 'ltr', inputMode: 'numeric' } }}
            />
          )}
          <Box sx={{ display: 'flex', gap: 1, pt: { md: 3 } }}>
            <Button type="submit" variant="contained" startIcon={<SearchIcon />}>
              {ar.common.search}
            </Button>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={reset}>
              {ar.common.reset}
            </Button>
          </Box>
        </Box>
      </Box>
    </SectionCard>
  );
}

function RecruitStatus({ recruit }: { recruit: Recruit }) {
  return recruit.is_locked ? (
    <StatusBadge tone="success">{ar.conscripts.status.complete}</StatusBadge>
  ) : (
    <StatusBadge tone="warning">{ar.conscripts.status.incomplete}</StatusBadge>
  );
}

function Results() {
  const navigate = useNavigate();
  const { mode, q, year, page, setParams } = useCriteria();
  const [pageSize, setPageSize] = useState(20);
  const canEnter = usePermission('conscripts.enter');
  const canPrint = usePermission('conscripts.label.print');
  const qualifications = useQualifications();
  const valid = validate(mode, q, year) === null;
  const recruits = useRecruitsQuery(toQuery(mode, q, year, page, pageSize), valid);

  const qualificationName = (typeId: number) =>
    qualifications.data?.find((row) => row.id === typeId)?.name_ar ?? String(typeId);

  const setPage = (next: number) =>
    setParams((current) => {
      const params = new URLSearchParams(current);
      params.set('page', String(next));
      return params;
    });

  return (
    <SectionCard
      icon={<PersonIcon />}
      title={q ? ar.conscripts.search.results : ar.conscripts.search.latest}
      actions={
        recruits.data && (
          <StatusBadge tone="primary" dot={false}>
            {ar.conscripts.search.matches(formatNumber(recruits.data.total))}
          </StatusBadge>
        )
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
                    <TableCell>{ar.conscripts.fields.policeNumberYear}</TableCell>
                    <TableCell>{ar.conscripts.batchAndYear}</TableCell>
                    <TableCell>{ar.conscripts.fields.qualification}</TableCell>
                    <TableCell>{ar.conscripts.fields.period}</TableCell>
                    <TableCell>{ar.common.status}</TableCell>
                    <TableCell align="center">{ar.common.actions}</TableCell>
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
                      <TableCell sx={{ fontWeight: 500, minWidth: 200 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <PersonIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
                          {recruit.name}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Mono>{recruit.national_id}</Mono>
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>
                        {recruit.police_number ? (
                          <Mono>
                            {recruit.police_number} / {recruit.enlistment_year}
                          </Mono>
                        ) : (
                          ar.common.none
                        )}
                      </TableCell>
                      <TableCell>
                        <BatchYear batch={recruit.batch_number} year={recruit.enlistment_year} />
                      </TableCell>
                      <TableCell>{qualificationName(recruit.type_id)}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {recruit.enlistment_start_date ? (
                          <>
                            <div>
                              {ar.conscripts.fields.from} <Mono>{formatDate(recruit.enlistment_start_date)}</Mono>
                            </div>
                            <div>
                              {ar.conscripts.fields.to} <Mono>{formatDate(recruit.enlistment_end_date)}</Mono>
                            </div>
                          </>
                        ) : (
                          ar.common.none
                        )}
                      </TableCell>
                      <TableCell>
                        <RecruitStatus recruit={recruit} />
                      </TableCell>
                      <TableCell align="center" onClick={(event) => event.stopPropagation()}>
                        <Box sx={{ display: 'inline-flex', gap: 0.5 }}>
                          {canEnter && (
                            <Button
                              size="small"
                              component={Link}
                              to={conscriptsPaths.entryFor(recruit.id)}
                              startIcon={<VisibilityIcon />}
                              sx={{ bgcolor: 'surface.low', minHeight: 30, px: 1.25 }}
                            >
                              {ar.common.view}
                            </Button>
                          )}
                          {canPrint && recruit.is_locked && (
                            <Tooltip title={ar.conscripts.labels.print}>
                              <IconButton
                                size="small"
                                component={Link}
                                to={conscriptsPaths.labelFor(recruit.id)}
                                aria-label={ar.conscripts.labels.print}
                                sx={{ bgcolor: 'surface.low', color: 'primary.main' }}
                              >
                                <QrCode2Icon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {recruits.data.items.length === 0 && <EmptyState text={ar.conscripts.search.noResults} />}
            <TablePager
              page={page}
              pageSize={pageSize}
              total={recruits.data.total}
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
    </SectionCard>
  );
}

export function SearchPage() {
  const { mode, q, year } = useCriteria();
  return (
    <>
      <PageHeader title={ar.conscripts.search.title} subtitle={ar.conscripts.search.subtitle} />
      <Box sx={{ display: 'grid', gap: 3 }}>
        {/* Remount the form when the URL criteria change (e.g. a search from the top bar). */}
        <SearchForm key={`${mode}|${q}|${year}`} />
        <Results />
        <Alert severity="info" icon={<InfoIcon sx={{ color: 'primary.main' }} />}>
          {ar.conscripts.search.printNote}
        </Alert>
      </Box>
    </>
  );
}
