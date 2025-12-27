import { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service';
import { AUDIT_EVENT_DISPLAY, type AuditEventType } from '../types/audit.types';

/**
 * Audit Controller
 * HTTP handlers for audit log endpoints
 */
class AuditController {
  /**
   * Query audit logs with filters
   * GET /api/v1/admin/audit/logs
   */
  async queryLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        profileId,
        actorId,
        eventType,
        startDate,
        endDate,
        resourceType,
        resourceId,
        page = '1',
        limit = '50',
      } = req.query;

      // Parse event types if provided
      let parsedEventTypes: AuditEventType | AuditEventType[] | undefined;
      if (eventType) {
        if (typeof eventType === 'string') {
          if (eventType.includes(',')) {
            parsedEventTypes = eventType.split(',') as AuditEventType[];
          } else {
            parsedEventTypes = eventType as AuditEventType;
          }
        }
      }

      const result = await auditService.queryAuditLogs({
        profileId: profileId as string,
        actorId: actorId as string,
        eventType: parsedEventTypes,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        resourceType: resourceType as string,
        resourceId: resourceId as string,
        page: parseInt(page as string, 10),
        limit: Math.min(parseInt(limit as string, 10), 100), // Cap at 100
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get audit logs for a specific user
   * GET /api/v1/admin/audit/users/:profileId
   */
  async getUserLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const { profileId } = req.params;
      const { page = '1', limit = '50', eventTypes } = req.query;

      let parsedEventTypes: AuditEventType[] | undefined;
      if (eventTypes && typeof eventTypes === 'string') {
        parsedEventTypes = eventTypes.split(',') as AuditEventType[];
      }

      const result = await auditService.getUserAuditLogs(profileId, {
        page: parseInt(page as string, 10),
        limit: Math.min(parseInt(limit as string, 10), 100),
        eventTypes: parsedEventTypes,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user activity summary
   * GET /api/v1/admin/audit/users/:profileId/summary
   */
  async getUserSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { profileId } = req.params;
      const summary = await auditService.getUserActivitySummary(profileId);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get audit logs performed by an admin
   * GET /api/v1/admin/audit/admins/:adminId
   */
  async getAdminLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const { adminId } = req.params;
      const { page = '1', limit = '50', eventTypes } = req.query;

      let parsedEventTypes: AuditEventType[] | undefined;
      if (eventTypes && typeof eventTypes === 'string') {
        parsedEventTypes = eventTypes.split(',') as AuditEventType[];
      }

      const result = await auditService.getAdminAuditLogs(adminId, {
        page: parseInt(page as string, 10),
        limit: Math.min(parseInt(limit as string, 10), 100),
        eventTypes: parsedEventTypes,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get admin activity summary
   * GET /api/v1/admin/audit/admins/:adminId/summary
   */
  async getAdminSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { adminId } = req.params;
      const summary = await auditService.getAdminActivitySummary(adminId);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get recent activity across all users
   * GET /api/v1/admin/audit/recent
   */
  async getRecentActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const { limit = '20', eventTypes } = req.query;

      let parsedEventTypes: AuditEventType[] | undefined;
      if (eventTypes && typeof eventTypes === 'string') {
        parsedEventTypes = eventTypes.split(',') as AuditEventType[];
      }

      const result = await auditService.getRecentActivity({
        limit: Math.min(parseInt(limit as string, 10), 100),
        eventTypes: parsedEventTypes,
      });

      res.json({ logs: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get activity statistics for a date range
   * GET /api/v1/admin/audit/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'startDate and endDate query parameters are required',
        });
        return;
      }

      const stats = await auditService.getActivityStats(
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get available event types for filtering
   * GET /api/v1/admin/audit/event-types
   */
  async getEventTypes(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Return all available event types with their display config
      const eventTypes = Object.entries(AUDIT_EVENT_DISPLAY).map(
        ([type, config]) => ({
          type,
          label: config.label,
          category: config.category,
          severity: config.severity,
        })
      );

      res.json({ eventTypes });
    } catch (error) {
      next(error);
    }
  }
}

export const auditController = new AuditController();
