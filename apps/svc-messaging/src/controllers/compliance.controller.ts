import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { complianceService } from '../services/compliance.service';
import { DecryptionRequestDTO } from '../types/dtos';

class ComplianceController {
  /**
   * Request decryption of messages
   */
  requestDecryption = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.headers['x-admin-id'] as string;
      const body = req.body as DecryptionRequestDTO;

      const request = await complianceService.createDecryptionRequest(adminId, body);

      res.status(201).json({
        success: true,
        data: request,
        message: 'Decryption request created, awaiting approval',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create decryption request');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create decryption request',
      });
    }
  };

  /**
   * List pending decryption requests
   */
  listRequests = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const status = req.query.status as string;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await complianceService.listRequests({ status, limit, offset });

      res.status(200).json({
        success: true,
        data: result.requests,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list decryption requests');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list decryption requests',
      });
    }
  };

  /**
   * Get specific decryption request
   */
  getRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { requestId } = req.params;

      const request = await complianceService.getRequest(requestId);

      if (!request) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Decryption request not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: request,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get decryption request');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get decryption request',
      });
    }
  };

  /**
   * Approve decryption request
   */
  approveRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { requestId } = req.params;
      const adminId = req.headers['x-admin-id'] as string;

      const request = await complianceService.approveRequest(requestId, adminId);

      res.status(200).json({
        success: true,
        data: request,
        message: 'Decryption request approved',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to approve decryption request');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to approve decryption request',
      });
    }
  };

  /**
   * Reject decryption request
   */
  rejectRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { requestId } = req.params;
      const adminId = req.headers['x-admin-id'] as string;
      const { reason } = req.body;

      const request = await complianceService.rejectRequest(requestId, adminId, reason);

      res.status(200).json({
        success: true,
        data: request,
        message: 'Decryption request rejected',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to reject decryption request');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to reject decryption request',
      });
    }
  };

  /**
   * Execute approved decryption
   */
  executeDecryption = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { requestId } = req.params;
      const adminId = req.headers['x-admin-id'] as string;

      const result = await complianceService.executeDecryption(requestId, adminId);

      res.status(200).json({
        success: true,
        data: result,
        message: `Decrypted ${result.messagesDecrypted} messages`,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to execute decryption');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to execute decryption',
      });
    }
  };

  /**
   * Get compliance audit log
   */
  getAuditLog = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const result = await complianceService.getAuditLog({ limit, offset, startDate, endDate });

      res.status(200).json({
        success: true,
        data: result.audits,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get audit log');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get audit log',
      });
    }
  };

  /**
   * Get compliance statistics
   */
  getStats = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const stats = await complianceService.getStats();

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get compliance stats');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get compliance stats',
      });
    }
  };
}

export const complianceController = new ComplianceController();
