import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { userManagementService } from '../services/user-management.service';
import type { AuthenticatedRequest } from '../types/dtos';

/**
 * User Management Controller
 * Handles KYC approval, denial, freeze/unfreeze, and batch registration
 */
class UserManagementController {
  /**
   * List users with optional status filter
   * GET /api/v1/admin/users?status=PENDING_ADMIN_APPROVAL
   */
  listUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { status, page = '1', limit = '20', search } = req.query;

      const result = await userManagementService.listUsers({
        status: status as string | undefined,
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        search: search as string | undefined,
      });

      res.json(result);
    } catch (error) {
      logger.error({ error }, 'List users failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get single user details
   * GET /api/v1/admin/users/:userId
   */
  getUserDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      const user = await userManagementService.getUserDetails(userId);

      res.json(user);
    } catch (error) {
      logger.error({ error, userId: req.params.userId }, 'Get user details failed');
      res.status(404).json({
        error: 'Not Found',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Approve user KYC and generate Fabric User ID
   * POST /api/v1/admin/users/:userId/approve
   */
  approveUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { notes } = req.body;
      const adminId = req.user?.profileId;

      if (!adminId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Admin ID not found' });
        return;
      }

      const result = await userManagementService.approveUser(userId, adminId, notes);

      logger.info(
        {
          userId,
          fabricUserId: result.fabricUserId,
          adminId,
        },
        'User approved'
      );

      res.json({
        success: true,
        message: 'User approved successfully',
        fabricUserId: result.fabricUserId,
        status: result.status,
      });
    } catch (error) {
      logger.error({ error, userId: req.params.userId }, 'Approve user failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Deny user KYC application
   * POST /api/v1/admin/users/:userId/deny
   */
  denyUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminId = req.user?.profileId;

      if (!adminId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Admin ID not found' });
        return;
      }

      if (!reason || reason.trim().length < 10) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Denial reason must be at least 10 characters',
        });
        return;
      }

      const result = await userManagementService.denyUser(userId, adminId, reason);

      logger.info({ userId, adminId, reason }, 'User denied');

      res.json({
        success: true,
        message: 'User KYC denied',
        status: result.status,
      });
    } catch (error) {
      logger.error({ error, userId: req.params.userId }, 'Deny user failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get users approved and awaiting blockchain registration
   * GET /api/v1/admin/users/pending-onchain
   */
  getPendingOnchainUsers = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const users = await userManagementService.getPendingOnchainUsers();

      res.json({
        success: true,
        users,
        total: users.length,
      });
    } catch (error) {
      logger.error({ error }, 'Get pending onchain users failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Batch register approved users on blockchain
   * POST /api/v1/admin/users/batch-register-onchain
   */
  batchRegisterOnchain = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userIds } = req.body;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'userIds must be a non-empty array',
        });
        return;
      }

      const result = await userManagementService.batchRegisterOnchain(userIds);

      logger.info({ count: result.commands.length }, 'Batch registration queued');

      res.status(202).json({
        success: true,
        message: 'Batch registration queued',
        count: result.commands.length,
        commands: result.commands,
      });
    } catch (error) {
      logger.error({ error }, 'Batch registration failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Freeze user account (prevent transactions)
   * POST /api/v1/admin/users/:userId/freeze
   */
  freezeUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { reason, notes } = req.body;
      const adminId = req.user?.profileId;

      if (!adminId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Admin ID not found' });
        return;
      }

      const validReasons = [
        'ADMIN_ACTION',
        'SUSPICIOUS_ACTIVITY',
        'COMPLIANCE_REVIEW',
        'COURT_ORDER',
        'USER_REQUEST',
      ];

      if (!validReasons.includes(reason)) {
        res.status(400).json({
          error: 'Bad Request',
          message: `Invalid freeze reason. Must be one of: ${validReasons.join(', ')}`,
        });
        return;
      }

      const result = await userManagementService.freezeUser(userId, adminId, reason, notes);

      logger.info({ userId, adminId, reason }, 'User frozen');

      res.json({
        success: true,
        message: 'User frozen successfully',
        fabricUserId: result.fabricUserId,
        status: result.status,
      });
    } catch (error) {
      logger.error({ error, userId: req.params.userId }, 'Freeze user failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Unfreeze user account (restore transaction capability)
   * POST /api/v1/admin/users/:userId/unfreeze
   */
  unfreezeUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const adminId = req.user?.profileId;

      if (!adminId) {
        res.status(401).json({ error: 'Unauthorized', message: 'Admin ID not found' });
        return;
      }

      const result = await userManagementService.unfreezeUser(userId, adminId);

      logger.info({ userId, adminId }, 'User unfrozen');

      res.json({
        success: true,
        message: 'User unfrozen successfully',
        fabricUserId: result.fabricUserId,
        status: result.status,
      });
    } catch (error) {
      logger.error({ error, userId: req.params.userId }, 'Unfreeze user failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * List all frozen accounts
   * GET /api/v1/admin/users/frozen
   */
  listFrozenUsers = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const users = await userManagementService.listFrozenUsers();

      res.json({
        success: true,
        frozenUsers: users,
        total: users.length,
      });
    } catch (error) {
      logger.error({ error }, 'List frozen users failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };
}

export const userManagementController = new UserManagementController();
