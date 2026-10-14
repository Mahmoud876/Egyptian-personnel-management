import { useQuery } from '@tanstack/react-query';
import { ApiError, api, type HealthResponse } from '../shared/api/client';

// 503 still carries a HealthResponse body (server up, database down), so it is not treated as an error.
async function fetchHealth(): Promise<HealthResponse> {
  const { data, error, response } = await api.GET('/api/v1/health');
  const body = data ?? (response.status === 503 ? (error as HealthResponse | undefined) : undefined);
  if (!body) throw new ApiError(response.status, '', 'health_unavailable');
  return body;
}

export function useHealthQuery() {
  return useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10_000,
  });
}
