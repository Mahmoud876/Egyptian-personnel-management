# Permission model

Access is decided by **permission codes assigned directly to each user**. There are no roles in the authorisation logic.

**Permission templates** exist only to save typing: when an admin creates or edits a user, they can apply a template (e.g. "Data entry") to pre-fill that user's permissions, then add or remove individual codes. Applying a template **copies** its codes into `user_permission`. Later changes to a template do not change existing users. The check at request time only ever looks at the user's own codes.

## Tables

```
permission            code PK (varchar 100), module, name_ar, name_en, description_ar
app_user              id PK, username UQ, full_name, password_hash, is_active, work_entity_id FK NULL,
                      must_change_password, last_login_at, created_at/by, updated_at/by
user_permission       user_id FK, permission_code FK, granted_at, granted_by    PK (user_id, permission_code)
permission_template   id PK, name_ar UQ, description_ar
template_permission   template_id FK, permission_code FK                        PK (template_id, permission_code)
user_session          id PK (random 32 bytes, hex), user_id FK, created_at, expires_at, last_seen_at, ip
audit_log             id PK, at, user_id FK NULL, ip, action, entity, entity_id, permission_code,
                      old_values NVARCHAR(MAX) JSON, new_values NVARCHAR(MAX) JSON, batch_id NULL
```

`permission` rows are seeded by script (`sql/003_permissions_seed.sql`); the app never creates codes at runtime. The DB login used by the app has `INSERT` only on `audit_log` (no `UPDATE`/`DELETE`).

## How checks work

Backend:
```python
@router.post("/imports/conscripts")
def upload(..., user = Depends(require_permission("conscripts.import.upload"))): ...
```
- `require_permission(*codes)` loads the session user and their codes (cache per request), allows if the user has **all** listed codes, otherwise writes `audit_log(action='denied', permission_code=...)` and raises 403.
- `has_permission(user, code)` for checks inside services (e.g. data scoping).
- Data scope: a user **without** `employees.scope.all` only sees employees whose `work_entity_id` equals their own. Apply in the query layer, not in the router.

Frontend:
- `GET /api/v1/auth/me` returns `{ id, username, full_name, permissions: string[] }`.
- `usePermission("code")` → boolean. `<Can perm="code">…</Can>` hides children. `<RequirePermission perm="code">` guards a route and shows the 403 page.
- Sidebar menu items each declare a permission; items the user lacks are not rendered.

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

## Seed templates

| Template | Codes |
| --- | --- |
| مدير النظام — المجندين | all `conscripts.*`, `users.view`, `users.manage`, `templates.manage`, `lookups.manage`, `audit.view` |
| مدخل بيانات — المجندين | `conscripts.view`, `conscripts.enter`, `conscripts.label.print` |
| مدير النظام — العاملين | all `employees.*`, `job_actions.create`, `documents.*`, `reports.*`, `migration.*`, `backup.manage`, `users.*`, `templates.manage`, `lookups.manage`, `audit.view` |
| موظف شئون العاملين | `employees.view`, `employees.create`, `employees.edit`, `employees.delete`, `job_actions.create`, `documents.view`, `documents.upload`, `employees.import`, `reports.view`, `reports.export` |
| مستعلم | `employees.view`, `documents.view`, `reports.view` |
| مراجع | `employees.view`, `employees.scope.all`, `employees.history.view`, `documents.view`, `audit.view` |

The first admin user is created by `scripts/create-admin.ps1` with **every** permission code.
