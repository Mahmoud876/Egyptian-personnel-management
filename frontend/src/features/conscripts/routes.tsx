import type { RouteObject } from 'react-router';
import { ar } from '../../shared/i18n/ar';
import { RequirePermission } from '../../shared/permissions/permissions';
import { UnderDevelopment } from '../../shared/ui/ErrorPages';
import { conscriptsPaths } from './paths';

// Screens come in Phase 4 (docs/skeleton-plan.md). The guards are already in place.
export const conscriptsRoutes: RouteObject[] = [
  {
    path: conscriptsPaths.upload,
    element: (
      <RequirePermission perm="conscripts.import.upload">
        <UnderDevelopment title={ar.menu.conscriptsUpload} />
      </RequirePermission>
    ),
  },
  {
    path: conscriptsPaths.search,
    element: (
      <RequirePermission perm="conscripts.view">
        <UnderDevelopment title={ar.menu.conscriptsSearch} />
      </RequirePermission>
    ),
  },
  {
    path: conscriptsPaths.entry,
    element: (
      <RequirePermission perm="conscripts.enter">
        <UnderDevelopment title={ar.menu.conscriptsEntry} />
      </RequirePermission>
    ),
  },
  {
    path: conscriptsPaths.labels,
    element: (
      <RequirePermission perm="conscripts.label.print">
        <UnderDevelopment title={ar.menu.conscriptsLabels} />
      </RequirePermission>
    ),
  },
];
