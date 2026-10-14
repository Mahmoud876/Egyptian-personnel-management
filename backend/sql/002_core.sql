-- 002_core.sql
-- Users, permissions, templates, sessions, audit log. See docs/permissions.md. Idempotent.
-- Timestamps are UTC (SYSUTCDATETIME). created_by / updated_by are NULL for rows written by scripts.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
USE [$(DB_NAME)];
GO

-- Arabic name normalisation for search: docs/business-rules.md#search-and-labels
-- أ إ آ -> ا, ة -> ه, ى -> ي, remove tatweel and diacritics (U+064B..U+0652, U+0670).
-- Created only if missing: persisted computed columns depend on it, so later changes need a new numbered script.
IF OBJECT_ID(N'dbo.fn_normalize_ar_name', N'FN') IS NULL
    EXEC (N'
CREATE FUNCTION dbo.fn_normalize_ar_name (@name NVARCHAR(200))
RETURNS NVARCHAR(200)
WITH SCHEMABINDING
AS
BEGIN
    IF @name IS NULL RETURN NULL;
    -- COLLATE inside every REPLACE: a variable always takes the database collation, and under Arabic_100_CI_AS
    -- diacritics are ignorable, so REPLACE would match the wrong text. Binary matches exact code points.
    DECLARE @s NVARCHAR(200) = @name;
    SET @s = REPLACE(@s COLLATE Latin1_General_BIN2, NCHAR(0x0623), NCHAR(0x0627));
    SET @s = REPLACE(@s COLLATE Latin1_General_BIN2, NCHAR(0x0625), NCHAR(0x0627));
    SET @s = REPLACE(@s COLLATE Latin1_General_BIN2, NCHAR(0x0622), NCHAR(0x0627));
    SET @s = REPLACE(@s COLLATE Latin1_General_BIN2, NCHAR(0x0629), NCHAR(0x0647));
    SET @s = REPLACE(@s COLLATE Latin1_General_BIN2, NCHAR(0x0649), NCHAR(0x064A));
    SET @s = REPLACE(@s COLLATE Latin1_General_BIN2, NCHAR(0x0640), N'''');
    DECLARE @c INT = 0x064B;
    WHILE @c <= 0x0652
    BEGIN
        SET @s = REPLACE(@s COLLATE Latin1_General_BIN2, NCHAR(@c), N'''');
        SET @c += 1;
    END;
    SET @s = REPLACE(@s COLLATE Latin1_General_BIN2, NCHAR(0x0670), N'''');
    RETURN @s;
END');
GO

IF OBJECT_ID(N'dbo.permission', N'U') IS NULL
CREATE TABLE dbo.permission (
    code            NVARCHAR(100) NOT NULL CONSTRAINT PK_permission PRIMARY KEY,
    module          NVARCHAR(20)  NOT NULL,
    name_ar         NVARCHAR(200) NOT NULL,
    name_en         NVARCHAR(200) NOT NULL,
    description_ar  NVARCHAR(500) NULL,
    sort_order      INT           NOT NULL CONSTRAINT DF_permission_sort_order DEFAULT 0,
    CONSTRAINT CK_permission_code CHECK (code COLLATE Latin1_General_BIN2 NOT LIKE N'%[^a-z0-9._]%'),
    CONSTRAINT CK_permission_module CHECK (module IN (N'admin', N'conscripts', N'employees'))
);
GO

IF OBJECT_ID(N'dbo.app_user', N'U') IS NULL
CREATE TABLE dbo.app_user (
    id                    INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_app_user PRIMARY KEY,
    username              NVARCHAR(50)  NOT NULL CONSTRAINT UQ_app_user_username UNIQUE,
    full_name             NVARCHAR(200) NOT NULL,
    password_hash         NVARCHAR(255) NOT NULL,
    is_active             BIT           NOT NULL CONSTRAINT DF_app_user_is_active DEFAULT 1,
    work_entity_id        INT           NULL,  -- FK added in 004_lookups.sql, after work_entity exists
    must_change_password  BIT           NOT NULL CONSTRAINT DF_app_user_must_change_password DEFAULT 1,
    last_login_at         DATETIME2(3)  NULL,
    created_at            DATETIME2(3)  NOT NULL CONSTRAINT DF_app_user_created_at DEFAULT SYSUTCDATETIME(),
    created_by            INT           NULL CONSTRAINT FK_app_user_created_by REFERENCES dbo.app_user (id),
    updated_at            DATETIME2(3)  NULL,
    updated_by            INT           NULL CONSTRAINT FK_app_user_updated_by REFERENCES dbo.app_user (id),
    CONSTRAINT CK_app_user_username CHECK (
        LEN(username) >= 3 AND username COLLATE Latin1_General_BIN2 NOT LIKE N'%[^a-zA-Z0-9._-]%'
    ),
    CONSTRAINT CK_app_user_full_name CHECK (LEN(full_name) > 0)
);
GO

IF OBJECT_ID(N'dbo.user_permission', N'U') IS NULL
CREATE TABLE dbo.user_permission (
    user_id          INT           NOT NULL CONSTRAINT FK_user_permission_user REFERENCES dbo.app_user (id),
    permission_code  NVARCHAR(100) NOT NULL CONSTRAINT FK_user_permission_permission REFERENCES dbo.permission (code),
    granted_at       DATETIME2(3)  NOT NULL CONSTRAINT DF_user_permission_granted_at DEFAULT SYSUTCDATETIME(),
    granted_by       INT           NULL CONSTRAINT FK_user_permission_granted_by REFERENCES dbo.app_user (id),
    CONSTRAINT PK_user_permission PRIMARY KEY (user_id, permission_code)
);
GO

IF OBJECT_ID(N'dbo.permission_template', N'U') IS NULL
CREATE TABLE dbo.permission_template (
    id              INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_permission_template PRIMARY KEY,
    name_ar         NVARCHAR(200) NOT NULL CONSTRAINT UQ_permission_template_name_ar UNIQUE,
    description_ar  NVARCHAR(500) NULL,
    created_at      DATETIME2(3)  NOT NULL CONSTRAINT DF_permission_template_created_at DEFAULT SYSUTCDATETIME(),
    created_by      INT           NULL CONSTRAINT FK_permission_template_created_by REFERENCES dbo.app_user (id),
    updated_at      DATETIME2(3)  NULL,
    updated_by      INT           NULL CONSTRAINT FK_permission_template_updated_by REFERENCES dbo.app_user (id),
    CONSTRAINT CK_permission_template_name_ar CHECK (LEN(name_ar) > 0)
);
GO

IF OBJECT_ID(N'dbo.template_permission', N'U') IS NULL
CREATE TABLE dbo.template_permission (
    template_id      INT           NOT NULL
        CONSTRAINT FK_template_permission_template REFERENCES dbo.permission_template (id) ON DELETE CASCADE,
    permission_code  NVARCHAR(100) NOT NULL
        CONSTRAINT FK_template_permission_permission REFERENCES dbo.permission (code),
    CONSTRAINT PK_template_permission PRIMARY KEY (template_id, permission_code)
);
GO

IF OBJECT_ID(N'dbo.user_session', N'U') IS NULL
CREATE TABLE dbo.user_session (
    id            NVARCHAR(64)  NOT NULL CONSTRAINT PK_user_session PRIMARY KEY,
    user_id       INT           NOT NULL CONSTRAINT FK_user_session_user REFERENCES dbo.app_user (id),
    created_at    DATETIME2(3)  NOT NULL CONSTRAINT DF_user_session_created_at DEFAULT SYSUTCDATETIME(),
    expires_at    DATETIME2(3)  NOT NULL,
    last_seen_at  DATETIME2(3)  NOT NULL CONSTRAINT DF_user_session_last_seen_at DEFAULT SYSUTCDATETIME(),
    ip            NVARCHAR(45)  NULL,
    CONSTRAINT CK_user_session_expires_at CHECK (expires_at > created_at),
    INDEX IX_user_session_user_id (user_id),
    INDEX IX_user_session_expires_at (expires_at)
);
GO

-- Append-only: the app login is denied UPDATE and DELETE (007_app_login.sql).
IF OBJECT_ID(N'dbo.audit_log', N'U') IS NULL
CREATE TABLE dbo.audit_log (
    id               BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_audit_log PRIMARY KEY,
    at               DATETIME2(3)  NOT NULL CONSTRAINT DF_audit_log_at DEFAULT SYSUTCDATETIME(),
    user_id          INT           NULL CONSTRAINT FK_audit_log_user REFERENCES dbo.app_user (id),
    ip               NVARCHAR(45)  NULL,
    action           NVARCHAR(50)  NOT NULL,
    entity           NVARCHAR(100) NULL,
    entity_id        NVARCHAR(100) NULL,
    permission_code  NVARCHAR(100) NULL CONSTRAINT FK_audit_log_permission REFERENCES dbo.permission (code),
    old_values       NVARCHAR(MAX) NULL,
    new_values       NVARCHAR(MAX) NULL,
    batch_id         BIGINT        NULL,  -- groups the rows written by one operation (e.g. an import approval)
    CONSTRAINT CK_audit_log_action CHECK (LEN(action) > 0),
    CONSTRAINT CK_audit_log_old_values CHECK (old_values IS NULL OR ISJSON(old_values) = 1),
    CONSTRAINT CK_audit_log_new_values CHECK (new_values IS NULL OR ISJSON(new_values) = 1),
    INDEX IX_audit_log_at (at),
    INDEX IX_audit_log_user_id_at (user_id, at),
    INDEX IX_audit_log_entity (entity, entity_id),
    INDEX IX_audit_log_action_at (action, at)
);
GO
