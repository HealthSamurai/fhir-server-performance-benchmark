-- ---------------------------------------------------------------------------
-- Server-level tuning for the Microsoft FHIR Server / SQL Server datastore.
--
-- Mirrors the Postgres tuning in infra/postgres/postgres.conf so the two
-- datastores are configured comparably under the same benchmark load
-- (parallelism cap, explicit memory target, plenty of tempdb headroom).
--
-- Applied once per bootstrap by the `mssql-tune` sidecar after SQL Server is
-- healthy and BEFORE the FHIR app builds its schema, so index builds honour the
-- same MAXDOP cap. Server-level settings persist in master; tempdb file/size
-- definitions also persist and are re-applied to the freshly-rebuilt tempdb on
-- every restart, so this script is written to be idempotent.
-- ---------------------------------------------------------------------------

SET NOCOUNT ON;

EXEC sys.sp_configure 'show advanced options', 1;
RECONFIGURE;
GO

-- Max degree of parallelism. Postgres caps a single query at 4 parallel workers
-- (max_parallel_workers_per_gather = 4); mirror that here so neither engine gets
-- to fan a single search across all 8 cores while others are starved.
EXEC sys.sp_configure 'max degree of parallelism', 4;

-- The default cost threshold of 5 pushes even trivial OLTP point-lookups onto a
-- parallel plan, adding scheduling/exchange overhead under high write+search
-- concurrency. 50 is the standard OLTP recommendation.
EXEC sys.sp_configure 'cost threshold for parallelism', 50;

-- The FHIR API issues a huge variety of one-shot ad-hoc search queries. Caching
-- a stub on first sight (instead of the full compiled plan) keeps the plan cache
-- from bloating with single-use plans and evicting the hot ones.
EXEC sys.sp_configure 'optimize for ad hoc workloads', 1;

-- Explicit buffer-pool target, kept in lockstep with MSSQL_MEMORY_LIMIT_MB
-- (26000) in docker-compose so the cap is visible here even if the env var is
-- ever dropped. Roughly mirrors Postgres shared_buffers + effective_cache_size
-- intent for the 30G container.
EXEC sys.sp_configure 'max server memory (MB)', 26000;

RECONFIGURE;
GO

-- ---------------------------------------------------------------------------
-- tempdb
--
-- SQL Server funnels sorts, hash joins and the version store through tempdb.
-- With a single data file the allocation-page latches (PFS/GAM/SGAM) serialize
-- under the concurrent search load this benchmark drives. Best practice is one
-- data file per logical core up to 8; the container gets 8 cores -> 8 equally
-- sized, equally growing files. Pre-sizing avoids autogrowth stalls mid-run.
-- ---------------------------------------------------------------------------

ALTER DATABASE tempdb MODIFY FILE (NAME = tempdev, SIZE = 1024MB, FILEGROWTH = 256MB);
ALTER DATABASE tempdb MODIFY FILE (NAME = templog, SIZE = 512MB,  FILEGROWTH = 256MB);
GO

DECLARE @i int = 2;
WHILE @i <= 8
BEGIN
    DECLARE @sql nvarchar(max) =
        N'ALTER DATABASE tempdb ADD FILE (NAME = tempdev' + CAST(@i AS nvarchar(2))
        + N', FILENAME = ''/var/opt/mssql/data/tempdb' + CAST(@i AS nvarchar(2))
        + N'.ndf'', SIZE = 1024MB, FILEGROWTH = 256MB)';
    BEGIN TRY
        EXEC sys.sp_executesql @sql;
        PRINT 'tempdb data file ' + CAST(@i AS nvarchar(2)) + ' added';
    END TRY
    BEGIN CATCH
        -- File already defined (persisted from a previous bootstrap) -> skip.
        PRINT 'tempdb data file ' + CAST(@i AS nvarchar(2)) + ' already exists, skipping';
    END CATCH
    SET @i += 1;
END
GO
