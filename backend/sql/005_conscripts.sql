-- 005_conscripts.sql
-- Import staging and conscript records. Rules: docs/business-rules.md#conscripts. Idempotent.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
USE [$(DB_NAME)];
GO

-- One upload of the Armed Forces file. docs/business-rules.md#upload
IF OBJECT_ID(N'dbo.import_batch', N'U') IS NULL
CREATE TABLE dbo.import_batch (
    id                 INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_import_batch PRIMARY KEY,
    batch_no           TINYINT       NOT NULL CONSTRAINT FK_import_batch_batch_schedule REFERENCES dbo.batch_schedule (batch_no),
    conscription_year  SMALLINT      NOT NULL,
    file_name          NVARCHAR(260) NOT NULL,
    file_sha256        NVARCHAR(64)  NOT NULL,
    status             NVARCHAR(20)  NOT NULL CONSTRAINT DF_import_batch_status DEFAULT N'staged',
    total_rows         INT           NOT NULL CONSTRAINT DF_import_batch_total_rows DEFAULT 0,
    valid_rows         INT           NOT NULL CONSTRAINT DF_import_batch_valid_rows DEFAULT 0,
    rejected_rows      INT           NOT NULL CONSTRAINT DF_import_batch_rejected_rows DEFAULT 0,
    approved_at        DATETIME2(3)  NULL,
    approved_by        INT           NULL CONSTRAINT FK_import_batch_approved_by REFERENCES dbo.app_user (id),
    cancelled_at       DATETIME2(3)  NULL,
    cancelled_by       INT           NULL CONSTRAINT FK_import_batch_cancelled_by REFERENCES dbo.app_user (id),
    created_at         DATETIME2(3)  NOT NULL CONSTRAINT DF_import_batch_created_at DEFAULT SYSUTCDATETIME(),
    created_by         INT           NULL CONSTRAINT FK_import_batch_created_by REFERENCES dbo.app_user (id),
    updated_at         DATETIME2(3)  NULL,
    updated_by         INT           NULL CONSTRAINT FK_import_batch_updated_by REFERENCES dbo.app_user (id),
    CONSTRAINT CK_import_batch_year CHECK (conscription_year BETWEEN 2000 AND 2100),
    CONSTRAINT CK_import_batch_file_sha256 CHECK (
        LEN(file_sha256) = 64 AND file_sha256 COLLATE Latin1_General_BIN2 NOT LIKE N'%[^0-9a-f]%'
    ),
    -- staged -> validated -> approved | cancelled
    CONSTRAINT CK_import_batch_status CHECK (status IN (N'staged', N'validated', N'approved', N'cancelled')),
    CONSTRAINT CK_import_batch_counts CHECK (
        total_rows >= 0 AND valid_rows >= 0 AND rejected_rows >= 0 AND valid_rows + rejected_rows <= total_rows
    ),
    CONSTRAINT CK_import_batch_approved CHECK (status <> N'approved' OR approved_at IS NOT NULL),
    CONSTRAINT CK_import_batch_cancelled CHECK (status <> N'cancelled' OR cancelled_at IS NOT NULL),
    INDEX IX_import_batch_year_batch (conscription_year, batch_no)
);
GO

-- Conscript record. Created as 'received' when an import is approved; data entry adds the police number
-- and dates and locks it ('registered'). docs/business-rules.md#data-entry
-- System-versioned: every change is kept in conscript_history.
IF OBJECT_ID(N'dbo.conscript', N'U') IS NULL
CREATE TABLE dbo.conscript (
    id                 INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_conscript PRIMARY KEY,
    national_id        NVARCHAR(14)  NOT NULL CONSTRAINT UQ_conscript_national_id UNIQUE,
    full_name          NVARCHAR(200) NOT NULL,
    -- docs/business-rules.md#search-and-labels
    name_normalized    AS dbo.fn_normalize_ar_name(full_name) PERSISTED,
    birth_date         DATE          NOT NULL,
    governorate_id     INT           NOT NULL CONSTRAINT FK_conscript_governorate REFERENCES dbo.governorate (id),
    police_station_id  INT           NOT NULL CONSTRAINT FK_conscript_police_station REFERENCES dbo.police_station (id),
    qualification_id   INT           NOT NULL CONSTRAINT FK_conscript_qualification REFERENCES dbo.qualification (id),
    import_batch_id    INT           NOT NULL CONSTRAINT FK_conscript_import_batch REFERENCES dbo.import_batch (id),
    conscription_year  SMALLINT      NOT NULL,
    batch_no           TINYINT       NOT NULL CONSTRAINT FK_conscript_batch_schedule REFERENCES dbo.batch_schedule (batch_no),
    status             NVARCHAR(20)  NOT NULL CONSTRAINT DF_conscript_status DEFAULT N'received',
    police_no          NVARCHAR(20)  NULL,  -- رقم الشرطة, typed in at data entry (not the police station code)
    start_date         DATE          NULL,
    end_date           DATE          NULL,
    barcode            NVARCHAR(50)  NULL,
    locked_at          DATETIME2(3)  NULL,
    locked_by          INT           NULL CONSTRAINT FK_conscript_locked_by REFERENCES dbo.app_user (id),
    created_at         DATETIME2(3)  NOT NULL CONSTRAINT DF_conscript_created_at DEFAULT SYSUTCDATETIME(),
    created_by         INT           NULL CONSTRAINT FK_conscript_created_by REFERENCES dbo.app_user (id),
    updated_at         DATETIME2(3)  NULL,
    updated_by         INT           NULL CONSTRAINT FK_conscript_updated_by REFERENCES dbo.app_user (id),
    valid_from         DATETIME2(7)  GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    valid_to           DATETIME2(7)  GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME (valid_from, valid_to),
    -- R1 + R2 (digits 0-9 only; binary collation so Arabic-Indic digits are rejected).
    -- TODO(rules): docs/business-rules.md#validation-rules-upload R3-R6 are checked in the API.
    CONSTRAINT CK_conscript_national_id CHECK (
        LEN(national_id) = 14 AND national_id COLLATE Latin1_General_BIN2 NOT LIKE N'%[^0-9]%'
    ),
    CONSTRAINT CK_conscript_full_name CHECK (LEN(full_name) > 0),
    CONSTRAINT CK_conscript_year CHECK (conscription_year BETWEEN 2000 AND 2100),
    CONSTRAINT CK_conscript_status CHECK (status IN (N'received', N'registered')),
    CONSTRAINT CK_conscript_police_no CHECK (police_no IS NULL OR LEN(police_no) > 0),
    CONSTRAINT CK_conscript_dates CHECK (end_date > start_date),
    CONSTRAINT CK_conscript_registered CHECK (
        status = N'received'
        OR (police_no IS NOT NULL AND start_date IS NOT NULL AND end_date IS NOT NULL AND locked_at IS NOT NULL)
    )
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.conscript_history));
GO

-- UNIQUE (police_no, conscription_year) for entered numbers only: a plain UNIQUE constraint would treat the
-- NULLs of not-yet-entered records as duplicates. Violation message: رقم الشرطة مسجل لنفس سنة التجنيد
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.conscript') AND name = N'UQ_conscript_police_no_year')
    CREATE UNIQUE INDEX UQ_conscript_police_no_year ON dbo.conscript (police_no, conscription_year) WHERE police_no IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.conscript') AND name = N'UQ_conscript_barcode')
    CREATE UNIQUE INDEX UQ_conscript_barcode ON dbo.conscript (barcode) WHERE barcode IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.conscript') AND name = N'IX_conscript_name_normalized')
    CREATE INDEX IX_conscript_name_normalized ON dbo.conscript (name_normalized);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.conscript') AND name = N'IX_conscript_import_batch_id')
    CREATE INDEX IX_conscript_import_batch_id ON dbo.conscript (import_batch_id);
GO

-- One row of an uploaded file, exactly as received (all text, nothing parsed), plus its validation outcome.
IF OBJECT_ID(N'dbo.import_row', N'U') IS NULL
CREATE TABLE dbo.import_row (
    id                 BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_import_row PRIMARY KEY,
    import_batch_id    INT           NOT NULL CONSTRAINT FK_import_row_import_batch REFERENCES dbo.import_batch (id),
    source_row_id      NVARCHAR(50)  NULL,  -- `id` column of person_data
    name               NVARCHAR(400) NULL,
    national_id        NVARCHAR(50)  NULL,
    birth_date         NVARCHAR(50)  NULL,
    gov_name           NVARCHAR(200) NULL,
    gov_id             NVARCHAR(50)  NULL,
    ps_name            NVARCHAR(200) NULL,
    ps_id              NVARCHAR(50)  NULL,
    type_id            NVARCHAR(50)  NULL,
    type_name          NVARCHAR(200) NULL,
    status             NVARCHAR(20)  NOT NULL CONSTRAINT DF_import_row_status DEFAULT N'pending',
    -- JSON array with every failing rule, not just the first.
    -- TODO(rules): docs/business-rules.md#validation-rules-upload (shape of each entry: rule code + Arabic reason)
    rejection_reasons  NVARCHAR(MAX) NULL,
    conscript_id       INT           NULL CONSTRAINT FK_import_row_conscript REFERENCES dbo.conscript (id),
    created_at         DATETIME2(3)  NOT NULL CONSTRAINT DF_import_row_created_at DEFAULT SYSUTCDATETIME(),
    created_by         INT           NULL CONSTRAINT FK_import_row_created_by REFERENCES dbo.app_user (id),
    updated_at         DATETIME2(3)  NULL,
    updated_by         INT           NULL CONSTRAINT FK_import_row_updated_by REFERENCES dbo.app_user (id),
    -- pending -> valid | rejected; valid -> imported on approval
    CONSTRAINT CK_import_row_status CHECK (status IN (N'pending', N'valid', N'rejected', N'imported')),
    CONSTRAINT CK_import_row_rejection_reasons CHECK (rejection_reasons IS NULL OR ISJSON(rejection_reasons) = 1),
    CONSTRAINT CK_import_row_rejected CHECK (status <> N'rejected' OR rejection_reasons IS NOT NULL),
    CONSTRAINT CK_import_row_imported CHECK (status <> N'imported' OR conscript_id IS NOT NULL),
    INDEX IX_import_row_batch_status (import_batch_id, status),
    INDEX IX_import_row_national_id (national_id)
);
GO
