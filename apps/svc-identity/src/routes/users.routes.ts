import { Router } from 'express';
import { usersController } from '../controllers/users.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { strictRateLimiter, moderateRateLimiter } from '@gx/core-http';

/**
 * Users Routes
 *
 * Handles user registration, profile management, and KYC workflows.
 * All write operations use the CQRS outbox pattern.
 */

const router = Router();

/**
 * POST /api/v1/users
 * Register a new user
 * Rate limited: 5 requests per minute per IP (prevent spam registration)
 *
 * @body {email: string, password: string, fullName: string, phone?: string}
 * @returns {user: UserProfile}
 */
router.post('/', strictRateLimiter, usersController.register);

/**
 * GET /api/v1/users/:id
 * Get user profile by ID
 * Requires authentication
 * 
 * @param id - User ID (UUID)
 * @returns {user: UserProfile}
 */
router.get('/:id', authenticateJWT, usersController.getProfile);

/**
 * PATCH /api/v1/users/:id
 * Update user profile
 * Requires authentication
 * 
 * @param id - User ID (UUID)
 * @body {fullName?: string, phone?: string, dateOfBirth?: string}
 * @returns {user: UserProfile}
 */
router.patch('/:id', authenticateJWT, usersController.updateProfile);

/**
 * POST /api/v1/users/:id/kyc
 * Submit KYC verification request
 * Requires authentication
 * Rate limited: 60 requests per minute per IP
 *
 * @param id - User ID (UUID)
 * @body {documentType: string, documentNumber: string, documentImages: string[]}
 * @returns {kycSubmission: KYCVerification}
 */
router.post('/:id/kyc', moderateRateLimiter, authenticateJWT, usersController.submitKYC);

/**
 * GET /api/v1/users/:id/kyc
 * Get KYC verification status
 * Requires authentication
 * 
 * @param id - User ID (UUID)
 * @returns {kycStatus: KYCVerification}
 */
router.get('/:id/kyc', authenticateJWT, usersController.getKYCStatus);

export default router;
