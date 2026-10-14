import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { FullPageError, FullPageLoader } from '../ui/states';
import { useMe } from './auth';

export const CHANGE_PASSWORD_PATH = '/change-password';

/** Sends signed-out users to /login, and users with a temporary password to the change-password screen. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isPending, isError, refetch } = useMe();
  const location = useLocation();

  if (isPending) return <FullPageLoader />;
  if (isError) return <FullPageError onRetry={() => void refetch()} />;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (me.must_change_password && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }
  return children;
}
