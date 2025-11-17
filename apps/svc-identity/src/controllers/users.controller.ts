import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { usersService } from '../services/users.service';
import type { 
  AuthenticatedRequest, 
  RegisterUserRequestDTO,
  UpdateProfileRequestDTO,
  SubmitKYCRequestDTO 
} from '../types/dtos';

/**
 * Users Controller
 * 
 * Handles HTTP requests for user-related endpoints.
 * Delegates business logic to UsersService.
 */

class UsersController {
  /**
   * POST /api/v1/users
   * Register a new user
   * 
   * @param req.body {email, password, firstName, lastName, phoneNum?, identityNum?, nationalityCountryCode?}
   * @returns {commandId, message}
   */
  register = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data: RegisterUserRequestDTO = req.body;

      // Validate required fields
      if (!data.email || !data.password || !data.firstName || !data.lastName) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Email, password, firstName, and lastName are required',
        });
        return;
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid email format',
        });
        return;
      }

      // Password strength validation
      if (data.password.length < 8) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Password must be at least 8 characters long',
        });
        return;
      }

      const result = await usersService.registerUser(data);

      logger.info({ commandId: result.commandId }, 'User registration initiated');

      res.status(202).json(result); // 202 Accepted (async operation)
    } catch (error) {
      logger.error({ error }, 'User registration failed');
      
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'User registration failed',
      });
    }
  };

  /**
   * GET /api/v1/users/:id
   * Get user profile by ID
   * 
   * @param req.params.id - User ID
   * @returns {user: UserProfileDTO}
   */
  getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Authorization check: users can only view their own profile
      // (unless they're an admin, which we'll add later)
      if (req.user && req.user.profileId !== id) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only view your own profile',
        });
        return;
      }

      const user = await usersService.getUserProfile(id);

      res.status(200).json({ user });
    } catch (error) {
      logger.error({ error, userId: req.params.id }, 'Failed to fetch user profile');
      
      if ((error as Error).message === 'User not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch user profile',
      });
    }
  };

  /**
   * PATCH /api/v1/users/:id
   * Update user profile
   *
   * @param req.params.id - User ID
   * @param req.body {firstName?, lastName?, phoneNum?, identityNum?}
   * @returns {profile: UserProfileDTO}
   */
  updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const data: UpdateProfileRequestDTO = req.body;

      // Authorization check
      if (req.user && req.user.profileId !== id) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only update your own profile',
        });
        return;
      }

      // Validate at least one field is provided
      if (!data.firstName && !data.lastName && !data.phoneNum && !data.identityNum) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'At least one field must be provided for update',
        });
        return;
      }

      const result = await usersService.updateProfile(id, data);

      logger.info({ userId: id, fields: Object.keys(data) }, 'Profile updated successfully');

      res.status(200).json(result); // 200 OK (sync operation)
    } catch (error) {
      logger.error({ error, userId: req.params.id }, 'Failed to update user profile');

      if ((error as Error).message === 'User not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update user profile',
      });
    }
  };

  /**
   * POST /api/v1/users/:id/kyc
   * Submit KYC verification request
   *
   * @param req.params.id - User ID
   * @param req.body {evidenceHash, evidenceSize, evidenceMime}
   * @returns {kycRecord: KYCStatusDTO}
   */
  submitKYC = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const data: SubmitKYCRequestDTO = req.body;

      // Authorization check
      if (req.user && req.user.profileId !== id) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only submit KYC for your own account',
        });
        return;
      }

      // Validate required fields
      if (!data.evidenceHash || !data.evidenceSize || !data.evidenceMime) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Evidence hash, size, and MIME type are required',
        });
        return;
      }

      const result = await usersService.submitKYC(id, data);

      logger.info({ kycId: result.kycRecord.kycId, userId: id }, 'KYC verification record created');

      res.status(201).json(result); // 201 Created (sync operation)
    } catch (error) {
      logger.error({ error, userId: req.params.id }, 'Failed to submit KYC');

      if ((error as Error).message === 'User not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
        return;
      }

      if ((error as Error).message === 'KYC already approved') {
        res.status(409).json({
          error: 'Conflict',
          message: 'KYC already approved',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to submit KYC',
      });
    }
  };

  /**
   * GET /api/v1/users/:id/kyc
   * Get KYC verification status
   * 
   * @param req.params.id - User ID
   * @returns {kycStatus: KYCStatusDTO | null}
   */
  getKYCStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Authorization check
      if (req.user && req.user.profileId !== id) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only view your own KYC status',
        });
        return;
      }

      const kycStatus = await usersService.getKYCStatus(id);

      res.status(200).json({ kycStatus });
    } catch (error) {
      logger.error({ error, userId: req.params.id }, 'Failed to fetch KYC status');
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch KYC status',
      });
    }
  };
}

export const usersController = new UsersController();
