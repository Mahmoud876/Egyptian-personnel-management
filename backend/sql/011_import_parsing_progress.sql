USE [$(DB_NAME)];
GO
IF COL_LENGTH(N'dbo.import_job', N'parsed_rows') IS NULL
BEGIN
 ALTER TABLE dbo.import_job ADD parsed_rows INT NOT NULL
 CONSTRAINT DF_import_parsed_rows DEFAULT 0
 CONSTRAINT CK_import_parsed_rows CHECK (parsed_rows >= 0);
END;
GO
