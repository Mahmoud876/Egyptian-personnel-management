import { adminPaths } from '../features/admin/paths';
import { conscriptsPaths } from '../features/conscripts/paths';
import { employeesPaths } from '../features/employees/paths';
import { ar } from '../shared/i18n/ar';
import {
  BadgeIcon,
  DashboardIcon,
  EditNoteIcon,
  FolderOpenIcon,
  HistoryIcon,
  ManageSearchIcon,
  PeopleIcon,
  QrCode2Icon,
  ReportIcon,
  StorageIcon,
  TuneIcon,
  UploadFileIcon,
} from '../shared/ui/icons';

export type MenuItem = {
  label: string;
  path: string;
  icon: typeof DashboardIcon;
  /** Permission code that shows the item. Omitted = every signed-in user. */
  perm?: string;
};

export type MenuGroup = { label: string; items: MenuItem[] };

/** Sidebar. Each item declares the permission that shows it; the matching route has the same guard. */
export const menu: MenuGroup[] = [
  { label: ar.menu.groups.main, items: [{ label: ar.menu.home, path: '/', icon: DashboardIcon }] },
  {
    label: ar.menu.groups.conscripts,
    items: [
      { label: ar.menu.conscriptsUpload, path: conscriptsPaths.imports, icon: UploadFileIcon, perm: 'conscripts.import.upload' },
      { label: ar.menu.conscriptsSearch, path: conscriptsPaths.search, icon: ManageSearchIcon, perm: 'conscripts.view' },
      { label: ar.menu.conscriptsEntry, path: conscriptsPaths.entry, icon: EditNoteIcon, perm: 'conscripts.enter' },
      { label: ar.menu.conscriptsLabels, path: conscriptsPaths.labels, icon: QrCode2Icon, perm: 'conscripts.label.print' },
    ],
  },
  {
    label: ar.menu.groups.employees,
    items: [
      { label: ar.menu.employees, path: employeesPaths.list, icon: BadgeIcon, perm: 'employees.view' },
      { label: ar.menu.employeesImport, path: employeesPaths.imports, icon: FolderOpenIcon, perm: 'employees.import' },
      { label: ar.menu.reports, path: employeesPaths.reports, icon: ReportIcon, perm: 'reports.view' },
      { label: ar.menu.migration, path: employeesPaths.migration, icon: StorageIcon, perm: 'migration.run' },
    ],
  },
  {
    label: ar.menu.groups.admin,
    items: [
      { label: ar.menu.users, path: adminPaths.users, icon: PeopleIcon, perm: 'users.view' },
      { label: ar.menu.audit, path: adminPaths.audit, icon: HistoryIcon, perm: 'audit.view' },
      { label: ar.menu.lookups, path: adminPaths.lookups, icon: TuneIcon, perm: 'lookups.manage' },
    ],
  },
];

/** The menu filtered to what `permissions` allow; empty groups are dropped. */
export function visibleMenu(permissions: readonly string[]): MenuGroup[] {
  return menu
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.perm === undefined || permissions.includes(item.perm)),
    }))
    .filter((group) => group.items.length > 0);
}

/** The item whose path best matches `pathname` (longest prefix), so /admin/users/5 highlights "users". */
export function activeMenuPath(pathname: string, groups: MenuGroup[]): string | null {
  let best: string | null = null;
  for (const item of groups.flatMap((group) => group.items)) {
    const matches = item.path === '/' ? pathname === '/' : pathname === item.path || pathname.startsWith(`${item.path}/`);
    if (matches && (best === null || item.path.length > best.length)) best = item.path;
  }
  return best;
}

/** Breadcrumb trail for the active item: [group, item]. Empty on the home page and unknown paths. */
export function activeTrail(pathname: string, groups: MenuGroup[]): string[] {
  const active = activeMenuPath(pathname, groups);
  if (active === null || active === '/') return [];
  for (const group of groups) {
    const item = group.items.find((candidate) => candidate.path === active);
    if (item) return [group.label, item.label];
  }
  return [];
}
