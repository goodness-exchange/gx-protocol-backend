/**
 * Entity Accounts Controller
 * Handles Business, Government, and NPO account management requests
 */

import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { entityAccountsService } from '../services/entity-accounts.service';
import type { AuthenticatedRequest } from '../types/dtos';

class EntityAccountsController {
  // ============================================
  // Business Accounts
  // ============================================

  /**
   * List business accounts
   * GET /api/v1/admin/business-accounts
   */
  listBusinessAccounts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { page = '1', limit = '20', search } = req.query;

      const result = await entityAccountsService.listBusinessAccounts({
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        search: search as string | undefined,
      });

      res.json(result);
    } catch (error) {
      logger.error({ error }, 'List business accounts failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get single business account
   * GET /api/v1/admin/business-accounts/:id
   */
  getBusinessAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const account = await entityAccountsService.getBusinessAccount(id);
      res.json({ account });
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get business account failed');
      res.status(404).json({
        error: 'Not Found',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get business account dashboard
   * GET /api/v1/admin/business-accounts/:id/dashboard
   */
  getBusinessDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await entityAccountsService.getBusinessDashboard(id);
      res.json(result);
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get business dashboard failed');
      res.status(404).json({
        error: 'Not Found',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get business sub-accounts
   * GET /api/v1/admin/business-accounts/:id/sub-accounts
   */
  getBusinessSubAccounts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await entityAccountsService.getBusinessSubAccounts(id);
      res.json(result);
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get business sub-accounts failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get business employees
   * GET /api/v1/admin/business-accounts/:id/employees
   */
  getBusinessEmployees = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await entityAccountsService.getBusinessEmployees(id);
      res.json(result);
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get business employees failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  // ============================================
  // Government Accounts
  // ============================================

  /**
   * List government accounts
   * GET /api/v1/admin/government-accounts
   */
  listGovernmentAccounts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { page = '1', limit = '20', search, agencyLevel } = req.query;

      const result = await entityAccountsService.listGovernmentAccounts({
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        search: search as string | undefined,
        agencyLevel: agencyLevel as string | undefined,
      });

      res.json(result);
    } catch (error) {
      logger.error({ error }, 'List government accounts failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get single government account
   * GET /api/v1/admin/government-accounts/:id
   */
  getGovernmentAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const account = await entityAccountsService.getGovernmentAccount(id);
      res.json({ account });
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get government account failed');
      res.status(404).json({
        error: 'Not Found',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get government account dashboard
   * GET /api/v1/admin/government-accounts/:id/dashboard
   */
  getGovernmentDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await entityAccountsService.getGovernmentDashboard(id);
      res.json(result);
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get government dashboard failed');
      res.status(404).json({
        error: 'Not Found',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get government signatories
   * GET /api/v1/admin/government-accounts/:id/signatories
   */
  getGovernmentSignatories = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await entityAccountsService.getGovernmentSignatories(id);
      res.json(result);
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get government signatories failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get government approvals
   * GET /api/v1/admin/government-accounts/:id/approvals
   */
  getGovernmentApprovals = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { status } = req.query;
      const result = await entityAccountsService.getGovernmentApprovals(
        id,
        status as string | undefined
      );
      res.json(result);
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get government approvals failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get government sub-accounts
   * GET /api/v1/admin/government-accounts/:id/sub-accounts
   */
  getGovernmentSubAccounts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await entityAccountsService.getGovernmentSubAccounts(id);
      res.json(result);
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get government sub-accounts failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  // ============================================
  // NPO Accounts
  // ============================================

  /**
   * List NPO accounts
   * GET /api/v1/admin/npo-accounts
   */
  listNPOAccounts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { page = '1', limit = '20', search, category } = req.query;

      const result = await entityAccountsService.listNPOAccounts({
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        search: search as string | undefined,
        category: category as string | undefined,
      });

      res.json(result);
    } catch (error) {
      logger.error({ error }, 'List NPO accounts failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get single NPO account
   * GET /api/v1/admin/npo-accounts/:id
   */
  getNPOAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const account = await entityAccountsService.getNPOAccount(id);
      res.json({ account });
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get NPO account failed');
      res.status(404).json({
        error: 'Not Found',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get NPO account dashboard
   * GET /api/v1/admin/npo-accounts/:id/dashboard
   */
  getNPODashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await entityAccountsService.getNPODashboard(id);
      res.json(result);
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get NPO dashboard failed');
      res.status(404).json({
        error: 'Not Found',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get NPO signatories
   * GET /api/v1/admin/npo-accounts/:id/signatories
   */
  getNPOSignatories = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await entityAccountsService.getNPOSignatories(id);
      res.json(result);
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get NPO signatories failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get NPO programs
   * GET /api/v1/admin/npo-accounts/:id/programs
   */
  getNPOPrograms = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await entityAccountsService.getNPOPrograms(id);
      res.json(result);
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get NPO programs failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get NPO donations
   * GET /api/v1/admin/npo-accounts/:id/donations
   */
  getNPODonations = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await entityAccountsService.getNPODonations(id);
      res.json(result);
    } catch (error) {
      logger.error({ error, id: req.params.id }, 'Get NPO donations failed');
      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message,
      });
    }
  };
}

export const entityAccountsController = new EntityAccountsController();
