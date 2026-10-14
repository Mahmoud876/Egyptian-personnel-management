-- 006_employees.sql
-- Civilian employees: migration runs, employees, job actions, documents. Idempotent.
-- Field details are an outline: TODO(rules): docs/business-rules.md#civilian-employees-outline-details-come-later
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
USE [$(DB_NAME)];
GO

-- One migration or import run (Oracle 11g, Excel or Access). Rows it created carry its id, so a run can be
-- rolled back by deleting them; re-runs MERGE on (source_system, source_key) to avoid duplicates.
IF OBJECT_ID(N'dbo.migration_batch', N'U') IS NULL
CREATE TABLE dbo.migration_batch (
    id                INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_migration_batch PRIMARY KEY,
    source_system     NVARCHAR(20)  NOT NULL,
    source_name       NVARCHAR(260) NULL,  -- file name or connection label
    status            NVARCHAR(20)  NOT NULL CONSTRAINT DF_migration_batch_status DEFAULT N'running',
    started_at        DATETIME2(3)  NOT NULL CONSTRAINT DF_migration_batch_started_at DEFAULT SYSUTCDATETIME(),
    finished_at       DATETIME2(3)  NULL,
    total_records     INT           NOT NULL CONSTRAINT DF_migration_batch_total_records DEFAULT 0,
    accepted_records  INT           NOT NULL CONSTRAINT DF_migration_batch_accepted_records DEFAULT 0,
    rejected_records  INT           NOT NULL CONSTRAINT DF_migration_batch_rejected_records DEFAULT 0,
    reconciliation    NVARCHAR(MAX) NULL,  -- JSON: counts, values, relationships, attachments vs expected
    rolled_back_at    DATETIME2(3)  NULL,
    rolled_back_by    INT           NULL CONSTRAINT FK_migration_batch_rolled_back_by REFERENCES dbo.app_user (id),
    created_at        DATETIME2(3)  NOT NULL CONSTRAINT DF_migration_batch_created_at DEFAULT SYSUTCDATETIME(),
    created_by        INT           NULL CONSTRAINT FK_migration_batch_created_by REFERENCES dbo.app_user (id),
    updated_at        DATETIME2(3)  NULL,
    updated_by        INT           NULL CONSTRAINT FK_migration_batch_updated_by REFERENCES dbo.app_user (id),
    CONSTRAINT CK_migration_batch_source_system CHECK (source_system IN (N'oracle', N'excel', N'access')),
    CONSTRAINT CK_migration_batch_status CHECK (status IN (N'running', N'completed', N'failed', N'rolled_back')),
    CONSTRAINT CK_migration_batch_counts CHECK (
        total_records >= 0 AND accepted_records >= 0 AND rejected_records >= 0
        AND accepted_records + rejected_records <= total_records
    ),
    CONSTRAINT CK_migration_batch_finished CHECK (finished_at IS NULL OR finished_at >= started_at),
    CONSTRAINT CK_migration_batch_rolled_back CHECK (status <> N'rolled_back' OR rolled_back_at IS NOT NULL),
    CONSTRAINT CK_migration_batch_reconciliation CHECK (reconciliation IS NULL OR ISJSON(reconciliation) = 1)
);
GO

-- A source record that was not migrated, with a clear reason (Arabic).
IF OBJECT_ID(N'dbo.migration_error', N'U') IS NULL
CREATE TABLE dbo.migration_error (
    id                  BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_migration_error PRIMARY KEY,
    migration_batch_id  INT           NOT NULL CONSTRAINT FK_migration_error_migration_batch REFERENCES dbo.migration_batch (id),
    entity              NVARCHAR(50)  NOT NULL,
    source_key          NVARCHAR(100) NULL,
    field               NVARCHAR(100) NULL,
    reason              NVARCHAR(500) NOT NULL,
    raw_data            NVARCHAR(MAX) NULL,
    created_at          DATETIME2(3)  NOT NULL CONSTRAINT DF_migration_error_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_migration_error_entity CHECK (entity IN (N'employee', N'job_action', N'document', N'document_link')),
    CONSTRAINT CK_migration_error_reason CHECK (LEN(reason) > 0),
    CONSTRAINT CK_migration_error_raw_data CHECK (raw_data IS NULL OR ISJSON(raw_data) = 1),
    INDEX IX_migration_error_batch (migration_batch_id, entity)
);
GO

-- System-versioned: past versions are in employee_history (employees.history.view).
IF OBJECT_ID(N'dbo.employee', N'U') IS NULL
CREATE TABLE dbo.employee (
    id                  INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_employee PRIMARY KEY,
    employee_no         NVARCHAR(20)  NOT NULL,
    national_id         NVARCHAR(14)  NOT NULL,
    full_name           NVARCHAR(200) NOT NULL,
    name_normalized     AS dbo.fn_normalize_ar_name(full_name) PERSISTED,
    gender              NVARCHAR(1)   NULL,
    birth_date          DATE          NULL,
    hire_date           DATE          NULL,
    work_entity_id      INT           NOT NULL CONSTRAINT FK_employee_work_entity REFERENCES dbo.work_entity (id),
    job_title           NVARCHAR(200) NULL,
    grade               NVARCHAR(50)  NULL,
    qualification       NVARCHAR(200) NULL,
    phone               NVARCHAR(30)  NULL,
    address             NVARCHAR(400) NULL,
    is_deleted          BIT           NOT NULL CONSTRAINT DF_employee_is_deleted DEFAULT 0,
    deleted_at          DATETIME2(3)  NULL,
    deleted_by          INT           NULL CONSTRAINT FK_employee_deleted_by REFERENCES dbo.app_user (id),
    source_system       NVARCHAR(20)  NULL,
    source_key          NVARCHAR(100) NULL,
    migration_batch_id  INT           NULL CONSTRAINT FK_employee_migration_batch REFERENCES dbo.migration_batch (id),
    created_at          DATETIME2(3)  NOT NULL CONSTRAINT DF_employee_created_at DEFAULT SYSUTCDATETIME(),
    created_by          INT           NULL CONSTRAINT FK_employee_created_by REFERENCES dbo.app_user (id),
    updated_at          DATETIME2(3)  NULL,
    updated_by          INT           NULL CONSTRAINT FK_employee_updated_by REFERENCES dbo.app_user (id),
    valid_from          DATETIME2(7)  GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    valid_to            DATETIME2(7)  GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME (valid_from, valid_to),
    CONSTRAINT CK_employee_employee_no CHECK (LEN(employee_no) > 0),
    CONSTRAINT CK_employee_national_id CHECK (
        LEN(national_id) = 14 AND national_id COLLATE Latin1_General_BIN2 NOT LIKE N'%[^0-9]%'
    ),
    CONSTRAINT CK_employee_full_name CHECK (LEN(full_name) > 0),
    CONSTRAINT CK_employee_gender CHECK (gender IN (N'M', N'F')),
    CONSTRAINT CK_employee_hire_date CHECK (hire_date > birth_date),
    CONSTRAINT CK_employee_deleted CHECK (is_deleted = 0 OR deleted_at IS NOT NULL),
    CONSTRAINT CK_employee_source_system CHECK (source_system IN (N'oracle', N'excel', N'access', N'manual')),
    CONSTRAINT CK_employee_source_key CHECK (source_key IS NULL OR source_system IS NOT NULL)
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.employee_history));
GO

-- Uniqueness among non-deleted employees only, so a soft-deleted record can be re-created.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.employee') AND name = N'UQ_employee_employee_no')
    CREATE UNIQUE INDEX UQ_employee_employee_no ON dbo.employee (employee_no) WHERE is_deleted = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.employee') AND name = N'UQ_employee_national_id')
    CREATE UNIQUE INDEX UQ_employee_national_id ON dbo.employee (national_id) WHERE is_deleted = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.employee') AND name = N'UQ_employee_source')
    CREATE UNIQUE INDEX UQ_employee_source ON dbo.employee (source_system, source_key) WHERE source_key IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.employee') AND name = N'IX_employee_work_entity')
    CREATE INDEX IX_employee_work_entity ON dbo.employee (work_entity_id) WHERE is_deleted = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.employee') AND name = N'IX_employee_name_normalized')
    CREATE INDEX IX_employee_name_normalized ON dbo.employee (name_normalized);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.employee') AND name = N'IX_employee_migration_batch')
    CREATE INDEX IX_employee_migration_batch ON dbo.employee (migration_batch_id) WHERE migration_batch_id IS NOT NULL;
GO

-- System-versioned: past versions are in job_action_history.
IF OBJECT_ID(N'dbo.job_action', N'U') IS NULL
CREATE TABLE dbo.job_action (
    id                  INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_job_action PRIMARY KEY,
    employee_id         INT            NOT NULL CONSTRAINT FK_job_action_employee REFERENCES dbo.employee (id),
    action_type_id      INT            NOT NULL CONSTRAINT FK_job_action_action_type REFERENCES dbo.action_type (id),
    decision_no         NVARCHAR(50)   NULL,
    decision_date       DATE           NULL,
    effective_date      DATE           NOT NULL,
    end_date            DATE           NULL,
    notes               NVARCHAR(1000) NULL,
    source_system       NVARCHAR(20)   NULL,
    source_key          NVARCHAR(100)  NULL,
    migration_batch_id  INT            NULL CONSTRAINT FK_job_action_migration_batch REFERENCES dbo.migration_batch (id),
    created_at          DATETIME2(3)   NOT NULL CONSTRAINT DF_job_action_created_at DEFAULT SYSUTCDATETIME(),
    created_by          INT            NULL CONSTRAINT FK_job_action_created_by REFERENCES dbo.app_user (id),
    updated_at          DATETIME2(3)   NULL,
    updated_by          INT            NULL CONSTRAINT FK_job_action_updated_by REFERENCES dbo.app_user (id),
    valid_from          DATETIME2(7)   GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    valid_to            DATETIME2(7)   GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME (valid_from, valid_to),
    CONSTRAINT CK_job_action_end_date CHECK (end_date >= effective_date),
    CONSTRAINT CK_job_action_source_system CHECK (source_system IN (N'oracle', N'excel', N'access', N'manual')),
    CONSTRAINT CK_job_action_source_key CHECK (source_key IS NULL OR source_system IS NOT NULL)
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.job_action_history));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.job_action') AND name = N'IX_job_action_employee')
    CREATE INDEX IX_job_action_employee ON dbo.job_action (employee_id, effective_date);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.job_action') AND name = N'UQ_job_action_source')
    CREATE UNIQUE INDEX UQ_job_action_source ON dbo.job_action (source_system, source_key) WHERE source_key IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.job_action') AND name = N'IX_job_action_migration_batch')
    CREATE INDEX IX_job_action_migration_batch ON dbo.job_action (migration_batch_id) WHERE migration_batch_id IS NOT NULL;
GO

-- Simulated e-archive document.
-- TODO: FILESTREAM in production (not available on the Linux dev container); VARBINARY(MAX) in dev.
IF OBJECT_ID(N'dbo.document', N'U') IS NULL
CREATE TABLE dbo.document (
    id                  INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_document PRIMARY KEY,
    title               NVARCHAR(300)  NULL,
    file_name           NVARCHAR(260)  NOT NULL,
    content_type        NVARCHAR(100)  NOT NULL,
    size_bytes          BIGINT         NOT NULL,
    sha256              NVARCHAR(64)   NOT NULL,
    content             VARBINARY(MAX) NOT NULL,
    archive_ref         NVARCHAR(100)  NULL,
    source_system       NVARCHAR(20)   NULL,
    source_key          NVARCHAR(100)  NULL,
    migration_batch_id  INT            NULL CONSTRAINT FK_document_migration_batch REFERENCES dbo.migration_batch (id),
    created_at          DATETIME2(3)   NOT NULL CONSTRAINT DF_document_created_at DEFAULT SYSUTCDATETIME(),
    created_by          INT            NULL CONSTRAINT FK_document_created_by REFERENCES dbo.app_user (id),
    updated_at          DATETIME2(3)   NULL,
    updated_by          INT            NULL CONSTRAINT FK_document_updated_by REFERENCES dbo.app_user (id),
    CONSTRAINT CK_document_file_name CHECK (LEN(file_name) > 0),
    CONSTRAINT CK_document_size_bytes CHECK (size_bytes >= 0 AND size_bytes = DATALENGTH(content)),
    CONSTRAINT CK_document_sha256 CHECK (LEN(sha256) = 64 AND sha256 COLLATE Latin1_General_BIN2 NOT LIKE N'%[^0-9a-f]%'),
    CONSTRAINT CK_document_source_system CHECK (source_system IN (N'oracle', N'excel', N'access', N'manual')),
    CONSTRAINT CK_document_source_key CHECK (source_key IS NULL OR source_system IS NOT NULL),
    INDEX IX_document_sha256 (sha256)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.document') AND name = N'UQ_document_source')
    CREATE UNIQUE INDEX UQ_document_source ON dbo.document (source_system, source_key) WHERE source_key IS NOT NULL;
GO

-- Links a document to an employee and/or a job action. Real FKs (not a polymorphic entity/id pair),
-- so a wrong link cannot exist undetected.
IF OBJECT_ID(N'dbo.document_link', N'U') IS NULL
CREATE TABLE dbo.document_link (
    id                  INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_document_link PRIMARY KEY,
    document_id         INT           NOT NULL CONSTRAINT FK_document_link_document REFERENCES dbo.document (id),
    employee_id         INT           NULL CONSTRAINT FK_document_link_employee REFERENCES dbo.employee (id),
    job_action_id       INT           NULL CONSTRAINT FK_document_link_job_action REFERENCES dbo.job_action (id),
    migration_batch_id  INT           NULL CONSTRAINT FK_document_link_migration_batch REFERENCES dbo.migration_batch (id),
    created_at          DATETIME2(3)  NOT NULL CONSTRAINT DF_document_link_created_at DEFAULT SYSUTCDATETIME(),
    created_by          INT           NULL CONSTRAINT FK_document_link_created_by REFERENCES dbo.app_user (id),
    updated_at          DATETIME2(3)  NULL,
    updated_by          INT           NULL CONSTRAINT FK_document_link_updated_by REFERENCES dbo.app_user (id),
    CONSTRAINT CK_document_link_target CHECK (employee_id IS NOT NULL OR job_action_id IS NOT NULL),
    INDEX IX_document_link_document (document_id),
    INDEX IX_document_link_employee (employee_id),
    INDEX IX_document_link_job_action (job_action_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.document_link') AND name = N'UQ_document_link_employee')
    CREATE UNIQUE INDEX UQ_document_link_employee ON dbo.document_link (document_id, employee_id)
        WHERE employee_id IS NOT NULL AND job_action_id IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.document_link') AND name = N'UQ_document_link_job_action')
    CREATE UNIQUE INDEX UQ_document_link_job_action ON dbo.document_link (document_id, job_action_id)
        WHERE job_action_id IS NOT NULL;
GO
