import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatDateTimeNumeric } from '../../../shared/format';
import { ar } from '../../../shared/i18n/ar';
import { Can } from '../../../shared/permissions/permissions';
import { Mono } from '../../../shared/ui/DataText';
import { AddIcon, PeopleIcon, SearchIcon } from '../../../shared/ui/icons';
import { InitialsAvatar } from '../../../shared/ui/InitialsAvatar';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { SectionCard } from '../../../shared/ui/SectionCard';
import { EmptyState, ErrorAlert, LoadingState } from '../../../shared/ui/states';
import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { TablePager } from '../../../shared/ui/TablePager';
import { type UsersQuery, useUsersQuery } from '../api';
import { adminPaths } from '../paths';

type StatusFilter = 'all' | 'active' | 'inactive';

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function RoleBadge({ role }: { role: string }) {
  return role === 'system_administrator' ? (
    <StatusBadge tone="primary">{ar.users.adminRole}</StatusBadge>
  ) : (
    <StatusBadge tone="neutral">{ar.users.operatorRole}</StatusBadge>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <StatusBadge tone="success">{ar.common.active}</StatusBadge>
  ) : (
    <StatusBadge tone="error">{ar.common.inactive}</StatusBadge>
  );
}

export function UsersListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const q = useDebounced(search.trim(), 300);

  useEffect(() => setPage(0), [q, status]);

  const query: UsersQuery = { page: page + 1, page_size: pageSize };
  if (q) query.q = q;
  if (status !== 'all') query.is_active = status === 'active';
  const users = useUsersQuery(query);

  return (
    <>
      <PageHeader
        title={ar.users.title}
        subtitle={ar.users.subtitle}
        actions={
          <Can perm="users.manage">
            <Button component={Link} to={adminPaths.newUser} variant="contained" startIcon={<AddIcon />}>
              {ar.users.newUser}
            </Button>
          </Can>
        }
      />
      <SectionCard
        icon={<PeopleIcon />}
        title={ar.users.listTitle}
        actions={
          users.data && (
            <StatusBadge tone="primary" dot={false}>
              {ar.users.count(users.data.total)}
            </StatusBadge>
          )
        }
        flush
      >
        <Box
          sx={{
            p: 2,
            display: 'flex',
            gap: 2,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <TextField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            label={ar.common.search}
            placeholder={ar.users.searchPlaceholder}
            sx={{ flex: 1, minWidth: 240 }}
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
          <TextField
            select
            label={ar.common.status}
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            sx={{ width: 180 }}
          >
            <MenuItem value="all">{ar.common.all}</MenuItem>
            <MenuItem value="active">{ar.common.active}</MenuItem>
            <MenuItem value="inactive">{ar.common.inactive}</MenuItem>
          </TextField>
        </Box>
        {users.isError && (
          <Box sx={{ p: 2 }}>
            <ErrorAlert error={users.error} onRetry={() => void users.refetch()} />
          </Box>
        )}
        {users.isPending ? (
          <LoadingState />
        ) : (
          users.data && (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{ar.users.user}</TableCell>
                      <TableCell>{ar.users.role}</TableCell>
                      <TableCell>{ar.users.workEntity}</TableCell>
                      <TableCell>{ar.common.status}</TableCell>
                      <TableCell>{ar.users.lastLogin}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.data.items.map((user) => (
                      <TableRow
                        key={user.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => void navigate(adminPaths.user(user.id))}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                            <InitialsAvatar name={user.full_name} size={32} soft />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {user.full_name}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                                <Mono>{user.username}</Mono>
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <RoleBadge role={user.role} />
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>{user.work_entity_name ?? ar.common.none}</TableCell>
                        <TableCell>
                          <ActiveBadge active={user.is_active} />
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>
                          {user.last_login_at ? <Mono>{formatDateTimeNumeric(user.last_login_at)}</Mono> : ar.users.never}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {users.data.items.length === 0 && <EmptyState />}
              <TablePager
                page={page}
                pageSize={pageSize}
                total={users.data.total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(0);
                }}
                pageSizeOptions={[10, 20, 50, 100]}
              />
            </>
          )
        )}
      </SectionCard>
    </>
  );
}
