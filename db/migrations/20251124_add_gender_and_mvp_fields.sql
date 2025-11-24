-- Migration: Add Gender and MVP User Registration Fields
-- Date: 2025-11-24
-- Purpose: Support new user registration architecture with deterministic Fabric User ID

-- Step 1: Update UserProfileStatus enum to support MVP state machine
ALTER TYPE "UserProfileStatus" RENAME TO "UserProfileStatus_old";

CREATE TYPE "UserProfileStatus" AS ENUM (
  'REGISTERED',
  'PENDING_ADMIN_APPROVAL',
  'APPROVED_PENDING_ONCHAIN',
  'DENIED',
  'ACTIVE',
  'FROZEN',
  'SUSPENDED',
  'CLOSED'
);

-- Step 2: Add new columns to UserProfile table
ALTER TABLE "UserProfile"
  ADD COLUMN "dateOfBirth" DATE,
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "fabricUserId" TEXT,
  ADD COLUMN "onchainStatus" TEXT,
  ADD COLUMN "isLocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lockReason" TEXT,
  ADD COLUMN "lockedBy" TEXT,
  ADD COLUMN "lockedAt" TIMESTAMPTZ(3),
  ADD COLUMN "lockNotes" TEXT,
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMPTZ(3),
  ADD COLUMN "denialReason" TEXT,
  ADD COLUMN "onchainRegisteredAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastSyncedAt" TIMESTAMPTZ(3);

-- Step 3: Migrate existing status values
-- This maps old statuses to new MVP statuses
ALTER TABLE "UserProfile"
  ALTER COLUMN "status" TYPE "UserProfileStatus"
  USING (
    CASE "status"::text
      WHEN 'PENDING_VERIFICATION' THEN 'PENDING_ADMIN_APPROVAL'::"UserProfileStatus"
      WHEN 'VERIFIED' THEN 'ACTIVE'::"UserProfileStatus"
      WHEN 'REJECTED' THEN 'DENIED'::"UserProfileStatus"
      WHEN 'SUSPENDED' THEN 'SUSPENDED'::"UserProfileStatus"
      WHEN 'CLOSED' THEN 'CLOSED'::"UserProfileStatus"
      ELSE 'REGISTERED'::"UserProfileStatus"
    END
  );

-- Step 4: Update default value for status column
ALTER TABLE "UserProfile"
  ALTER COLUMN "status" SET DEFAULT 'REGISTERED'::"UserProfileStatus";

-- Step 5: Drop old enum
DROP TYPE "UserProfileStatus_old";

-- Step 6: Add unique constraint on fabricUserId
ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_fabricUserId_key" UNIQUE ("fabricUserId");

-- Step 7: Create indexes for new fields
CREATE INDEX "UserProfile_fabricUserId_idx" ON "UserProfile"("fabricUserId");
CREATE INDEX "UserProfile_isLocked_idx" ON "UserProfile"("isLocked");
CREATE INDEX "UserProfile_reviewedBy_idx" ON "UserProfile"("reviewedBy");

-- Step 8: Add comments for documentation
COMMENT ON COLUMN "UserProfile"."gender" IS 'User gender: "male" or "female" - required for Fabric User ID generation';
COMMENT ON COLUMN "UserProfile"."fabricUserId" IS 'Deterministic 20-character ID format: CC CCC AANNNN TCCCC NNNN';
COMMENT ON COLUMN "UserProfile"."onchainStatus" IS 'Mirror of blockchain User.Status for sync validation';
COMMENT ON COLUMN "UserProfile"."isLocked" IS 'Account freeze status (frozen users cannot transact)';

-- Step 9: Verify migration
DO $$
BEGIN
  -- Check that all required columns exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'UserProfile' AND column_name = 'gender'
  ) THEN
    RAISE EXCEPTION 'Migration failed: gender column not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'UserProfile' AND column_name = 'fabricUserId'
  ) THEN
    RAISE EXCEPTION 'Migration failed: fabricUserId column not created';
  END IF;

  RAISE NOTICE 'Migration completed successfully';
END $$;
