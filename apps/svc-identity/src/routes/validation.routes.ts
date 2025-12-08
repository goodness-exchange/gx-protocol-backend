import { Router } from 'express';
import { usersController } from '../controllers/users.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { moderateRateLimiter } from '@gx/core-http';

/**
 * Validation Routes
 *
 * Endpoints for real-time validation checks during KYR/KYC submission.
 * These are lightweight checks to improve UX by validating data before submission.
 */

const router = Router();

/**
 * POST /api/v1/validation/national-id
 * Check if a National ID number is already registered
 * Requires authentication (user must be logged in)
 * Rate limited: 60 requests per minute per IP
 *
 * @body {nationalIdNumber: string, countryCode: string}
 * @returns {isAvailable: boolean, message: string}
 */
router.post(
  '/national-id',
  moderateRateLimiter,
  authenticateJWT,
  usersController.checkNationalIdAvailability
);

export default router;
