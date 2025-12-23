/**
 * Not-for-Profit (NPO) Account Service
 *
 * Phase 4: Account Types & Integrations
 *
 * Manages non-profit organization accounts including:
 * - Account creation and management
 * - Signatory management (requires personal account)
 * - Multi-signature approval workflows
 * - Program/fund management
 * - Donation tracking and tax receipts
 * - Transparency and compliance requirements
 */

import { db } from '@gx/core-db';
import { Decimal } from '@prisma/client/runtime/library';

// Type aliases for enums
type SignatoryRole = 'OWNER' | 'DIRECTOR' | 'AUTHORIZED_SIGNATORY' | 'ACCOUNTANT' | 'VIEWER' | 'INITIATOR' | 'APPROVER';
type NPOCategory = 'CHARITY' | 'EDUCATION' | 'HEALTHCARE' | 'ENVIRONMENTAL' | 'RELIGIOUS' | 'ARTS_CULTURE' | 'ANIMAL_WELFARE' | 'HUMANITARIAN' | 'COMMUNITY' | 'RESEARCH' | 'ADVOCACY' | 'OTHER';
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
type ProgramStatus = 'ACTIVE' | 'COMPLETED' | 'SUSPENDED' | 'PLANNED';

// ============================================
// Types & Interfaces
// ============================================

interface CreateNPOAccountInput {
  tenantId: string;
  orgProfileId: string;
  walletId: string;
  taxExemptStatus?: string;
  taxExemptNumber?: string;
  missionStatement?: string;
  category?: NPOCategory;
  annualReportDue?: Date;
  defaultRequiredApprovals?: number;
  publicDonorList?: boolean;
  requiresDonorReceipts?: boolean;
}

interface UpdateNPOAccountInput {
  taxExemptStatus?: string;
  taxExemptNumber?: string;
  missionStatement?: string;
  category?: NPOCategory;
  annualReportDue?: Date;
  lastAuditDate?: Date;
  defaultRequiredApprovals?: number;
  publicDonorList?: boolean;
  requiresDonorReceipts?: boolean;
}

interface AddSignatoryInput {
  tenantId: string;
  npoAccountId: string;
  profileId: string;
  role: SignatoryRole;
  canInitiateTransactions?: boolean;
  canApproveTransactions?: boolean;
  maxTransactionLimit?: number;
  boardMember?: boolean;
  volunteerStatus?: boolean;
}

interface UpdateSignatoryInput {
  role?: SignatoryRole;
  canInitiateTransactions?: boolean;
  canApproveTransactions?: boolean;
  maxTransactionLimit?: number;
  boardMember?: boolean;
  volunteerStatus?: boolean;
}

interface CreateSignatoryRuleInput {
  tenantId: string;
  npoAccountId: string;
  minAmount?: number;
  maxAmount?: number;
  requiredApprovals: number;
  transactionType?: string;
  dailyLimit?: number;
}

interface CreateApprovalInput {
  tenantId: string;
  npoAccountId: string;
  transactionId: string;
  requestedById: string;
  amount: number;
  description?: string;
  requiredApprovals: number;
  expiresAt?: Date;
}

interface CreateProgramInput {
  tenantId: string;
  npoAccountId: string;
  name: string;
  description?: string;
  goalAmount?: number;
  startDate?: Date;
  endDate?: Date;
}

interface RecordDonationInput {
  tenantId: string;
  npoAccountId: string;
  donorProfileId?: string;
  donorName?: string;
  isAnonymous?: boolean;
  amount: number;
  currency?: string;
  transactionId?: string;
  programId?: string;
  designation?: string;
}

// ============================================
// NPO Account Service
// ============================================

class NPOAccountService {
  /**
   * Create a new NPO account
   * Requires an existing OrganizationProfile with entityType=NOT_FOR_PROFIT
   */
  async createAccount(input: CreateNPOAccountInput) {
    const {
      tenantId,
      orgProfileId,
      walletId,
      taxExemptStatus,
      taxExemptNumber,
      missionStatement,
      category = 'OTHER',
      annualReportDue,
      defaultRequiredApprovals = 2,
      publicDonorList = false,
      requiresDonorReceipts = true,
    } = input;

    // Verify organization profile exists
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
    const existingAccount = await db.notForProfitAccount.findUnique({
      where: { tenantId_orgProfileId: { tenantId, orgProfileId } },
    });

    if (existingAccount) {
      throw new Error('NPO account already exists for this organization');
    }

    // Create the NPO account
    const account = await db.notForProfitAccount.create({
      data: {
        tenantId,
        orgProfileId,
        walletId,
        taxExemptStatus,
        taxExemptNumber,
        missionStatement,
        category,
        annualReportDue,
        defaultRequiredApprovals,
        publicDonorList,
        requiresDonorReceipts,
      },
      include: {
        organization: true,
        wallet: true,
      },
    });

    return { success: true, account };
  }

  /**
   * Get NPO account by ID
   */
  async getAccount(tenantId: string, npoAccountId: string) {
    const account = await db.notForProfitAccount.findFirst({
      where: { tenantId, npoAccountId },
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
        programs: true,
      },
    });

    if (!account) {
      throw new Error('NPO account not found');
    }

    return { success: true, account };
  }

  /**
   * Update NPO account settings
   */
  async updateAccount(
    tenantId: string,
    npoAccountId: string,
    input: UpdateNPOAccountInput
  ) {
    const account = await db.notForProfitAccount.findFirst({
      where: { tenantId, npoAccountId },
    });

    if (!account) {
      throw new Error('NPO account not found');
    }

    const updated = await db.notForProfitAccount.update({
      where: { npoAccountId },
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
   * List NPO accounts for a tenant
   */
  async listAccounts(
    tenantId: string,
    options?: {
      category?: NPOCategory;
      page?: number;
      limit?: number;
    }
  ) {
    const { category, page = 1, limit = 20 } = options || {};

    const where: any = { tenantId };
    if (category) {
      where.category = category;
    }

    const [accounts, total] = await Promise.all([
      db.notForProfitAccount.findMany({
        where,
        include: {
          organization: true,
          wallet: true,
          _count: {
            select: {
              signatories: true,
              programs: true,
              donations: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.notForProfitAccount.count({ where }),
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
   * Add a signatory to an NPO account
   * The user must have an existing personal account (UserProfile)
   */
  async addSignatory(input: AddSignatoryInput) {
    const {
      tenantId,
      npoAccountId,
      profileId,
      role,
      canInitiateTransactions = false,
      canApproveTransactions = false,
      maxTransactionLimit,
      boardMember = false,
      volunteerStatus = false,
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

    // Verify NPO account exists
    const account = await db.notForProfitAccount.findFirst({
      where: { tenantId, npoAccountId },
      include: { organization: true },
    });

    if (!account) {
      throw new Error('NPO account not found');
    }

    // Check if already a signatory
    const existingSignatory = await db.nPOSignatory.findUnique({
      where: {
        tenantId_npoAccountId_profileId: {
          tenantId,
          npoAccountId,
          profileId,
        },
      },
    });

    if (existingSignatory) {
      throw new Error('User is already a signatory for this account');
    }

    // Create signatory
    const signatory = await db.nPOSignatory.create({
      data: {
        tenantId,
        npoAccountId,
        profileId,
        role,
        canInitiateTransactions,
        canApproveTransactions,
        maxTransactionLimit: maxTransactionLimit
          ? new Decimal(maxTransactionLimit)
          : null,
        boardMember,
        volunteerStatus,
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
        type: 'NOT_FOR_PROFIT',
        npoAccountId,
        name: `NPO: ${account.organization.legalName}`,
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
    const signatory = await db.nPOSignatory.findFirst({
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

    const updated = await db.nPOSignatory.update({
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
   * Confirm a signatory
   */
  async confirmSignatory(tenantId: string, signatoryId: string) {
    const signatory = await db.nPOSignatory.findFirst({
      where: { tenantId, signatoryId },
    });

    if (!signatory) {
      throw new Error('Signatory not found');
    }

    if (signatory.confirmedAt) {
      throw new Error('Signatory already confirmed');
    }

    const updated = await db.nPOSignatory.update({
      where: { signatoryId },
      data: { confirmedAt: new Date() },
    });

    return { success: true, signatory: updated };
  }

  /**
   * Revoke a signatory's access
   */
  async revokeSignatory(tenantId: string, signatoryId: string) {
    const signatory = await db.nPOSignatory.findFirst({
      where: { tenantId, signatoryId },
    });

    if (!signatory) {
      throw new Error('Signatory not found');
    }

    if (signatory.revokedAt) {
      throw new Error('Signatory already revoked');
    }

    const updated = await db.nPOSignatory.update({
      where: { signatoryId },
      data: { revokedAt: new Date() },
    });

    // Deactivate account context
    await db.accountContext.updateMany({
      where: {
        tenantId,
        profileId: signatory.profileId,
        npoAccountId: signatory.npoAccountId,
      },
      data: { isActive: false },
    });

    return { success: true, signatory: updated };
  }

  /**
   * List signatories for an NPO account
   */
  async listSignatories(
    tenantId: string,
    npoAccountId: string,
    options?: {
      includeRevoked?: boolean;
      role?: SignatoryRole;
      boardMembersOnly?: boolean;
    }
  ) {
    const { includeRevoked = false, role, boardMembersOnly } = options || {};

    const where: any = { tenantId, npoAccountId };
    if (!includeRevoked) {
      where.revokedAt = null;
    }
    if (role) {
      where.role = role;
    }
    if (boardMembersOnly) {
      where.boardMember = true;
    }

    const signatories = await db.nPOSignatory.findMany({
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
   * Create a signatory rule
   */
  async createSignatoryRule(input: CreateSignatoryRuleInput) {
    const {
      tenantId,
      npoAccountId,
      minAmount,
      maxAmount,
      requiredApprovals,
      transactionType,
      dailyLimit,
    } = input;

    const account = await db.notForProfitAccount.findFirst({
      where: { tenantId, npoAccountId },
    });

    if (!account) {
      throw new Error('NPO account not found');
    }

    const rule = await db.nPOSignatoryRule.create({
      data: {
        tenantId,
        npoAccountId,
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
  async listSignatoryRules(tenantId: string, npoAccountId: string) {
    const rules = await db.nPOSignatoryRule.findMany({
      where: { tenantId, npoAccountId, isActive: true },
      orderBy: { minAmount: 'asc' },
    });

    return { success: true, rules };
  }

  // ============================================
  // Approval Workflows
  // ============================================

  /**
   * Create an approval request
   */
  async createApproval(input: CreateApprovalInput) {
    const {
      tenantId,
      npoAccountId,
      transactionId,
      requestedById,
      amount,
      description,
      requiredApprovals,
      expiresAt,
    } = input;

    // Verify requestor is a signatory who can initiate
    const signatory = await db.nPOSignatory.findFirst({
      where: {
        tenantId,
        npoAccountId,
        profileId: requestedById,
        canInitiateTransactions: true,
        revokedAt: null,
      },
    });

    if (!signatory) {
      throw new Error('User cannot initiate transactions for this account');
    }

    const approval = await db.nPOApproval.create({
      data: {
        tenantId,
        npoAccountId,
        transactionId,
        requestedById,
        amount: new Decimal(amount),
        description,
        requiredApprovals,
        expiresAt,
        status: 'PENDING',
      },
      include: {
        npoAccount: true,
      },
    });

    return { success: true, approval };
  }

  /**
   * Vote on an approval
   */
  async voteOnApproval(
    tenantId: string,
    approvalId: string,
    voterId: string,
    vote: 'APPROVED' | 'REJECTED',
    comment?: string
  ) {
    const approval = await db.nPOApproval.findFirst({
      where: { tenantId, approvalId, status: 'PENDING' },
    });

    if (!approval) {
      throw new Error('Approval not found or not pending');
    }

    // Check if expired
    if (approval.expiresAt && approval.expiresAt < new Date()) {
      await db.nPOApproval.update({
        where: { approvalId },
        data: { status: 'EXPIRED' },
      });
      throw new Error('Approval has expired');
    }

    // Verify voter is a signatory who can approve
    const signatory = await db.nPOSignatory.findFirst({
      where: {
        tenantId,
        npoAccountId: approval.npoAccountId,
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
    const existingVote = await db.nPOApprovalVote.findUnique({
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
    const voteRecord = await db.nPOApprovalVote.create({
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
      await db.nPOApproval.update({
        where: { approvalId },
        data: { status: 'REJECTED' },
      });
    } else {
      const approvalCount = await db.nPOApprovalVote.count({
        where: { approvalId, vote: 'APPROVED' },
      });

      if (approvalCount >= approval.requiredApprovals) {
        await db.nPOApproval.update({
          where: { approvalId },
          data: { status: 'APPROVED' },
        });
      }
    }

    return { success: true, vote: voteRecord };
  }

  /**
   * List pending approvals
   */
  async listPendingApprovals(
    tenantId: string,
    npoAccountId: string,
    options?: {
      status?: ApprovalStatus;
      page?: number;
      limit?: number;
    }
  ) {
    const { status = 'PENDING', page = 1, limit = 20 } = options || {};

    const where: any = { tenantId, npoAccountId };
    if (status) {
      where.status = status;
    }

    const [approvals, total] = await Promise.all([
      db.nPOApproval.findMany({
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
      db.nPOApproval.count({ where }),
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
  // Programs (Campaigns/Funds)
  // ============================================

  /**
   * Create a program/campaign
   */
  async createProgram(input: CreateProgramInput) {
    const {
      tenantId,
      npoAccountId,
      name,
      description,
      goalAmount,
      startDate,
      endDate,
    } = input;

    const account = await db.notForProfitAccount.findFirst({
      where: { tenantId, npoAccountId },
    });

    if (!account) {
      throw new Error('NPO account not found');
    }

    const program = await db.nPOProgram.create({
      data: {
        tenantId,
        npoAccountId,
        name,
        description,
        goalAmount: goalAmount ? new Decimal(goalAmount) : null,
        raisedAmount: new Decimal(0),
        startDate,
        endDate,
        status: startDate && startDate > new Date() ? 'PLANNED' : 'ACTIVE',
      },
    });

    return { success: true, program };
  }

  /**
   * List programs
   */
  async listPrograms(
    tenantId: string,
    npoAccountId: string,
    options?: {
      status?: ProgramStatus;
      page?: number;
      limit?: number;
    }
  ) {
    const { status, page = 1, limit = 20 } = options || {};

    const where: any = { tenantId, npoAccountId };
    if (status) {
      where.status = status;
    }

    const [programs, total] = await Promise.all([
      db.nPOProgram.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.nPOProgram.count({ where }),
    ]);

    return {
      success: true,
      programs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update program status
   */
  async updateProgramStatus(
    tenantId: string,
    programId: string,
    status: ProgramStatus
  ) {
    const program = await db.nPOProgram.findFirst({
      where: { tenantId, programId },
    });

    if (!program) {
      throw new Error('Program not found');
    }

    const updated = await db.nPOProgram.update({
      where: { programId },
      data: { status, updatedAt: new Date() },
    });

    return { success: true, program: updated };
  }

  // ============================================
  // Donations
  // ============================================

  /**
   * Record a donation
   */
  async recordDonation(input: RecordDonationInput) {
    const {
      tenantId,
      npoAccountId,
      donorProfileId,
      donorName,
      isAnonymous = false,
      amount,
      currency = 'GXC',
      transactionId,
      programId,
      designation,
    } = input;

    const account = await db.notForProfitAccount.findFirst({
      where: { tenantId, npoAccountId },
    });

    if (!account) {
      throw new Error('NPO account not found');
    }

    // If linked to a program, update program raised amount
    if (programId) {
      await db.nPOProgram.update({
        where: { programId },
        data: {
          raisedAmount: { increment: amount },
        },
      });
    }

    const donation = await db.nPODonation.create({
      data: {
        tenantId,
        npoAccountId,
        donorProfileId,
        donorName,
        isAnonymous,
        amount: new Decimal(amount),
        currency,
        transactionId,
        programId,
        designation,
      },
      include: {
        donorProfile: donorProfileId
          ? {
              select: {
                profileId: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            }
          : false,
      },
    });

    return { success: true, donation };
  }

  /**
   * Issue a tax receipt for a donation
   */
  async issueTaxReceipt(tenantId: string, donationId: string) {
    const donation = await db.nPODonation.findFirst({
      where: { tenantId, donationId },
    });

    if (!donation) {
      throw new Error('Donation not found');
    }

    if (donation.receiptIssued) {
      throw new Error('Receipt already issued');
    }

    // Generate receipt number
    const receiptNumber = `RCP-${Date.now()}-${donationId.slice(0, 8).toUpperCase()}`;

    const updated = await db.nPODonation.update({
      where: { donationId },
      data: {
        receiptIssued: true,
        receiptNumber,
        receiptIssuedAt: new Date(),
      },
    });

    return { success: true, donation: updated, receiptNumber };
  }

  /**
   * List donations
   */
  async listDonations(
    tenantId: string,
    npoAccountId: string,
    options?: {
      programId?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    }
  ) {
    const { programId, startDate, endDate, page = 1, limit = 20 } = options || {};

    const where: any = { tenantId, npoAccountId };
    if (programId) {
      where.programId = programId;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [donations, total, totalAmount] = await Promise.all([
      db.nPODonation.findMany({
        where,
        include: {
          donorProfile: {
            select: {
              profileId: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.nPODonation.count({ where }),
      db.nPODonation.aggregate({
        where,
        _sum: { amount: true },
      }),
    ]);

    return {
      success: true,
      donations,
      total,
      totalAmount: totalAmount._sum.amount || new Decimal(0),
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get public donor list (if enabled)
   */
  async getPublicDonorList(tenantId: string, npoAccountId: string) {
    const account = await db.notForProfitAccount.findFirst({
      where: { tenantId, npoAccountId },
    });

    if (!account) {
      throw new Error('NPO account not found');
    }

    if (!account.publicDonorList) {
      throw new Error('Public donor list is not enabled for this organization');
    }

    const donations = await db.nPODonation.findMany({
      where: {
        tenantId,
        npoAccountId,
        isAnonymous: false,
      },
      include: {
        donorProfile: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { amount: 'desc' },
    });

    const donors = donations.map((d: typeof donations[0]) => ({
      name: d.donorProfile
        ? `${d.donorProfile.firstName} ${d.donorProfile.lastName}`
        : d.donorName || 'Anonymous',
      amount: d.amount,
      date: d.createdAt,
    }));

    return { success: true, donors };
  }

  // ============================================
  // Dashboard & Analytics
  // ============================================

  /**
   * Get NPO account dashboard summary
   */
  async getDashboard(tenantId: string, npoAccountId: string) {
    const account = await db.notForProfitAccount.findFirst({
      where: { tenantId, npoAccountId },
      include: {
        wallet: true,
        organization: true,
      },
    });

    if (!account) {
      throw new Error('NPO account not found');
    }

    // Get signatory counts
    const [totalSignatories, boardMembers] = await Promise.all([
      db.nPOSignatory.count({
        where: { tenantId, npoAccountId, revokedAt: null },
      }),
      db.nPOSignatory.count({
        where: { tenantId, npoAccountId, boardMember: true, revokedAt: null },
      }),
    ]);

    // Get pending approvals
    const pendingApprovals = await db.nPOApproval.count({
      where: { tenantId, npoAccountId, status: 'PENDING' },
    });

    // Get program summary
    const programs = await db.nPOProgram.findMany({
      where: { tenantId, npoAccountId, status: 'ACTIVE' },
    });

    const totalGoal = programs.reduce(
      (sum: Decimal, p: typeof programs[0]) => sum.plus(p.goalAmount || 0),
      new Decimal(0)
    );

    const totalRaised = programs.reduce(
      (sum: Decimal, p: typeof programs[0]) => sum.plus(p.raisedAmount),
      new Decimal(0)
    );

    // Get donation stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalDonations, recentDonations] = await Promise.all([
      db.nPODonation.aggregate({
        where: { tenantId, npoAccountId },
        _sum: { amount: true },
        _count: true,
      }),
      db.nPODonation.aggregate({
        where: {
          tenantId,
          npoAccountId,
          createdAt: { gte: thirtyDaysAgo },
        },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return {
      success: true,
      dashboard: {
        account: {
          id: account.npoAccountId,
          category: account.category,
          taxExemptStatus: account.taxExemptStatus,
          walletBalance: account.wallet.cachedBalance,
        },
        organization: {
          name: account.organization.legalName,
          missionStatement: account.missionStatement,
        },
        signatories: {
          total: totalSignatories,
          boardMembers,
        },
        pendingApprovals,
        programs: {
          activeCount: programs.length,
          totalGoal,
          totalRaised,
          progress: totalGoal.greaterThan(0)
            ? totalRaised.dividedBy(totalGoal).times(100).toNumber()
            : 0,
        },
        donations: {
          totalCount: totalDonations._count,
          totalAmount: totalDonations._sum.amount || new Decimal(0),
          last30Days: {
            count: recentDonations._count,
            amount: recentDonations._sum.amount || new Decimal(0),
          },
        },
        compliance: {
          annualReportDue: account.annualReportDue,
          lastAuditDate: account.lastAuditDate,
          publicDonorList: account.publicDonorList,
        },
      },
    };
  }
}

export const npoService = new NPOAccountService();
