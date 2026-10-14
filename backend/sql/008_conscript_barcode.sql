-- 008_conscript_barcode.sql
-- Conscript barcode: docs/business-rules.md#barcode. Idempotent.
--   value   12 digits = conscription year (4) + batch (1) + sequence (7), e.g. 202630001234
--   source  dbo.conscript_barcode_seq (unique under concurrency; gaps are harmless)
--   when    assigned when data entry saves the record (status 'registered'); never changes afterwards
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
USE [$(DB_NAME)];
GO

-- 7-digit sequence part. NO CYCLE: running out raises an error instead of reusing numbers.
IF OBJECT_ID(N'dbo.conscript_barcode_seq', N'SO') IS NULL
    CREATE SEQUENCE dbo.conscript_barcode_seq AS BIGINT
        START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9999999 NO CYCLE CACHE 50;
GO

-- Format only. The year/batch prefix records when the barcode was issued and is not tied to the current
-- conscription_year / batch_no columns, so correcting those later does not invalidate printed labels.
IF OBJECT_ID(N'dbo.CK_conscript_barcode_format', N'C') IS NULL
    ALTER TABLE dbo.conscript ADD CONSTRAINT CK_conscript_barcode_format CHECK (
        barcode IS NULL
        OR barcode COLLATE Latin1_General_BIN2 LIKE N'2[0-9][0-9][0-9][1-4][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
    );
GO

-- A registered record must have its barcode (replaces the 005 version of this constraint).
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_conscript_registered' AND parent_object_id = OBJECT_ID(N'dbo.conscript')
      AND definition NOT LIKE N'%barcode%'
)
    ALTER TABLE dbo.conscript DROP CONSTRAINT CK_conscript_registered;
IF OBJECT_ID(N'dbo.CK_conscript_registered', N'C') IS NULL
    ALTER TABLE dbo.conscript ADD CONSTRAINT CK_conscript_registered CHECK (
        status = N'received'
        OR (police_no IS NOT NULL AND start_date IS NOT NULL AND end_date IS NOT NULL
            AND locked_at IS NOT NULL AND barcode IS NOT NULL)
    );
GO

-- Once assigned, a barcode never changes: printed labels must keep working.
CREATE OR ALTER TRIGGER dbo.TR_conscript_barcode_immutable
ON dbo.conscript
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(barcode) AND EXISTS (
        SELECT 1
        FROM inserted AS i
        JOIN deleted AS d ON d.id = i.id
        WHERE d.barcode IS NOT NULL AND (i.barcode IS NULL OR i.barcode <> d.barcode)
    )
        THROW 50101, 'TR_conscript_barcode_immutable: a conscript barcode cannot be changed once assigned.', 1;
END;
GO
