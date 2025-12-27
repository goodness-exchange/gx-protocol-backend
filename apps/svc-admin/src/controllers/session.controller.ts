import { Request, Response, NextFunction } from 'express';
import { sessionService } from '../services/session.service';
import type { SessionStatus } from '../types/session.types';

/**
 * Session Controller
 * HTTP handlers for session and device management endpoints
 */
class SessionController {
  /**
   * Query user sessions with filters
   * GET /api/v1/admin/sessions/users
   */
  async queryUserSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { profileId, status, deviceId, startDate, endDate, page = '1', limit = '50' } = req.query;

      const result = await sessionService.queryUserSessions({
        profileId: profileId as string,
        status: status as SessionStatus,
        deviceId: deviceId as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        page: parseInt(page as string, 10),
        limit: Math.min(parseInt(limit as string, 10), 100),
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get sessions for a specific user
   * GET /api/v1/admin/sessions/users/:profileId
   */
  async getUserSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { profileId } = req.params;
      const { includeRevoked, page = '1', limit = '50' } = req.query;

      const result = await sessionService.getUserSessions(profileId, {
        includeRevoked: includeRevoked === 'true',
        page: parseInt(page as string, 10),
        limit: Math.min(parseInt(limit as string, 10), 100),
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user session summary
   * GET /api/v1/admin/sessions/users/:profileId/summary
   */
  async getUserSessionSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { profileId } = req.params;
      const summary = await sessionService.getUserSessionSummary(profileId);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Revoke a user session
   * DELETE /api/v1/admin/sessions/users/:sessionId
   */
  async revokeUserSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { reason } = req.body;
      const adminId = (req as any).admin?.adminId;

      await sessionService.revokeUserSession(sessionId, reason, adminId);
      res.json({ success: true, message: 'Session revoked' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Revoke all sessions for a user
   * DELETE /api/v1/admin/sessions/users/:profileId/all
   */
  async revokeAllUserSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { profileId } = req.params;
      const { reason } = req.body;
      const adminId = (req as any).admin?.adminId;

      const count = await sessionService.revokeAllUserSessions(profileId, reason, adminId);
      res.json({ success: true, message: `${count} sessions revoked` });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Query admin sessions with filters
   * GET /api/v1/admin/sessions/admins
   */
  async queryAdminSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { adminId, includeRevoked, startDate, endDate, page = '1', limit = '50' } = req.query;

      const result = await sessionService.queryAdminSessions({
        adminId: adminId as string,
        includeRevoked: includeRevoked === 'true',
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        page: parseInt(page as string, 10),
        limit: Math.min(parseInt(limit as string, 10), 100),
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get admin session summary
   * GET /api/v1/admin/sessions/admins/:adminId/summary
   */
  async getAdminSessionSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { adminId } = req.params;
      const summary = await sessionService.getAdminSessionSummary(adminId);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Query trusted devices with filters
   * GET /api/v1/admin/devices
   */
  async queryDevices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { profileId, isTrusted, startDate, endDate, page = '1', limit = '50' } = req.query;

      const result = await sessionService.queryDevices({
        profileId: profileId as string,
        isTrusted: isTrusted !== undefined ? isTrusted === 'true' : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        page: parseInt(page as string, 10),
        limit: Math.min(parseInt(limit as string, 10), 100),
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get devices for a specific user
   * GET /api/v1/admin/devices/users/:profileId
   */
  async getUserDevices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { profileId } = req.params;
      const { isTrusted, page = '1', limit = '50' } = req.query;

      const result = await sessionService.getUserDevices(profileId, {
        isTrusted: isTrusted !== undefined ? isTrusted === 'true' : undefined,
        page: parseInt(page as string, 10),
        limit: Math.min(parseInt(limit as string, 10), 100),
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update device trust status
   * PATCH /api/v1/admin/devices/:deviceId/trust
   */
  async updateDeviceTrust(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { deviceId } = req.params;
      const { trusted } = req.body;
      const adminId = (req as any).admin?.adminId;

      if (typeof trusted !== 'boolean') {
        res.status(400).json({ error: 'Bad Request', message: 'trusted must be a boolean' });
        return;
      }

      await sessionService.updateDeviceTrust(deviceId, trusted, adminId);
      res.json({ success: true, message: `Device ${trusted ? 'trusted' : 'untrusted'}` });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove a device
   * DELETE /api/v1/admin/devices/:deviceId
   */
  async removeDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { deviceId } = req.params;
      const adminId = (req as any).admin?.adminId;

      await sessionService.removeDevice(deviceId, adminId);
      res.json({ success: true, message: 'Device removed' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get session activity statistics
   * GET /api/v1/admin/sessions/stats
   */
  async getSessionStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'startDate and endDate query parameters are required',
        });
        return;
      }

      const stats = await sessionService.getSessionStats(
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
}

export const sessionController = new SessionController();
