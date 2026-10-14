import { api, type Schemas, unwrap } from '../../../shared/api/client';
import { ar } from '../../../shared/i18n/ar';

/** A lookup row as the generic table sees it. Each definition below calls the typed API for its kind. */
export type LookupRow = Record<string, string | number | boolean | null>;

export type FieldKind = 'text' | 'digits' | 'number' | 'boolean' | 'governorate' | 'month' | 'day';

export type LookupField = {
  name: string;
  label: string;
  kind: FieldKind;
  /** text: max length. digits: max digits. number: max value. */
  max?: number;
  /** digits: min digits. number: min value. */
  min?: number;
};

export type LookupDef = {
  key: string;
  label: string;
  idField: 'id' | 'batch_no';
  fields: LookupField[];
  /** Columns shown in the table (by field name), in order. */
  columns: string[];
  creatable: boolean;
  hint?: string;
  list: () => Promise<LookupRow[]>;
  create: (body: LookupRow) => Promise<LookupRow>;
  update: (id: number, body: LookupRow) => Promise<LookupRow>;
};

const rows = (data: unknown) => data as LookupRow[];
const row = (data: unknown) => data as LookupRow;
const notCreatable = () => Promise.reject(new Error('not creatable'));

const code = (min: number, max: number): LookupField => ({ name: 'code', label: ar.lookups.code, kind: 'digits', min, max });
const freeCode: LookupField = { name: 'code', label: ar.lookups.code, kind: 'text', max: 20 };
const name = (max: number): LookupField => ({ name: 'name_ar', label: ar.lookups.name, kind: 'text', max });
const active: LookupField = { name: 'is_active', label: ar.lookups.isActive, kind: 'boolean' };

export const lookupDefs: LookupDef[] = [
  {
    key: 'governorates',
    label: ar.lookups.tabs.governorates,
    idField: 'id',
    fields: [code(2, 2), name(100), active],
    columns: ['code', 'name_ar', 'is_active'],
    creatable: true,
    list: async () => rows(await unwrap(api.GET('/api/v1/lookups/governorates'))),
    create: async (body) =>
      row(await unwrap(api.POST('/api/v1/lookups/governorates', { body: body as Schemas['GovernorateIn'] }))),
    update: async (id, body) =>
      row(
        await unwrap(
          api.PUT('/api/v1/lookups/governorates/{row_id}', {
            params: { path: { row_id: id } },
            body: body as Schemas['GovernorateIn'],
          }),
        ),
      ),
  },
  {
    key: 'police-stations',
    label: ar.lookups.tabs.policeStations,
    idField: 'id',
    fields: [
      code(4, 4),
      name(100),
      { name: 'governorate_id', label: ar.lookups.governorate, kind: 'governorate' },
      active,
    ],
    columns: ['code', 'name_ar', 'governorate_id', 'is_active'],
    creatable: true,
    list: async () => rows(await unwrap(api.GET('/api/v1/lookups/police-stations'))),
    create: async (body) =>
      row(await unwrap(api.POST('/api/v1/lookups/police-stations', { body: body as Schemas['PoliceStationIn'] }))),
    update: async (id, body) =>
      row(
        await unwrap(
          api.PUT('/api/v1/lookups/police-stations/{row_id}', {
            params: { path: { row_id: id } },
            body: body as Schemas['PoliceStationIn'],
          }),
        ),
      ),
  },
  {
    key: 'qualifications',
    label: ar.lookups.tabs.qualifications,
    idField: 'id',
    fields: [
      code(1, 2),
      name(100),
      { name: 'service_months', label: ar.lookups.serviceMonths, kind: 'number', min: 1, max: 120 },
      active,
    ],
    columns: ['code', 'name_ar', 'service_months', 'is_active'],
    creatable: true,
    list: async () => rows(await unwrap(api.GET('/api/v1/lookups/qualifications'))),
    create: async (body) =>
      row(await unwrap(api.POST('/api/v1/lookups/qualifications', { body: body as Schemas['QualificationIn'] }))),
    update: async (id, body) =>
      row(
        await unwrap(
          api.PUT('/api/v1/lookups/qualifications/{row_id}', {
            params: { path: { row_id: id } },
            body: body as Schemas['QualificationIn'],
          }),
        ),
      ),
  },
  {
    key: 'batch-schedules',
    label: ar.lookups.tabs.batchSchedules,
    idField: 'batch_no',
    fields: [
      { name: 'start_month', label: ar.lookups.startMonth, kind: 'month' },
      { name: 'start_day', label: ar.lookups.startDay, kind: 'day' },
    ],
    columns: ['batch_no', 'start_month', 'start_day'],
    creatable: false,
    hint: ar.lookups.batchesFixed,
    list: async () => rows(await unwrap(api.GET('/api/v1/lookups/batch-schedules'))),
    create: notCreatable,
    update: async (id, body) =>
      row(
        await unwrap(
          api.PUT('/api/v1/lookups/batch-schedules/{row_id}', {
            params: { path: { row_id: id } },
            body: body as Schemas['BatchScheduleUpdate'],
          }),
        ),
      ),
  },
  {
    key: 'work-entities',
    label: ar.lookups.tabs.workEntities,
    idField: 'id',
    fields: [freeCode, name(200), active],
    columns: ['code', 'name_ar', 'is_active'],
    creatable: true,
    list: async () => rows(await unwrap(api.GET('/api/v1/lookups/work-entities'))),
    create: async (body) =>
      row(await unwrap(api.POST('/api/v1/lookups/work-entities', { body: body as Schemas['WorkEntityIn'] }))),
    update: async (id, body) =>
      row(
        await unwrap(
          api.PUT('/api/v1/lookups/work-entities/{row_id}', {
            params: { path: { row_id: id } },
            body: body as Schemas['WorkEntityIn'],
          }),
        ),
      ),
  },
  {
    key: 'action-types',
    label: ar.lookups.tabs.actionTypes,
    idField: 'id',
    fields: [freeCode, name(200), active],
    columns: ['code', 'name_ar', 'is_active'],
    creatable: true,
    list: async () => rows(await unwrap(api.GET('/api/v1/lookups/action-types'))),
    create: async (body) =>
      row(await unwrap(api.POST('/api/v1/lookups/action-types', { body: body as Schemas['ActionTypeIn'] }))),
    update: async (id, body) =>
      row(
        await unwrap(
          api.PUT('/api/v1/lookups/action-types/{row_id}', {
            params: { path: { row_id: id } },
            body: body as Schemas['ActionTypeIn'],
          }),
        ),
      ),
  },
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Client-side check mirroring the API and SQL rules; returns an Arabic message or null. */
export function validateField(field: LookupField, value: string | boolean, values: Record<string, string | boolean>): string | null {
  if (field.kind === 'boolean') return null;
  const text = String(value).trim();
  if (text === '') return ar.validation.required;
  switch (field.kind) {
    case 'text':
      return text.length > (field.max ?? 200) ? ar.validation.maxLength(field.max ?? 200) : null;
    case 'digits': {
      const min = field.min ?? 1;
      const max = field.max ?? min;
      if (new RegExp(`^[0-9]{${min},${max}}$`).test(text)) return null;
      return min === max ? ar.validation.digits(max) : ar.validation.digitsUpTo(max);
    }
    case 'number': {
      const n = Number(text);
      const [min, max] = [field.min ?? 0, field.max ?? Number.MAX_SAFE_INTEGER];
      return Number.isInteger(n) && n >= min && n <= max ? null : ar.validation.numberRange(min, max);
    }
    case 'month':
    case 'governorate':
      return null;
    case 'day': {
      const day = Number(text);
      const month = Number(values.start_month);
      const limit = DAYS_IN_MONTH[month - 1] ?? 31;
      if (!Number.isInteger(day) || day < 1 || day > 31) return ar.validation.numberRange(1, 31);
      return day > limit ? ar.validation.invalidDay : null;
    }
  }
}
