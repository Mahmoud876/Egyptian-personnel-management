-- 004_lookups.sql
-- Reference data edited through lookups.manage. Seeds from docs/business-rules.md#lookups-seed-from-the-sample-file.
-- Seeds only insert missing rows (matched by code), so admin edits are never overwritten. Idempotent.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
USE [$(DB_NAME)];
GO

IF OBJECT_ID(N'dbo.governorate', N'U') IS NULL
CREATE TABLE dbo.governorate (
    id          INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_governorate PRIMARY KEY,
    code        NVARCHAR(2)   NOT NULL CONSTRAINT UQ_governorate_code UNIQUE,
    name_ar     NVARCHAR(100) NOT NULL CONSTRAINT UQ_governorate_name_ar UNIQUE,
    is_active   BIT           NOT NULL CONSTRAINT DF_governorate_is_active DEFAULT 1,
    created_at  DATETIME2(3)  NOT NULL CONSTRAINT DF_governorate_created_at DEFAULT SYSUTCDATETIME(),
    created_by  INT           NULL CONSTRAINT FK_governorate_created_by REFERENCES dbo.app_user (id),
    updated_at  DATETIME2(3)  NULL,
    updated_by  INT           NULL CONSTRAINT FK_governorate_updated_by REFERENCES dbo.app_user (id),
    -- TODO(rules): docs/business-rules.md#validation-rules-upload (R5 open question): these are the file's
    -- governorate codes, which differ from the official national ID codes for some governorates.
    CONSTRAINT CK_governorate_code CHECK (code COLLATE Latin1_General_BIN2 LIKE N'[0-9][0-9]'),
    CONSTRAINT CK_governorate_name_ar CHECK (LEN(name_ar) > 0)
);
GO

IF OBJECT_ID(N'dbo.police_station', N'U') IS NULL
CREATE TABLE dbo.police_station (
    id              INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_police_station PRIMARY KEY,
    code            NVARCHAR(4)   NOT NULL CONSTRAINT UQ_police_station_code UNIQUE,
    name_ar         NVARCHAR(100) NOT NULL,
    governorate_id  INT           NOT NULL CONSTRAINT FK_police_station_governorate REFERENCES dbo.governorate (id),
    is_active       BIT           NOT NULL CONSTRAINT DF_police_station_is_active DEFAULT 1,
    created_at      DATETIME2(3)  NOT NULL CONSTRAINT DF_police_station_created_at DEFAULT SYSUTCDATETIME(),
    created_by      INT           NULL CONSTRAINT FK_police_station_created_by REFERENCES dbo.app_user (id),
    updated_at      DATETIME2(3)  NULL,
    updated_by      INT           NULL CONSTRAINT FK_police_station_updated_by REFERENCES dbo.app_user (id),
    -- The first two digits must equal the governorate code; checked in the API (cross-table rule).
    CONSTRAINT CK_police_station_code CHECK (code COLLATE Latin1_General_BIN2 LIKE N'[0-9][0-9][0-9][0-9]'),
    CONSTRAINT CK_police_station_name_ar CHECK (LEN(name_ar) > 0),
    CONSTRAINT UQ_police_station_governorate_name UNIQUE (governorate_id, name_ar)
);
GO

IF OBJECT_ID(N'dbo.qualification', N'U') IS NULL
CREATE TABLE dbo.qualification (
    id              INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_qualification PRIMARY KEY,
    code            NVARCHAR(2)   NOT NULL CONSTRAINT UQ_qualification_code UNIQUE,  -- type_id in the input file
    name_ar         NVARCHAR(100) NOT NULL CONSTRAINT UQ_qualification_name_ar UNIQUE,
    service_months  TINYINT       NOT NULL,
    is_active       BIT           NOT NULL CONSTRAINT DF_qualification_is_active DEFAULT 1,
    created_at      DATETIME2(3)  NOT NULL CONSTRAINT DF_qualification_created_at DEFAULT SYSUTCDATETIME(),
    created_by      INT           NULL CONSTRAINT FK_qualification_created_by REFERENCES dbo.app_user (id),
    updated_at      DATETIME2(3)  NULL,
    updated_by      INT           NULL CONSTRAINT FK_qualification_updated_by REFERENCES dbo.app_user (id),
    CONSTRAINT CK_qualification_code CHECK (code COLLATE Latin1_General_BIN2 NOT LIKE N'%[^0-9]%' AND LEN(code) > 0),
    CONSTRAINT CK_qualification_name_ar CHECK (LEN(name_ar) > 0),
    CONSTRAINT CK_qualification_service_months CHECK (service_months BETWEEN 1 AND 120)
);
GO

IF OBJECT_ID(N'dbo.batch_schedule', N'U') IS NULL
CREATE TABLE dbo.batch_schedule (
    batch_no     TINYINT      NOT NULL CONSTRAINT PK_batch_schedule PRIMARY KEY,
    start_month  TINYINT      NOT NULL,
    start_day    TINYINT      NOT NULL,
    created_at   DATETIME2(3) NOT NULL CONSTRAINT DF_batch_schedule_created_at DEFAULT SYSUTCDATETIME(),
    created_by   INT          NULL CONSTRAINT FK_batch_schedule_created_by REFERENCES dbo.app_user (id),
    updated_at   DATETIME2(3) NULL,
    updated_by   INT          NULL CONSTRAINT FK_batch_schedule_updated_by REFERENCES dbo.app_user (id),
    CONSTRAINT CK_batch_schedule_batch_no CHECK (batch_no BETWEEN 1 AND 4),
    CONSTRAINT CK_batch_schedule_start_month CHECK (start_month BETWEEN 1 AND 12),
    CONSTRAINT CK_batch_schedule_start_day CHECK (
        start_day >= 1 AND start_day <= CASE WHEN start_month = 2 THEN 28
                                            WHEN start_month IN (4, 6, 9, 11) THEN 30
                                            ELSE 31 END
    )
);
GO

IF OBJECT_ID(N'dbo.work_entity', N'U') IS NULL
CREATE TABLE dbo.work_entity (
    id          INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_work_entity PRIMARY KEY,
    code        NVARCHAR(20)  NOT NULL CONSTRAINT UQ_work_entity_code UNIQUE,
    name_ar     NVARCHAR(200) NOT NULL CONSTRAINT UQ_work_entity_name_ar UNIQUE,
    is_active   BIT           NOT NULL CONSTRAINT DF_work_entity_is_active DEFAULT 1,
    created_at  DATETIME2(3)  NOT NULL CONSTRAINT DF_work_entity_created_at DEFAULT SYSUTCDATETIME(),
    created_by  INT           NULL CONSTRAINT FK_work_entity_created_by REFERENCES dbo.app_user (id),
    updated_at  DATETIME2(3)  NULL,
    updated_by  INT           NULL CONSTRAINT FK_work_entity_updated_by REFERENCES dbo.app_user (id),
    CONSTRAINT CK_work_entity_code CHECK (LEN(code) > 0),
    CONSTRAINT CK_work_entity_name_ar CHECK (LEN(name_ar) > 0)
);
GO

IF OBJECT_ID(N'dbo.action_type', N'U') IS NULL
CREATE TABLE dbo.action_type (
    id          INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_action_type PRIMARY KEY,
    code        NVARCHAR(20)  NOT NULL CONSTRAINT UQ_action_type_code UNIQUE,
    name_ar     NVARCHAR(200) NOT NULL CONSTRAINT UQ_action_type_name_ar UNIQUE,
    is_active   BIT           NOT NULL CONSTRAINT DF_action_type_is_active DEFAULT 1,
    created_at  DATETIME2(3)  NOT NULL CONSTRAINT DF_action_type_created_at DEFAULT SYSUTCDATETIME(),
    created_by  INT           NULL CONSTRAINT FK_action_type_created_by REFERENCES dbo.app_user (id),
    updated_at  DATETIME2(3)  NULL,
    updated_by  INT           NULL CONSTRAINT FK_action_type_updated_by REFERENCES dbo.app_user (id),
    CONSTRAINT CK_action_type_code CHECK (LEN(code) > 0),
    CONSTRAINT CK_action_type_name_ar CHECK (LEN(name_ar) > 0)
);
GO

-- app_user.work_entity_id -> work_entity (app_user is created in 002, before work_entity exists).
IF OBJECT_ID(N'dbo.FK_app_user_work_entity', N'F') IS NULL
    ALTER TABLE dbo.app_user
        ADD CONSTRAINT FK_app_user_work_entity FOREIGN KEY (work_entity_id) REFERENCES dbo.work_entity (id);
GO

-- Seeds ---------------------------------------------------------------------
-- work_entity and action_type have no seed in the spec yet; admins add them through lookups.manage.
-- TODO(rules): docs/business-rules.md#civilian-employees-outline-details-come-later
BEGIN TRANSACTION;

INSERT dbo.governorate (code, name_ar)
SELECT s.code, s.name_ar
FROM (VALUES
    (N'01', N'القاهرة'), (N'02', N'الإسكندرية'), (N'03', N'الجيزة'), (N'11', N'الدقهلية'),
    (N'12', N'الشرقية'), (N'13', N'القليوبية'), (N'14', N'الغربية'), (N'15', N'المنوفية'),
    (N'16', N'البحيرة'), (N'21', N'المنيا'),    (N'22', N'أسيوط'),   (N'23', N'سوهاج')
) AS s (code, name_ar)
WHERE NOT EXISTS (SELECT 1 FROM dbo.governorate AS g WHERE g.code = s.code);

INSERT dbo.police_station (code, name_ar, governorate_id)
SELECT s.code, s.name_ar, g.id
FROM (VALUES
    (N'0101', N'منشأة ناصر', N'01'),
    (N'0201', N'منتزه أول', N'02'), (N'0202', N'منتزه ثان', N'02'), (N'0203', N'رمل أول', N'02'),
    (N'0301', N'الدقي', N'03'), (N'0303', N'العجوزة', N'03'),
    (N'1101', N'المنصورة', N'11'),
    (N'1201', N'زقازيق', N'12'), (N'1202', N'بلبيس', N'12'), (N'1203', N'منيا القمح', N'12'),
    (N'1301', N'بنها', N'13'), (N'1302', N'شبرا الخيمة', N'13'), (N'1303', N'قليوب', N'13'),
    (N'1401', N'طنطا', N'14'), (N'1402', N'محلة الكبرى', N'14'),
    (N'1501', N'شبين الكوم', N'15'), (N'1502', N'منوف', N'15'), (N'1503', N'أشمون', N'15'),
    (N'1601', N'دمنهور', N'16'), (N'1602', N'كفر الدوار', N'16'), (N'1603', N'رشيد', N'16'),
    (N'2101', N'المنيا', N'21'),
    (N'2201', N'أسيوط', N'22'),
    (N'2301', N'سوهاج', N'23')
) AS s (code, name_ar, governorate_code)
JOIN dbo.governorate AS g ON g.code = s.governorate_code
WHERE NOT EXISTS (SELECT 1 FROM dbo.police_station AS p WHERE p.code = s.code);

-- docs/business-rules.md#data-entry: service length by qualification.
INSERT dbo.qualification (code, name_ar, service_months)
SELECT s.code, s.name_ar, s.service_months
FROM (VALUES
    (N'1', N'عالى', 14), (N'2', N'متوسط', 26), (N'3', N'فوق متوسط', 20), (N'4', N'بدون', 38)
) AS s (code, name_ar, service_months)
WHERE NOT EXISTS (SELECT 1 FROM dbo.qualification AS q WHERE q.code = s.code);

-- docs/business-rules.md#upload: batch 1 -> 1 Jan, 2 -> 1 Apr, 3 -> 1 Jul, 4 -> 1 Oct.
INSERT dbo.batch_schedule (batch_no, start_month, start_day)
SELECT s.batch_no, s.start_month, s.start_day
FROM (VALUES (1, 1, 1), (2, 4, 1), (3, 7, 1), (4, 10, 1)) AS s (batch_no, start_month, start_day)
WHERE NOT EXISTS (SELECT 1 FROM dbo.batch_schedule AS b WHERE b.batch_no = s.batch_no);

COMMIT TRANSACTION;
GO
