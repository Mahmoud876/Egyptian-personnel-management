import type { RouteObject } from 'react-router';
import { ar } from '../../shared/i18n/ar';
import { RequirePermission } from '../../shared/permissions/permissions';
import { UnderDevelopment } from '../../shared/ui/ErrorPages';
import { employeesPaths } from './paths';

// Screens come in Phase 5 (docs/skeleton-plan.md). The guards are already in place.
export const employeesRoutes: RouteObject[] = [
  {
    path: employeesPaths.list,
    element: (
      <RequirePermission perm="employees.view">
        <UnderDevelopment title={ar.menu.employees} />
      </RequirePermission>
    ),
  },
  {
    path: employeesPaths.imports,
    element: (
      <RequirePermission perm="employees.import">
        <UnderDevelopment title={ar.menu.employeesImport} />
      </RequirePermission>
    ),
  },
  {
    path: employeesPaths.reports,
    element: (
      <RequirePermission perm="reports.view">
        <UnderDevelopment title={ar.menu.reports} />
      </RequirePermission>
    ),
  },
  {
    path: employeesPaths.migration,
    element: (
      <RequirePermission perm="migration.run">
        <UnderDevelopment title={ar.menu.migration} />
      </RequirePermission>
    ),
  },
];
