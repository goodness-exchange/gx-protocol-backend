-- Migration: Add Address table and AddressType enum
-- This migration adds support for user address history for KYR verification

-- Create AddressType enum
CREATE TYPE "AddressType" AS ENUM ('CURRENT', 'PREVIOUS', 'MAILING', 'WORK');

-- Create Address table
CREATE TABLE "Address" (
    "addressId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "addressType" "AddressType" NOT NULL DEFAULT 'CURRENT',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "stateProvince" TEXT,
    "postalCode" TEXT,
    "countryCode" CHAR(2) NOT NULL,
    "proofDocumentUrl" TEXT,
    "proofDocumentHash" TEXT,
    "proofDocumentType" TEXT,
    "proofUploadedAt" TIMESTAMPTZ(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMPTZ(3),
    "verifiedBy" TEXT,
    "validFrom" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("addressId")
);

-- Create indexes for Address table
CREATE INDEX "Address_tenantId_profileId_idx" ON "Address"("tenantId", "profileId");
CREATE INDEX "Address_tenantId_profileId_addressType_idx" ON "Address"("tenantId", "profileId", "addressType");
CREATE INDEX "Address_tenantId_profileId_isCurrent_idx" ON "Address"("tenantId", "profileId", "isCurrent");
CREATE INDEX "Address_countryCode_idx" ON "Address"("countryCode");

-- Add foreign key constraint
ALTER TABLE "Address" ADD CONSTRAINT "Address_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;
