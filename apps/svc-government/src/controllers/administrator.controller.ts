import { Response, NextFunction } from 'express';
import { logger } from '@gx/core-logger';
import { AppError } from '../utils';
import { administratorService } from '../services';
import {
  GovernmentAuthenticatedRequest,
  AssignAdministratorSchema,
  UpdateAdministratorSchema,
  GovernmentErrorCode,
} from '../types';

export const administratorController = {
  /**
   * Get administrator by ID
   */
  async getAdministratorById(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { adminId } = req.params;

      const admin = await administratorService.getAdministratorById(adminId);

      if (!admin) {
        throw new AppError(GovernmentErrorCode.ADMINISTRATOR_NOT_FOUND, 404, 'Administrator not found');
      }

      res.json({ success: true, data: admin });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List administrators for a treasury
   */
  async listAdministrators(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string | undefined;
      const accountId = req.query.accountId as string | undefined;

      const result = await administratorService.listAdministrators({
        treasuryId,
        accountId,
        status,
        page,
        limit,
      });

      res.json({
        success: true,
        data: result.administrators,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get current user's administrator assignments
   */
  async getMyAssignments(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const assignments = await administratorService.getAdministratorsForProfile(req.user!.profileId);

      res.json({ success: true, data: assignments });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Assign administrator to treasury or account
   */
  async assignAdministrator(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;

      const validation = AssignAdministratorSchema.safeParse(req.body);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const admin = await administratorService.assignAdministrator(
        treasuryId,
        validation.data,
        req.user!.profileId
      );

      logger.info(
        { adminId: admin.id, treasuryId, assignedByProfileId: req.user!.profileId },
        'Administrator assigned via API'
      );

      res.status(201).json({ success: true, data: admin });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update administrator
   */
  async updateAdministrator(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { adminId } = req.params;

      const validation = UpdateAdministratorSchema.safeParse(req.body);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const admin = await administratorService.updateAdministrator(
        adminId,
        validation.data,
        req.user!.profileId
      );

      res.json({ success: true, data: admin });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Remove administrator
   */
  async removeAdministrator(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { adminId } = req.params;

      await administratorService.removeAdministrator(adminId, req.user!.profileId);

      res.json({ success: true, message: 'Administrator removed' });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get permissions for current user on treasury/account
   */
  async getMyPermissions(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;
      const accountId = req.query.accountId as string | undefined;

      const permissions = await administratorService.getPermissions(
        req.user!.profileId,
        treasuryId,
        accountId
      );

      res.json({ success: true, data: permissions });
    } catch (error) {
      next(error);
    }
  },
};
