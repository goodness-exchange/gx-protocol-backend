import { Request, Response } from 'express';
import { logger } from '@gx/core-logger';
import { adminAuthService } from '../services/admin-auth.service';
import {
  AdminAuthenticatedRequest,
  AdminLoginRequestDTO,
  AdminMfaVerifyRequestDTO,
  AdminPasswordChangeRequestDTO,
  AdminMfaEnableRequestDTO,
  AdminAuthErrorCode,
} from '../types/admin-auth.types';

// ============================================================================
// Helper Functions
// ============================================================================

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function getUserAgent(req: Request): string {
  return req.headers['user-agent'] || 'unknown';
}

function handleAuthError(error: unknown, res: Response): void {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const authError = error as { code: AdminAuthErrorCode; message: string };

    switch (authError.code) {
      case AdminAuthErrorCode.INVALID_CREDENTIALS:
        res.status(401).json({ error: 'Unauthorized', code: authError.code, message: authError.message });
        return;
      case AdminAuthErrorCode.ACCOUNT_LOCKED:
        res.status(403).json({ error: 'Forbidden', code: authError.code, message: authError.message });
        return;
      case AdminAuthErrorCode.ACCOUNT_DISABLED:
        res.status(403).json({ error: 'Forbidden', code: authError.code, message: authError.message });
        return;
      case AdminAuthErrorCode.MFA_REQUIRED:
        res.status(401).json({ error: 'MFA Required', code: authError.code, message: authError.message });
        return;
      case AdminAuthErrorCode.MFA_INVALID:
        res.status(401).json({ error: 'Unauthorized', code: authError.code, message: authError.message });
        return;
      case AdminAuthErrorCode.SESSION_EXPIRED:
      case AdminAuthErrorCode.SESSION_REVOKED:
      case AdminAuthErrorCode.IDLE_TIMEOUT:
        res.status(401).json({ error: 'Session Invalid', code: authError.code, message: authError.message });
        return;
      case AdminAuthErrorCode.PASSWORD_POLICY_VIOLATION:
        res.status(400).json({ error: 'Bad Request', code: authError.code, message: authError.message });
        return;
      default:
        res.status(400).json({ error: 'Bad Request', code: authError.code, message: authError.message });
        return;
    }
  }

  logger.error({ error }, 'Admin auth error');
  res.status(500).json({ error: 'Internal Server Error', message: 'An unexpected error occurred' });
}

// ============================================================================
// Admin Auth Controller
// ============================================================================

class AdminAuthController {
  /**
   * POST /auth/login
   * Authenticate admin user
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const dto: AdminLoginRequestDTO = req.body;

      if (!dto.username || !dto.password) {
        res.status(400).json({ error: 'Bad Request', message: 'Username and password are required' });
        return;
      }

      const result = await adminAuthService.login(dto, getClientIp(req), getUserAgent(req));

      logger.info({ username: dto.username, requiresMfa: result.requiresMfa }, 'Admin login attempt');
      res.status(200).json(result);
    } catch (error) {
      handleAuthError(error, res);
    }
  };

  /**
   * POST /auth/mfa/verify
   * Verify MFA code and complete login
   */
  verifyMfa = async (req: Request, res: Response): Promise<void> => {
    try {
      const dto: AdminMfaVerifyRequestDTO = req.body;

      if (!dto.mfaToken || !dto.code) {
        res.status(400).json({ error: 'Bad Request', message: 'MFA token and code are required' });
        return;
      }

      const result = await adminAuthService.verifyMfa(dto, getClientIp(req), getUserAgent(req));

      res.status(200).json(result);
    } catch (error) {
      handleAuthError(error, res);
    }
  };

  /**
   * POST /auth/refresh
   * Refresh access token
   */
  refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({ error: 'Bad Request', message: 'Refresh token is required' });
        return;
      }

      const result = await adminAuthService.refreshToken(refreshToken, getClientIp(req), getUserAgent(req));

      res.status(200).json(result);
    } catch (error) {
      handleAuthError(error, res);
    }
  };

  /**
   * POST /auth/logout
   * Logout current session
   */
  logout = async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.admin) {
        res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
        return;
      }

      await adminAuthService.logout(
        req.admin.sessionId,
        req.admin.adminId,
        getClientIp(req),
        getUserAgent(req)
      );

      res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      handleAuthError(error, res);
    }
  };

  /**
   * POST /auth/logout-all
   * Logout all sessions except current
   */
  logoutAll = async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.admin) {
        res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
        return;
      }

      const count = await adminAuthService.logoutAllSessions(
        req.admin.adminId,
        req.admin.sessionId,
        getClientIp(req),
        getUserAgent(req)
      );

      res.status(200).json({ success: true, message: `Logged out ${count} other session(s)`, revokedCount: count });
    } catch (error) {
      handleAuthError(error, res);
    }
  };

  /**
   * GET /auth/sessions
   * Get active sessions
   */
  getSessions = async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.admin) {
        res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
        return;
      }

      const sessions = await adminAuthService.getSessions(req.admin.adminId, req.admin.sessionId);

      res.status(200).json({ sessions, total: sessions.length });
    } catch (error) {
      handleAuthError(error, res);
    }
  };

  /**
   * DELETE /auth/sessions/:sessionId
   * Revoke a specific session
   */
  revokeSession = async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.admin) {
        res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
        return;
      }

      const { sessionId } = req.params;

      if (sessionId === req.admin.sessionId) {
        res.status(400).json({ error: 'Bad Request', message: 'Cannot revoke current session. Use logout instead.' });
        return;
      }

      await adminAuthService.revokeSession(
        sessionId,
        req.admin.adminId,
        req.admin.sessionId,
        getClientIp(req),
        getUserAgent(req)
      );

      res.status(200).json({ success: true, message: 'Session revoked' });
    } catch (error) {
      handleAuthError(error, res);
    }
  };

  /**
   * POST /auth/password/change
   * Change password
   */
  changePassword = async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.admin) {
        res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
        return;
      }

      const dto: AdminPasswordChangeRequestDTO = req.body;

      if (!dto.currentPassword || !dto.newPassword || !dto.confirmPassword) {
        res.status(400).json({ error: 'Bad Request', message: 'Current password, new password, and confirmation are required' });
        return;
      }

      const result = await adminAuthService.changePassword(
        req.admin.adminId,
        dto,
        getClientIp(req),
        getUserAgent(req),
        req.admin.sessionId
      );

      res.status(200).json(result);
    } catch (error) {
      handleAuthError(error, res);
    }
  };

  /**
   * POST /auth/mfa/setup
   * Setup MFA (generate TOTP secret and QR code)
   */
  setupMfa = async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.admin) {
        res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
        return;
      }

      const result = await adminAuthService.setupMfa(req.admin.adminId);

      res.status(200).json(result);
    } catch (error) {
      handleAuthError(error, res);
    }
  };

  /**
   * POST /auth/mfa/enable
   * Enable MFA after verification
   */
  enableMfa = async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.admin) {
        res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
        return;
      }

      const dto: AdminMfaEnableRequestDTO = req.body;

      if (!dto.code) {
        res.status(400).json({ error: 'Bad Request', message: 'Verification code is required' });
        return;
      }

      const result = await adminAuthService.enableMfa(
        req.admin.adminId,
        dto,
        getClientIp(req),
        getUserAgent(req),
        req.admin.sessionId
      );

      res.status(200).json(result);
    } catch (error) {
      handleAuthError(error, res);
    }
  };

  /**
   * POST /auth/mfa/disable
   * Disable MFA
   */
  disableMfa = async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.admin) {
        res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
        return;
      }

      const { password, code } = req.body;

      if (!password || !code) {
        res.status(400).json({ error: 'Bad Request', message: 'Password and verification code are required' });
        return;
      }

      await adminAuthService.disableMfa(
        req.admin.adminId,
        password,
        code,
        getClientIp(req),
        getUserAgent(req),
        req.admin.sessionId
      );

      res.status(200).json({ success: true, message: 'MFA disabled successfully' });
    } catch (error) {
      handleAuthError(error, res);
    }
  };

  /**
   * GET /auth/profile
   * Get current admin profile
   */
  getProfile = async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.admin) {
        res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
        return;
      }

      const profile = await adminAuthService.getProfile(req.admin.adminId);

      res.status(200).json(profile);
    } catch (error) {
      handleAuthError(error, res);
    }
  };
}

export const adminAuthController = new AdminAuthController();
