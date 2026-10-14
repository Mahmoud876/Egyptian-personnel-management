import type { RouteObject } from 'react-router';
import { RequirePermission } from '../../shared/permissions/permissions';
import { EntryLookupPage, RecruitEntryPage } from './entry/EntryPage';
import { ImportReportPage } from './imports/ImportReportPage';
import { ImportsPage } from './imports/ImportsPage';
import { LabelLookupPage, LabelPage } from './labels/LabelsPage';
import { conscriptsPaths } from './paths';
import { SearchPage } from './search/SearchPage';

// Each guard uses the same permission as the menu item; the backend enforces its own check on every call.
export const conscriptsRoutes: RouteObject[] = [
  {
    path: conscriptsPaths.imports,
    element: (
      <RequirePermission perm="conscripts.import.upload">
        <ImportsPage />
      </RequirePermission>
    ),
  },
  {
    path: conscriptsPaths.importReport(':importId'),
    element: (
      <RequirePermission perm="conscripts.import.upload">
        <ImportReportPage />
      </RequirePermission>
    ),
  },
  {
    path: conscriptsPaths.search,
    element: (
      <RequirePermission perm="conscripts.view">
        <SearchPage />
      </RequirePermission>
    ),
  },
  {
    path: conscriptsPaths.entry,
    element: (
      <RequirePermission perm="conscripts.enter">
        <EntryLookupPage />
      </RequirePermission>
    ),
  },
  {
    path: conscriptsPaths.entryFor(':recruitId'),
    element: (
      <RequirePermission perm="conscripts.enter">
        <RecruitEntryPage />
      </RequirePermission>
    ),
  },
  {
    path: conscriptsPaths.labels,
    element: (
      <RequirePermission perm="conscripts.label.print">
        <LabelLookupPage />
      </RequirePermission>
    ),
  },
  {
    path: conscriptsPaths.labelFor(':recruitId'),
    element: (
      <RequirePermission perm="conscripts.label.print">
        <LabelPage />
      </RequirePermission>
    ),
  },
];
