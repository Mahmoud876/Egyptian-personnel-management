import { useQuery } from '@tanstack/react-query';
import { API_BASE, ApiError, type HealthResponse } from '../shared/api/client';

// 503 still carries a HealthResponse body (server up, database down), so it is not treated as an error.
async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`, { headers: { Accept: 'application/json' } });
  if (response.status !== 200 && response.status !== 503) {
    throw new ApiError(response.status, `GET /health failed with ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}

export function useHealthQuery() {
  return useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10_000,
  });
}
