import createClient from 'openapi-fetch';
import { ar } from '../i18n/ar';
import type { components, paths } from './schema';

export type Schemas = components['schemas'];
export type Me = Schemas['MeResponse'];
export type HealthResponse = Schemas['HealthResponse'];

export const API_BASE = '/api/v1';

/** Typed client generated from FastAPI's OpenAPI schema (scripts/gen-types.ps1). */
export const api = createClient<paths>({
  // Absolute URLs (same origin) work in the browser and in the test DOM alike.
  baseUrl: typeof window === 'undefined' ? '' : window.location.origin,
  credentials: 'same-origin',
  // Resolve fetch per call (not once at import) so tests can stub it.
  fetch: (request) => globalThis.fetch(request),
});

/** An API error: `message` is the Arabic `detail` from the backend, `code` its stable machine code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type FetchResult<T> = { data?: T; error?: unknown; response: Response };

/** Returns the data of an openapi-fetch call or throws ApiError with the backend's Arabic message. */
export async function unwrap<T>(call: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await call;
  if (!response.ok) {
    const body = (error ?? {}) as { detail?: unknown; code?: unknown };
    throw new ApiError(
      response.status,
      typeof body.detail === 'string' ? body.detail : ar.common.errorGeneric,
      typeof body.code === 'string' ? body.code : 'error',
    );
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return ar.common.networkError;
  return ar.common.errorGeneric;
}
