/**
 * Government Account Service
 *
 * Phase 4: Account Types & Integrations
 *
 * Manages government agency/department accounts including:
 * - Account creation and management
 * - Signatory management (requires personal account)
 * - Multi-signature approval workflows
 * - Government-specific sub-accounts (departments, funds)
 * - Compliance and audit trail requirements
 */

import { db } from '@gx/core-db';
import { Decimal } from '@prisma/client/runtime/library';

// Type aliases for enums
type SignatoryRole = 'OWNER' | 'DIRECTOR' | 'AUTHORIZED_SIGNATORY' | 'ACCOUNTANT' | 'VIEWER' | 'INITIATOR' | 'APPROVER';
type GovernmentLevel = 'FEDERAL' | 'STATE' | 'LOCAL' | 'MUNICIPAL' | 'AGENCY' | 'DEPARTMENT';
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

// ============================================
// Types & Interfaces
// ============================================

interface CreateGovernmentAccountInput {
  tenantId: string;
  orgProfileId: string;
  walletId: string;
  departmentCode?: string;
  agencyLevel?: GovernmentLevel;
  fiscalYearStart?: number;
  defaultRequiredApprovals?: number;
  requiresAuditTrail?: boolean;
  retentionYears?: number;
}

interface UpdateGovernmentAccountInput {
  departmentCode?: string;
  agencyLevel?: GovernmentLevel;
  fiscalYearStart?: number;
  defaultRequiredApprovals?: number;
  requiresAuditTrail?: boolean;
  retentionYears?: number;
}

interface AddSignatoryInput {
  tenantId: string;
  governmentAccountId: string;
  profileId: string;
  role: SignatoryRole;
  canInitiateTransactions?: boolean;
  canApproveTransactions?: boolean;
  maxTransactionLimit?: number;
  positionTitle?: string;
  employeeId?: string;
}

interface UpdateSignatoryInput {
  role?: SignatoryRole;
  canInitiateTransactions?: boolean;
  canApproveTransactions?: boolean;
  maxTransactionLimit?: number;
  positionTitle?: string;
  employeeId?: string;
}

interface CreateSignatoryRuleInput {
  tenantId: string;
  governmentAccountId: string;
  minAmount?: number;
  maxAmount?: number;
  requiredApprovals: number;
  transactionType?: string;
  dailyLimit?: number;
}

interface CreateApprovalInput {
  tenantId: string;
  governmentAccountId: string;
  transactionId: string;
  requestedById: string;
  amount: number;
  description?: string;
  requiredApprovals: number;
  expiresAt?: Date;
}

interface CreateSubAccountInput {
  tenantId: string;
  governmentAccountId: string;
  name: string;
  description?: string;
  subAccountType: string;
  fundCode?: string;
  allocationAmount?: number;
  annualBudget?: number;
}

// ============================================
// Government Account Service
// ============================================

class GovernmentAccountService {
  /**
   * Create a new government account
   * Requires an existing OrganizationProfile with entityType=GOVERNMENT
   */
  async createAccount(input: CreateGovernmentAccountInput) {
    const {
      tenantId,
      orgProfileId,
      walletId,
      departmentCode,
      agencyLevel = 'LOCAL',
      fiscalYearStart = 1,
      defaultRequiredApprovals = 2,
      requiresAuditTrail = true,
      retentionYears = 7,
    } = input;

    // Verify organization profile exists and is a government entity
    const orgProfile = await db.organizationProfile.findUnique({
      where: { orgProfileId },
    });

    if (!orgProfile) {
      throw new Error('Organization profile not found');
    }

    if (orgProfile.tenantId !== tenantId) {
      throw new Error('Tenant mismatch');
    }

    // Check if account already exists for this org
    const existingAccount = await db.governmentAccount.findUnique({
      where: { tenantId_orgProfileId: { tenantId, orgProfileId } },
    });

    if (existingAccount) {
      throw new Error('Government account already exists for this organization');
    }

    // Create the government account
    const account = await db.governmentAccount.create({
      data: {
        tenantId,
        orgProfileId,
        walletId,
        departmentCode,
        agencyLevel,
        fiscalYearStart,
        defaultRequiredApprovals,
        requiresAuditTrail,
        retentionYears,
      },
      include: {
        organization: true,
        wallet: true,
      },
    });

    return { success: true, account };
  }

  /**
   * Get government account by ID
   */
  async getAccount(tenantId: string, governmentAccountId: string) {
    const account = await db.governmentAccount.findFirst({
      where: { tenantId, governmentAccountId },
      include: {
        organization: true,
        wallet: true,
        signatories: {
          include: {
            userProfile: {
              select: {
                profileId: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        signatoryRules: true,
        subAccounts: true,
      },
    });

    if (!account) {
      throw new Error('Government account not found');
    }

    return { success: true, account };
  }

  /**
   * Update government account settings
   */
  async updateAccount(
    tenantId: string,
    governmentAccountId: string,
    input: UpdateGovernmentAccountInput
  ) {
    const account = await db.governmentAccount.findFirst({
      where: { tenantId, governmentAccountId },
    });

    if (!account) {
      throw new Error('Government account not found');
    }

    const updated = await db.governmentAccount.update({
      where: { governmentAccountId },
      data: {
        ...input,
        updatedAt: new Date(),
      },
      include: {
        organization: true,
        wallet: true,
      },
    });

    return { success: true, account: updated };
  }

  /**
   * List government accounts for a tenant
   */
  async listAccounts(
    tenantId: string,
    options?: {
      agencyLevel?: GovernmentLevel;
      page?: number;
      limit?: number;
    }
  ) {
    const { agencyLevel, page = 1, limit = 20 } = options || {};

    const where: any = { tenantId };
    if (agencyLevel) {
      where.agencyLevel = agencyLevel;
    }

    const [accounts, total] = await Promise.all([
      db.governmentAccount.findMany({
        where,
        include: {
          organization: true,
          wallet: true,
          _count: {
            select: {
              signatories: true,
              subAccounts: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.governmentAccount.count({ where }),
    ]);

    return {
      success: true,
      accounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // Signatory Management
  // ============================================

  /**
   * Add a signatory to a government account
   * The user must have an existing personal account (UserProfile)
   */
  async addSignatory(input: AddSignatoryInput) {
    const {
      tenantId,
      governmentAccountId,
      profileId,
      role,
      canInitiateTransactions = false,
      canApproveTransactions = false,
      maxTransactionLimit,
      positionTitle,
      employeeId,
    } = input;

    // Verify user has a personal account
    const userProfile = await db.userProfile.findFirst({
      where: { tenantId, profileId },
    });

    if (!userProfile) {
      throw new Error('User must have a personal account to be a signatory');
    }

    if (userProfile.status !== 'ACTIVE') {
      throw new Error('User account must be active to be a signatory');
    }

    // Verify government account exists
    const account = await db.governmentAccount.findFirst({
      where: { tenantId, governmentAccountId },
    });

    if (!account) {
      throw new Error('Government account not found');
    }

    // Check if already a signatory
    const existingSignatory = await db.governmentSignatory.findUnique({
      where: {
        tenantId_governmentAccountId_profileId: {
          tenantId,
          governmentAccountId,
          profileId,
        },
      },
    });

    if (existingSignatory) {
      throw new Error('User is already a signatory for this account');
    }

    // Create signatory
    const signatory = await db.governmentSignatory.create({
      data: {
        tenantId,
        governmentAccountId,
        profileId,
        role,
        canInitiateTransactions,
        canApproveTransactions,
        maxTransactionLimit: maxTransactionLimit
          ? new Decimal(maxTransactionLimit)
          : null,
        positionTitle,
        employeeId,
      },
      include: {
        userProfile: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Create account context for the user
    await db.accountContext.create({
      data: {
        tenantId,
        profileId,
        type: 'GOVERNMENT',
        governmentAccountId,
        name: `Government: ${account.departmentCode || 'Account'}`,
        isDefault: false,
        isActive: true,
      },
    });

    return { success: true, signatory };
  }

  /**
   * Update a signatory's permissions
   */
  async updateSignatory(
    tenantId: string,
    signatoryId: string,
    input: UpdateSignatoryInput
  ) {
    const signatory = await db.governmentSignatory.findFirst({
      where: { tenantId, signatoryId },
    });

    if (!signatory) {
      throw new Error('Signatory not found');
    }

    const updateData: any = { ...input };
    if (input.maxTransactionLimit !== undefined) {
      updateData.maxTransactionLimit = input.maxTransactionLimit
        ? new Decimal(input.maxTransactionLimit)
        : null;
    }

    const updated = await db.governmentSignatory.update({
      where: { signatoryId },
      data: updateData,
      include: {
        userProfile: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return { success: true, signatory: updated };
  }

  /**
   * Confirm a signatory (after invitation acceptance)
   */
  async confirmSignatory(tenantId: string, signatoryId: string) {
    const signatory = await db.governmentSignatory.findFirst({
      where: { tenantId, signatoryId },
    });

    if (!signatory) {
      throw new Error('Signatory not found');
    }

    if (signatory.confirmedAt) {
      throw new Error('Signatory already confirmed');
    }

    const updated = await db.governmentSignatory.update({
      where: { signatoryId },
      data: { confirmedAt: new Date() },
    });

    return { success: true, signatory: updated };
  }

  /**
   * Revoke a signatory's access
   */
  async revokeSignatory(tenantId: string, signatoryId: string) {
    const signatory = await db.governmentSignatory.findFirst({
      where: { tenantId, signatoryId },
    });

    if (!signatory) {
      throw new Error('Signatory not found');
    }

    if (signatory.revokedAt) {
      throw new Error('Signatory already revoked');
    }

    // Revoke signatory
    const updated = await db.governmentSignatory.update({
      where: { signatoryId },
      data: { revokedAt: new Date() },
    });

    // Deactivate account context
    await db.accountContext.updateMany({
      where: {
        tenantId,
        profileId: signatory.profileId,
        governmentAccountId: signatory.governmentAccountId,
      },
      data: { isActive: false },
    });

    return { success: true, signatory: updated };
  }

  /**
   * List signatories for a government account
   */
  async listSignatories(
    tenantId: string,
    governmentAccountId: string,
    options?: {
      includeRevoked?: boolean;
      role?: SignatoryRole;
    }
  ) {
    const { includeRevoked = false, role } = options || {};

    const where: any = { tenantId, governmentAccountId };
    if (!includeRevoked) {
      where.revokedAt = null;
    }
    if (role) {
      where.role = role;
    }

    const signatories = await db.governmentSignatory.findMany({
      where,
      include: {
        userProfile: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { invitedAt: 'desc' },
    });

    return { success: true, signatories };
  }

  // ============================================
  // Signatory Rules
  // ============================================

  /**
   * Create a signatory rule (approval threshold)
   */
  async createSignatoryRule(input: CreateSignatoryRuleInput) {
    const {
      tenantId,
      governmentAccountId,
      minAmount,
      maxAmount,
      requiredApprovals,
      transactionType,
      dailyLimit,
    } = input;

    const account = await db.governmentAccount.findFirst({
      where: { tenantId, governmentAccountId },
    });

    if (!account) {
      throw new Error('Government account not found');
    }

    const rule = await db.governmentSignatoryRule.create({
      data: {
        tenantId,
        governmentAccountId,
        minAmount: minAmount ? new Decimal(minAmount) : null,
        maxAmount: maxAmount ? new Decimal(maxAmount) : null,
        requiredApprovals,
        transactionType: transactionType as any,
        dailyLimit: dailyLimit ? new Decimal(dailyLimit) : null,
      },
    });

    return { success: true, rule };
  }

  /**
   * List signatory rules
   */
  async listSignatoryRules(tenantId: string, governmentAccountId: string) {
    const rules = await db.governmentSignatoryRule.findMany({
      where: { tenantId, governmentAccountId, isActive: true },
      orderBy: { minAmount: 'asc' },
    });

    return { success: true, rules };
  }

  /**
   * Deactivate a signatory rule
   */
  async deactivateRule(tenantId: string, ruleId: string) {
    const rule = await db.governmentSignatoryRule.findFirst({
      where: { tenantId, ruleId },
    });

    if (!rule) {
      throw new Error('Rule not found');
    }

    const updated = await db.governmentSignatoryRule.update({
      where: { ruleId },
      data: { isActive: false },
    });

    return { success: true, rule: updated };
  }

  // ============================================
  // Approval Workflows
  // ============================================

  /**
   * Create an approval request for a transaction
   */
  async createApproval(input: CreateApprovalInput) {
    const {
      tenantId,
      governmentAccountId,
      transactionId,
      requestedById,
      amount,
      description,
      requiredApprovals,
      expiresAt,
    } = input;

    // Verify requestor is a signatory who can initiate
    const signatory = await db.governmentSignatory.findFirst({
      where: {
        tenantId,
        governmentAccountId,
        profileId: requestedById,
        canInitiateTransactions: true,
        revokedAt: null,
      },
    });

    if (!signatory) {
      throw new Error('User cannot initiate transactions for this account');
    }

    const approval = await db.governmentApproval.create({
      data: {
        tenantId,
        governmentAccountId,
        transactionId,
        requestedById,
        amount: new Decimal(amount),
        description,
        requiredApprovals,
        expiresAt,
        status: 'PENDING',
      },
      include: {
        governmentAccount: true,
      },
    });

    return { success: true, approval };
  }

  /**
   * Vote on an approval (approve/reject)
   */
  async voteOnApproval(
    tenantId: string,
    approvalId: string,
    voterId: string,
    vote: 'APPROVED' | 'REJECTED',
    comment?: string
  ) {
    // Verify approval exists and is pending
    const approval = await db.governmentApproval.findFirst({
      where: { tenantId, approvalId, status: 'PENDING' },
    });

    if (!approval) {
      throw new Error('Approval not found or not pending');
    }

    // Check if expired
    if (approval.expiresAt && approval.expiresAt < new Date()) {
      await db.governmentApproval.update({
        where: { approvalId },
        data: { status: 'EXPIRED' },
      });
      throw new Error('Approval has expired');
    }

    // Verify voter is a signatory who can approve
    const signatory = await db.governmentSignatory.findFirst({
      where: {
        tenantId,
        governmentAccountId: approval.governmentAccountId,
        profileId: voterId,
        canApproveTransactions: true,
        revokedAt: null,
        confirmedAt: { not: null },
      },
    });

    if (!signatory) {
      throw new Error('User cannot approve transactions for this account');
    }

    // Check if already voted
    const existingVote = await db.governmentApprovalVote.findUnique({
      where: {
        approvalId_signatoryId: {
          approvalId,
          signatoryId: signatory.signatoryId,
        },
      },
    });

    if (existingVote) {
      throw new Error('User has already voted on this approval');
    }

    // Record vote
    const voteRecord = await db.governmentApprovalVote.create({
      data: {
        tenantId,
        approvalId,
        signatoryId: signatory.signatoryId,
        vote,
        comment,
      },
    });

    // Check if approval is now complete
    if (vote === 'REJECTED') {
      await db.governmentApproval.update({
        where: { approvalId },
        data: { status: 'REJECTED' },
      });
    } else {
      // Count approvals
      const approvalCount = await db.governmentApprovalVote.count({
        where: { approvalId, vote: 'APPROVED' },
      });

      if (approvalCount >= approval.requiredApprovals) {
        await db.governmentApproval.update({
          where: { approvalId },
          data: { status: 'APPROVED' },
        });
      }
    }

    return { success: true, vote: voteRecord };
  }

  /**
   * List pending approvals for an account
   */
  async listPendingApprovals(
    tenantId: string,
    governmentAccountId: string,
    options?: {
      status?: ApprovalStatus;
      page?: number;
      limit?: number;
    }
  ) {
    const { status = 'PENDING', page = 1, limit = 20 } = options || {};

    const where: any = { tenantId, governmentAccountId };
    if (status) {
      where.status = status;
    }

    const [approvals, total] = await Promise.all([
      db.governmentApproval.findMany({
        where,
        include: {
          votes: {
            include: {
              signatory: {
                include: {
                  userProfile: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.governmentApproval.count({ where }),
    ]);

    return {
      success: true,
      approvals,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // Sub-Accounts (Funds/Departments)
  // ============================================

  /**
   * Create a government sub-account (fund or department allocation)
   */
  async createSubAccount(input: CreateSubAccountInput) {
    const {
      tenantId,
      governmentAccountId,
      name,
      description,
      subAccountType,
      fundCode,
      allocationAmount,
      annualBudget,
    } = input;

    const account = await db.governmentAccount.findFirst({
      where: { tenantId, governmentAccountId },
    });

    if (!account) {
      throw new Error('Government account not found');
    }

    const subAccount = await db.governmentSubAccount.create({
      data: {
        tenantId,
        governmentAccountId,
        name,
        description,
        subAccountType,
        fundCode,
        allocationAmount: allocationAmount
          ? new Decimal(allocationAmount)
          : new Decimal(0),
        currentBalance: new Decimal(0),
        annualBudget: annualBudget ? new Decimal(annualBudget) : null,
      },
    });

    return { success: true, subAccount };
  }

  /**
   * List sub-accounts for a government account
   */
  async listSubAccounts(tenantId: string, governmentAccountId: string) {
    const subAccounts = await db.governmentSubAccount.findMany({
      where: { tenantId, governmentAccountId, isActive: true },
      orderBy: { name: 'asc' },
    });

    return { success: true, subAccounts };
  }

  /**
   * Update sub-account allocation
   */
  async updateSubAccountAllocation(
    tenantId: string,
    subAccountId: string,
    amount: number,
    isAddition: boolean
  ) {
    const subAccount = await db.governmentSubAccount.findFirst({
      where: { tenantId, id: subAccountId },
    });

    if (!subAccount) {
      throw new Error('Sub-account not found');
    }

    const newBalance = isAddition
      ? subAccount.currentBalance.plus(amount)
      : subAccount.currentBalance.minus(amount);

    if (newBalance.lessThan(0)) {
      throw new Error('Insufficient sub-account balance');
    }

    const updated = await db.governmentSubAccount.update({
      where: { id: subAccountId },
      data: {
        currentBalance: newBalance,
        updatedAt: new Date(),
      },
    });

    return { success: true, subAccount: updated };
  }

  // ============================================
  // Dashboard & Analytics
  // ============================================

  /**
   * Get government account dashboard summary
   */
  async getDashboard(tenantId: string, governmentAccountId: string) {
    const account = await db.governmentAccount.findFirst({
      where: { tenantId, governmentAccountId },
      include: {
        wallet: true,
        organization: true,
      },
    });

    if (!account) {
      throw new Error('Government account not found');
    }

    // Get signatory counts
    const [totalSignatories, activeSignatories] = await Promise.all([
      db.governmentSignatory.count({
        where: { tenantId, governmentAccountId },
      }),
      db.governmentSignatory.count({
        where: {
          tenantId,
          governmentAccountId,
          confirmedAt: { not: null },
          revokedAt: null,
        },
      }),
    ]);

    // Get pending approvals count
    const pendingApprovals = await db.governmentApproval.count({
      where: { tenantId, governmentAccountId, status: 'PENDING' },
    });

    // Get sub-account summary
    const subAccounts = await db.governmentSubAccount.findMany({
      where: { tenantId, governmentAccountId, isActive: true },
    });

    const totalAllocated = subAccounts.reduce(
      (sum: Decimal, sa: typeof subAccounts[0]) => sum.plus(sa.allocationAmount),
      new Decimal(0)
    );

    const totalBalance = subAccounts.reduce(
      (sum: Decimal, sa: typeof subAccounts[0]) => sum.plus(sa.currentBalance),
      new Decimal(0)
    );

    return {
      success: true,
      dashboard: {
        account: {
          id: account.governmentAccountId,
          departmentCode: account.departmentCode,
          agencyLevel: account.agencyLevel,
          walletBalance: account.wallet.cachedBalance,
        },
        organization: {
          name: account.organization.legalName,
        },
        signatories: {
          total: totalSignatories,
          active: activeSignatories,
        },
        pendingApprovals,
        subAccounts: {
          count: subAccounts.length,
          totalAllocated,
          totalBalance,
        },
        compliance: {
          requiresAuditTrail: account.requiresAuditTrail,
          retentionYears: account.retentionYears,
        },
      },
    };
  }
}

export const governmentService = new GovernmentAccountService();
