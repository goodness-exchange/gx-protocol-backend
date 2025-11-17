import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { strictRateLimiter } from '@gx/core-http';

/**
 * Authentication Routes
 *
 * Handles user authentication, login, logout, and token refresh.
 * All write operations use the CQRS outbox pattern.
 */

const router = Router();

/**
 * POST /api/v1/auth/login
 * User login endpoint
 * Rate limited: 5 requests per minute per IP (brute force protection)
 *
 * @body {email: string, password: string}
 * @returns {accessToken: string, refreshToken: string, user: UserProfile}
 */
router.post('/login', strictRateLimiter, authController.login);

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 * 
 * @body {refreshToken: string}
 * @returns {accessToken: string}
 */
router.post('/refresh', authController.refresh);

/**
 * POST /api/v1/auth/logout
 * User logout endpoint
 * Invalidates the refresh token
 * 
 * @body {refreshToken: string}
 * @returns {message: string}
 */
router.post('/logout', authController.logout);

export default router;
