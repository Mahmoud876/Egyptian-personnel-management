-- 009_poc_backend.sql: PoC job pipeline and RBAC. Additive; legacy records remain intact.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
USE [$(DB_NAME)];
GO
IF COL_LENGTH(N'dbo.app_user', N'role') IS NULL
BEGIN
    ALTER TABLE dbo.app_user ADD role NVARCHAR(30) NOT NULL CONSTRAINT DF_app_user_role DEFAULT N'data_entry_operator';
    EXEC(N'UPDATE dbo.app_user SET role = N''system_administrator'' WHERE id IN
        (SELECT user_id FROM dbo.user_permission WHERE permission_code = N''users.manage'')');
END;
IF COL_LENGTH(N'dbo.app_user', N'session_version') IS NULL
    ALTER TABLE dbo.app_user ADD session_version INT NOT NULL CONSTRAINT DF_app_user_session_version DEFAULT 0;
GO
IF OBJECT_ID(N'dbo.CK_app_user_role', N'C') IS NULL
    ALTER TABLE dbo.app_user ADD CONSTRAINT CK_app_user_role CHECK (role IN (N'system_administrator', N'data_entry_operator'));
IF OBJECT_ID(N'dbo.CK_permission_code', N'C') IS NOT NULL
    ALTER TABLE dbo.permission DROP CONSTRAINT CK_permission_code;
ALTER TABLE dbo.permission ADD CONSTRAINT CK_permission_code CHECK (code COLLATE Latin1_General_BIN2 NOT LIKE N'%[^a-z0-9._:]%');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.permission WHERE code=N'file:insert') INSERT dbo.permission(code,module,name_ar,name_en) VALUES(N'file:insert',N'conscripts',N'استيراد واعتماد وتصدير الملفات',N'file:insert');
IF NOT EXISTS (SELECT 1 FROM dbo.permission WHERE code=N'audit:get') INSERT dbo.permission(code,module,name_ar,name_en) VALUES(N'audit:get',N'admin',N'عرض سجل الرقابة',N'audit:get');
IF NOT EXISTS (SELECT 1 FROM dbo.permission WHERE code=N'profile:get') INSERT dbo.permission(code,module,name_ar,name_en) VALUES(N'profile:get',N'conscripts',N'عرض المجندين',N'profile:get');
IF NOT EXISTS (SELECT 1 FROM dbo.permission WHERE code=N'profile:insert') INSERT dbo.permission(code,module,name_ar,name_en) VALUES(N'profile:insert',N'conscripts',N'إكمال بيانات التجنيد',N'profile:insert');
IF NOT EXISTS (SELECT 1 FROM dbo.permission WHERE code=N'profile:update') INSERT dbo.permission(code,module,name_ar,name_en) VALUES(N'profile:update',N'conscripts',N'تعديل بيانات المجندين',N'profile:update');
IF NOT EXISTS (SELECT 1 FROM dbo.permission WHERE code=N'barcode:get') INSERT dbo.permission(code,module,name_ar,name_en) VALUES(N'barcode:get',N'conscripts',N'طباعة الباركود',N'barcode:get');
IF NOT EXISTS (SELECT 1 FROM dbo.permission WHERE code=N'user:get') INSERT dbo.permission(code,module,name_ar,name_en) VALUES(N'user:get',N'admin',N'عرض المستخدمين',N'user:get');
IF NOT EXISTS (SELECT 1 FROM dbo.permission WHERE code=N'user:insert') INSERT dbo.permission(code,module,name_ar,name_en) VALUES(N'user:insert',N'admin',N'إضافة مستخدم',N'user:insert');
IF NOT EXISTS (SELECT 1 FROM dbo.permission WHERE code=N'user:update') INSERT dbo.permission(code,module,name_ar,name_en) VALUES(N'user:update',N'admin',N'تعديل المستخدم والدور',N'user:update');
IF NOT EXISTS (SELECT 1 FROM dbo.permission WHERE code=N'user:delete') INSERT dbo.permission(code,module,name_ar,name_en) VALUES(N'user:delete',N'admin',N'إيقاف المستخدم',N'user:delete');
GO
IF OBJECT_ID(N'dbo.official_governorate', N'U') IS NULL

CREATE TABLE official_governorate (
	code NVARCHAR(2) NOT NULL,
	name NVARCHAR(100) NOT NULL,
	PRIMARY KEY (code)
)

;
GO
IF OBJECT_ID(N'dbo.import_job', N'U') IS NULL

CREATE TABLE import_job (
	id UNIQUEIDENTIFIER NOT NULL,
	uploaded_by_user_id INTEGER NOT NULL,
	approved_by_user_id INTEGER NULL,
	original_filename NVARCHAR(260) NOT NULL,
	storage_key NVARCHAR(500) NOT NULL,
	file_type NVARCHAR(10) NOT NULL,
	file_sha256 NVARCHAR(64) NOT NULL,
	batch_number INTEGER NOT NULL,
	enlistment_year INTEGER NOT NULL,
	status NVARCHAR(30) NOT NULL,
	total_rows INTEGER NOT NULL,
	processed_rows INTEGER NOT NULL,
	valid_rows INTEGER NOT NULL,
	invalid_rows INTEGER NOT NULL,
	checkpoint_row INTEGER NOT NULL,
	retry_count INTEGER NOT NULL,
	progress_version BIGINT NOT NULL,
	rq_job_id NVARCHAR(100) NULL,
	last_error NVARCHAR(1000) NULL,
	started_at DATETIME2(3) NULL,
	heartbeat_at DATETIME2(3) NULL,
	completed_at DATETIME2(3) NULL,
	approved_at DATETIME2(3) NULL,
	cancelled_at DATETIME2(3) NULL,
	duplicate_policy NVARCHAR(20) NOT NULL,
	created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	updated_at DATETIME2(3) NULL,
	PRIMARY KEY (id),
	CONSTRAINT [CK_poc_import_batch] CHECK (batch_number BETWEEN 1 AND 4),
	CONSTRAINT [CK_poc_import_year] CHECK (enlistment_year BETWEEN 2000 AND 2100),
	CONSTRAINT [CK_poc_import_status] CHECK (status IN ('QUEUED','PARSING','VALIDATING','READY_FOR_REVIEW','APPROVED','CANCELLED','FAILED')),
	CONSTRAINT [CK_poc_import_counts] CHECK (total_rows >= 0 AND processed_rows >= 0 AND valid_rows >= 0 AND invalid_rows >= 0 AND processed_rows = valid_rows + invalid_rows AND processed_rows <= total_rows AND checkpoint_row = processed_rows AND retry_count >= 0),
	CONSTRAINT [CK_poc_duplicate_policy] CHECK (duplicate_policy IN ('reject_all','keep_first')),
	FOREIGN KEY(uploaded_by_user_id) REFERENCES app_user (id),
	FOREIGN KEY(approved_by_user_id) REFERENCES app_user (id)
)

;
GO
IF OBJECT_ID(N'dbo.export_job', N'U') IS NULL

CREATE TABLE export_job (
	id UNIQUEIDENTIFIER NOT NULL,
	import_job_id UNIQUEIDENTIFIER NOT NULL,
	requested_by_user_id INTEGER NOT NULL,
	export_format NVARCHAR(10) NOT NULL,
	status NVARCHAR(20) NOT NULL,
	storage_key NVARCHAR(500) NULL,
	rq_job_id NVARCHAR(100) NULL,
	retry_count INTEGER NOT NULL,
	last_error NVARCHAR(1000) NULL,
	heartbeat_at DATETIME2(3) NULL,
	completed_at DATETIME2(3) NULL,
	created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	updated_at DATETIME2(3) NULL,
	PRIMARY KEY (id),
	CONSTRAINT [CK_poc_export_format] CHECK (export_format IN ('xlsx','accdb')),
	CONSTRAINT [CK_poc_export_status] CHECK (status IN ('QUEUED','PROCESSING','COMPLETED','FAILED')),
	FOREIGN KEY(import_job_id) REFERENCES import_job (id),
	FOREIGN KEY(requested_by_user_id) REFERENCES app_user (id)
)

;
GO
IF OBJECT_ID(N'dbo.import_record', N'U') IS NULL

CREATE TABLE import_record (
	id UNIQUEIDENTIFIER NOT NULL,
	import_job_id UNIQUEIDENTIFIER NOT NULL,
	row_number INTEGER NOT NULL,
	source_record_id NVARCHAR(100) NULL,
	raw_data_json NVARCHAR(MAX) NOT NULL,
	national_id_raw NVARCHAR(MAX) NULL,
	normalized_national_id NVARCHAR(14) NULL,
	parsed_data_json NVARCHAR(MAX) NULL,
	parsed_type_id INTEGER NULL,
	validation_status NVARCHAR(10) NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT [UX_ImportRows_Job_Row] UNIQUE (import_job_id, row_number),
	CONSTRAINT [CK_poc_row] CHECK (row_number > 0 AND validation_status IN ('VALID','INVALID')),
	FOREIGN KEY(import_job_id) REFERENCES import_job (id),
	FOREIGN KEY(parsed_type_id) REFERENCES qualification (id)
)

;
GO
IF OBJECT_ID(N'dbo.recruit', N'U') IS NULL

CREATE TABLE recruit (
	id UNIQUEIDENTIFIER NOT NULL,
	import_job_id UNIQUEIDENTIFIER NOT NULL,
	completed_by_user_id INTEGER NULL,
	source_record_id NVARCHAR(100) NULL,
	name NVARCHAR(200) NOT NULL,
	normalized_name NVARCHAR(200) NOT NULL,
	national_id NVARCHAR(14) NOT NULL,
	birth_date DATETIME2(3) NOT NULL,
	gov_id NVARCHAR(2) NOT NULL,
	ps_id NVARCHAR(20) NOT NULL,
	ps_name NVARCHAR(200) NOT NULL,
	type_id INTEGER NOT NULL,
	police_number NVARCHAR(20) NULL,
	enlistment_year INTEGER NOT NULL,
	batch_number INTEGER NOT NULL,
	enlistment_start_date DATETIME2(3) NULL,
	enlistment_end_date DATETIME2(3) NULL,
	is_locked BIT NOT NULL,
	completed_at DATETIME2(3) NULL,
	barcode NVARCHAR(12) NULL,
	revision INTEGER NOT NULL,
	created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	updated_at DATETIME2(3) NULL,
	PRIMARY KEY (id),
	CONSTRAINT [CK_poc_recruit_batch] CHECK (batch_number BETWEEN 1 AND 4 AND enlistment_year BETWEEN 2000 AND 2100),
	CONSTRAINT [CK_poc_recruit_dates] CHECK (enlistment_end_date > enlistment_start_date),
	CONSTRAINT [CK_poc_recruit_complete] CHECK (is_locked = 0 OR (police_number IS NOT NULL AND enlistment_start_date IS NOT NULL AND enlistment_end_date IS NOT NULL AND completed_at IS NOT NULL AND completed_by_user_id IS NOT NULL AND barcode IS NOT NULL)),
	FOREIGN KEY(import_job_id) REFERENCES import_job (id),
	FOREIGN KEY(completed_by_user_id) REFERENCES app_user (id),
	UNIQUE (national_id),
	FOREIGN KEY(gov_id) REFERENCES official_governorate (code),
	FOREIGN KEY(type_id) REFERENCES qualification (id)
)

;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.recruit') AND name=N'UX_Recruits_PoliceNumber_Year')
CREATE UNIQUE INDEX [UX_Recruits_PoliceNumber_Year] ON recruit (police_number, enlistment_year) WHERE police_number IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.recruit') AND name=N'ix_recruit_normalized_name')
CREATE INDEX ix_recruit_normalized_name ON recruit (normalized_name);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.recruit') AND name=N'UX_Recruits_Barcode')
CREATE UNIQUE INDEX [UX_Recruits_Barcode] ON recruit (barcode) WHERE barcode IS NOT NULL;
GO
IF OBJECT_ID(N'dbo.import_record_error', N'U') IS NULL

CREATE TABLE import_record_error (
	id UNIQUEIDENTIFIER NOT NULL,
	import_row_id UNIQUEIDENTIFIER NOT NULL,
	error_code NVARCHAR(60) NOT NULL,
	field_name NVARCHAR(100) NOT NULL,
	error_message NVARCHAR(500) NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(import_row_id) REFERENCES import_record (id)
)

;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.import_record_error') AND name=N'ix_import_record_error_import_row_id')
CREATE INDEX ix_import_record_error_import_row_id ON import_record_error (import_row_id);
GO
IF OBJECT_ID(N'dbo.recruit_document', N'U') IS NULL

CREATE TABLE recruit_document (
	id UNIQUEIDENTIFIER NOT NULL,
	recruit_id UNIQUEIDENTIFIER NOT NULL,
	uploaded_by_user_id INTEGER NOT NULL,
	original_filename NVARCHAR(260) NOT NULL,
	storage_key NVARCHAR(500) NOT NULL,
	content_type NVARCHAR(100) NOT NULL,
	file_size_bytes BIGINT NOT NULL,
	sha256 NVARCHAR(64) NOT NULL,
	created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	updated_at DATETIME2(3) NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(recruit_id) REFERENCES recruit (id),
	FOREIGN KEY(uploaded_by_user_id) REFERENCES app_user (id)
)

;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.recruit_document') AND name=N'ix_recruit_document_recruit_id')
CREATE INDEX ix_recruit_document_recruit_id ON recruit_document (recruit_id);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'01') INSERT dbo.official_governorate(code,name) VALUES(N'01',N'القاهرة');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'02') INSERT dbo.official_governorate(code,name) VALUES(N'02',N'الإسكندرية');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'03') INSERT dbo.official_governorate(code,name) VALUES(N'03',N'بورسعيد');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'04') INSERT dbo.official_governorate(code,name) VALUES(N'04',N'السويس');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'11') INSERT dbo.official_governorate(code,name) VALUES(N'11',N'دمياط');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'12') INSERT dbo.official_governorate(code,name) VALUES(N'12',N'الدقهلية');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'13') INSERT dbo.official_governorate(code,name) VALUES(N'13',N'الشرقية');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'14') INSERT dbo.official_governorate(code,name) VALUES(N'14',N'القليوبية');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'15') INSERT dbo.official_governorate(code,name) VALUES(N'15',N'كفر الشيخ');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'16') INSERT dbo.official_governorate(code,name) VALUES(N'16',N'الغربية');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'17') INSERT dbo.official_governorate(code,name) VALUES(N'17',N'المنوفية');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'18') INSERT dbo.official_governorate(code,name) VALUES(N'18',N'البحيرة');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'19') INSERT dbo.official_governorate(code,name) VALUES(N'19',N'الإسماعيلية');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'21') INSERT dbo.official_governorate(code,name) VALUES(N'21',N'الجيزة');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'22') INSERT dbo.official_governorate(code,name) VALUES(N'22',N'بني سويف');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'23') INSERT dbo.official_governorate(code,name) VALUES(N'23',N'الفيوم');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'24') INSERT dbo.official_governorate(code,name) VALUES(N'24',N'المنيا');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'25') INSERT dbo.official_governorate(code,name) VALUES(N'25',N'أسيوط');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'26') INSERT dbo.official_governorate(code,name) VALUES(N'26',N'سوهاج');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'27') INSERT dbo.official_governorate(code,name) VALUES(N'27',N'قنا');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'28') INSERT dbo.official_governorate(code,name) VALUES(N'28',N'أسوان');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'29') INSERT dbo.official_governorate(code,name) VALUES(N'29',N'الأقصر');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'31') INSERT dbo.official_governorate(code,name) VALUES(N'31',N'البحر الأحمر');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'32') INSERT dbo.official_governorate(code,name) VALUES(N'32',N'الوادي الجديد');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'33') INSERT dbo.official_governorate(code,name) VALUES(N'33',N'مطروح');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'34') INSERT dbo.official_governorate(code,name) VALUES(N'34',N'شمال سيناء');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'35') INSERT dbo.official_governorate(code,name) VALUES(N'35',N'جنوب سيناء');
IF NOT EXISTS (SELECT 1 FROM dbo.official_governorate WHERE code=N'88') INSERT dbo.official_governorate(code,name) VALUES(N'88',N'خارج الجمهورية');
GO
IF OBJECT_ID(N'dbo.CK_recruit_national_id', N'C') IS NULL
 ALTER TABLE dbo.recruit ADD CONSTRAINT CK_recruit_national_id CHECK (LEN(national_id)=14 AND national_id COLLATE Latin1_General_BIN2 NOT LIKE N'%[^0-9]%');
IF OBJECT_ID(N'dbo.CK_recruit_barcode', N'C') IS NULL
 ALTER TABLE dbo.recruit ADD CONSTRAINT CK_recruit_barcode CHECK (barcode IS NULL OR (LEN(barcode)=12 AND barcode COLLATE Latin1_General_BIN2 NOT LIKE N'%[^0-9]%' AND LEFT(barcode,1)=N'2' AND SUBSTRING(barcode,5,1) IN (N'1',N'2',N'3',N'4')));
IF OBJECT_ID(N'dbo.CK_recruit_id_structure', N'C') IS NULL
 ALTER TABLE dbo.recruit ADD CONSTRAINT CK_recruit_id_structure CHECK (
   LEFT(national_id,1) IN (N'2',N'3') AND SUBSTRING(national_id,8,2)=gov_id
   AND SUBSTRING(national_id,13,1) IN (N'1',N'3',N'5',N'7',N'9')
   AND TRY_CONVERT(date, CASE LEFT(national_id,1) WHEN N'2' THEN N'19' ELSE N'20' END + SUBSTRING(national_id,2,6),112) IS NOT NULL
   AND birth_date=TRY_CONVERT(date, CASE LEFT(national_id,1) WHEN N'2' THEN N'19' ELSE N'20' END + SUBSTRING(national_id,2,6),112));
IF OBJECT_ID(N'dbo.CK_recruit_profile_fields', N'C') IS NULL
 ALTER TABLE dbo.recruit ADD CONSTRAINT CK_recruit_profile_fields CHECK (
   LEN(name)>0 AND LEN(ps_name)>0 AND LEN(ps_id)>0 AND type_id IN (1,2,3,4)
   AND (police_number IS NULL OR LEN(police_number)>0));
IF COL_LENGTH(N'dbo.recruit', N'row_version') IS NULL
 ALTER TABLE dbo.recruit ADD row_version ROWVERSION;
GO
CREATE OR ALTER TRIGGER dbo.TR_recruit_rules ON dbo.recruit AFTER INSERT, UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON i.id=d.id WHERE d.barcode IS NOT NULL AND (i.barcode IS NULL OR i.barcode<>d.barcode))
   THROW 51001, 'Assigned barcode is immutable', 1;
 IF EXISTS (SELECT 1 FROM inserted WHERE is_locked=1 AND enlistment_end_date <> DATEADD(month, CASE type_id WHEN 1 THEN 14 WHEN 2 THEN 26 WHEN 3 THEN 20 WHEN 4 THEN 38 END, enlistment_start_date))
   THROW 51002, 'Enlistment duration does not match qualification', 1;
END;
GO
CREATE OR ALTER VIEW dbo.v_recruit_search AS
 SELECT id,name,normalized_name,national_id,police_number,enlistment_year,barcode,is_locked FROM dbo.recruit;
GO
