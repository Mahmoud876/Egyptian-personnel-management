-- Durable delivery scheduling; old unfinished jobs are immediately eligible for reconciliation.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
USE [$(DB_NAME)];
GO
IF COL_LENGTH(N'dbo.import_job', N'dispatched_at') IS NULL
    ALTER TABLE dbo.import_job ADD dispatched_at DATETIME2(3) NULL;
IF COL_LENGTH(N'dbo.import_job', N'next_dispatch_check_at') IS NULL
    ALTER TABLE dbo.import_job ADD next_dispatch_check_at DATETIME2(3) NOT NULL
        CONSTRAINT DF_import_dispatch_check DEFAULT SYSUTCDATETIME() WITH VALUES;
GO
IF COL_LENGTH(N'dbo.export_job', N'dispatched_at') IS NULL
    ALTER TABLE dbo.export_job ADD dispatched_at DATETIME2(3) NULL;
IF COL_LENGTH(N'dbo.export_job', N'next_dispatch_check_at') IS NULL
    ALTER TABLE dbo.export_job ADD next_dispatch_check_at DATETIME2(3) NOT NULL
        CONSTRAINT DF_export_dispatch_check DEFAULT SYSUTCDATETIME() WITH VALUES;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.import_job') AND name = N'IX_import_dispatch_due')
    CREATE INDEX IX_import_dispatch_due ON dbo.import_job (next_dispatch_check_at, created_at, id)
        INCLUDE (status) WHERE status IN (N'QUEUED', N'PARSING', N'VALIDATING');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.export_job') AND name = N'IX_export_dispatch_due')
    CREATE INDEX IX_export_dispatch_due ON dbo.export_job (next_dispatch_check_at, created_at, id)
        INCLUDE (status) WHERE status IN (N'QUEUED', N'PROCESSING');
GO
