import type { RouteObject } from 'react-router';
import { adminRoutes } from '../features/admin/routes';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { conscriptsRoutes } from '../features/conscripts/routes';
import { employeesRoutes } from '../features/employees/routes';
import { CHANGE_PASSWORD_PATH, RequireAuth } from '../shared/auth/RequireAuth';
import { NotFoundPage } from '../shared/ui/ErrorPages';
import { HomePage } from './HomePage';
import { AppLayout } from './layout/AppLayout';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: CHANGE_PASSWORD_PATH, element: <ChangePasswordPage /> },
      ...adminRoutes,
      ...conscriptsRoutes,
      ...employeesRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
