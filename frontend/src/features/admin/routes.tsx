import type { RouteObject } from 'react-router';
import { RequirePermission } from '../../shared/permissions/permissions';
import { AuditLogPage } from './audit/AuditLogPage';
import { LookupsPage } from './lookups/LookupsPage';
import { adminPaths } from './paths';
import { TemplatesPage } from './templates/TemplatesPage';
import { UserEditPage } from './users/UserEditPage';
import { UsersListPage } from './users/UsersListPage';

export const adminRoutes: RouteObject[] = [
  {
    path: adminPaths.users,
    element: (
      <RequirePermission perm="users.view">
        <UsersListPage />
      </RequirePermission>
    ),
  },
  {
    path: adminPaths.newUser,
    element: (
      <RequirePermission perm="users.manage">
        <UserEditPage />
      </RequirePermission>
    ),
  },
  {
    path: adminPaths.user(':userId'),
    element: (
      <RequirePermission perm="users.view">
        <UserEditPage />
      </RequirePermission>
    ),
  },
  {
    path: adminPaths.templates,
    element: (
      <RequirePermission perm="templates.manage">
        <TemplatesPage />
      </RequirePermission>
    ),
  },
  {
    path: adminPaths.audit,
    element: (
      <RequirePermission perm="audit.view">
        <AuditLogPage />
      </RequirePermission>
    ),
  },
  {
    path: adminPaths.lookups,
    element: (
      <RequirePermission perm="lookups.manage">
        <LookupsPage />
      </RequirePermission>
    ),
  },
];
