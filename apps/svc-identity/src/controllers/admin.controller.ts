import { Request, Response } from 'express';
import { logger } from '@gx/core-logger';
import { adminService } from '../services/admin.service';

/**
 * Admin Controller
 *
 * Handles HTTP requests for admin-related endpoints.
 */

class AdminController {
  /**
   * GET /api/v1/admin/users
   * List users with optional status filter
   *
   * @query status - Filter by user status
   * @query page - Page number (default: 1)
   * @query pageSize - Items per page (default: 20)
   */
  listUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, page, pageSize } = req.query;

      const result = await adminService.listUsers(
        status as string | undefined,
        page ? parseInt(page as string, 10) : 1,
        pageSize ? parseInt(pageSize as string, 10) : 20
      );

      res.status(200).json(result);
    } catch (error) {
      logger.error({ error }, 'Failed to list users');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list users',
      });
    }
  };

  /**
   * GET /api/v1/admin/users/:id
   * Get detailed user information
   *
   * @param id - User profile ID
   */
  getUserDetails = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const user = await adminService.getUserDetails(id);

      res.status(200).json({ user });
    } catch (error) {
      logger.error({ error, userId: req.params.id }, 'Failed to get user details');

      if ((error as Error).message === 'User not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get user details',
      });
    }
  };

  /**
   * POST /api/v1/admin/users/:id/approve
   * Approve user KYC and activate account
   *
   * @param id - User profile ID
   * @body notes - Optional admin notes
   */
  approveUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      // TODO: Get admin ID from authenticated session
      const adminId = 'system-admin';

      await adminService.approveUser(id, adminId, notes);

      res.status(200).json({
        success: true,
        message: 'User approved successfully',
      });
    } catch (error) {
      logger.error({ error, userId: req.params.id }, 'Failed to approve user');

      if ((error as Error).message === 'User not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to approve user',
      });
    }
  };

  /**
   * POST /api/v1/admin/users/:id/reject
   * Reject user KYC
   *
   * @param id - User profile ID
   * @body reason - Rejection reason (required)
   */
  rejectUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Rejection reason is required',
        });
        return;
      }

      // TODO: Get admin ID from authenticated session
      const adminId = 'system-admin';

      await adminService.rejectUser(id, adminId, reason);

      res.status(200).json({
        success: true,
        message: 'User rejected',
      });
    } catch (error) {
      logger.error({ error, userId: req.params.id }, 'Failed to reject user');

      if ((error as Error).message === 'User not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to reject user',
      });
    }
  };

  /**
   * GET /api/v1/admin/users/pending-blockchain
   * Get users pending blockchain registration
   */
  getUsersPendingBlockchain = async (_req: Request, res: Response): Promise<void> => {
    try {
      const users = await adminService.getUsersPendingBlockchain();

      res.status(200).json({ users, total: users.length });
    } catch (error) {
      logger.error({ error }, 'Failed to get users pending blockchain');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get users pending blockchain registration',
      });
    }
  };

  /**
   * POST /api/v1/admin/batch-approve-blockchain
   * Batch approve users for blockchain registration
   *
   * @body profileIds - Optional array of specific profile IDs to process
   */
  batchApproveForBlockchain = async (req: Request, res: Response): Promise<void> => {
    try {
      const { profileIds } = req.body;

      // TODO: Get admin ID from authenticated session
      const adminId = 'system-admin';

      const result = await adminService.batchApproveForBlockchain(adminId, profileIds);

      res.status(200).json(result);
    } catch (error) {
      logger.error({ error }, 'Failed to batch approve for blockchain');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to batch approve users for blockchain registration',
      });
    }
  };
}

export const adminController = new AdminController();
