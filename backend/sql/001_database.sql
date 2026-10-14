-- 001_database.sql
-- Creates the application database with the Arabic collation. Idempotent.
-- Variables (sqlcmd style): $(DB_NAME)
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
USE master;
GO

IF DB_ID(N'$(DB_NAME)') IS NULL
BEGIN
    CREATE DATABASE [$(DB_NAME)] COLLATE Arabic_100_CI_AS;
    PRINT 'Created database $(DB_NAME)';
END
GO

IF CONVERT(NVARCHAR(128), DATABASEPROPERTYEX(N'$(DB_NAME)', 'Collation')) <> N'Arabic_100_CI_AS'
    THROW 50001, 'Database $(DB_NAME) exists with a collation other than Arabic_100_CI_AS.', 1;
GO

-- Readers don't block writers. Needs exclusive access, so only switch when it is off (normally on first run).
IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'$(DB_NAME)' AND is_read_committed_snapshot_on = 1)
    ALTER DATABASE [$(DB_NAME)] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
GO
