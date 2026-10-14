-- 003_permissions_seed.sql
-- Every permission code from docs/permissions.md, and the seed templates. Idempotent.
-- Permission codes are owned by this script (inserted / renamed here, never by the app).
-- Templates are only created if missing, so edits made by admins through the UI are never overwritten.
-- Template wildcards from the doc ("all conscripts.*") are expanded to explicit codes here; there is no
-- wildcard matching at runtime.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
USE [$(DB_NAME)];
GO

BEGIN TRANSACTION;

MERGE dbo.permission WITH (HOLDLOCK) AS target
USING (VALUES
    -- Shared / administration
    (N'users.view',                N'admin',      10, N'عرض المستخدمين',          N'View users',                N'عرض قائمة المستخدمين وصلاحيات كل مستخدم'),
    (N'users.manage',              N'admin',      20, N'إدارة المستخدمين',         N'Manage users',              N'إضافة المستخدمين وتعديلهم وإيقافهم، وتعيين الصلاحيات، وإعادة تعيين كلمات المرور'),
    (N'templates.manage',          N'admin',      30, N'إدارة قوالب الصلاحيات',    N'Manage permission templates', N'إنشاء قوالب الصلاحيات وتعديلها'),
    (N'lookups.manage',            N'admin',      40, N'إدارة البيانات المرجعية',  N'Manage lookups',            N'تعديل المحافظات وأقسام الشرطة والمؤهلات ومواعيد الدفعات وجهات العمل وأنواع الإجراءات'),
    (N'audit.view',                N'admin',      50, N'عرض سجل الرقابة',          N'View audit log',            N'الاطلاع على سجل الرقابة'),
    -- Conscripts
    (N'conscripts.view',           N'conscripts', 10, N'الاستعلام عن المجندين',    N'Search conscripts',         N'البحث في سجلات المجندين والاطلاع عليها'),
    (N'conscripts.enter',          N'conscripts', 20, N'تسجيل بيانات التجنيد',     N'Enter enlistment data',     N'الاستعلام عن سجل مستلم، وإدخال رقم الشرطة والتواريخ، والحفظ (يُغلق السجل)'),
    (N'conscripts.edit_locked',    N'conscripts', 30, N'تعديل بيانات بعد الحفظ',   N'Edit locked records',       N'تعديل السجل بعد إغلاقه'),
    (N'conscripts.label.print',    N'conscripts', 40, N'طباعة الباركود',           N'Print barcode labels',      N'طباعة ملصقات الباركود'),
    (N'conscripts.import.upload',  N'conscripts', 50, N'رفع ملف القوات المسلحة',   N'Upload Armed Forces file',  N'رفع الملف، واختيار الدفعة والسنة، والاطلاع على تقرير الفحص'),
    (N'conscripts.import.approve', N'conscripts', 60, N'اعتماد أو إلغاء الرفع',    N'Approve or cancel upload',  N'اعتماد السجلات السليمة أو إلغاء الرفع بالكامل'),
    (N'conscripts.import.export',  N'conscripts', 70, N'تصدير المرفوضين',          N'Export rejected rows',      N'تصدير السجلات المرفوضة (Excel / Access) مع الأسباب'),
    -- Civilian employees
    (N'employees.view',            N'employees',  10, N'عرض الموظفين',             N'View employees',            N'البحث في سجلات الموظفين والاطلاع عليها (جهة عمل المستخدم فقط ما لم تكن لديه صلاحية كل جهات العمل)'),
    (N'employees.scope.all',       N'employees',  20, N'كل جهات العمل',            N'All work entities',         N'الاطلاع على موظفي جميع جهات العمل'),
    (N'employees.create',          N'employees',  30, N'إضافة موظف',               N'Create employees',          N'إضافة موظفين'),
    (N'employees.edit',            N'employees',  40, N'تعديل موظف',               N'Edit employees',            N'تعديل بيانات الموظفين'),
    (N'employees.delete',          N'employees',  50, N'حذف موظف',                 N'Delete employees',          N'حذف الموظفين (حذف منطقي)'),
    (N'employees.history.view',    N'employees',  60, N'عرض سجل التغييرات',        N'View change history',       N'الاطلاع على الإصدارات السابقة للسجل'),
    (N'job_actions.create',        N'employees',  70, N'تسجيل إجراء وظيفي',        N'Record job actions',        N'تسجيل إجراء وظيفي وإرفاق قراره'),
    (N'documents.view',            N'employees',  80, N'عرض المستندات',            N'View documents',            N'فتح المستندات المرفقة'),
    (N'documents.upload',          N'employees',  90, N'رفع المستندات',            N'Upload documents',          N'رفع المستندات وربطها'),
    (N'employees.import',          N'employees', 100, N'استيراد ملفات',            N'Import files',              N'استيراد ملفات Excel / Access'),
    (N'reports.view',              N'employees', 110, N'عرض التقارير',             N'View reports',              N'تشغيل التقارير وطباعتها'),
    (N'reports.export',            N'employees', 120, N'تصدير التقارير',           N'Export reports',            N'تصدير التقارير إلى Excel / PDF'),
    (N'migration.run',             N'employees', 130, N'تشغيل الترحيل',            N'Run migration',             N'بدء عملية ترحيل والاطلاع على تقرير المطابقة'),
    (N'migration.rollback',        N'employees', 140, N'التراجع عن الترحيل',       N'Roll back migration',       N'التراجع عن عملية ترحيل'),
    (N'backup.manage',             N'employees', 150, N'النسخ الاحتياطي',          N'Manage backups',            N'تشغيل النسخ الاحتياطي والاستعادة')
) AS source (code, module, sort_order, name_ar, name_en, description_ar)
ON target.code = source.code
WHEN MATCHED AND (
       target.module <> source.module OR target.sort_order <> source.sort_order
    OR target.name_ar <> source.name_ar OR target.name_en <> source.name_en
    OR ISNULL(target.description_ar, N'') <> source.description_ar
) THEN UPDATE SET
    module = source.module, sort_order = source.sort_order, name_ar = source.name_ar,
    name_en = source.name_en, description_ar = source.description_ar
WHEN NOT MATCHED BY TARGET THEN
    INSERT (code, module, sort_order, name_ar, name_en, description_ar)
    VALUES (source.code, source.module, source.sort_order, source.name_ar, source.name_en, source.description_ar);

DECLARE @templates TABLE (name_ar NVARCHAR(200) NOT NULL PRIMARY KEY, description_ar NVARCHAR(500) NOT NULL);
INSERT @templates (name_ar, description_ar) VALUES
    (N'مدير النظام — المجندين', N'كل صلاحيات منظومة المجندين، وإدارة المستخدمين والقوالب والبيانات المرجعية، وسجل الرقابة'),
    (N'مدخل بيانات — المجندين', N'الاستعلام وتسجيل بيانات التجنيد وطباعة الباركود'),
    (N'مدير النظام — العاملين', N'كل صلاحيات منظومة العاملين المدنيين، وإدارة المستخدمين والقوالب والبيانات المرجعية، وسجل الرقابة'),
    (N'موظف شئون العاملين',     N'إدارة سجلات الموظفين والإجراءات الوظيفية والمستندات والاستيراد والتقارير'),
    (N'مستعلم',                 N'الاستعلام عن الموظفين والمستندات والتقارير'),
    (N'مراجع',                  N'مراجعة سجلات الموظفين في جميع الجهات وسجل التغييرات وسجل الرقابة');

DECLARE @template_codes TABLE (template_name NVARCHAR(200) NOT NULL, code NVARCHAR(100) NOT NULL);
INSERT @template_codes (template_name, code)
SELECT N'مدير النظام — المجندين', code FROM (VALUES
    (N'conscripts.view'), (N'conscripts.enter'), (N'conscripts.edit_locked'), (N'conscripts.label.print'),
    (N'conscripts.import.upload'), (N'conscripts.import.approve'), (N'conscripts.import.export'),
    (N'users.view'), (N'users.manage'), (N'templates.manage'), (N'lookups.manage'), (N'audit.view')
) AS c (code)
UNION ALL
SELECT N'مدخل بيانات — المجندين', code FROM (VALUES
    (N'conscripts.view'), (N'conscripts.enter'), (N'conscripts.label.print')
) AS c (code)
UNION ALL
SELECT N'مدير النظام — العاملين', code FROM (VALUES
    (N'employees.view'), (N'employees.scope.all'), (N'employees.create'), (N'employees.edit'), (N'employees.delete'),
    (N'employees.history.view'), (N'employees.import'), (N'job_actions.create'), (N'documents.view'),
    (N'documents.upload'), (N'reports.view'), (N'reports.export'), (N'migration.run'), (N'migration.rollback'),
    (N'backup.manage'), (N'users.view'), (N'users.manage'), (N'templates.manage'), (N'lookups.manage'), (N'audit.view')
) AS c (code)
UNION ALL
SELECT N'موظف شئون العاملين', code FROM (VALUES
    (N'employees.view'), (N'employees.create'), (N'employees.edit'), (N'employees.delete'), (N'job_actions.create'),
    (N'documents.view'), (N'documents.upload'), (N'employees.import'), (N'reports.view'), (N'reports.export')
) AS c (code)
UNION ALL
SELECT N'مستعلم', code FROM (VALUES
    (N'employees.view'), (N'documents.view'), (N'reports.view')
) AS c (code)
UNION ALL
SELECT N'مراجع', code FROM (VALUES
    (N'employees.view'), (N'employees.scope.all'), (N'employees.history.view'), (N'documents.view'), (N'audit.view')
) AS c (code);

DECLARE @created TABLE (id INT NOT NULL, name_ar NVARCHAR(200) NOT NULL);

INSERT dbo.permission_template (name_ar, description_ar)
OUTPUT inserted.id, inserted.name_ar INTO @created (id, name_ar)
SELECT t.name_ar, t.description_ar
FROM @templates AS t
WHERE NOT EXISTS (SELECT 1 FROM dbo.permission_template AS p WHERE p.name_ar = t.name_ar);

INSERT dbo.template_permission (template_id, permission_code)
SELECT c.id, tc.code
FROM @created AS c
JOIN @template_codes AS tc ON tc.template_name = c.name_ar;

COMMIT TRANSACTION;
GO
