export const conscriptsPaths = {
  /** Upload form and history of uploaded files. */
  imports: '/conscripts/imports',
  importReport: (id: string) => `/conscripts/imports/${id}`,
  search: '/conscripts/search',
  /** Enlistment data entry: lookup by national ID, then the recruit's profile. */
  entry: '/conscripts/entry',
  entryFor: (id: string) => `/conscripts/entry/${id}`,
  labels: '/conscripts/labels',
  labelFor: (id: string) => `/conscripts/labels/${id}`,
} as const;
