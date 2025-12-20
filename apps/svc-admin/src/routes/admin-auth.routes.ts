import { Router } from 'express';
import { adminAuthController } from '../controllers/admin-auth.controller';
import { authenticateAdminJWT } from '../middlewares/admin-auth.middleware';

const router = Router();

// ============================================================================
// Public Routes (No Authentication Required)
// ============================================================================

/**
 * POST /auth/login
 * Authenticate admin user with username/email and password
 * Returns tokens or MFA challenge if MFA is enabled
 */
router.post('/login', adminAuthController.login);

/**
 * POST /auth/mfa/verify
 * Verify MFA code and complete login
 * Called after login returns requiresMfa: true
 */
router.post('/mfa/verify', adminAuthController.verifyMfa);

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 * No JWT required, uses refresh token from body
 */
router.post('/refresh', adminAuthController.refreshToken);

// ============================================================================
// Protected Routes (Authentication Required)
// ============================================================================

/**
 * POST /auth/logout
 * Logout current session
 */
router.post('/logout', authenticateAdminJWT, adminAuthController.logout);

/**
 * POST /auth/logout-all
 * Logout all sessions except current
 */
router.post('/logout-all', authenticateAdminJWT, adminAuthController.logoutAll);

/**
 * GET /auth/sessions
 * Get list of active sessions for current admin
 */
router.get('/sessions', authenticateAdminJWT, adminAuthController.getSessions);

/**
 * DELETE /auth/sessions/:sessionId
 * Revoke a specific session
 */
router.delete('/sessions/:sessionId', authenticateAdminJWT, adminAuthController.revokeSession);

/**
 * POST /auth/password/change
 * Change password for current admin
 */
router.post('/password/change', authenticateAdminJWT, adminAuthController.changePassword);

/**
 * GET /auth/profile
 * Get current admin profile with permissions
 */
router.get('/profile', authenticateAdminJWT, adminAuthController.getProfile);

// ============================================================================
// MFA Management Routes (Authentication Required)
// ============================================================================

/**
 * POST /auth/mfa/setup
 * Setup MFA - generates TOTP secret and QR code
 * Does not enable MFA until verified
 */
router.post('/mfa/setup', authenticateAdminJWT, adminAuthController.setupMfa);

/**
 * POST /auth/mfa/enable
 * Enable MFA after verifying the code
 * Returns backup codes
 */
router.post('/mfa/enable', authenticateAdminJWT, adminAuthController.enableMfa);

/**
 * POST /auth/mfa/disable
 * Disable MFA (requires password and current MFA code)
 */
router.post('/mfa/disable', authenticateAdminJWT, adminAuthController.disableMfa);

export default router;
