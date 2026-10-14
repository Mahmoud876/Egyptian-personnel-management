USE [$(DB_NAME)];
GO
IF COL_LENGTH(N'dbo.import_job', N'validation_run') IS NULL
 ALTER TABLE dbo.import_job ADD validation_run INT NOT NULL CONSTRAINT DF_import_validation_run DEFAULT 0
 CONSTRAINT CK_import_validation_run CHECK (validation_run >= 0);
GO
IF COL_LENGTH(N'dbo.import_record', N'corrected_data_json') IS NULL
 ALTER TABLE dbo.import_record ADD corrected_data_json NVARCHAR(MAX) NULL
 CONSTRAINT CK_import_corrected_json CHECK (corrected_data_json IS NULL OR ISJSON(corrected_data_json)=1);
GO
