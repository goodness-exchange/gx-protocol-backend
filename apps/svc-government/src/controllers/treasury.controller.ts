import { Response, NextFunction } from 'express';
import { logger } from '@gx/core-logger';
import { AppError } from '../utils';
import { treasuryService } from '../services';
import {
  GovernmentAuthenticatedRequest,
  OnboardTreasurySchema,
  UpdateTreasuryStatusSchema,
  GovernmentErrorCode,
} from '../types';

export const treasuryController = {
  /**
   * Get treasury by country code
   */
  async getTreasuryByCountry(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { countryCode } = req.params;

      const treasury = await treasuryService.getTreasuryByCountry(countryCode);

      if (!treasury) {
        throw new AppError(GovernmentErrorCode.TREASURY_NOT_FOUND, 404, 'Treasury not found');
      }

      res.json({ success: true, data: treasury });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get treasury by ID
   */
  async getTreasuryById(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;

      const treasury = await treasuryService.getTreasuryById(treasuryId);

      if (!treasury) {
        throw new AppError(GovernmentErrorCode.TREASURY_NOT_FOUND, 404, 'Treasury not found');
      }

      res.json({ success: true, data: treasury });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List all treasuries
   */
  async listTreasuries(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string | undefined;

      const result = await treasuryService.listTreasuries({ page, limit, status });

      res.json({
        success: true,
        data: result.treasuries,
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
   * Onboard a treasury (Super Admin only)
   */
  async onboardTreasury(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validation = OnboardTreasurySchema.safeParse(req.body);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const treasury = await treasuryService.onboardTreasury(
        validation.data,
        req.user!.profileId
      );

      logger.info(
        { treasuryId: treasury.treasuryId, adminProfileId: req.user!.profileId },
        'Treasury onboarded via API'
      );

      res.status(201).json({ success: true, data: treasury });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update treasury status (Super Admin only)
   */
  async updateTreasuryStatus(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;

      const validation = UpdateTreasuryStatusSchema.safeParse(req.body);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const treasury = await treasuryService.updateTreasuryStatus(
        treasuryId,
        validation.data,
        req.user!.profileId
      );

      res.json({ success: true, data: treasury });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Activate a treasury (transition from ONBOARDING to ACTIVE)
   */
  async activateTreasury(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;

      const treasury = await treasuryService.activateTreasury(
        treasuryId,
        req.user!.profileId
      );

      res.json({ success: true, data: treasury });
    } catch (error) {
      next(error);
    }
  },
};
