import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { z } from 'zod';
import { API_BASE, api, type Schemas, unwrap } from '../../shared/api/client';
import { meQueryKey } from '../../shared/auth/auth';

export type ImportJob = Schemas['ImportOut'];
export type ImportRecord = Schemas['ImportRecordOut'];
export type Recruit = Schemas['RecruitOut'];
export type ExportJob = Schemas['ExportOut'];
export type RecruitDocument = Schemas['DocumentOut'];
export type RowStatus = 'VALID' | 'INVALID';

/** Import job states (backend docs/backend-poc.md). Active ones are still being parsed or validated. */
export const ACTIVE_IMPORT_STATUSES = ['QUEUED', 'PARSING', 'VALIDATING'] as const;
/** States in which the review report (valid/invalid rows) can be read. */
export const REPORT_STATUSES = ['READY_FOR_REVIEW', 'APPROVED', 'CANCELLED'] as const;

export const isActiveImport = (status: string) => (ACTIVE_IMPORT_STATUSES as readonly string[]).includes(status);
export const hasReport = (status: string) => (REPORT_STATUSES as readonly string[]).includes(status);

export const conscriptsKeys = {
  imports: ['conscripts', 'imports'] as const,
  importsList: (query: object) => ['conscripts', 'imports', 'list', query] as const,
  import: (id: string) => ['conscripts', 'imports', 'detail', id] as const,
  rows: (id: string, query: object) => ['conscripts', 'imports', 'rows', id, query] as const,
  export: (id: string) => ['conscripts', 'exports', id] as const,
  recruits: ['conscripts', 'recruits'] as const,
  recruitsSearch: (query: object) => ['conscripts', 'recruits', 'search', query] as const,
  recruit: (id: string) => ['conscripts', 'recruits', 'detail', id] as const,
  documents: (id: string) => ['conscripts', 'recruits', 'documents', id] as const,
  lookup: (kind: string) => ['lookups', kind] as const,
};

// --- imports -----------------------------------------------------------------------

export type ImportStatus = 'QUEUED' | 'PARSING' | 'VALIDATING' | 'READY_FOR_REVIEW' | 'APPROVED' | 'CANCELLED' | 'FAILED';

export function useImportsQuery(query: { page: number; page_size: number; status?: ImportStatus[] }, enabled = true) {
  return useQuery({
    queryKey: conscriptsKeys.importsList(query),
    queryFn: () => unwrap(api.GET('/api/v1/imports', { params: { query } })),
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval: 10_000,
  });
}

export function useImportQuery(id: string) {
  return useQuery({
    queryKey: conscriptsKeys.import(id),
    queryFn: () => unwrap(api.GET('/api/v1/imports/{job_id}', { params: { path: { job_id: id } } })),
    // Server-sent events push progress (useImportProgress); polling is the fallback if the stream drops.
    refetchInterval: (query) => (query.state.data && isActiveImport(query.state.data.status) ? 5000 : false),
  });
}

const progressSnapshot = z.object({
  id: z.string(),
  status: z.enum(['QUEUED', 'PARSING', 'VALIDATING', 'READY_FOR_REVIEW', 'APPROVED', 'CANCELLED', 'FAILED']),
  total_rows: z.number().int().nonnegative(),
  processed_rows: z.number().int().nonnegative(),
  valid_rows: z.number().int().nonnegative(),
  invalid_rows: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  retry_count: z.number().int().nonnegative(),
  last_error: z.string().nullable(),
});

/** Ignore malformed, cross-job or delayed stream events; reconnects must never roll progress back. */
export function mergeImportProgress(job: ImportJob, payload: unknown): ImportJob {
  const parsed = progressSnapshot.safeParse(payload);
  if (!parsed.success || parsed.data.id !== job.id || parsed.data.version <= job.progress_version) return job;
  const { version, ...data } = parsed.data;
  return { ...job, ...data, progress_version: version };
}

/** Live progress of a running import over SSE (GET /imports/{id}/events), merged into the job query. */
export function useImportProgress(id: string, active: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!active || typeof EventSource === 'undefined') return;
    const source = new EventSource(`${API_BASE}/imports/${id}/events`);
    source.addEventListener('progress', (event) => {
      let payload: unknown;
      try {
        payload = JSON.parse((event as MessageEvent<string>).data);
      } catch {
        return; // Five-second polling remains active if a proxy sends a malformed event.
      }
      const updated = queryClient.setQueryData<ImportJob>(conscriptsKeys.import(id), (job) =>
        job ? mergeImportProgress(job, payload) : job);
      if (updated && !isActiveImport(updated.status)) {
        source.close();
        void queryClient.invalidateQueries({ queryKey: conscriptsKeys.imports });
      }
    });
    source.addEventListener('unauthorized', () => {
      source.close();
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
    });
    return () => source.close();
  }, [id, active, queryClient]);
}

export function useImportRowsQuery(id: string, status: RowStatus, page: number, pageSize: number, enabled: boolean) {
  const query = { status, page: page + 1, page_size: pageSize };
  return useQuery({
    queryKey: conscriptsKeys.rows(id, query),
    queryFn: () =>
      unwrap(api.GET('/api/v1/imports/{job_id}/rows', { params: { path: { job_id: id }, query } })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export type UploadInput = { file: File; batch_number: number; enlistment_year: number };

export function useUploadImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, batch_number, enlistment_year }: UploadInput) =>
      unwrap(
        api.POST('/api/v1/imports', {
          // The typed body only describes the form fields; the real payload is built as multipart below.
          body: { file: file.name, batch_number, enlistment_year },
          bodySerializer: () => {
            const form = new FormData();
            form.append('file', file);
            form.append('batch_number', String(batch_number));
            form.append('enlistment_year', String(enlistment_year));
            return form;
          },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conscriptsKeys.imports }),
  });
}

function useInvalidateAfterDecision() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: conscriptsKeys.imports });
    void queryClient.invalidateQueries({ queryKey: conscriptsKeys.recruits });
  };
}

/** Inserts the valid rows as recruits. 409 if another import added the same national IDs meanwhile. */
export function useApproveImport(id: string) {
  const invalidate = useInvalidateAfterDecision();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/imports/{job_id}/approve', { params: { path: { job_id: id } } })),
    onSettled: invalidate,
  });
}

/** Discards the whole file; nothing is inserted. */
export function useCancelImport(id: string) {
  const invalidate = useInvalidateAfterDecision();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/imports/{job_id}/cancel', { params: { path: { job_id: id } } })),
    onSettled: invalidate,
  });
}

// --- exports of rejected rows ------------------------------------------------------

export function useCreateExport(importId: string) {
  return useMutation({
    mutationFn: (format: 'xlsx' | 'accdb') =>
      unwrap(api.POST('/api/v1/imports/{job_id}/exports', { params: { path: { job_id: importId } }, body: { format } })),
  });
}

export function useExportQuery(exportId: string | null) {
  return useQuery({
    queryKey: conscriptsKeys.export(exportId ?? ''),
    queryFn: () => unwrap(api.GET('/api/v1/exports/{export_id}', { params: { path: { export_id: exportId ?? '' } } })),
    enabled: exportId !== null,
    refetchInterval: (query) =>
      query.state.data && ['COMPLETED', 'FAILED'].includes(query.state.data.status) ? false : 1500,
  });
}

export const exportDownloadUrl = (exportId: string) => `${API_BASE}/exports/${exportId}/download`;

// --- recruits --------------------------------------------------------------------------

export type RecruitsQuery = {
  search?: string;
  national_id?: string;
  barcode?: string;
  name?: string;
  police_number?: string;
  enlistment_year?: number;
  page: number;
  page_size: number;
};

export function useRecruitsQuery(query: RecruitsQuery, enabled = true) {
  return useQuery({
    queryKey: conscriptsKeys.recruitsSearch(query),
    queryFn: () => unwrap(api.GET('/api/v1/recruits', { params: { query } })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useRecruitQuery(id: string) {
  return useQuery({
    queryKey: conscriptsKeys.recruit(id),
    queryFn: () => unwrap(api.GET('/api/v1/recruits/{recruit_id}', { params: { path: { recruit_id: id } } })),
  });
}

/** Lookup by national ID; resolves to the recruit, or rejects with the backend's 404/422 message. */
export function useFindByNationalId() {
  return useMutation({
    mutationFn: (nationalId: string) =>
      unwrap(
        api.GET('/api/v1/recruits/by-national-id/{national_id}', { params: { path: { national_id: nationalId } } }),
      ),
  });
}

export type ProfileInput = Schemas['CompleteProfile'];
export type ProfileEditInput = Schemas['EditProfile'];

export function useSaveRecruit(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ edit, body }: { edit: false; body: ProfileInput } | { edit: true; body: ProfileEditInput }) =>
      edit
        ? unwrap(api.PATCH('/api/v1/recruits/{recruit_id}', { params: { path: { recruit_id: id } }, body }))
        : unwrap(api.POST('/api/v1/recruits/{recruit_id}/complete', { params: { path: { recruit_id: id } }, body })),
    onSuccess: (recruit) => {
      queryClient.setQueryData(conscriptsKeys.recruit(id), recruit);
      void queryClient.invalidateQueries({ queryKey: conscriptsKeys.recruits });
    },
  });
}

export function useRecruitDocuments(id: string) {
  return useQuery({
    queryKey: conscriptsKeys.documents(id),
    queryFn: () =>
      unwrap(api.GET('/api/v1/recruits/{recruit_id}/documents', { params: { path: { recruit_id: id } } })),
  });
}

export function useUploadDocument(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      unwrap(
        api.POST('/api/v1/recruits/{recruit_id}/documents', {
          params: { path: { recruit_id: id } },
          body: { file: file.name },
          bodySerializer: () => {
            const form = new FormData();
            form.append('file', file);
            return form;
          },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conscriptsKeys.documents(id) }),
  });
}

export const documentDownloadUrl = (recruitId: string, documentId: string) =>
  `${API_BASE}/recruits/${recruitId}/documents/${documentId}/download`;

/** The printable 50 × 25 mm label. Opening it records a "label" entry in the audit log. */
export const labelUrl = (recruitId: string) => `${API_BASE}/recruits/${recruitId}/barcode`;

// --- lookups for display names -----------------------------------------------------------

export function useGovernorates() {
  return useQuery({
    queryKey: conscriptsKeys.lookup('official-governorates'),
    queryFn: () => unwrap(api.GET('/api/v1/lookups/official-governorates')),
    staleTime: 5 * 60_000,
  });
}

export function useQualifications() {
  return useQuery({
    queryKey: conscriptsKeys.lookup('qualifications'),
    queryFn: () => unwrap(api.GET('/api/v1/lookups/qualifications')),
    staleTime: 5 * 60_000,
  });
}
