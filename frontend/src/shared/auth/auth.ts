import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, type Me, type Schemas, unwrap } from '../api/client';

export const meQueryKey = ['auth', 'me'] as const;

/** null when not signed in. */
async function fetchMe(): Promise<Me | null> {
  const { data, response } = await api.GET('/api/v1/auth/me');
  if (response.status === 401) return null;
  if (!response.ok || !data) throw new ApiError(response.status, '', 'error');
  return data;
}

export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: fetchMe, staleTime: Infinity, retry: false });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['LoginRequest']) => unwrap(api.POST('/api/v1/auth/login', { body })),
    onSuccess: (me) => {
      // Drop anything cached for a previous user.
      queryClient.removeQueries();
      queryClient.setQueryData(meQueryKey, me);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/auth/logout')),
    onSettled: () => {
      queryClient.removeQueries();
      queryClient.setQueryData(meQueryKey, null);
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['ChangePasswordRequest']) =>
      unwrap(api.POST('/api/v1/auth/change-password', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meQueryKey }),
  });
}
