-- Migration: Add Gender and MVP User Registration Fields (v2 - Fixed)
-- Date: 2025-11-24
-- Purpose: Support new user registration architecture with deterministic Fabric User ID

-- Step 1: Add new columns to UserProfile table FIRST (before enum changes)
ALTER TABLE "UserProfile"
  ADD COLUMN IF NOT EXISTS "dateOfBirth" DATE,
  ADD COLUMN IF NOT EXISTS "gender" TEXT,
  ADD COLUMN IF NOT EXISTS "fabricUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "onchainStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lockReason" TEXT,
  ADD COLUMN IF NOT EXISTS "lockedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "lockNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "denialReason" TEXT,
  ADD COLUMN IF NOT EXISTS "onchainRegisteredAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMPTZ(3);

-- Step 2: Update isLocked to NOT NULL (for rows that were just added)
UPDATE "UserProfile" SET "isLocked" = false WHERE "isLocked" IS NULL;
ALTER TABLE "UserProfile" ALTER COLUMN "isLocked" SET NOT NULL;

-- Step 3: Update UserProfileStatus enum with proper casting
DO $$
BEGIN
  -- Create new enum type
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserProfileStatus_new') THEN
    CREATE TYPE "UserProfileStatus_new" AS ENUM (
      'REGISTERED',
      'PENDING_ADMIN_APPROVAL',
      'APPROVED_PENDING_ONCHAIN',
      'DENIED',
      'ACTIVE',
      'FROZEN',
      'SUSPENDED',
      'CLOSED'
    );
  END IF;

  -- Migrate existing data with explicit mapping
  ALTER TABLE "UserProfile"
    ALTER COLUMN "status" DROP DEFAULT;

  ALTER TABLE "UserProfile"
    ALTER COLUMN "status" TYPE "UserProfileStatus_new"
    USING (
      CASE "status"::text
        WHEN 'PENDING_VERIFICATION' THEN 'PENDING_ADMIN_APPROVAL'::"UserProfileStatus_new"
        WHEN 'VERIFIED' THEN 'ACTIVE'::"UserProfileStatus_new"
        WHEN 'REJECTED' THEN 'DENIED'::"UserProfileStatus_new"
        WHEN 'SUSPENDED' THEN 'SUSPENDED'::"UserProfileStatus_new"
        WHEN 'CLOSED' THEN 'CLOSED'::"UserProfileStatus_new"
        ELSE 'REGISTERED'::"UserProfileStatus_new"
      END
    );

  -- Drop old enum and rename new one
  DROP TYPE IF EXISTS "UserProfileStatus" CASCADE;
  ALTER TYPE "UserProfileStatus_new" RENAME TO "UserProfileStatus";

  -- Set new default
  ALTER TABLE "UserProfile"
    ALTER COLUMN "status" SET DEFAULT 'REGISTERED'::"UserProfileStatus";

  RAISE NOTICE 'Enum migration completed';
END $$;

-- Step 4: Add unique constraint on fabricUserId (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'UserProfile_fabricUserId_key'
  ) THEN
    ALTER TABLE "UserProfile"
      ADD CONSTRAINT "UserProfile_fabricUserId_key" UNIQUE ("fabricUserId");
  END IF;
END $$;

-- Step 5: Create indexes for new fields (if not exist)
CREATE INDEX IF NOT EXISTS "UserProfile_fabricUserId_idx" ON "UserProfile"("fabricUserId");
CREATE INDEX IF NOT EXISTS "UserProfile_isLocked_idx" ON "UserProfile"("isLocked");
CREATE INDEX IF NOT EXISTS "UserProfile_reviewedBy_idx" ON "UserProfile"("reviewedBy");

-- Step 6: Add comments for documentation
COMMENT ON COLUMN "UserProfile"."gender" IS 'User gender: "male" or "female" - required for Fabric User ID generation';
COMMENT ON COLUMN "UserProfile"."fabricUserId" IS 'Deterministic 20-character ID format: CC CCC AANNNN TCCCC NNNN';
COMMENT ON COLUMN "UserProfile"."onchainStatus" IS 'Mirror of blockchain User.Status for sync validation';
COMMENT ON COLUMN "UserProfile"."isLocked" IS 'Account freeze status (frozen users cannot transact)';

-- Step 7: Verify migration
DO $$
DECLARE
  gender_exists BOOLEAN;
  fabricUserId_exists BOOLEAN;
  enum_values TEXT[];
BEGIN
  -- Check columns
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'UserProfile' AND column_name = 'gender'
  ) INTO gender_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'UserProfile' AND column_name = 'fabricUserId'
  ) INTO fabricUserId_exists;

  -- Check enum values
  SELECT array_agg(enumlabel::text ORDER BY enumsortorder)
  INTO enum_values
  FROM pg_enum
  WHERE enumtypid = 'UserProfileStatus'::regtype;

  -- Verify
  IF NOT gender_exists THEN
    RAISE EXCEPTION 'Migration failed: gender column not created';
  END IF;

  IF NOT fabricUserId_exists THEN
    RAISE EXCEPTION 'Migration failed: fabricUserId column not created';
  END IF;

  IF NOT ('REGISTERED' = ANY(enum_values)) THEN
    RAISE EXCEPTION 'Migration failed: REGISTERED status not in enum';
  END IF;

  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'New columns: gender, fabricUserId, dateOfBirth, and 11 others';
  RAISE NOTICE 'New status values: %', enum_values;
END $$;
