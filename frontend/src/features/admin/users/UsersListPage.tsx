import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
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
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatDateTime } from '../../../shared/format';
import { ar } from '../../../shared/i18n/ar';
import { Can } from '../../../shared/permissions/permissions';
import { AddIcon, SearchIcon } from '../../../shared/ui/icons';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { EmptyState, ErrorAlert, LoadingState } from '../../../shared/ui/states';
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
        actions={
          <Can perm="users.manage">
            <Button component={Link} to={adminPaths.newUser} variant="contained" startIcon={<AddIcon />}>
              {ar.users.newUser}
            </Button>
          </Can>
        }
      />
      <Paper variant="outlined">
        <Box sx={{ p: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={ar.users.searchPlaceholder}
            aria-label={ar.common.search}
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
            sx={{ width: 160 }}
          >
            <MenuItem value="all">{ar.common.all}</MenuItem>
            <MenuItem value="active">{ar.common.active}</MenuItem>
            <MenuItem value="inactive">{ar.common.inactive}</MenuItem>
          </TextField>
        </Box>
        {users.isError && (
          <Box sx={{ px: 2, pb: 2 }}>
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
                      <TableCell>{ar.users.username}</TableCell>
                      <TableCell>{ar.users.fullName}</TableCell>
                      <TableCell>{ar.users.workEntity}</TableCell>
                      <TableCell>{ar.common.status}</TableCell>
                      <TableCell>{ar.users.permissionCount}</TableCell>
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
                        <TableCell dir="ltr" sx={{ textAlign: 'right' }}>
                          {user.username}
                        </TableCell>
                        <TableCell>{user.full_name}</TableCell>
                        <TableCell>{user.work_entity_name ?? ar.common.none}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={user.is_active ? ar.common.active : ar.common.inactive}
                            color={user.is_active ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell>{user.permission_count}</TableCell>
                        <TableCell>{user.last_login_at ? formatDateTime(user.last_login_at) : ar.users.never}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {users.data.items.length === 0 && <EmptyState />}
              <TablePagination
                component="div"
                count={users.data.total}
                page={page}
                rowsPerPage={pageSize}
                rowsPerPageOptions={[10, 20, 50, 100]}
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
