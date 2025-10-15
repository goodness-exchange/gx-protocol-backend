-- GX Protocol Backend - PostgreSQL Initialization Script
-- This script runs automatically when the PostgreSQL container is first created
-- Location: infra/docker/postgres/init.sql

-- Create extensions (if needed in future)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Note: The main database 'gxprotocol_dev' is already created via POSTGRES_DB env var
-- This script is for any additional setup needed

-- Create a read-only user for reporting/analytics (optional for future use)
-- DO
-- $$
-- BEGIN
--   IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'gx_readonly') THEN
--     CREATE USER gx_readonly WITH PASSWORD 'readonly_pass';
--   END IF;
-- END
-- $$;

-- Grant connect permission
-- GRANT CONNECT ON DATABASE gxprotocol_dev TO gx_readonly;

-- Note: Table-level permissions will be granted after Prisma migrations create tables
-- This will be done in a separate migration script

-- Log successful initialization
DO $$
BEGIN
  RAISE NOTICE 'GX Protocol PostgreSQL initialization complete';
  RAISE NOTICE 'Database: gxprotocol_dev';
  RAISE NOTICE 'Ready for Prisma migrations';
END $$;
