import { type ReactNode, useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { api } from '../api/client';
import { useMe } from '../auth/auth';
import { ForbiddenPage } from '../ui/ErrorPages';

/*
 * Permission checks in the UI. They only hide what the user can't do; the backend enforces every rule.
 * Checks use permission codes only, never role or template names (docs/permissions.md).
 */

export function usePermission(code: string): boolean {
  const { data: me } = useMe();
  return me?.permissions.includes(code) ?? false;
}

export function useAnyPermission(codes: readonly string[]): boolean {
  const { data: me } = useMe();
  return codes.some((code) => me?.permissions.includes(code) ?? false);
}

type CanProps = { children: ReactNode } & ({ perm: string; anyOf?: never } | { anyOf: readonly string[]; perm?: never });

/** Renders children only if the user has `perm` (or any of `anyOf`). */
export function Can(props: CanProps) {
  const codes = props.perm !== undefined ? [props.perm] : props.anyOf;
  return useAnyPermission(codes) ? props.children : null;
}

/**
 * Route guard. Without the permission it shows the 403 page and asks the backend to record the attempt
 * (POST /auth/permission-check), so it appears in the audit log.
 */
export function RequirePermission({ perm, children }: { perm: string; children: ReactNode }) {
  const allowed = usePermission(perm);
  const { pathname } = useLocation();
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (allowed || reported.current === pathname) return;
    reported.current = pathname;
    void api.POST('/api/v1/auth/permission-check', { body: { permission: perm, path: pathname.slice(0, 100) } });
  }, [allowed, perm, pathname]);

  return allowed ? children : <ForbiddenPage />;
}
