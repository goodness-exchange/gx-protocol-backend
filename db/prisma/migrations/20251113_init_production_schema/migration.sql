-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'LOCKED', 'SUBMITTED', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "CommandType" AS ENUM ('CREATE_USER', 'TRANSFER_TOKENS');

-- CreateEnum
CREATE TYPE "UserProfileStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrgProfileStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "LegalTenderStatusEnum" AS ENUM ('RECOGNIZED', 'SANDBOX', 'ACTIVE_LEGAL_TENDER');

-- CreateEnum
CREATE TYPE "OffChainTxType" AS ENUM ('MINT', 'SENT', 'RECEIVED', 'TAX', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT');

-- CreateEnum
CREATE TYPE "CollateralStatus" AS ENUM ('PLEDGED', 'RELEASED');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('FATHER', 'MOTHER', 'SPOUSE', 'CHILD', 'SIBLING', 'BUSINESS_PARTNER', 'DIRECTOR', 'WORKPLACE_ASSOCIATE', 'FRIEND');

-- CreateEnum
CREATE TYPE "RelationshipStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'DECEASED', 'DIVORCED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "SignatoryRole" AS ENUM ('OWNER', 'DIRECTOR', 'AUTHORIZED_SIGNATORY', 'ACCOUNTANT', 'VIEWER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('USER_LOGIN', 'USER_LOGOUT', 'USER_REGISTERED', 'PROFILE_UPDATED', 'PASSWORD_CHANGED', 'KYC_SUBMITTED', 'KYC_APPROVED', 'KYC_REJECTED', 'TRANSACTION_INITIATED', 'TRANSACTION_APPROVED', 'TRANSACTION_REJECTED', 'TRANSACTION_COMPLETED', 'TRANSACTION_FAILED', 'WALLET_CREATED', 'BENEFICIARY_ADDED', 'BENEFICIARY_REMOVED', 'RELATIONSHIP_INVITED', 'RELATIONSHIP_CONFIRMED', 'RELATIONSHIP_REJECTED', 'BUSINESS_SIGNATORY_ADDED', 'BUSINESS_SIGNATORY_REVOKED', 'ADMIN_ACCOUNT_FROZEN', 'ADMIN_ACCOUNT_UNFROZEN', 'ADMIN_ACCOUNT_CLOSED', 'SESSION_CREATED', 'SESSION_REVOKED', 'DEVICE_TRUSTED', 'DEVICE_UNTRUSTED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'LOGGED_OUT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RELATIONSHIP_INVITATION', 'RELATIONSHIP_CONFIRMED', 'RELATIONSHIP_REJECTED', 'BUSINESS_SIGNATORY_INVITATION', 'TRANSACTION_APPROVAL_REQUEST', 'TRANSACTION_APPROVED', 'TRANSACTION_REJECTED', 'TRANSACTION_COMPLETED', 'KYC_STATUS_UPDATE', 'WALLET_CREDITED', 'WALLET_DEBITED', 'SYSTEM_ANNOUNCEMENT', 'SECURITY_ALERT');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED', 'ACTIONED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('NATIONAL_ID', 'PASSPORT', 'DRIVERS_LICENSE', 'PROOF_OF_ADDRESS', 'DEATH_CERTIFICATE', 'DIVORCE_CERTIFICATE', 'BUSINESS_REGISTRATION', 'TAX_REGISTRATION', 'BANK_STATEMENT', 'UTILITY_BILL', 'SELFIE_PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "LimitType" AS ENUM ('DAILY_SEND', 'DAILY_RECEIVE', 'MONTHLY_SEND', 'MONTHLY_RECEIVE', 'SINGLE_TRANSACTION', 'VELOCITY_CHECK');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Country" (
    "countryCode" CHAR(2) NOT NULL,
    "countryName" TEXT NOT NULL,
    "region" TEXT,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("countryCode")
);

-- CreateTable
CREATE TABLE "LegalTenderStatus" (
    "statusId" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "status" "LegalTenderStatusEnum" NOT NULL,
    "effectiveDate" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalTenderStatus_pkey" PRIMARY KEY ("statusId")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "profileId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phoneNum" TEXT,
    "identityNum" TEXT,
    "biometricHash" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nationalityCountryCode" CHAR(2),
    "status" "UserProfileStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "KYCVerification" (
    "kycId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),
    "verifierDetails" TEXT,
    "evidenceHash" TEXT,
    "evidenceSize" INTEGER,
    "evidenceMime" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "KYCVerification_pkey" PRIMARY KEY ("kycId")
);

-- CreateTable
CREATE TABLE "OrganizationProfile" (
    "orgProfileId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "jurisdictionCountryCode" CHAR(2) NOT NULL,
    "address" TEXT,
    "status" "OrgProfileStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationProfile_pkey" PRIMARY KEY ("orgProfileId")
);

-- CreateTable
CREATE TABLE "FamilyRelationship" (
    "relationshipId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "initiatorProfileId" TEXT NOT NULL,
    "relatedProfileId" TEXT,
    "relatedEmail" TEXT,
    "relationType" "RelationType" NOT NULL,
    "status" "RelationshipStatus" NOT NULL DEFAULT 'PENDING',
    "statusDocumentUrl" TEXT,
    "statusDocumentHash" TEXT,
    "statusRemarks" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "rejectedAt" TIMESTAMPTZ(3),
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "isApplicable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FamilyRelationship_pkey" PRIMARY KEY ("relationshipId")
);

-- CreateTable
CREATE TABLE "TrustScore" (
    "profileId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "familyScore" INTEGER NOT NULL DEFAULT 0,
    "businessScore" INTEGER NOT NULL DEFAULT 0,
    "friendsScore" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "familyWeight" DECIMAL(5,2) NOT NULL DEFAULT 0.80,
    "businessWeight" DECIMAL(5,2) NOT NULL DEFAULT 0.10,
    "friendsWeight" DECIMAL(5,2) NOT NULL DEFAULT 0.10,
    "lastCalculatedAt" TIMESTAMPTZ(3) NOT NULL,
    "calculationVersion" TEXT NOT NULL DEFAULT '1.0',

    CONSTRAINT "TrustScore_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "walletId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "primaryAccountId" TEXT NOT NULL,
    "walletName" TEXT NOT NULL,
    "cachedBalance" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("walletId")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "offTxId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "onChainTxId" TEXT,
    "walletId" TEXT NOT NULL,
    "type" "OffChainTxType" NOT NULL,
    "counterparty" TEXT NOT NULL,
    "amount" DECIMAL(36,9) NOT NULL,
    "fee" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "remark" TEXT,
    "timestamp" TIMESTAMPTZ(3) NOT NULL,
    "blockNumber" BIGINT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("offTxId")
);

-- CreateTable
CREATE TABLE "Beneficiary" (
    "beneficiaryId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerProfileId" TEXT NOT NULL,
    "beneficiaryIdentityId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("beneficiaryId")
);

-- CreateTable
CREATE TABLE "Contact" (
    "contactId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerProfileId" TEXT NOT NULL,
    "contactProfileId" TEXT,
    "displayName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "lastTransactionAt" TIMESTAMPTZ(3),
    "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("contactId")
);

-- CreateTable
CREATE TABLE "BusinessAccount" (
    "businessAccountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgProfileId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "defaultRequiredApprovals" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BusinessAccount_pkey" PRIMARY KEY ("businessAccountId")
);

-- CreateTable
CREATE TABLE "BusinessSignatory" (
    "signatoryId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessAccountId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "role" "SignatoryRole" NOT NULL,
    "canInitiateTransactions" BOOLEAN NOT NULL DEFAULT false,
    "canApproveTransactions" BOOLEAN NOT NULL DEFAULT false,
    "maxTransactionLimit" DECIMAL(36,9),
    "invitedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "BusinessSignatory_pkey" PRIMARY KEY ("signatoryId")
);

-- CreateTable
CREATE TABLE "SignatoryRule" (
    "ruleId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessAccountId" TEXT NOT NULL,
    "minAmount" DECIMAL(36,9),
    "maxAmount" DECIMAL(36,9),
    "requiredApprovals" INTEGER NOT NULL,
    "transactionType" "OffChainTxType",
    "dailyLimit" DECIMAL(36,9),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SignatoryRule_pkey" PRIMARY KEY ("ruleId")
);

-- CreateTable
CREATE TABLE "TransactionApproval" (
    "approvalId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessAccountId" TEXT NOT NULL,
    "outboxCommandId" TEXT NOT NULL,
    "requiredApprovals" INTEGER NOT NULL,
    "receivedApprovals" INTEGER NOT NULL DEFAULT 0,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransactionApproval_pkey" PRIMARY KEY ("approvalId")
);

-- CreateTable
CREATE TABLE "ApprovalVote" (
    "voteId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "signatoryId" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "remarks" TEXT,
    "votedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalVote_pkey" PRIMARY KEY ("voteId")
);

-- CreateTable
CREATE TABLE "KYCDocument" (
    "documentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "documentNumber" TEXT,
    "issuingCountry" CHAR(2),
    "issuedDate" DATE,
    "expiryDate" DATE,
    "storageUrl" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "encryptionKey" TEXT,
    "virusScanStatus" TEXT,
    "virusScanDate" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "replacesDocumentId" TEXT,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMPTZ(3),
    "verifiedBy" TEXT,

    CONSTRAINT "KYCDocument_pkey" PRIMARY KEY ("documentId")
);

-- CreateTable
CREATE TABLE "TransactionLimit" (
    "limitId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT,
    "walletId" TEXT,
    "limitType" "LimitType" NOT NULL,
    "limitAmount" DECIMAL(36,9) NOT NULL,
    "maxCount" INTEGER,
    "timeWindowMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransactionLimit_pkey" PRIMARY KEY ("limitId")
);

-- CreateTable
CREATE TABLE "TransactionRiskScore" (
    "riskId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offTxId" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskFactors" JSONB NOT NULL,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionRiskScore_pkey" PRIMARY KEY ("riskId")
);

-- CreateTable
CREATE TABLE "HoardingTaxSnapshot" (
    "snapshotId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "balance" DECIMAL(36,9) NOT NULL,
    "daysHeld" INTEGER NOT NULL,
    "taxableAmount" DECIMAL(36,9) NOT NULL,
    "taxRate" DECIMAL(5,4) NOT NULL,
    "taxOwed" DECIMAL(36,9) NOT NULL,
    "taxPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMPTZ(3),
    "fabricTxId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoardingTaxSnapshot_pkey" PRIMARY KEY ("snapshotId")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "sessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "deviceOs" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" TEXT,
    "refreshToken" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "TrustedDevice" (
    "deviceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "deviceOs" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isTrusted" BOOLEAN NOT NULL DEFAULT false,
    "trustVerifiedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "notificationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionUrl" TEXT,
    "actionRequired" BOOLEAN NOT NULL DEFAULT false,
    "actionResourceType" TEXT,
    "actionResourceId" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "readAt" TIMESTAMPTZ(3),
    "actionedAt" TIMESTAMPTZ(3),
    "sentViaEmail" BOOLEAN NOT NULL DEFAULT false,
    "sentViaPush" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMPTZ(3),
    "pushSentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("notificationId")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "tokenId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "deviceId" TEXT,
    "platform" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("tokenId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "auditId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" "AuditEventType" NOT NULL,
    "actorProfileId" TEXT,
    "targetProfileId" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,
    "sessionId" TEXT,
    "previousValue" JSONB,
    "newValue" JSONB,
    "metadata" JSONB,
    "eventHash" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("auditId")
);

-- CreateTable
CREATE TABLE "UserOrganizationLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "orgProfileId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserOrganizationLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicensedPartner" (
    "partnerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "jurisdictionCountryCode" CHAR(2) NOT NULL,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicensedPartner_pkey" PRIMARY KEY ("partnerId")
);

-- CreateTable
CREATE TABLE "Application" (
    "appId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("appId")
);

-- CreateTable
CREATE TABLE "License" (
    "licenseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "licenseType" TEXT NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiryDate" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "License_pkey" PRIMARY KEY ("licenseId")
);

-- CreateTable
CREATE TABLE "Credential" (
    "credentialId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretHash" TEXT NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("credentialId")
);

-- CreateTable
CREATE TABLE "PartnerGrant" (
    "grantId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amount" DECIMAL(36,9) NOT NULL,
    "purpose" TEXT,
    "issuanceTimestamp" TIMESTAMPTZ(3),
    "onChainTxId" TEXT,

    CONSTRAINT "PartnerGrant_pkey" PRIMARY KEY ("grantId")
);

-- CreateTable
CREATE TABLE "Collateral" (
    "collateralId" TEXT NOT NULL,
    "onChainLoanId" TEXT NOT NULL,
    "documentReference" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "documentSize" INTEGER,
    "documentMime" TEXT,
    "status" "CollateralStatus" NOT NULL DEFAULT 'PLEDGED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Collateral_pkey" PRIMARY KEY ("collateralId")
);

-- CreateTable
CREATE TABLE "OutboxCommand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "commandType" "CommandType" NOT NULL,
    "requestId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "fabricTxId" TEXT,
    "commitBlock" BIGINT,
    "errorCode" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OutboxCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectorState" (
    "tenantId" TEXT NOT NULL,
    "projectorName" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "lastBlock" BIGINT NOT NULL,
    "lastEventIndex" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProjectorState_pkey" PRIMARY KEY ("tenantId","projectorName","channel")
);

-- CreateTable
CREATE TABLE "HttpIdempotency" (
    "tenantId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "responseBody" JSONB NOT NULL,
    "responseHeaders" JSONB,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ttlExpiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "HttpIdempotency_pkey" PRIMARY KEY ("tenantId","method","path","bodyHash")
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fabricTxId" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "channel" TEXT NOT NULL,
    "chaincode" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventVersion" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "txTimestamp" TIMESTAMPTZ(3) NOT NULL,
    "ingestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDLQ" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "fabricTxId" TEXT,
    "blockNumber" BIGINT,
    "channel" TEXT,
    "chaincode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventDLQ_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalTenderStatus_countryCode_effectiveDate_idx" ON "LegalTenderStatus"("countryCode", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_email_key" ON "UserProfile"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_phoneNum_key" ON "UserProfile"("phoneNum");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_biometricHash_key" ON "UserProfile"("biometricHash");

-- CreateIndex
CREATE INDEX "UserProfile_tenantId_status_idx" ON "UserProfile"("tenantId", "status");

-- CreateIndex
CREATE INDEX "UserProfile_tenantId_email_idx" ON "UserProfile"("tenantId", "email");

-- CreateIndex
CREATE INDEX "UserProfile_tenantId_phoneNum_idx" ON "UserProfile"("tenantId", "phoneNum");

-- CreateIndex
CREATE INDEX "UserProfile_tenantId_deletedAt_idx" ON "UserProfile"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "UserProfile_tenantId_nationalityCountryCode_idx" ON "UserProfile"("tenantId", "nationalityCountryCode");

-- CreateIndex
CREATE INDEX "KYCVerification_profileId_idx" ON "KYCVerification"("profileId");

-- CreateIndex
CREATE INDEX "KYCVerification_status_idx" ON "KYCVerification"("status");

-- CreateIndex
CREATE INDEX "OrganizationProfile_tenantId_status_idx" ON "OrganizationProfile"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OrganizationProfile_tenantId_deletedAt_idx" ON "OrganizationProfile"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "FamilyRelationship_tenantId_initiatorProfileId_idx" ON "FamilyRelationship"("tenantId", "initiatorProfileId");

-- CreateIndex
CREATE INDEX "FamilyRelationship_tenantId_relatedProfileId_idx" ON "FamilyRelationship"("tenantId", "relatedProfileId");

-- CreateIndex
CREATE INDEX "FamilyRelationship_tenantId_status_idx" ON "FamilyRelationship"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FamilyRelationship_tenantId_relationType_status_idx" ON "FamilyRelationship"("tenantId", "relationType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyRelationship_tenantId_initiatorProfileId_relatedProfi_key" ON "FamilyRelationship"("tenantId", "initiatorProfileId", "relatedProfileId", "relationType");

-- CreateIndex
CREATE INDEX "TrustScore_tenantId_totalScore_idx" ON "TrustScore"("tenantId", "totalScore");

-- CreateIndex
CREATE INDEX "Wallet_tenantId_profileId_idx" ON "Wallet"("tenantId", "profileId");

-- CreateIndex
CREATE INDEX "Wallet_tenantId_deletedAt_idx" ON "Wallet"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_tenantId_primaryAccountId_key" ON "Wallet"("tenantId", "primaryAccountId");

-- CreateIndex
CREATE INDEX "Transaction_tenantId_walletId_timestamp_idx" ON "Transaction"("tenantId", "walletId", "timestamp");

-- CreateIndex
CREATE INDEX "Transaction_tenantId_counterparty_timestamp_idx" ON "Transaction"("tenantId", "counterparty", "timestamp");

-- CreateIndex
CREATE INDEX "Transaction_timestamp_idx" ON "Transaction"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_tenantId_onChainTxId_key" ON "Transaction"("tenantId", "onChainTxId");

-- CreateIndex
CREATE INDEX "Beneficiary_ownerProfileId_idx" ON "Beneficiary"("ownerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiary_tenantId_ownerProfileId_beneficiaryIdentityId_key" ON "Beneficiary"("tenantId", "ownerProfileId", "beneficiaryIdentityId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_ownerProfileId_idx" ON "Contact"("tenantId", "ownerProfileId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_status_idx" ON "Contact"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_tenantId_ownerProfileId_contactProfileId_key" ON "Contact"("tenantId", "ownerProfileId", "contactProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessAccount_walletId_key" ON "BusinessAccount"("walletId");

-- CreateIndex
CREATE INDEX "BusinessAccount_tenantId_idx" ON "BusinessAccount"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessAccount_tenantId_orgProfileId_key" ON "BusinessAccount"("tenantId", "orgProfileId");

-- CreateIndex
CREATE INDEX "BusinessSignatory_tenantId_profileId_idx" ON "BusinessSignatory"("tenantId", "profileId");

-- CreateIndex
CREATE INDEX "BusinessSignatory_tenantId_businessAccountId_idx" ON "BusinessSignatory"("tenantId", "businessAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSignatory_tenantId_businessAccountId_profileId_key" ON "BusinessSignatory"("tenantId", "businessAccountId", "profileId");

-- CreateIndex
CREATE INDEX "SignatoryRule_tenantId_businessAccountId_idx" ON "SignatoryRule"("tenantId", "businessAccountId");

-- CreateIndex
CREATE INDEX "SignatoryRule_tenantId_isActive_idx" ON "SignatoryRule"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "TransactionApproval_tenantId_businessAccountId_status_idx" ON "TransactionApproval"("tenantId", "businessAccountId", "status");

-- CreateIndex
CREATE INDEX "TransactionApproval_status_expiresAt_idx" ON "TransactionApproval"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionApproval_tenantId_outboxCommandId_key" ON "TransactionApproval"("tenantId", "outboxCommandId");

-- CreateIndex
CREATE INDEX "ApprovalVote_tenantId_signatoryId_idx" ON "ApprovalVote"("tenantId", "signatoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalVote_tenantId_approvalId_signatoryId_key" ON "ApprovalVote"("tenantId", "approvalId", "signatoryId");

-- CreateIndex
CREATE INDEX "KYCDocument_tenantId_kycId_idx" ON "KYCDocument"("tenantId", "kycId");

-- CreateIndex
CREATE INDEX "KYCDocument_documentType_idx" ON "KYCDocument"("documentType");

-- CreateIndex
CREATE INDEX "KYCDocument_fileHash_idx" ON "KYCDocument"("fileHash");

-- CreateIndex
CREATE INDEX "TransactionLimit_tenantId_profileId_idx" ON "TransactionLimit"("tenantId", "profileId");

-- CreateIndex
CREATE INDEX "TransactionLimit_tenantId_walletId_idx" ON "TransactionLimit"("tenantId", "walletId");

-- CreateIndex
CREATE INDEX "TransactionLimit_tenantId_isActive_idx" ON "TransactionLimit"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionRiskScore_offTxId_key" ON "TransactionRiskScore"("offTxId");

-- CreateIndex
CREATE INDEX "TransactionRiskScore_tenantId_requiresReview_idx" ON "TransactionRiskScore"("tenantId", "requiresReview");

-- CreateIndex
CREATE INDEX "TransactionRiskScore_tenantId_riskScore_idx" ON "TransactionRiskScore"("tenantId", "riskScore");

-- CreateIndex
CREATE INDEX "HoardingTaxSnapshot_tenantId_snapshotDate_taxPaid_idx" ON "HoardingTaxSnapshot"("tenantId", "snapshotDate", "taxPaid");

-- CreateIndex
CREATE INDEX "HoardingTaxSnapshot_tenantId_taxPaid_idx" ON "HoardingTaxSnapshot"("tenantId", "taxPaid");

-- CreateIndex
CREATE UNIQUE INDEX "HoardingTaxSnapshot_tenantId_walletId_snapshotDate_key" ON "HoardingTaxSnapshot"("tenantId", "walletId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_refreshToken_key" ON "UserSession"("refreshToken");

-- CreateIndex
CREATE INDEX "UserSession_tenantId_profileId_status_idx" ON "UserSession"("tenantId", "profileId", "status");

-- CreateIndex
CREATE INDEX "UserSession_refreshTokenHash_idx" ON "UserSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_tenantId_deviceId_idx" ON "UserSession"("tenantId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tenantId_sessionId_key" ON "UserSession"("tenantId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_deviceFingerprint_key" ON "TrustedDevice"("deviceFingerprint");

-- CreateIndex
CREATE INDEX "TrustedDevice_tenantId_profileId_idx" ON "TrustedDevice"("tenantId", "profileId");

-- CreateIndex
CREATE INDEX "TrustedDevice_tenantId_isTrusted_idx" ON "TrustedDevice"("tenantId", "isTrusted");

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_tenantId_profileId_deviceFingerprint_key" ON "TrustedDevice"("tenantId", "profileId", "deviceFingerprint");

-- CreateIndex
CREATE INDEX "Notification_tenantId_recipientId_status_idx" ON "Notification"("tenantId", "recipientId", "status");

-- CreateIndex
CREATE INDEX "Notification_tenantId_recipientId_createdAt_idx" ON "Notification"("tenantId", "recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_expiresAt_idx" ON "Notification"("expiresAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_type_status_idx" ON "Notification"("tenantId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_tenantId_profileId_idx" ON "PushToken"("tenantId", "profileId");

-- CreateIndex
CREATE INDEX "PushToken_tenantId_isActive_idx" ON "PushToken"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_tenantId_profileId_token_key" ON "PushToken"("tenantId", "profileId", "token");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_eventType_timestamp_idx" ON "AuditLog"("tenantId", "eventType", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_actorProfileId_timestamp_idx" ON "AuditLog"("tenantId", "actorProfileId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_targetProfileId_timestamp_idx" ON "AuditLog"("tenantId", "targetProfileId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_resourceType_resourceId_idx" ON "AuditLog"("tenantId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "UserOrganizationLink_userProfileId_idx" ON "UserOrganizationLink"("userProfileId");

-- CreateIndex
CREATE INDEX "UserOrganizationLink_orgProfileId_idx" ON "UserOrganizationLink"("orgProfileId");

-- CreateIndex
CREATE INDEX "UserOrganizationLink_tenantId_idx" ON "UserOrganizationLink"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserOrganizationLink_tenantId_userProfileId_orgProfileId_key" ON "UserOrganizationLink"("tenantId", "userProfileId", "orgProfileId");

-- CreateIndex
CREATE INDEX "LicensedPartner_tenantId_status_idx" ON "LicensedPartner"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LicensedPartner_tenantId_companyName_key" ON "LicensedPartner"("tenantId", "companyName");

-- CreateIndex
CREATE INDEX "Application_tenantId_partnerId_idx" ON "Application"("tenantId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_tenantId_appName_key" ON "Application"("tenantId", "appName");

-- CreateIndex
CREATE INDEX "License_tenantId_appId_idx" ON "License"("tenantId", "appId");

-- CreateIndex
CREATE INDEX "License_tenantId_status_idx" ON "License"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Credential_tenantId_licenseId_idx" ON "Credential"("tenantId", "licenseId");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_tenantId_clientId_key" ON "Credential"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "PartnerGrant_tenantId_partnerId_idx" ON "PartnerGrant"("tenantId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "Collateral_onChainLoanId_key" ON "Collateral"("onChainLoanId");

-- CreateIndex
CREATE INDEX "Collateral_onChainLoanId_idx" ON "Collateral"("onChainLoanId");

-- CreateIndex
CREATE INDEX "Collateral_status_idx" ON "Collateral"("status");

-- CreateIndex
CREATE INDEX "OutboxCommand_status_createdAt_idx" ON "OutboxCommand"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxCommand_tenantId_status_idx" ON "OutboxCommand"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OutboxCommand_fabricTxId_idx" ON "OutboxCommand"("fabricTxId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxCommand_tenantId_requestId_key" ON "OutboxCommand"("tenantId", "requestId");

-- CreateIndex
CREATE INDEX "HttpIdempotency_ttlExpiresAt_idx" ON "HttpIdempotency"("ttlExpiresAt");

-- CreateIndex
CREATE INDEX "EventLog_tenantId_blockNumber_idx" ON "EventLog"("tenantId", "blockNumber");

-- CreateIndex
CREATE INDEX "EventLog_fabricTxId_idx" ON "EventLog"("fabricTxId");

-- CreateIndex
CREATE INDEX "EventLog_tenantId_eventName_idx" ON "EventLog"("tenantId", "eventName");

-- CreateIndex
CREATE INDEX "EventDLQ_tenantId_createdAt_idx" ON "EventDLQ"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "LegalTenderStatus" ADD CONSTRAINT "LegalTenderStatus_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("countryCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_nationalityCountryCode_fkey" FOREIGN KEY ("nationalityCountryCode") REFERENCES "Country"("countryCode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KYCVerification" ADD CONSTRAINT "KYCVerification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationProfile" ADD CONSTRAINT "OrganizationProfile_jurisdictionCountryCode_fkey" FOREIGN KEY ("jurisdictionCountryCode") REFERENCES "Country"("countryCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyRelationship" ADD CONSTRAINT "FamilyRelationship_initiatorProfileId_fkey" FOREIGN KEY ("initiatorProfileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyRelationship" ADD CONSTRAINT "FamilyRelationship_relatedProfileId_fkey" FOREIGN KEY ("relatedProfileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustScore" ADD CONSTRAINT "TrustScore_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("walletId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_contactProfileId_fkey" FOREIGN KEY ("contactProfileId") REFERENCES "UserProfile"("profileId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessAccount" ADD CONSTRAINT "BusinessAccount_orgProfileId_fkey" FOREIGN KEY ("orgProfileId") REFERENCES "OrganizationProfile"("orgProfileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessAccount" ADD CONSTRAINT "BusinessAccount_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("walletId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSignatory" ADD CONSTRAINT "BusinessSignatory_businessAccountId_fkey" FOREIGN KEY ("businessAccountId") REFERENCES "BusinessAccount"("businessAccountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSignatory" ADD CONSTRAINT "BusinessSignatory_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatoryRule" ADD CONSTRAINT "SignatoryRule_businessAccountId_fkey" FOREIGN KEY ("businessAccountId") REFERENCES "BusinessAccount"("businessAccountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionApproval" ADD CONSTRAINT "TransactionApproval_businessAccountId_fkey" FOREIGN KEY ("businessAccountId") REFERENCES "BusinessAccount"("businessAccountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionApproval" ADD CONSTRAINT "TransactionApproval_outboxCommandId_fkey" FOREIGN KEY ("outboxCommandId") REFERENCES "OutboxCommand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalVote" ADD CONSTRAINT "ApprovalVote_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "TransactionApproval"("approvalId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalVote" ADD CONSTRAINT "ApprovalVote_signatoryId_fkey" FOREIGN KEY ("signatoryId") REFERENCES "BusinessSignatory"("signatoryId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KYCDocument" ADD CONSTRAINT "KYCDocument_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "KYCVerification"("kycId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KYCDocument" ADD CONSTRAINT "KYCDocument_issuingCountry_fkey" FOREIGN KEY ("issuingCountry") REFERENCES "Country"("countryCode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLimit" ADD CONSTRAINT "TransactionLimit_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRiskScore" ADD CONSTRAINT "TransactionRiskScore_offTxId_fkey" FOREIGN KEY ("offTxId") REFERENCES "Transaction"("offTxId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoardingTaxSnapshot" ADD CONSTRAINT "HoardingTaxSnapshot_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("walletId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationLink" ADD CONSTRAINT "UserOrganizationLink_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationLink" ADD CONSTRAINT "UserOrganizationLink_orgProfileId_fkey" FOREIGN KEY ("orgProfileId") REFERENCES "OrganizationProfile"("orgProfileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicensedPartner" ADD CONSTRAINT "LicensedPartner_jurisdictionCountryCode_fkey" FOREIGN KEY ("jurisdictionCountryCode") REFERENCES "Country"("countryCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "LicensedPartner"("partnerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_appId_fkey" FOREIGN KEY ("appId") REFERENCES "Application"("appId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("licenseId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerGrant" ADD CONSTRAINT "PartnerGrant_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "LicensedPartner"("partnerId") ON DELETE CASCADE ON UPDATE CASCADE;

