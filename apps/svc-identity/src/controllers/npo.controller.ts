/**
 * NPO (Not-for-Profit) Account Controller
 *
 * Phase 4: Account Types & Integrations
 *
 * Handles HTTP requests for NPO account operations.
 */

import { Request, Response } from 'express';
import { npoService } from '../services/npo.service';

// Type aliases for enums
type SignatoryRole = 'OWNER' | 'DIRECTOR' | 'AUTHORIZED_SIGNATORY' | 'ACCOUNTANT' | 'VIEWER' | 'INITIATOR' | 'APPROVER';
type NPOCategory = 'CHARITY' | 'EDUCATION' | 'HEALTHCARE' | 'ENVIRONMENTAL' | 'RELIGIOUS' | 'ARTS_CULTURE' | 'ANIMAL_WELFARE' | 'HUMANITARIAN' | 'COMMUNITY' | 'RESEARCH' | 'ADVOCACY' | 'OTHER';
type ProgramStatus = 'ACTIVE' | 'COMPLETED' | 'SUSPENDED' | 'PLANNED';

// Default tenant ID for this deployment
const DEFAULT_TENANT_ID = 'gx-tenant-001';

// ============================================
// Account Management
// ============================================

/**
 * Create an NPO account
 * POST /api/v1/npo-accounts
 */
export async function createNPOAccount(req: Request, res: Response): Promise<void> {
  try {
    const {
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
    } = req.body;

    if (!orgProfileId || !walletId) {
      res.status(400).json({
        success: false,
        error: 'orgProfileId and walletId are required',
      });
      return;
    }

    const result = await npoService.createAccount({
      tenantId: DEFAULT_TENANT_ID,
      orgProfileId,
      walletId,
      taxExemptStatus,
      taxExemptNumber,
      missionStatement,
      category,
      annualReportDue: annualReportDue ? new Date(annualReportDue) : undefined,
      defaultRequiredApprovals,
      publicDonorList,
      requiresDonorReceipts,
    });

    res.status(201).json({
      success: true,
      data: { account: result.account },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get an NPO account
 * GET /api/v1/npo-accounts/:id
 */
export async function getNPOAccount(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const result = await npoService.getAccount(DEFAULT_TENANT_ID, id);

    res.json({
      success: true,
      data: { account: result.account },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Update an NPO account
 * PUT /api/v1/npo-accounts/:id
 */
export async function updateNPOAccount(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Convert date strings to Date objects
    if (updateData.annualReportDue) {
      updateData.annualReportDue = new Date(updateData.annualReportDue);
    }
    if (updateData.lastAuditDate) {
      updateData.lastAuditDate = new Date(updateData.lastAuditDate);
    }

    const result = await npoService.updateAccount(DEFAULT_TENANT_ID, id, updateData);

    res.json({
      success: true,
      data: { account: result.account },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * List NPO accounts
 * GET /api/v1/npo-accounts
 */
export async function listNPOAccounts(req: Request, res: Response): Promise<void> {
  try {
    const { category, page, limit } = req.query;

    const result = await npoService.listAccounts(DEFAULT_TENANT_ID, {
      category: category as NPOCategory | undefined,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
    });

    res.json({
      success: true,
      data: {
        accounts: result.accounts,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get NPO account dashboard
 * GET /api/v1/npo-accounts/:id/dashboard
 */
export async function getNPODashboard(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const result = await npoService.getDashboard(DEFAULT_TENANT_ID, id);

    res.json({
      success: true,
      data: { dashboard: result.dashboard },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

// ============================================
// Signatory Management
// ============================================

/**
 * Add a signatory to an NPO account
 * POST /api/v1/npo-accounts/:id/signatories
 */
export async function addSignatory(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const {
      profileId,
      role,
      canInitiateTransactions,
      canApproveTransactions,
      maxTransactionLimit,
      boardMember,
      volunteerStatus,
    } = req.body;

    if (!profileId || !role) {
      res.status(400).json({
        success: false,
        error: 'profileId and role are required',
      });
      return;
    }

    const result = await npoService.addSignatory({
      tenantId: DEFAULT_TENANT_ID,
      npoAccountId: id,
      profileId,
      role: role as SignatoryRole,
      canInitiateTransactions,
      canApproveTransactions,
      maxTransactionLimit,
      boardMember,
      volunteerStatus,
    });

    res.status(201).json({
      success: true,
      data: { signatory: result.signatory },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 :
                   error.message.includes('already') ? 409 :
                   error.message.includes('must have') ? 400 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Update a signatory
 * PUT /api/v1/npo-signatories/:signatoryId
 */
export async function updateSignatory(req: Request, res: Response): Promise<void> {
  try {
    const { signatoryId } = req.params;
    const updateData = req.body;

    const result = await npoService.updateSignatory(DEFAULT_TENANT_ID, signatoryId, updateData);

    res.json({
      success: true,
      data: { signatory: result.signatory },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Confirm a signatory
 * POST /api/v1/npo-signatories/:signatoryId/confirm
 */
export async function confirmSignatory(req: Request, res: Response): Promise<void> {
  try {
    const { signatoryId } = req.params;

    const result = await npoService.confirmSignatory(DEFAULT_TENANT_ID, signatoryId);

    res.json({
      success: true,
      data: { signatory: result.signatory },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 :
                   error.message.includes('already') ? 409 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Revoke a signatory
 * POST /api/v1/npo-signatories/:signatoryId/revoke
 */
export async function revokeSignatory(req: Request, res: Response): Promise<void> {
  try {
    const { signatoryId } = req.params;

    const result = await npoService.revokeSignatory(DEFAULT_TENANT_ID, signatoryId);

    res.json({
      success: true,
      data: { signatory: result.signatory },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 :
                   error.message.includes('already') ? 409 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * List signatories for an NPO account
 * GET /api/v1/npo-accounts/:id/signatories
 */
export async function listSignatories(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { includeRevoked, role, boardMembersOnly } = req.query;

    const result = await npoService.listSignatories(DEFAULT_TENANT_ID, id, {
      includeRevoked: includeRevoked === 'true',
      role: role as SignatoryRole | undefined,
      boardMembersOnly: boardMembersOnly === 'true',
    });

    res.json({
      success: true,
      data: {
        signatories: result.signatories,
        total: result.signatories.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// ============================================
// Signatory Rules
// ============================================

/**
 * Create a signatory rule
 * POST /api/v1/npo-accounts/:id/signatory-rules
 */
export async function createSignatoryRule(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { minAmount, maxAmount, requiredApprovals, transactionType, dailyLimit } = req.body;

    if (!requiredApprovals) {
      res.status(400).json({
        success: false,
        error: 'requiredApprovals is required',
      });
      return;
    }

    const result = await npoService.createSignatoryRule({
      tenantId: DEFAULT_TENANT_ID,
      npoAccountId: id,
      minAmount,
      maxAmount,
      requiredApprovals,
      transactionType,
      dailyLimit,
    });

    res.status(201).json({
      success: true,
      data: { rule: result.rule },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * List signatory rules
 * GET /api/v1/npo-accounts/:id/signatory-rules
 */
export async function listSignatoryRules(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const result = await npoService.listSignatoryRules(DEFAULT_TENANT_ID, id);

    res.json({
      success: true,
      data: {
        rules: result.rules,
        total: result.rules.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// ============================================
// Approvals
// ============================================

/**
 * Create an approval request
 * POST /api/v1/npo-accounts/:id/approvals
 */
export async function createApproval(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { transactionId, amount, description, requiredApprovals, expiresAt } = req.body;

    // Get requestor from JWT
    const requestedById = (req as any).user?.profileId;
    if (!requestedById) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!transactionId || !amount || !requiredApprovals) {
      res.status(400).json({
        success: false,
        error: 'transactionId, amount, and requiredApprovals are required',
      });
      return;
    }

    const result = await npoService.createApproval({
      tenantId: DEFAULT_TENANT_ID,
      npoAccountId: id,
      transactionId,
      requestedById,
      amount,
      description,
      requiredApprovals,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    res.status(201).json({
      success: true,
      data: { approval: result.approval },
    });
  } catch (error: any) {
    const status = error.message.includes('cannot') ? 403 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Vote on an approval
 * POST /api/v1/npo-approvals/:approvalId/vote
 */
export async function voteOnApproval(req: Request, res: Response): Promise<void> {
  try {
    const { approvalId } = req.params;
    const { vote, comment } = req.body;

    // Get voter from JWT
    const voterId = (req as any).user?.profileId;
    if (!voterId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!vote || !['APPROVED', 'REJECTED'].includes(vote)) {
      res.status(400).json({
        success: false,
        error: 'vote must be APPROVED or REJECTED',
      });
      return;
    }

    const result = await npoService.voteOnApproval(
      DEFAULT_TENANT_ID,
      approvalId,
      voterId,
      vote,
      comment
    );

    res.json({
      success: true,
      data: { vote: result.vote },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 :
                   error.message.includes('cannot') ? 403 :
                   error.message.includes('already') ? 409 :
                   error.message.includes('expired') ? 410 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * List approvals
 * GET /api/v1/npo-accounts/:id/approvals
 */
export async function listApprovals(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status, page, limit } = req.query;

    const result = await npoService.listPendingApprovals(DEFAULT_TENANT_ID, id, {
      status: status as any,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
    });

    res.json({
      success: true,
      data: {
        approvals: result.approvals,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// ============================================
// Programs
// ============================================

/**
 * Create a program
 * POST /api/v1/npo-accounts/:id/programs
 */
export async function createProgram(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, description, goalAmount, startDate, endDate } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        error: 'name is required',
      });
      return;
    }

    const result = await npoService.createProgram({
      tenantId: DEFAULT_TENANT_ID,
      npoAccountId: id,
      name,
      description,
      goalAmount,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(201).json({
      success: true,
      data: { program: result.program },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * List programs
 * GET /api/v1/npo-accounts/:id/programs
 */
export async function listPrograms(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status, page, limit } = req.query;

    const result = await npoService.listPrograms(DEFAULT_TENANT_ID, id, {
      status: status as ProgramStatus | undefined,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
    });

    res.json({
      success: true,
      data: {
        programs: result.programs,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Update program status
 * PUT /api/v1/npo-programs/:programId/status
 */
export async function updateProgramStatus(req: Request, res: Response): Promise<void> {
  try {
    const { programId } = req.params;
    const { status } = req.body;

    if (!status || !['ACTIVE', 'COMPLETED', 'SUSPENDED', 'PLANNED'].includes(status)) {
      res.status(400).json({
        success: false,
        error: 'status must be ACTIVE, COMPLETED, SUSPENDED, or PLANNED',
      });
      return;
    }

    const result = await npoService.updateProgramStatus(DEFAULT_TENANT_ID, programId, status);

    res.json({
      success: true,
      data: { program: result.program },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

// ============================================
// Donations
// ============================================

/**
 * Record a donation
 * POST /api/v1/npo-accounts/:id/donations
 */
export async function recordDonation(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const {
      donorProfileId,
      donorName,
      isAnonymous,
      amount,
      currency,
      transactionId,
      programId,
      designation,
    } = req.body;

    if (!amount) {
      res.status(400).json({
        success: false,
        error: 'amount is required',
      });
      return;
    }

    const result = await npoService.recordDonation({
      tenantId: DEFAULT_TENANT_ID,
      npoAccountId: id,
      donorProfileId,
      donorName,
      isAnonymous,
      amount,
      currency,
      transactionId,
      programId,
      designation,
    });

    res.status(201).json({
      success: true,
      data: { donation: result.donation },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Issue a tax receipt
 * POST /api/v1/npo-donations/:donationId/receipt
 */
export async function issueTaxReceipt(req: Request, res: Response): Promise<void> {
  try {
    const { donationId } = req.params;

    const result = await npoService.issueTaxReceipt(DEFAULT_TENANT_ID, donationId);

    res.json({
      success: true,
      data: {
        donation: result.donation,
        receiptNumber: result.receiptNumber,
      },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 :
                   error.message.includes('already') ? 409 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * List donations
 * GET /api/v1/npo-accounts/:id/donations
 */
export async function listDonations(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { programId, startDate, endDate, page, limit } = req.query;

    const result = await npoService.listDonations(DEFAULT_TENANT_ID, id, {
      programId: programId as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
    });

    res.json({
      success: true,
      data: {
        donations: result.donations,
        total: result.total,
        totalAmount: result.totalAmount,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get public donor list
 * GET /api/v1/npo-accounts/:id/donors/public
 */
export async function getPublicDonorList(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const result = await npoService.getPublicDonorList(DEFAULT_TENANT_ID, id);

    res.json({
      success: true,
      data: { donors: result.donors },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 :
                   error.message.includes('not enabled') ? 403 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}
