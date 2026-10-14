import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Schemas, unwrap } from '../../shared/api/client';

export type UserListItem = Schemas['UserListItem'];
export type UserDetail = Schemas['UserDetail'];
export type PermissionInfo = Schemas['PermissionOut'];
export type Template = { id: number; name_ar: string; description_ar: string | null; permissions: string[] };
export type AuditEntry = Schemas['AuditEntry'];
export type WorkEntity = Schemas['WorkEntityOut'];

export const adminKeys = {
  users: ['admin', 'users'] as const,
  usersList: (query: object) => ['admin', 'users', 'list', query] as const,
  user: (id: number) => ['admin', 'users', 'detail', id] as const,
  permissions: ['admin', 'permissions'] as const,
  templates: ['admin', 'templates'] as const,
  audit: (query: object) => ['admin', 'audit', query] as const,
  auditFacets: ['admin', 'audit', 'facets'] as const,
  lookup: (kind: string) => ['lookups', kind] as const,
};

// --- users ---------------------------------------------------------------------

export type UsersQuery = { q?: string; is_active?: boolean; page: number; page_size: number };

export function useUsersQuery(query: UsersQuery) {
  return useQuery({
    queryKey: adminKeys.usersList(query),
    queryFn: () => unwrap(api.GET('/api/v1/users', { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useUserQuery(id: number | null) {
  return useQuery({
    queryKey: adminKeys.user(id ?? 0),
    queryFn: () => unwrap(api.GET('/api/v1/users/{user_id}', { params: { path: { user_id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: adminKeys.users });
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (body: Schemas['UserCreate']) => unwrap(api.POST('/api/v1/users', { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateUser(id: number) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (body: Schemas['UserUpdate']) =>
      unwrap(api.PUT('/api/v1/users/{user_id}', { params: { path: { user_id: id } }, body })),
    onSuccess: invalidate,
  });
}

export function useSetUserPermissions(id: number) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (permissions: string[]) =>
      unwrap(api.PUT('/api/v1/users/{user_id}/permissions', { params: { path: { user_id: id } }, body: { permissions } })),
    onSuccess: invalidate,
  });
}

export function useResetPassword(id: number) {
  return useMutation({
    mutationFn: (new_password: string) =>
      unwrap(
        api.POST('/api/v1/users/{user_id}/reset-password', { params: { path: { user_id: id } }, body: { new_password } }),
      ),
  });
}

// --- permissions catalog and templates -----------------------------------------

export function usePermissionsCatalog() {
  return useQuery({
    queryKey: adminKeys.permissions,
    queryFn: () => unwrap(api.GET('/api/v1/permissions')),
    staleTime: Infinity,
  });
}

// --- audit -----------------------------------------------------------------------

export type AuditQuery = {
  q?: string;
  user_id?: number;
  action?: string;
  entity?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  page_size: number;
};

export function useAuditQuery(query: AuditQuery, enabled = true) {
  return useQuery({
    queryKey: adminKeys.audit(query),
    enabled,
    queryFn: () => unwrap(api.GET('/api/v1/audit', { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useAuditFacets() {
  return useQuery({ queryKey: adminKeys.auditFacets, queryFn: () => unwrap(api.GET('/api/v1/audit/facets')) });
}

// --- lookups used by admin forms ------------------------------------------------

export function useWorkEntities() {
  return useQuery({
    queryKey: adminKeys.lookup('work-entities'),
    queryFn: () => unwrap(api.GET('/api/v1/lookups/work-entities')),
  });
}
