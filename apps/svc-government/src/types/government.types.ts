import { Request } from 'express';
import { z } from 'zod';

// =============================================================================
// Enums (matching Prisma schema)
// =============================================================================

export type TreasuryStatus =
  | 'PENDING_ONBOARDING'
  | 'ONBOARDING'
  | 'TREASURY_ACTIVE'
  | 'TREASURY_SUSPENDED'
  | 'TREASURY_FROZEN';

export type GovtAdminStatus =
  | 'ADMIN_PENDING'
  | 'ADMIN_ACTIVE'
  | 'ADMIN_SUSPENDED'
  | 'ADMIN_REMOVED';

export type GovtAccountStatus =
  | 'ACCOUNT_ACTIVE'
  | 'ACCOUNT_FROZEN'
  | 'ACCOUNT_ARCHIVED';

export type GovtTransactionType =
  | 'GENESIS_MINT'
  | 'ALLOCATION'
  | 'DISBURSEMENT'
  | 'GOVT_TRANSFER'
  | 'GOVT_RECEIPT'
  | 'GOVT_FEE'
  | 'GOVT_ADJUSTMENT';

export type MultiSigStatus =
  | 'MULTISIG_PENDING'
  | 'MULTISIG_APPROVED'
  | 'MULTISIG_EXECUTED'
  | 'MULTISIG_REJECTED'
  | 'MULTISIG_EXPIRED'
  | 'MULTISIG_CANCELLED';

// =============================================================================
// JWT Payload & Authenticated Request
// =============================================================================

export interface GovernmentJWTPayload {
  profileId: string;
  email: string;
  treasuryId?: string;
  accountId?: string;
  role?: string;
  permissions: string[];
  iat?: number;
  exp?: number;
}

export interface GovernmentAuthenticatedRequest extends Request {
  user?: GovernmentJWTPayload;
}

// =============================================================================
// Administrator Permissions
// =============================================================================

export interface AdminPermissions {
  canCreateStructure: boolean;
  canAllocateFunds: boolean;
  canAssignAdministrators: boolean;
  canConfigureRules: boolean;
  canDisburseFunds: boolean;
  canViewReports: boolean;
  canManageAPIKeys: boolean;
}

export const DEFAULT_ADMIN_PERMISSIONS: AdminPermissions = {
  canCreateStructure: false,
  canAllocateFunds: false,
  canAssignAdministrators: false,
  canConfigureRules: false,
  canDisburseFunds: false,
  canViewReports: true,
  canManageAPIKeys: false,
};

// =============================================================================
// Treasury DTOs
// =============================================================================

export const OnboardTreasurySchema = z.object({
  countryCode: z.string().length(2),
  verificationNotes: z.string().optional(),
  initialAdministrators: z.array(z.object({
    profileId: z.string().uuid(),
    role: z.string().min(1),
    permissions: z.object({
      canCreateStructure: z.boolean().default(false),
      canAllocateFunds: z.boolean().default(false),
      canAssignAdministrators: z.boolean().default(false),
      canConfigureRules: z.boolean().default(false),
      canDisburseFunds: z.boolean().default(false),
      canViewReports: z.boolean().default(true),
      canManageAPIKeys: z.boolean().default(false),
    }).optional(),
  })).optional(),
});

export type OnboardTreasuryDTO = z.infer<typeof OnboardTreasurySchema>;

export const UpdateTreasuryStatusSchema = z.object({
  status: z.enum(['TREASURY_ACTIVE', 'TREASURY_SUSPENDED', 'TREASURY_FROZEN']),
  reason: z.string().optional(),
});

export type UpdateTreasuryStatusDTO = z.infer<typeof UpdateTreasuryStatusSchema>;

export interface TreasuryResponse {
  treasuryId: string;
  countryCode: string;
  countryName: string;
  status: TreasuryStatus;
  locked: boolean;
  lockReason?: string;
  balance: string;
  cumulativeAllocations: string;
  totalDisbursed: string;
  totalAllocatedToAccounts: string;
  onboardedAt?: string;
  createdAt: string;
  lastActivityAt?: string;
  administratorCount: number;
  accountCount: number;
}

// =============================================================================
// Administrator DTOs
// =============================================================================

export const AssignAdministratorSchema = z.object({
  profileId: z.string().uuid(),
  accountId: z.string().optional(), // null = treasury-level
  role: z.string().min(1),
  permissions: z.object({
    canCreateStructure: z.boolean().default(false),
    canAllocateFunds: z.boolean().default(false),
    canAssignAdministrators: z.boolean().default(false),
    canConfigureRules: z.boolean().default(false),
    canDisburseFunds: z.boolean().default(false),
    canViewReports: z.boolean().default(true),
    canManageAPIKeys: z.boolean().default(false),
  }),
});

export type AssignAdministratorDTO = z.infer<typeof AssignAdministratorSchema>;

export const UpdateAdministratorSchema = z.object({
  role: z.string().min(1).optional(),
  status: z.enum(['ADMIN_ACTIVE', 'ADMIN_SUSPENDED']).optional(),
  permissions: z.object({
    canCreateStructure: z.boolean().optional(),
    canAllocateFunds: z.boolean().optional(),
    canAssignAdministrators: z.boolean().optional(),
    canConfigureRules: z.boolean().optional(),
    canDisburseFunds: z.boolean().optional(),
    canViewReports: z.boolean().optional(),
    canManageAPIKeys: z.boolean().optional(),
  }).optional(),
});

export type UpdateAdministratorDTO = z.infer<typeof UpdateAdministratorSchema>;

export interface AdministratorResponse {
  id: string;
  treasuryId: string;
  accountId?: string;
  accountName?: string;
  profileId: string;
  profileName: string;
  profileEmail: string;
  role: string;
  permissions: AdminPermissions;
  status: GovtAdminStatus;
  assignedAt: string;
  assignedBy: string;
}

// =============================================================================
// Account Hierarchy DTOs
// =============================================================================

export const CreateAccountSchema = z.object({
  parentAccountId: z.string().optional(), // null = direct child of treasury
  accountName: z.string().min(1).max(200),
  description: z.string().optional(),
  budgetCode: z.string().optional(),
  fiscalYear: z.number().int().min(2020).max(2100).optional(),
});

export type CreateAccountDTO = z.infer<typeof CreateAccountSchema>;

export const UpdateAccountSchema = z.object({
  accountName: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  budgetCode: z.string().optional(),
  fiscalYear: z.number().int().min(2020).max(2100).optional(),
  status: z.enum(['ACCOUNT_ACTIVE', 'ACCOUNT_FROZEN', 'ACCOUNT_ARCHIVED']).optional(),
});

export type UpdateAccountDTO = z.infer<typeof UpdateAccountSchema>;

export interface AccountResponse {
  accountId: string;
  treasuryId: string;
  parentAccountId?: string;
  accountName: string;
  hierarchyLevel: number;
  hierarchyPath: string;
  balance: string;
  allocatedFromParent: string;
  totalDisbursed: string;
  totalAllocatedToChildren: string;
  status: GovtAccountStatus;
  description?: string;
  budgetCode?: string;
  fiscalYear?: number;
  createdAt: string;
  createdBy: string;
  childAccountCount: number;
  administratorCount: number;
}

// =============================================================================
// Fund Operation DTOs
// =============================================================================

export const AllocateFundsSchema = z.object({
  toAccountId: z.string(),
  amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
    message: 'Amount must be a positive number',
  }),
  purpose: z.string().optional(),
  category: z.string().optional(),
  externalRef: z.string().optional(),
});

export type AllocateFundsDTO = z.infer<typeof AllocateFundsSchema>;

export const DisburseFundsSchema = z.object({
  recipientId: z.string().uuid(),
  recipientType: z.enum(['USER', 'BUSINESS', 'NPO']),
  amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
    message: 'Amount must be a positive number',
  }),
  purpose: z.string(),
  category: z.string().optional(),
  externalRef: z.string().optional(),
});

export type DisburseFundsDTO = z.infer<typeof DisburseFundsSchema>;

// =============================================================================
// Multi-Sig DTOs
// =============================================================================

export const CreateSignatoryRuleSchema = z.object({
  entityId: z.string(),
  ruleOrder: z.number().int().min(1),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  requiredApprovals: z.number().int().min(1),
  transactionTypes: z.array(z.string()).optional(),
  approverRoles: z.array(z.string()).optional(),
  autoExecute: z.boolean().default(true),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
});

export type CreateSignatoryRuleDTO = z.infer<typeof CreateSignatoryRuleSchema>;

export const VoteOnTransactionSchema = z.object({
  approved: z.boolean(),
  remarks: z.string().optional(),
});

export type VoteOnTransactionDTO = z.infer<typeof VoteOnTransactionSchema>;

export interface PendingTransactionResponse {
  pendingTxId: string;
  entityType: string;
  entityId: string;
  transactionType: string;
  fromEntityId: string;
  fromEntityName?: string;
  toEntityId: string;
  toEntityName?: string;
  amount: string;
  fee: string;
  purpose?: string;
  category?: string;
  externalRef?: string;
  requiredApprovals: number;
  currentApprovals: number;
  status: MultiSigStatus;
  initiatedBy: string;
  initiatedByName?: string;
  initiatedAt: string;
  expiresAt?: string;
  votes: Array<{
    voteId: string;
    voterId: string;
    voterName: string;
    voterRole?: string;
    approved: boolean;
    remarks?: string;
    votedAt: string;
  }>;
}

// =============================================================================
// Transaction History DTOs
// =============================================================================

export interface TransactionResponse {
  txId: string;
  treasuryId: string;
  accountId?: string;
  transactionType: GovtTransactionType;
  fromAccountId?: string;
  fromAccountName?: string;
  toAccountId?: string;
  toAccountName?: string;
  recipientId?: string;
  recipientType?: string;
  amount: string;
  fee: string;
  purpose?: string;
  category?: string;
  externalRef?: string;
  pendingTxId?: string;
  approvers?: Array<{
    profileId: string;
    role: string;
    approvedAt: string;
  }>;
  blockchainTxId?: string;
  blockNumber?: string;
  createdAt: string;
}

export const TransactionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  transactionType: z.enum(['GENESIS_MINT', 'ALLOCATION', 'DISBURSEMENT', 'GOVT_TRANSFER', 'GOVT_RECEIPT', 'GOVT_FEE', 'GOVT_ADJUSTMENT']).optional(),
  category: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export type TransactionQueryDTO = z.infer<typeof TransactionQuerySchema>;

// =============================================================================
// API Credential DTOs
// =============================================================================

export const CreateAPICredentialSchema = z.object({
  systemName: z.string().min(1).max(200),
  systemType: z.enum(['ERP', 'BUDGET', 'PAYROLL', 'AUDIT', 'OTHER']),
  description: z.string().optional(),
  ipWhitelist: z.array(z.string().ip()).optional(),
  permissions: z.array(z.string()).default(['read_balance']),
  webhookUrl: z.string().url().optional(),
  expiresAt: z.string().datetime().optional(),
});

export type CreateAPICredentialDTO = z.infer<typeof CreateAPICredentialSchema>;

export interface APICredentialResponse {
  id: string;
  treasuryId: string;
  systemName: string;
  systemType: string;
  description?: string;
  apiKeyPrefix: string;
  ipWhitelist: string[];
  permissions: string[];
  webhookUrl?: string;
  status: string;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  createdBy: string;
}

export interface APICredentialWithKeyResponse extends APICredentialResponse {
  apiKey: string; // Only returned on creation
}

// =============================================================================
// Error Codes
// =============================================================================

export enum GovernmentErrorCode {
  // Treasury errors
  TREASURY_NOT_FOUND = 'TREASURY_NOT_FOUND',
  TREASURY_ALREADY_ONBOARDED = 'TREASURY_ALREADY_ONBOARDED',
  TREASURY_LOCKED = 'TREASURY_LOCKED',
  TREASURY_NOT_ACTIVE = 'TREASURY_NOT_ACTIVE',

  // Account errors
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  ACCOUNT_FROZEN = 'ACCOUNT_FROZEN',
  ACCOUNT_ARCHIVED = 'ACCOUNT_ARCHIVED',
  PARENT_ACCOUNT_NOT_FOUND = 'PARENT_ACCOUNT_NOT_FOUND',

  // Administrator errors
  ADMINISTRATOR_NOT_FOUND = 'ADMINISTRATOR_NOT_FOUND',
  ADMINISTRATOR_ALREADY_EXISTS = 'ADMINISTRATOR_ALREADY_EXISTS',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // Fund operation errors
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  RECIPIENT_NOT_FOUND = 'RECIPIENT_NOT_FOUND',

  // Multi-sig errors
  PENDING_TX_NOT_FOUND = 'PENDING_TX_NOT_FOUND',
  PENDING_TX_EXPIRED = 'PENDING_TX_EXPIRED',
  PENDING_TX_ALREADY_VOTED = 'PENDING_TX_ALREADY_VOTED',
  PENDING_TX_NOT_PENDING = 'PENDING_TX_NOT_PENDING',

  // API credential errors
  API_CREDENTIAL_NOT_FOUND = 'API_CREDENTIAL_NOT_FOUND',
  API_CREDENTIAL_EXPIRED = 'API_CREDENTIAL_EXPIRED',
  API_CREDENTIAL_REVOKED = 'API_CREDENTIAL_REVOKED',

  // General errors
  COUNTRY_NOT_FOUND = 'COUNTRY_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR',
}
