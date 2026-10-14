-- 007_app_login.sql
-- Least-privilege login the app runs as (docs/permissions.md#tables). Idempotent; re-running resets the
-- password to $(APP_DB_PASSWORD) so it always matches .env.
-- Variables: $(DB_NAME), $(APP_DB_USER), $(APP_DB_PASSWORD)
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
USE master;
GO

IF SUSER_ID(N'$(APP_DB_USER)') IS NULL
    CREATE LOGIN [$(APP_DB_USER)] WITH PASSWORD = N'$(APP_DB_PASSWORD)',
        DEFAULT_DATABASE = [$(DB_NAME)], CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;
ELSE
    ALTER LOGIN [$(APP_DB_USER)] WITH PASSWORD = N'$(APP_DB_PASSWORD)';
GO

USE [$(DB_NAME)];
GO

IF USER_ID(N'$(APP_DB_USER)') IS NULL
    CREATE USER [$(APP_DB_USER)] FOR LOGIN [$(APP_DB_USER)];
IF DATABASE_PRINCIPAL_ID(N'app_role') IS NULL
    CREATE ROLE app_role;
IF IS_ROLEMEMBER(N'app_role', N'$(APP_DB_USER)') = 0
    ALTER ROLE app_role ADD MEMBER [$(APP_DB_USER)];
GO

-- Data access only: no DDL, no ownership.
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON SCHEMA::dbo TO app_role;

-- Audit log is append-only for the app.
DENY UPDATE, DELETE ON dbo.audit_log TO app_role;

-- Permission codes are owned by 003_permissions_seed.sql; the app never creates or changes them.
DENY INSERT, UPDATE, DELETE ON dbo.permission TO app_role;
GO
