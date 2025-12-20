import { Response } from 'express';
import { z } from 'zod';
import { logger } from '@gx/core-logger';
import { AdminAuthenticatedRequest } from '../types/admin-auth.types';
import { approvalService } from '../services/approval.service';
import { ApprovalErrorCode } from '../types/approval.types';

// ============================================================================
// Validation Schemas
// ============================================================================

const createApprovalSchema = z.object({
  requestType: z.enum([
    'DEPLOYMENT_PROMOTION',
    'USER_FREEZE',
    'TREASURY_OPERATION',
    'SYSTEM_PAUSE',
    'CONFIG_CHANGE',
    'ADMIN_ROLE_CHANGE',
  ]),
  action: z.string().min(1).max(200),
  targetResource: z.string().max(200).optional(),
  payload: z.record(z.unknown()).optional(),
  reason: z.string().min(10).max(1000),
});

const voteApprovalSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().max(1000).optional(),
});

const listApprovalsSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED']).optional(),
  requestType: z
    .enum([
      'DEPLOYMENT_PROMOTION',
      'USER_FREEZE',
      'TREASURY_OPERATION',
      'SYSTEM_PAUSE',
      'CONFIG_CHANGE',
      'ADMIN_ROLE_CHANGE',
    ])
    .optional(),
  requesterId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ============================================================================
// Controller Class
// ============================================================================

class ApprovalController {
  // ==========================================================================
  // Create Approval Request
  // ==========================================================================

  async createApproval(req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const validation = createApprovalSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid request body',
          details: validation.error.errors,
        });
        return;
      }

      const admin = req.admin!;
      const approval = await approvalService.createApprovalRequest(admin.adminId, validation.data);

      logger.info(
        { adminId: admin.adminId, approvalId: approval.id, requestType: validation.data.requestType },
        'Approval request created'
      );

      res.status(201).json({
        success: true,
        approval,
        message: 'Approval request created successfully. Awaiting SUPER_OWNER approval.',
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // List Approval Requests
  // ==========================================================================

  async listApprovals(req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const validation = listApprovalsSchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid query parameters',
          details: validation.error.errors,
        });
        return;
      }

      const admin = req.admin!;
      const result = await approvalService.listApprovalRequests(
        validation.data,
        admin.adminId,
        admin.role
      );

      res.json(result);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Get Single Approval Request
  // ==========================================================================

  async getApproval(req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Approval ID is required',
        });
        return;
      }

      const admin = req.admin!;
      const approval = await approvalService.getApprovalRequest(id, admin.adminId, admin.role);

      res.json(approval);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Vote on Approval Request (Approve/Reject)
  // ==========================================================================

  async voteOnApproval(req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Approval ID is required',
        });
        return;
      }

      const validation = voteApprovalSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid request body',
          details: validation.error.errors,
        });
        return;
      }

      const admin = req.admin!;
      const approval = await approvalService.voteOnApproval(id, admin.adminId, validation.data);

      const actionText = validation.data.decision === 'APPROVE' ? 'approved' : 'rejected';

      logger.info(
        { adminId: admin.adminId, approvalId: id, decision: validation.data.decision },
        `Approval request ${actionText}`
      );

      res.json({
        success: true,
        approval,
        message: `Approval request ${actionText} successfully`,
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Cancel Approval Request
  // ==========================================================================

  async cancelApproval(req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Approval ID is required',
        });
        return;
      }

      const admin = req.admin!;
      await approvalService.cancelApproval(id, admin.adminId);

      logger.info({ adminId: admin.adminId, approvalId: id }, 'Approval request cancelled');

      res.json({
        success: true,
        message: 'Approval request cancelled successfully',
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Execute Approved Action
  // ==========================================================================

  async executeApproval(req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Approval ID is required',
        });
        return;
      }

      const admin = req.admin!;
      const { approval, result } = await approvalService.executeApproval(id, admin.adminId);

      logger.info(
        { adminId: admin.adminId, approvalId: id, success: result.success },
        'Approval action executed'
      );

      if (!result.success) {
        res.status(500).json({
          success: false,
          approval,
          executionResult: result,
          message: result.error || 'Execution failed',
        });
        return;
      }

      res.json({
        success: true,
        approval,
        executionResult: result,
        message: 'Approved action executed successfully',
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Get Pending Approvals Count (for dashboard)
  // ==========================================================================

  async getPendingCount(_req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const count = await approvalService.getPendingApprovalsCount();
      res.json({ pendingCount: count });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Error Handler
  // ==========================================================================

  private handleError(error: unknown, res: Response): void {
    // Check for known error codes
    if (error && typeof error === 'object' && 'code' in error) {
      const err = error as { code: ApprovalErrorCode; message: string };

      switch (err.code) {
        case ApprovalErrorCode.NOT_FOUND:
          res.status(404).json({
            error: 'Not Found',
            code: err.code,
            message: err.message,
          });
          return;

        case ApprovalErrorCode.ALREADY_PROCESSED:
        case ApprovalErrorCode.EXPIRED:
        case ApprovalErrorCode.SELF_APPROVAL_NOT_ALLOWED:
        case ApprovalErrorCode.MAX_PENDING_EXCEEDED:
          res.status(400).json({
            error: 'Bad Request',
            code: err.code,
            message: err.message,
          });
          return;

        case ApprovalErrorCode.UNAUTHORIZED:
          res.status(403).json({
            error: 'Forbidden',
            code: err.code,
            message: err.message,
          });
          return;

        case ApprovalErrorCode.EXECUTION_FAILED:
          res.status(500).json({
            error: 'Execution Failed',
            code: err.code,
            message: err.message,
          });
          return;
      }
    }

    // Unknown error
    logger.error({ error }, 'Approval controller error');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }
}

export const approvalController = new ApprovalController();
