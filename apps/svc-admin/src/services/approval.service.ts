import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import crypto from 'crypto';
import {
  ApprovalType,
  ApprovalStatus,
  CreateApprovalRequestDTO,
  VoteApprovalRequestDTO,
  ListApprovalsQueryDTO,
  ApprovalRequestDTO,
  ApprovalListResponseDTO,
  ApprovalExecutionContext,
  ApprovalExecutionResult,
  ApprovalErrorCode,
} from '../types/approval.types';
import { notificationService } from './notification.service';
import type { ApprovalNotificationData } from '../types/notification.types';

// ============================================================================
// Type Definitions for Prisma Results
// ============================================================================

interface AdminUserBasic {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

interface ApprovalRecord {
  id: string;
  requestType: string;
  requesterId: string;
  action: string;
  targetResource: string | null;
  payload: unknown;
  reason: string;
  status: string;
  approvalToken: string | null;
  tokenExpiresAt: Date | null;
  approverId: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  executedAt: Date | null;
  executionResult: unknown;
  createdAt: Date;
  requester: AdminUserBasic;
  approver: AdminUserBasic | null;
}

// ============================================================================
// Approval Service
// ============================================================================

class ApprovalService {
  private readonly DEFAULT_TOKEN_VALIDITY_MINS = 30;
  private readonly MAX_PENDING_APPROVALS = 10;

  // ==========================================================================
  // Create Approval Request
  // ==========================================================================

  async createApprovalRequest(
    requesterId: string,
    data: CreateApprovalRequestDTO
  ): Promise<ApprovalRequestDTO> {
    logger.info({ requesterId, requestType: data.requestType, action: data.action }, 'Creating approval request');

    // Check max pending approvals for this requester
    const pendingCount = await db.approvalRequest.count({
      where: {
        requesterId,
        status: 'PENDING',
      },
    });

    if (pendingCount >= this.MAX_PENDING_APPROVALS) {
      throw {
        code: ApprovalErrorCode.MAX_PENDING_EXCEEDED,
        message: `Maximum pending approvals (${this.MAX_PENDING_APPROVALS}) exceeded`,
      };
    }

    // Generate secure approval token
    const approvalToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + this.DEFAULT_TOKEN_VALIDITY_MINS * 60 * 1000);

    // Create approval request
    const approval = await db.approvalRequest.create({
      data: {
        requestType: data.requestType,
        requesterId,
        action: data.action,
        targetResource: data.targetResource,
        payload: data.payload as object,
        reason: data.reason,
        approvalToken,
        tokenExpiresAt,
        status: 'PENDING',
      },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        approver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    // Log to audit trail
    await this.logApprovalAction(requesterId, 'approval:create', approval.id, {
      requestType: data.requestType,
      action: data.action,
    });

    // Get requester email for notification
    const requesterWithEmail = await db.adminUser.findUnique({
      where: { id: requesterId },
      select: { id: true, email: true, username: true, displayName: true, role: true },
    });

    // Send notifications
    if (requesterWithEmail) {
      const notificationData: ApprovalNotificationData = {
        approvalId: approval.id,
        requestType: data.requestType,
        action: data.action,
        reason: data.reason,
        requester: {
          id: requesterWithEmail.id,
          username: requesterWithEmail.username,
          displayName: requesterWithEmail.displayName,
          email: requesterWithEmail.email,
          role: requesterWithEmail.role,
        },
        targetResource: data.targetResource,
        payload: data.payload,
        tokenExpiresAt: tokenExpiresAt,
      };

      // Fire and forget - don't block on notification delivery
      notificationService.notifyApprovalCreated(notificationData).catch((err) => {
        logger.error({ error: err, approvalId: approval.id }, 'Failed to send approval created notification');
      });
    }

    logger.info({ approvalId: approval.id }, 'Approval request created');

    return this.mapToDTO(approval as ApprovalRecord, true);
  }

  // ==========================================================================
  // List Approval Requests
  // ==========================================================================

  async listApprovalRequests(
    query: ListApprovalsQueryDTO,
    adminId: string,
    adminRole: string
  ): Promise<ApprovalListResponseDTO> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.requestType) {
      where.requestType = query.requestType;
    }

    // Non-SUPER_OWNER can only see their own requests
    if (adminRole !== 'SUPER_OWNER') {
      where.requesterId = adminId;
    } else if (query.requesterId) {
      where.requesterId = query.requesterId;
    }

    // Get total count
    const total = await db.approvalRequest.count({ where });

    // Get approvals
    const approvals = await db.approvalRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        approver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    return {
      approvals: approvals.map((a: ApprovalRecord) => this.mapToDTO(a, a.requesterId === adminId)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==========================================================================
  // Get Single Approval Request
  // ==========================================================================

  async getApprovalRequest(
    approvalId: string,
    adminId: string,
    adminRole: string
  ): Promise<ApprovalRequestDTO> {
    const approval = await db.approvalRequest.findUnique({
      where: { id: approvalId },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        approver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    if (!approval) {
      throw {
        code: ApprovalErrorCode.NOT_FOUND,
        message: 'Approval request not found',
      };
    }

    // Non-SUPER_OWNER can only see their own requests
    if (adminRole !== 'SUPER_OWNER' && approval.requesterId !== adminId) {
      throw {
        code: ApprovalErrorCode.UNAUTHORIZED,
        message: 'Not authorized to view this approval request',
      };
    }

    return this.mapToDTO(approval as ApprovalRecord, approval.requesterId === adminId);
  }

  // ==========================================================================
  // Vote on Approval Request (Approve/Reject)
  // ==========================================================================

  async voteOnApproval(
    approvalId: string,
    approverId: string,
    vote: VoteApprovalRequestDTO
  ): Promise<ApprovalRequestDTO> {
    logger.info({ approvalId, approverId, decision: vote.decision }, 'Processing approval vote');

    const approval = await db.approvalRequest.findUnique({
      where: { id: approvalId },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    if (!approval) {
      throw {
        code: ApprovalErrorCode.NOT_FOUND,
        message: 'Approval request not found',
      };
    }

    // Check if already processed
    if (approval.status !== 'PENDING') {
      throw {
        code: ApprovalErrorCode.ALREADY_PROCESSED,
        message: `Approval request already ${approval.status.toLowerCase()}`,
      };
    }

    // Check if token expired
    if (approval.tokenExpiresAt && new Date() > approval.tokenExpiresAt) {
      // Mark as expired
      await db.approvalRequest.update({
        where: { id: approvalId },
        data: { status: 'EXPIRED' },
      });

      throw {
        code: ApprovalErrorCode.EXPIRED,
        message: 'Approval request has expired',
      };
    }

    // Prevent self-approval
    if (approval.requesterId === approverId) {
      throw {
        code: ApprovalErrorCode.SELF_APPROVAL_NOT_ALLOWED,
        message: 'Cannot approve or reject your own request',
      };
    }

    // Update approval status
    const updateData: Record<string, unknown> = {
      approverId,
    };

    if (vote.decision === 'APPROVE') {
      updateData.status = 'APPROVED';
      updateData.approvedAt = new Date();
    } else {
      updateData.status = 'REJECTED';
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = vote.reason || 'No reason provided';
    }

    const updatedApproval = await db.approvalRequest.update({
      where: { id: approvalId },
      data: updateData,
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        approver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    // Log to audit trail
    await this.logApprovalAction(approverId, `approval:${vote.decision.toLowerCase()}`, approvalId, {
      requestType: approval.requestType,
      action: approval.action,
      reason: vote.reason,
    });

    // Get full user details for notification
    const [requesterWithEmail, approverWithEmail] = await Promise.all([
      db.adminUser.findUnique({
        where: { id: approval.requesterId },
        select: { id: true, email: true, username: true, displayName: true, role: true },
      }),
      db.adminUser.findUnique({
        where: { id: approverId },
        select: { id: true, email: true, username: true, displayName: true, role: true },
      }),
    ]);

    // Send notifications
    if (requesterWithEmail && approverWithEmail) {
      const notificationData: ApprovalNotificationData = {
        approvalId: approval.id,
        requestType: approval.requestType,
        action: approval.action,
        reason: approval.reason,
        requester: {
          id: requesterWithEmail.id,
          username: requesterWithEmail.username,
          displayName: requesterWithEmail.displayName,
          email: requesterWithEmail.email,
          role: requesterWithEmail.role,
        },
        approver: {
          id: approverWithEmail.id,
          username: approverWithEmail.username,
          displayName: approverWithEmail.displayName,
          email: approverWithEmail.email,
          role: approverWithEmail.role,
        },
        rejectionReason: vote.reason,
      };

      // Fire and forget - don't block on notification delivery
      const notifyPromise = vote.decision === 'APPROVE'
        ? notificationService.notifyApprovalApproved(notificationData)
        : notificationService.notifyApprovalRejected(notificationData);

      notifyPromise.catch((err) => {
        logger.error({ error: err, approvalId }, `Failed to send approval ${vote.decision.toLowerCase()} notification`);
      });
    }

    logger.info(
      { approvalId, approverId, decision: vote.decision },
      `Approval request ${vote.decision.toLowerCase()}d`
    );

    return this.mapToDTO(updatedApproval as ApprovalRecord, false);
  }

  // ==========================================================================
  // Cancel Approval Request
  // ==========================================================================

  async cancelApproval(approvalId: string, requesterId: string): Promise<void> {
    logger.info({ approvalId, requesterId }, 'Cancelling approval request');

    const approval = await db.approvalRequest.findUnique({
      where: { id: approvalId },
    });

    if (!approval) {
      throw {
        code: ApprovalErrorCode.NOT_FOUND,
        message: 'Approval request not found',
      };
    }

    // Only requester can cancel
    if (approval.requesterId !== requesterId) {
      throw {
        code: ApprovalErrorCode.UNAUTHORIZED,
        message: 'Only the requester can cancel an approval request',
      };
    }

    // Can only cancel pending requests
    if (approval.status !== 'PENDING') {
      throw {
        code: ApprovalErrorCode.ALREADY_PROCESSED,
        message: `Cannot cancel ${approval.status.toLowerCase()} request`,
      };
    }

    await db.approvalRequest.update({
      where: { id: approvalId },
      data: { status: 'CANCELLED' },
    });

    // Log to audit trail
    await this.logApprovalAction(requesterId, 'approval:cancel', approvalId, {
      requestType: approval.requestType,
      action: approval.action,
    });

    // Get requester for notification
    const requesterWithEmail = await db.adminUser.findUnique({
      where: { id: requesterId },
      select: { id: true, email: true, username: true, displayName: true, role: true },
    });

    // Send notification
    if (requesterWithEmail) {
      const notificationData: ApprovalNotificationData = {
        approvalId: approval.id,
        requestType: approval.requestType,
        action: approval.action,
        reason: approval.reason,
        requester: {
          id: requesterWithEmail.id,
          username: requesterWithEmail.username,
          displayName: requesterWithEmail.displayName,
          email: requesterWithEmail.email,
          role: requesterWithEmail.role,
        },
      };

      notificationService.notifyApprovalCancelled(notificationData).catch((err) => {
        logger.error({ error: err, approvalId }, 'Failed to send approval cancelled notification');
      });
    }

    logger.info({ approvalId }, 'Approval request cancelled');
  }

  // ==========================================================================
  // Execute Approved Action
  // ==========================================================================

  async executeApproval(
    approvalId: string,
    executorId: string
  ): Promise<{ approval: ApprovalRequestDTO; result: ApprovalExecutionResult }> {
    logger.info({ approvalId, executorId }, 'Executing approved action');

    const approval = await db.approvalRequest.findUnique({
      where: { id: approvalId },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        approver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    if (!approval) {
      throw {
        code: ApprovalErrorCode.NOT_FOUND,
        message: 'Approval request not found',
      };
    }

    // Must be approved
    if (approval.status !== 'APPROVED') {
      throw {
        code: ApprovalErrorCode.UNAUTHORIZED,
        message: `Cannot execute ${approval.status.toLowerCase()} request`,
      };
    }

    // Already executed
    if (approval.executedAt) {
      throw {
        code: ApprovalErrorCode.ALREADY_PROCESSED,
        message: 'Approval request already executed',
      };
    }

    // Execute the action based on type
    const context: ApprovalExecutionContext = {
      approvalId: approval.id,
      requestType: approval.requestType as ApprovalType,
      action: approval.action,
      targetResource: approval.targetResource,
      payload: approval.payload as Record<string, unknown> | null,
      requesterId: approval.requesterId,
      approverId: approval.approverId!,
    };

    let result: ApprovalExecutionResult;
    try {
      result = await this.executeAction(context);
    } catch (error) {
      logger.error({ error, approvalId }, 'Failed to execute approved action');
      result = {
        success: false,
        error: error instanceof Error ? error.message : 'Execution failed',
      };
    }

    // Update approval with execution result
    const updatedApproval = await db.approvalRequest.update({
      where: { id: approvalId },
      data: {
        executedAt: new Date(),
        executionResult: result as object,
      },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        approver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    // Log to audit trail
    await this.logApprovalAction(executorId, 'approval:execute', approvalId, {
      requestType: approval.requestType,
      action: approval.action,
      success: result.success,
    });

    // Get requester for notification
    const requesterWithEmail = await db.adminUser.findUnique({
      where: { id: approval.requesterId },
      select: { id: true, email: true, username: true, displayName: true, role: true },
    });

    // Send notification
    if (requesterWithEmail && result.success) {
      const notificationData: ApprovalNotificationData = {
        approvalId: approval.id,
        requestType: approval.requestType,
        action: approval.action,
        reason: approval.reason,
        requester: {
          id: requesterWithEmail.id,
          username: requesterWithEmail.username,
          displayName: requesterWithEmail.displayName,
          email: requesterWithEmail.email,
          role: requesterWithEmail.role,
        },
      };

      notificationService.notifyApprovalExecuted(notificationData).catch((err) => {
        logger.error({ error: err, approvalId }, 'Failed to send approval executed notification');
      });
    }

    logger.info({ approvalId, success: result.success }, 'Approval action executed');

    return {
      approval: this.mapToDTO(updatedApproval as ApprovalRecord, false),
      result,
    };
  }

  // ==========================================================================
  // Get Pending Approvals Count (for dashboard)
  // ==========================================================================

  async getPendingApprovalsCount(): Promise<number> {
    return db.approvalRequest.count({
      where: { status: 'PENDING' },
    });
  }

  // ==========================================================================
  // Expire Old Approval Requests (can be called by cron)
  // ==========================================================================

  async expireOldApprovals(): Promise<number> {
    const result = await db.approvalRequest.updateMany({
      where: {
        status: 'PENDING',
        tokenExpiresAt: {
          lt: new Date(),
        },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    if (result.count > 0) {
      logger.info({ count: result.count }, 'Expired old approval requests');
    }

    return result.count;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async executeAction(context: ApprovalExecutionContext): Promise<ApprovalExecutionResult> {
    // This is where the actual action execution logic goes
    // For now, we'll return a placeholder success
    // Each action type should have its own handler

    switch (context.requestType) {
      case 'DEPLOYMENT_PROMOTION':
        return this.executeDeploymentPromotion(context);

      case 'USER_FREEZE':
        return this.executeUserFreeze(context);

      case 'TREASURY_OPERATION':
        return this.executeTreasuryOperation(context);

      case 'SYSTEM_PAUSE':
        return this.executeSystemPause(context);

      case 'CONFIG_CHANGE':
        return this.executeConfigChange(context);

      case 'ADMIN_ROLE_CHANGE':
        return this.executeAdminRoleChange(context);

      default:
        return {
          success: false,
          error: `Unknown request type: ${context.requestType}`,
        };
    }
  }

  // Placeholder execution handlers - to be implemented with actual logic
  private async executeDeploymentPromotion(context: ApprovalExecutionContext): Promise<ApprovalExecutionResult> {
    logger.info({ context }, 'Executing deployment promotion');
    // TODO: Integrate with deployment service
    return { success: true, data: { message: 'Deployment promotion executed (placeholder)' } };
  }

  private async executeUserFreeze(context: ApprovalExecutionContext): Promise<ApprovalExecutionResult> {
    logger.info({ context }, 'Executing user freeze');
    // TODO: Integrate with user service
    return { success: true, data: { message: 'User freeze executed (placeholder)' } };
  }

  private async executeTreasuryOperation(context: ApprovalExecutionContext): Promise<ApprovalExecutionResult> {
    logger.info({ context }, 'Executing treasury operation');
    // TODO: Integrate with treasury service
    return { success: true, data: { message: 'Treasury operation executed (placeholder)' } };
  }

  private async executeSystemPause(context: ApprovalExecutionContext): Promise<ApprovalExecutionResult> {
    logger.info({ context }, 'Executing system pause');
    // TODO: Integrate with system pause service
    return { success: true, data: { message: 'System pause executed (placeholder)' } };
  }

  private async executeConfigChange(context: ApprovalExecutionContext): Promise<ApprovalExecutionResult> {
    logger.info({ context }, 'Executing config change');
    // TODO: Integrate with config service
    return { success: true, data: { message: 'Config change executed (placeholder)' } };
  }

  private async executeAdminRoleChange(context: ApprovalExecutionContext): Promise<ApprovalExecutionResult> {
    logger.info({ context }, 'Executing admin role change');
    // TODO: Integrate with admin service
    return { success: true, data: { message: 'Admin role change executed (placeholder)' } };
  }

  private async logApprovalAction(
    adminId: string,
    action: string,
    approvalId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    try {
      // Get the previous hash for chain integrity
      const lastLog = await db.adminAuditLog.findFirst({
        orderBy: { timestamp: 'desc' },
        select: { eventHash: true },
      });

      const previousHash = lastLog?.eventHash || 'genesis';
      const timestamp = new Date();
      const eventData = `${approvalId}:${action}:${timestamp.toISOString()}:${previousHash}`;
      const eventHash = crypto.createHash('sha256').update(eventData).digest('hex');

      await db.adminAuditLog.create({
        data: {
          adminId,
          action,
          category: 'SYSTEM',
          resourceType: 'ApprovalRequest',
          resourceId: approvalId,
          ipAddress: 'internal',
          userAgent: 'approval-service',
          metadata: metadata as object,
          eventHash,
          previousHash,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to log approval action to audit trail');
    }
  }

  private mapToDTO(approval: ApprovalRecord, includeToken: boolean): ApprovalRequestDTO {
    const dto: ApprovalRequestDTO = {
      id: approval.id,
      requestType: approval.requestType as ApprovalType,
      action: approval.action,
      targetResource: approval.targetResource,
      payload: approval.payload as Record<string, unknown> | null,
      reason: approval.reason,
      status: approval.status as ApprovalStatus,
      requester: {
        id: approval.requester.id,
        username: approval.requester.username,
        displayName: approval.requester.displayName,
        role: approval.requester.role,
      },
      approver: approval.approver
        ? {
            id: approval.approver.id,
            username: approval.approver.username,
            displayName: approval.approver.displayName,
            role: approval.approver.role,
          }
        : null,
      createdAt: approval.createdAt,
      approvedAt: approval.approvedAt,
      rejectedAt: approval.rejectedAt,
      rejectionReason: approval.rejectionReason,
      executedAt: approval.executedAt,
      executionResult: approval.executionResult as Record<string, unknown> | null,
    };

    // Only include token for the requester
    if (includeToken && approval.status === 'PENDING') {
      dto.approvalToken = approval.approvalToken || undefined;
      dto.tokenExpiresAt = approval.tokenExpiresAt;
    }

    return dto;
  }
}

export const approvalService = new ApprovalService();
