# Permission model

Current authorization is RBAC, required by FR-27 of the owner's PoC specification. Each account has one role, and `app/core/roles.py` derives its permissions. Direct user grants and editable permission templates do not influence access. [backend-poc.md](backend-poc.md) documents the complete migration and workflow.

- `system_administrator`: all ten PoC colon-separated codes below, plus lookup maintenance.
- `data_entry_operator`: `profile:get`, `profile:insert`, `barcode:get`.
- Dot-separated conscript/admin names are compatibility aliases for the existing frontend. Civilian employee codes below are retained in the historical catalog but are not granted by these two conscript roles.

Routes declare `require_permission(...)`; the backend enforces access and audits denials. The UI hides unavailable actions. `GET /auth/me` returns the user's role and derived permissions. `GET /roles` is the administrator's fixed role catalog. Nonempty direct grants on user creation are rejected; the old assignment endpoint returns 409, and template routes are retired.

Sessions use opaque HTTP-only, SameSite=Strict cookies with hashed token keys in Redis, idle TTL and an absolute lifetime. Every authenticated request checks the account's active flag and SQL session version. Role changes, deactivation and password resets revoke existing sessions. SQL `user_session` rows are no longer used.

Migration 009 assigns existing accounts with the old `users.manage` grant to administrator and other accounts to operator once. New accounts default to operator. `scripts/create-admin.ps1` creates or resets the administrator role and forces a password change. Historical permission/template tables remain for compatibility, not authorization.

The catalog below includes active PoC codes and historical codes so database seeds and older UI identifiers remain documented. Historical codes do not imply implemented civilian workflows.

## Permission codes

### Shared / administration
| Code | Arabic name | Allows |
| --- | --- | --- |
| `users.view` | عرض المستخدمين | See the user list and each user's permissions |
| `users.manage` | إدارة المستخدمين | Create, edit, deactivate users; assign permissions; reset passwords |
| `templates.manage` | إدارة قوالب الصلاحيات | Create and edit permission templates |
| `lookups.manage` | إدارة البيانات المرجعية | Edit governorates, police stations, qualifications, batch schedule, work entities, action types |
| `audit.view` | عرض سجل الرقابة | View the audit log |

### Conscripts
| Code | Arabic name | Allows |
| --- | --- | --- |
| `conscripts.view` | الاستعلام عن المجندين | Search and view conscript records |
| `conscripts.enter` | تسجيل بيانات التجنيد | Look up a received record, enter police number and dates, save (locks the record) |
| `conscripts.edit_locked` | تعديل بيانات بعد الحفظ | Edit a record after it is locked |
| `conscripts.label.print` | طباعة الباركود | Print barcode labels |
| `conscripts.import.upload` | رفع ملف القوات المسلحة | Upload a file, choose batch and year, see the validation report |
| `conscripts.import.approve` | اعتماد أو إلغاء الرفع | Approve the valid rows or cancel the whole upload |
| `conscripts.import.export` | تصدير المرفوضين | Export rejected rows (Excel / Access) with reasons |

### Civilian employees
| Code | Arabic name | Allows |
| --- | --- | --- |
| `employees.view` | عرض الموظفين | Search and view employee records (own work entity unless `employees.scope.all`) |
| `employees.scope.all` | كل جهات العمل | See employees of every work entity |
| `employees.create` | إضافة موظف | Create employees |
| `employees.edit` | تعديل موظف | Edit employees |
| `employees.delete` | حذف موظف | Soft-delete employees |
| `employees.history.view` | عرض سجل التغييرات | View a record's past versions |
| `job_actions.create` | تسجيل إجراء وظيفي | Record a job action and attach its decision |
| `documents.view` | عرض المستندات | Open attached documents |
| `documents.upload` | رفع المستندات | Upload and link documents |
| `employees.import` | استيراد ملفات | Import Excel / Access files |
| `reports.view` | عرض التقارير | Run and print reports |
| `reports.export` | تصدير التقارير | Export reports to Excel / PDF |
| `migration.run` | تشغيل الترحيل | Start a migration run and see its reconciliation report |
| `migration.rollback` | التراجع عن الترحيل | Roll back a migration run |
| `backup.manage` | النسخ الاحتياطي | Run backups and restores |

### PoC role permission codes (current backend)
| Code | Arabic name | Allows |
| --- | --- | --- |
| `file:insert` | استيراد واعتماد وتصدير الملفات | Admin import, approval, cancellation and exports |
| `audit:get` | عرض سجل الرقابة | Admin audit access |
| `profile:get` | عرض المجندين | Read/search recruits |
| `profile:insert` | إكمال بيانات التجنيد | Complete an unlocked profile |
| `profile:update` | تعديل بيانات المجندين | Admin correction of profiles |
| `barcode:get` | طباعة الباركود | Print a completed recruit label |
| `user:get` | عرض المستخدمين | Admin user/role catalog |
| `user:insert` | إضافة مستخدم | Admin account creation |
| `user:update` | تعديل المستخدم والدور | Admin role, details and password management |
| `user:delete` | إيقاف المستخدم | Admin account deactivation |

## Seed templates

| Template | Codes |
| --- | --- |
| مدير النظام — المجندين | all `conscripts.*`, `users.view`, `users.manage`, `templates.manage`, `lookups.manage`, `audit.view` |
| مدخل بيانات — المجندين | `conscripts.view`, `conscripts.enter`, `conscripts.label.print` |
| مدير النظام — العاملين | all `employees.*`, `job_actions.create`, `documents.*`, `reports.*`, `migration.*`, `backup.manage`, `users.*`, `templates.manage`, `lookups.manage`, `audit.view` |
| موظف شئون العاملين | `employees.view`, `employees.create`, `employees.edit`, `employees.delete`, `job_actions.create`, `documents.view`, `documents.upload`, `employees.import`, `reports.view`, `reports.export` |
| مستعلم | `employees.view`, `documents.view`, `reports.view` |
| مراجع | `employees.view`, `employees.scope.all`, `employees.history.view`, `documents.view`, `audit.view` |

These are historical seed templates retained for migration compatibility only. They do not grant access in the current RBAC backend.
