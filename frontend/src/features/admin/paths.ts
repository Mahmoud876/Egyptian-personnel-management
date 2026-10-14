export const adminPaths = {
  users: '/admin/users',
  newUser: '/admin/users/new',
  user: (id: number | string) => `/admin/users/${id}`,
  templates: '/admin/templates',
  audit: '/admin/audit',
  lookups: '/admin/lookups',
} as const;
