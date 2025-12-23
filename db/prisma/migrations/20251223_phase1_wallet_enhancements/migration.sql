-- Phase 1: Wallet Enhancement Features Migration
-- Date: 2025-12-23
-- Features: Context Switching, Sub-Accounts, Categories, Receipts, Contact Groups, Analytics

-- =============================================================================
-- ENUMS
-- =============================================================================

-- Context Type
CREATE TYPE "ContextType" AS ENUM ('PERSONAL', 'BUSINESS');

-- Sub-Account Type
CREATE TYPE "SubAccountType" AS ENUM (
    'SAVINGS', 'EMERGENCY_FUND', 'MORTGAGE', 'RENT', 'UTILITIES',
    'GROCERIES', 'ENTERTAINMENT', 'HEALTHCARE', 'EDUCATION', 'VACATION', 'CUSTOM_PERSONAL',
    'PAYROLL', 'OPERATING_EXPENSES', 'TAX_RESERVE', 'MARKETING',
    'EQUIPMENT', 'INVENTORY', 'DEPARTMENT', 'PROJECT', 'CUSTOM_BUSINESS'
);

-- Allocation Rule Type
CREATE TYPE "AllocationRuleType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'REMAINDER');

-- Allocation Trigger
CREATE TYPE "AllocationTrigger" AS ENUM ('ON_RECEIVE', 'ON_SCHEDULE', 'MANUAL');

-- Allocation Frequency
CREATE TYPE "AllocationFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'QUARTERLY');

-- Sub-Account Transaction Type
CREATE TYPE "SubAccountTxType" AS ENUM (
    'ALLOCATION', 'TRANSFER_IN', 'TRANSFER_OUT', 'SPEND', 'RETURN_TO_MAIN', 'ADJUSTMENT'
);

-- Budget Period Type
CREATE TYPE "BudgetPeriodType" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM');

-- Budget Status
CREATE TYPE "BudgetStatus" AS ENUM ('ON_TRACK', 'WARNING', 'EXCEEDED', 'COMPLETED');

-- Contact Group Type
CREATE TYPE "ContactGroupType" AS ENUM ('FAMILY', 'CLOSE_FRIENDS', 'PROFESSIONAL', 'CUSTOM');

-- Coin Request Status
CREATE TYPE "CoinRequestStatus" AS ENUM ('PENDING', 'FULFILLED', 'EXPIRED', 'CANCELLED', 'DECLINED');

-- =============================================================================
-- TABLES
-- =============================================================================

-- Account Context (SSO switching between personal/business)
CREATE TABLE "AccountContext" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" "ContextType" NOT NULL,
    "businessAccountId" TEXT,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastAccessedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AccountContext_pkey" PRIMARY KEY ("id")
);

-- Sub-Account (Virtual wallet divisions for budgeting)
CREATE TABLE "SubAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "contextId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "SubAccountType" NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "currentBalance" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "reservedBalance" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "monthlyBudget" DECIMAL(36,9),
    "monthlySpent" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "monthlyResetDay" INTEGER NOT NULL DEFAULT 1,
    "goalAmount" DECIMAL(36,9),
    "goalDeadline" TIMESTAMPTZ(3),
    "goalName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SubAccount_pkey" PRIMARY KEY ("id")
);

-- Allocation Rule (Automatic fund distribution)
CREATE TABLE "AllocationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "subAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ruleType" "AllocationRuleType" NOT NULL,
    "percentage" DECIMAL(5,2),
    "fixedAmount" DECIMAL(36,9),
    "triggerType" "AllocationTrigger" NOT NULL,
    "minTriggerAmount" DECIMAL(36,9),
    "frequency" "AllocationFrequency",
    "dayOfMonth" INTEGER,
    "dayOfWeek" INTEGER,
    "nextScheduledAt" TIMESTAMPTZ(3),
    "lastExecutedAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AllocationRule_pkey" PRIMARY KEY ("id")
);

-- Allocation Execution (Log of rule executions)
CREATE TABLE "AllocationExecution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "subAccountId" TEXT NOT NULL,
    "amount" DECIMAL(36,9) NOT NULL,
    "triggerAmount" DECIMAL(36,9),
    "triggeredBy" TEXT,
    "sourceTransactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "errorMessage" TEXT,
    "executedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllocationExecution_pkey" PRIMARY KEY ("id")
);

-- Sub-Account Transaction (Movements within sub-accounts)
CREATE TABLE "SubAccountTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subAccountId" TEXT NOT NULL,
    "mainTransactionId" TEXT,
    "type" "SubAccountTxType" NOT NULL,
    "amount" DECIMAL(36,9) NOT NULL,
    "balanceBefore" DECIMAL(36,9) NOT NULL,
    "balanceAfter" DECIMAL(36,9) NOT NULL,
    "counterpartSubAccountId" TEXT,
    "isCredit" BOOLEAN NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubAccountTransaction_pkey" PRIMARY KEY ("id")
);

-- Budget Period (Track budget performance)
CREATE TABLE "BudgetPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "subAccountId" TEXT,
    "periodType" "BudgetPeriodType" NOT NULL,
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3) NOT NULL,
    "budgetAmount" DECIMAL(36,9) NOT NULL,
    "spentAmount" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "remainingAmount" DECIMAL(36,9) NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'ON_TRACK',
    "alertThreshold" DECIMAL(5,2) NOT NULL DEFAULT 80,
    "alertSent" BOOLEAN NOT NULL DEFAULT false,
    "alertSentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BudgetPeriod_pkey" PRIMARY KEY ("id")
);

-- Transaction Category (User-defined categories)
CREATE TABLE "TransactionCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366F1',
    "icon" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isIncome" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransactionCategory_pkey" PRIMARY KEY ("id")
);

-- Transaction Tag (Links transactions to categories)
CREATE TABLE "TransactionTag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionTag_pkey" PRIMARY KEY ("id")
);

-- Transaction Receipt (Downloadable receipts)
CREATE TABLE "TransactionReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "receiptHash" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMPTZ(3),
    "shareableLink" TEXT,
    "shareExpiresAt" TIMESTAMPTZ(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransactionReceipt_pkey" PRIMARY KEY ("id")
);

-- Contact Group (Groups for organizing contacts)
CREATE TABLE "ContactGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ContactGroupType" NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContactGroup_pkey" PRIMARY KEY ("id")
);

-- Contact Group Member (Links contacts to groups)
CREATE TABLE "ContactGroupMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactGroupMember_pkey" PRIMARY KEY ("id")
);

-- Coin Request (Request coins from another user)
CREATE TABLE "CoinRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestCode" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterWalletId" TEXT NOT NULL,
    "requesteeId" TEXT,
    "requesteeEmail" TEXT,
    "requesteePhone" TEXT,
    "amount" DECIMAL(36,9) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GXC',
    "reason" TEXT,
    "reference" TEXT,
    "qrData" TEXT NOT NULL,
    "qrHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "validityHours" INTEGER NOT NULL DEFAULT 24,
    "status" "CoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "statusChangedAt" TIMESTAMPTZ(3),
    "fulfilledBy" TEXT,
    "fulfilledAt" TIMESTAMPTZ(3),
    "transactionId" TEXT,
    "declinedAt" TIMESTAMPTZ(3),
    "declineReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CoinRequest_pkey" PRIMARY KEY ("id")
);

-- Daily Analytics (Daily aggregated analytics)
CREATE TABLE "DailyAnalytics" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalSent" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "totalReceived" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "netFlow" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "receiveCount" INTEGER NOT NULL DEFAULT 0,
    "totalFees" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL(36,9) NOT NULL,
    "closingBalance" DECIMAL(36,9) NOT NULL,
    "categoryBreakdown" JSONB,
    "subAccountSummary" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DailyAnalytics_pkey" PRIMARY KEY ("id")
);

-- Monthly Analytics (Monthly aggregated analytics)
CREATE TABLE "MonthlyAnalytics" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "totalSent" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "totalReceived" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "netFlow" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "receiveCount" INTEGER NOT NULL DEFAULT 0,
    "totalFees" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "avgDailyBalance" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "minBalance" DECIMAL(36,9) NOT NULL,
    "maxBalance" DECIMAL(36,9) NOT NULL,
    "sentTrend" DECIMAL(10,2),
    "receiveTrend" DECIMAL(10,2),
    "categoryBreakdown" JSONB,
    "subAccountSummary" JSONB,
    "budgetAmount" DECIMAL(36,9),
    "budgetUsed" DECIMAL(10,2),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MonthlyAnalytics_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- UNIQUE CONSTRAINTS
-- =============================================================================

CREATE UNIQUE INDEX "AccountContext_tenantId_profileId_type_businessAccountId_key" ON "AccountContext"("tenantId", "profileId", "type", "businessAccountId");
CREATE UNIQUE INDEX "SubAccount_tenantId_walletId_name_key" ON "SubAccount"("tenantId", "walletId", "name");
CREATE UNIQUE INDEX "AllocationRule_tenantId_walletId_name_key" ON "AllocationRule"("tenantId", "walletId", "name");
CREATE UNIQUE INDEX "BudgetPeriod_tenantId_walletId_subAccountId_periodType_startDate_key" ON "BudgetPeriod"("tenantId", "walletId", "subAccountId", "periodType", "startDate");
CREATE UNIQUE INDEX "TransactionCategory_tenantId_profileId_name_key" ON "TransactionCategory"("tenantId", "profileId", "name");
CREATE UNIQUE INDEX "TransactionTag_tenantId_transactionId_categoryId_key" ON "TransactionTag"("tenantId", "transactionId", "categoryId");
CREATE UNIQUE INDEX "TransactionReceipt_transactionId_key" ON "TransactionReceipt"("transactionId");
CREATE UNIQUE INDEX "TransactionReceipt_receiptNumber_key" ON "TransactionReceipt"("receiptNumber");
CREATE UNIQUE INDEX "TransactionReceipt_shareableLink_key" ON "TransactionReceipt"("shareableLink");
CREATE UNIQUE INDEX "ContactGroup_tenantId_profileId_name_key" ON "ContactGroup"("tenantId", "profileId", "name");
CREATE UNIQUE INDEX "ContactGroupMember_tenantId_groupId_contactId_key" ON "ContactGroupMember"("tenantId", "groupId", "contactId");
CREATE UNIQUE INDEX "CoinRequest_requestCode_key" ON "CoinRequest"("requestCode");
CREATE UNIQUE INDEX "DailyAnalytics_tenantId_profileId_walletId_date_key" ON "DailyAnalytics"("tenantId", "profileId", "walletId", "date");
CREATE UNIQUE INDEX "MonthlyAnalytics_tenantId_profileId_walletId_year_month_key" ON "MonthlyAnalytics"("tenantId", "profileId", "walletId", "year", "month");

-- =============================================================================
-- INDEXES
-- =============================================================================

-- AccountContext indexes
CREATE INDEX "AccountContext_tenantId_profileId_idx" ON "AccountContext"("tenantId", "profileId");
CREATE INDEX "AccountContext_tenantId_profileId_isDefault_idx" ON "AccountContext"("tenantId", "profileId", "isDefault");

-- SubAccount indexes
CREATE INDEX "SubAccount_tenantId_walletId_idx" ON "SubAccount"("tenantId", "walletId");
CREATE INDEX "SubAccount_tenantId_walletId_isActive_idx" ON "SubAccount"("tenantId", "walletId", "isActive");

-- AllocationRule indexes
CREATE INDEX "AllocationRule_tenantId_walletId_idx" ON "AllocationRule"("tenantId", "walletId");
CREATE INDEX "AllocationRule_tenantId_isActive_idx" ON "AllocationRule"("tenantId", "isActive");
CREATE INDEX "AllocationRule_triggerType_isActive_idx" ON "AllocationRule"("triggerType", "isActive");
CREATE INDEX "AllocationRule_nextScheduledAt_idx" ON "AllocationRule"("nextScheduledAt");

-- AllocationExecution indexes
CREATE INDEX "AllocationExecution_tenantId_ruleId_idx" ON "AllocationExecution"("tenantId", "ruleId");
CREATE INDEX "AllocationExecution_tenantId_subAccountId_idx" ON "AllocationExecution"("tenantId", "subAccountId");
CREATE INDEX "AllocationExecution_executedAt_idx" ON "AllocationExecution"("executedAt");

-- SubAccountTransaction indexes
CREATE INDEX "SubAccountTransaction_tenantId_subAccountId_idx" ON "SubAccountTransaction"("tenantId", "subAccountId");
CREATE INDEX "SubAccountTransaction_tenantId_subAccountId_createdAt_idx" ON "SubAccountTransaction"("tenantId", "subAccountId", "createdAt");
CREATE INDEX "SubAccountTransaction_mainTransactionId_idx" ON "SubAccountTransaction"("mainTransactionId");

-- BudgetPeriod indexes
CREATE INDEX "BudgetPeriod_tenantId_walletId_idx" ON "BudgetPeriod"("tenantId", "walletId");
CREATE INDEX "BudgetPeriod_tenantId_status_idx" ON "BudgetPeriod"("tenantId", "status");
CREATE INDEX "BudgetPeriod_endDate_idx" ON "BudgetPeriod"("endDate");

-- TransactionCategory indexes
CREATE INDEX "TransactionCategory_tenantId_profileId_idx" ON "TransactionCategory"("tenantId", "profileId");
CREATE INDEX "TransactionCategory_tenantId_profileId_isActive_idx" ON "TransactionCategory"("tenantId", "profileId", "isActive");

-- TransactionTag indexes
CREATE INDEX "TransactionTag_tenantId_transactionId_idx" ON "TransactionTag"("tenantId", "transactionId");
CREATE INDEX "TransactionTag_tenantId_categoryId_idx" ON "TransactionTag"("tenantId", "categoryId");

-- TransactionReceipt indexes
CREATE INDEX "TransactionReceipt_tenantId_idx" ON "TransactionReceipt"("tenantId");
CREATE INDEX "TransactionReceipt_receiptNumber_idx" ON "TransactionReceipt"("receiptNumber");

-- ContactGroup indexes
CREATE INDEX "ContactGroup_tenantId_profileId_idx" ON "ContactGroup"("tenantId", "profileId");
CREATE INDEX "ContactGroup_tenantId_profileId_type_idx" ON "ContactGroup"("tenantId", "profileId", "type");

-- ContactGroupMember indexes
CREATE INDEX "ContactGroupMember_tenantId_groupId_idx" ON "ContactGroupMember"("tenantId", "groupId");
CREATE INDEX "ContactGroupMember_tenantId_contactId_idx" ON "ContactGroupMember"("tenantId", "contactId");

-- CoinRequest indexes
CREATE INDEX "CoinRequest_tenantId_requesterId_idx" ON "CoinRequest"("tenantId", "requesterId");
CREATE INDEX "CoinRequest_tenantId_requesteeId_idx" ON "CoinRequest"("tenantId", "requesteeId");
CREATE INDEX "CoinRequest_tenantId_status_idx" ON "CoinRequest"("tenantId", "status");
CREATE INDEX "CoinRequest_requestCode_idx" ON "CoinRequest"("requestCode");
CREATE INDEX "CoinRequest_expiresAt_idx" ON "CoinRequest"("expiresAt");

-- DailyAnalytics indexes
CREATE INDEX "DailyAnalytics_tenantId_profileId_date_idx" ON "DailyAnalytics"("tenantId", "profileId", "date");
CREATE INDEX "DailyAnalytics_tenantId_walletId_date_idx" ON "DailyAnalytics"("tenantId", "walletId", "date");

-- MonthlyAnalytics indexes
CREATE INDEX "MonthlyAnalytics_tenantId_profileId_year_month_idx" ON "MonthlyAnalytics"("tenantId", "profileId", "year", "month");
CREATE INDEX "MonthlyAnalytics_tenantId_walletId_year_month_idx" ON "MonthlyAnalytics"("tenantId", "walletId", "year", "month");

-- =============================================================================
-- FOREIGN KEY CONSTRAINTS
-- =============================================================================

-- AccountContext
ALTER TABLE "AccountContext" ADD CONSTRAINT "AccountContext_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountContext" ADD CONSTRAINT "AccountContext_businessAccountId_fkey" FOREIGN KEY ("businessAccountId") REFERENCES "BusinessAccount"("businessAccountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- SubAccount
ALTER TABLE "SubAccount" ADD CONSTRAINT "SubAccount_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("walletId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AllocationRule
ALTER TABLE "AllocationRule" ADD CONSTRAINT "AllocationRule_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("walletId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AllocationRule" ADD CONSTRAINT "AllocationRule_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AllocationExecution
ALTER TABLE "AllocationExecution" ADD CONSTRAINT "AllocationExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AllocationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SubAccountTransaction
ALTER TABLE "SubAccountTransaction" ADD CONSTRAINT "SubAccountTransaction_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubAccountTransaction" ADD CONSTRAINT "SubAccountTransaction_mainTransactionId_fkey" FOREIGN KEY ("mainTransactionId") REFERENCES "Transaction"("offTxId") ON DELETE SET NULL ON UPDATE CASCADE;

-- BudgetPeriod
ALTER TABLE "BudgetPeriod" ADD CONSTRAINT "BudgetPeriod_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("walletId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetPeriod" ADD CONSTRAINT "BudgetPeriod_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TransactionCategory
ALTER TABLE "TransactionCategory" ADD CONSTRAINT "TransactionCategory_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- TransactionTag
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("offTxId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TransactionReceipt
ALTER TABLE "TransactionReceipt" ADD CONSTRAINT "TransactionReceipt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("offTxId") ON DELETE CASCADE ON UPDATE CASCADE;

-- ContactGroup
ALTER TABLE "ContactGroup" ADD CONSTRAINT "ContactGroup_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- ContactGroupMember
ALTER TABLE "ContactGroupMember" ADD CONSTRAINT "ContactGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ContactGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactGroupMember" ADD CONSTRAINT "ContactGroupMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("contactId") ON DELETE CASCADE ON UPDATE CASCADE;

-- CoinRequest
ALTER TABLE "CoinRequest" ADD CONSTRAINT "CoinRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoinRequest" ADD CONSTRAINT "CoinRequest_requesteeId_fkey" FOREIGN KEY ("requesteeId") REFERENCES "UserProfile"("profileId") ON DELETE SET NULL ON UPDATE CASCADE;

-- DailyAnalytics
ALTER TABLE "DailyAnalytics" ADD CONSTRAINT "DailyAnalytics_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyAnalytics" ADD CONSTRAINT "DailyAnalytics_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("walletId") ON DELETE CASCADE ON UPDATE CASCADE;

-- MonthlyAnalytics
ALTER TABLE "MonthlyAnalytics" ADD CONSTRAINT "MonthlyAnalytics_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("profileId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthlyAnalytics" ADD CONSTRAINT "MonthlyAnalytics_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("walletId") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- SEED DEFAULT CATEGORIES (Optional - Run after migration)
-- =============================================================================

-- Note: Default categories should be created per user upon registration
-- This is typically handled in the application layer, but here's an example:

-- INSERT INTO "TransactionCategory" ("id", "tenantId", "profileId", "name", "color", "icon", "isSystem", "isIncome", "isActive", "sortOrder", "createdAt", "updatedAt")
-- VALUES
-- (gen_random_uuid(), 'default', '<profile_id>', 'Salary', '#22C55E', 'banknotes', true, true, true, 0, NOW(), NOW()),
-- (gen_random_uuid(), 'default', '<profile_id>', 'Shopping', '#F59E0B', 'shopping-cart', true, false, true, 1, NOW(), NOW()),
-- (gen_random_uuid(), 'default', '<profile_id>', 'Food & Dining', '#EF4444', 'utensils', true, false, true, 2, NOW(), NOW()),
-- (gen_random_uuid(), 'default', '<profile_id>', 'Transportation', '#3B82F6', 'car', true, false, true, 3, NOW(), NOW()),
-- (gen_random_uuid(), 'default', '<profile_id>', 'Bills & Utilities', '#8B5CF6', 'file-text', true, false, true, 4, NOW(), NOW()),
-- (gen_random_uuid(), 'default', '<profile_id>', 'Entertainment', '#EC4899', 'film', true, false, true, 5, NOW(), NOW()),
-- (gen_random_uuid(), 'default', '<profile_id>', 'Healthcare', '#06B6D4', 'heart-pulse', true, false, true, 6, NOW(), NOW()),
-- (gen_random_uuid(), 'default', '<profile_id>', 'Other', '#6B7280', 'more-horizontal', true, false, true, 99, NOW(), NOW());
