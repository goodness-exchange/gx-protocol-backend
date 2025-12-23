/**
 * Government Account Controller
 *
 * Phase 4: Account Types & Integrations
 *
 * Handles HTTP requests for government account operations.
 */

import { Request, Response } from 'express';
import { governmentService } from '../services/government.service';

// Type aliases for enums
type SignatoryRole = 'OWNER' | 'DIRECTOR' | 'AUTHORIZED_SIGNATORY' | 'ACCOUNTANT' | 'VIEWER' | 'INITIATOR' | 'APPROVER';
type GovernmentLevel = 'FEDERAL' | 'STATE' | 'LOCAL' | 'MUNICIPAL' | 'AGENCY' | 'DEPARTMENT';

// Default tenant ID for this deployment
const DEFAULT_TENANT_ID = 'gx-tenant-001';

// ============================================
// Account Management
// ============================================

/**
 * Create a government account
 * POST /api/v1/government-accounts
 */
export async function createGovernmentAccount(req: Request, res: Response): Promise<void> {
  try {
    const {
      orgProfileId,
      walletId,
      departmentCode,
      agencyLevel,
      fiscalYearStart,
      defaultRequiredApprovals,
      requiresAuditTrail,
      retentionYears,
    } = req.body;

    if (!orgProfileId || !walletId) {
      res.status(400).json({
        success: false,
        error: 'orgProfileId and walletId are required',
      });
      return;
    }

    const result = await governmentService.createAccount({
      tenantId: DEFAULT_TENANT_ID,
      orgProfileId,
      walletId,
      departmentCode,
      agencyLevel,
      fiscalYearStart,
      defaultRequiredApprovals,
      requiresAuditTrail,
      retentionYears,
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
 * Get a government account
 * GET /api/v1/government-accounts/:id
 */
export async function getGovernmentAccount(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const result = await governmentService.getAccount(DEFAULT_TENANT_ID, id);

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
 * Update a government account
 * PUT /api/v1/government-accounts/:id
 */
export async function updateGovernmentAccount(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const result = await governmentService.updateAccount(DEFAULT_TENANT_ID, id, updateData);

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
 * List government accounts
 * GET /api/v1/government-accounts
 */
export async function listGovernmentAccounts(req: Request, res: Response): Promise<void> {
  try {
    const { agencyLevel, page, limit } = req.query;

    const result = await governmentService.listAccounts(DEFAULT_TENANT_ID, {
      agencyLevel: agencyLevel as GovernmentLevel | undefined,
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
 * Get government account dashboard
 * GET /api/v1/government-accounts/:id/dashboard
 */
export async function getGovernmentDashboard(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const result = await governmentService.getDashboard(DEFAULT_TENANT_ID, id);

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
 * Add a signatory to a government account
 * POST /api/v1/government-accounts/:id/signatories
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
      positionTitle,
      employeeId,
    } = req.body;

    if (!profileId || !role) {
      res.status(400).json({
        success: false,
        error: 'profileId and role are required',
      });
      return;
    }

    const result = await governmentService.addSignatory({
      tenantId: DEFAULT_TENANT_ID,
      governmentAccountId: id,
      profileId,
      role: role as SignatoryRole,
      canInitiateTransactions,
      canApproveTransactions,
      maxTransactionLimit,
      positionTitle,
      employeeId,
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
 * PUT /api/v1/government-signatories/:signatoryId
 */
export async function updateSignatory(req: Request, res: Response): Promise<void> {
  try {
    const { signatoryId } = req.params;
    const updateData = req.body;

    const result = await governmentService.updateSignatory(
      DEFAULT_TENANT_ID,
      signatoryId,
      updateData
    );

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
 * POST /api/v1/government-signatories/:signatoryId/confirm
 */
export async function confirmSignatory(req: Request, res: Response): Promise<void> {
  try {
    const { signatoryId } = req.params;

    const result = await governmentService.confirmSignatory(DEFAULT_TENANT_ID, signatoryId);

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
 * POST /api/v1/government-signatories/:signatoryId/revoke
 */
export async function revokeSignatory(req: Request, res: Response): Promise<void> {
  try {
    const { signatoryId } = req.params;

    const result = await governmentService.revokeSignatory(DEFAULT_TENANT_ID, signatoryId);

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
 * List signatories for a government account
 * GET /api/v1/government-accounts/:id/signatories
 */
export async function listSignatories(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { includeRevoked, role } = req.query;

    const result = await governmentService.listSignatories(DEFAULT_TENANT_ID, id, {
      includeRevoked: includeRevoked === 'true',
      role: role as SignatoryRole | undefined,
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
 * POST /api/v1/government-accounts/:id/signatory-rules
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

    const result = await governmentService.createSignatoryRule({
      tenantId: DEFAULT_TENANT_ID,
      governmentAccountId: id,
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
 * GET /api/v1/government-accounts/:id/signatory-rules
 */
export async function listSignatoryRules(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const result = await governmentService.listSignatoryRules(DEFAULT_TENANT_ID, id);

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

/**
 * Deactivate a signatory rule
 * DELETE /api/v1/government-signatory-rules/:ruleId
 */
export async function deactivateRule(req: Request, res: Response): Promise<void> {
  try {
    const { ruleId } = req.params;

    const result = await governmentService.deactivateRule(DEFAULT_TENANT_ID, ruleId);

    res.json({
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

// ============================================
// Approvals
// ============================================

/**
 * Create an approval request
 * POST /api/v1/government-accounts/:id/approvals
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

    const result = await governmentService.createApproval({
      tenantId: DEFAULT_TENANT_ID,
      governmentAccountId: id,
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
 * POST /api/v1/government-approvals/:approvalId/vote
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

    const result = await governmentService.voteOnApproval(
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
 * GET /api/v1/government-accounts/:id/approvals
 */
export async function listApprovals(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status, page, limit } = req.query;

    const result = await governmentService.listPendingApprovals(DEFAULT_TENANT_ID, id, {
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
// Sub-Accounts
// ============================================

/**
 * Create a sub-account
 * POST /api/v1/government-accounts/:id/sub-accounts
 */
export async function createSubAccount(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, description, subAccountType, fundCode, allocationAmount, annualBudget } = req.body;

    if (!name || !subAccountType) {
      res.status(400).json({
        success: false,
        error: 'name and subAccountType are required',
      });
      return;
    }

    const result = await governmentService.createSubAccount({
      tenantId: DEFAULT_TENANT_ID,
      governmentAccountId: id,
      name,
      description,
      subAccountType,
      fundCode,
      allocationAmount,
      annualBudget,
    });

    res.status(201).json({
      success: true,
      data: { subAccount: result.subAccount },
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
 * List sub-accounts
 * GET /api/v1/government-accounts/:id/sub-accounts
 */
export async function listSubAccounts(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const result = await governmentService.listSubAccounts(DEFAULT_TENANT_ID, id);

    res.json({
      success: true,
      data: {
        subAccounts: result.subAccounts,
        total: result.subAccounts.length,
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
 * Update sub-account allocation
 * POST /api/v1/government-sub-accounts/:subAccountId/allocate
 */
export async function updateSubAccountAllocation(req: Request, res: Response): Promise<void> {
  try {
    const { subAccountId } = req.params;
    const { amount, isAddition } = req.body;

    if (amount === undefined || isAddition === undefined) {
      res.status(400).json({
        success: false,
        error: 'amount and isAddition are required',
      });
      return;
    }

    const result = await governmentService.updateSubAccountAllocation(
      DEFAULT_TENANT_ID,
      subAccountId,
      amount,
      isAddition
    );

    res.json({
      success: true,
      data: { subAccount: result.subAccount },
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 :
                   error.message.includes('Insufficient') ? 400 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
}
