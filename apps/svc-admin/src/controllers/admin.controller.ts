import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { adminService } from '../services/admin.service';
import { supplyService } from '../services/supply.service';
import type { AuthenticatedRequest } from '../types/dtos';

class AdminController {
  bootstrapSystem = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = await adminService.bootstrapSystem();
      logger.info({ commandId: result.commandId }, 'Bootstrap initiated');
      res.status(202).json(result);
    } catch (error) {
      logger.error({ error }, 'Bootstrap failed');
      res.status(400).json({ error: 'Bad Request', message: (error as Error).message });
    }
  };

  initializeCountryData = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = await adminService.initializeCountryData(req.body);
      res.status(202).json(result);
    } catch (error) {
      res.status(400).json({ error: 'Bad Request', message: (error as Error).message });
    }
  };

  updateSystemParameter = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = await adminService.updateSystemParameter(req.body);
      res.status(202).json(result);
    } catch (error) {
      res.status(400).json({ error: 'Bad Request', message: (error as Error).message });
    }
  };

  pauseSystem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = await adminService.pauseSystem(req.body);
      res.status(202).json(result);
    } catch (error) {
      res.status(400).json({ error: 'Bad Request', message: (error as Error).message });
    }
  };

  resumeSystem = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = await adminService.resumeSystem();
      res.status(202).json(result);
    } catch (error) {
      res.status(400).json({ error: 'Bad Request', message: (error as Error).message });
    }
  };

  appointAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = await adminService.appointAdmin(req.body);
      res.status(202).json(result);
    } catch (error) {
      res.status(400).json({ error: 'Bad Request', message: (error as Error).message });
    }
  };

  activateTreasury = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = await adminService.activateTreasury(req.body);
      res.status(202).json(result);
    } catch (error) {
      res.status(400).json({ error: 'Bad Request', message: (error as Error).message });
    }
  };

  getSystemStatus = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const status = await adminService.getSystemStatus();
      res.status(200).json({ status });
    } catch (error) {
      res.status(500).json({ error: 'Internal Server Error', message: (error as Error).message });
    }
  };

  getSystemParameter = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const param = await adminService.getSystemParameter(req.params.paramId);
      res.status(200).json({ parameter: param });
    } catch (error) {
      res.status(404).json({ error: 'Not Found', message: (error as Error).message });
    }
  };

  getCountryStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const stats = await adminService.getCountryStats(req.params.countryCode);
      res.status(200).json({ stats });
    } catch (error) {
      res.status(404).json({ error: 'Not Found', message: (error as Error).message });
    }
  };

  listAllCountries = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const countries = await adminService.listAllCountries();
      res.status(200).json({ countries });
    } catch (error) {
      res.status(500).json({ error: 'Internal Server Error', message: (error as Error).message });
    }
  };

  getGlobalCounters = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const counters = await adminService.getGlobalCounters();
      res.status(200).json({ counters });
    } catch (error) {
      res.status(500).json({ error: 'Internal Server Error', message: (error as Error).message });
    }
  };

  listAdmins = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { role, isActive, page, limit, search } = req.query;
      const result = await adminService.listAdmins({
        role: role as string | undefined,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        search: search as string | undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      logger.error({ error }, 'Failed to list admins');
      res.status(500).json({ error: 'Internal Server Error', message: (error as Error).message });
    }
  };

  getAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const admin = await adminService.getAdminById(req.params.adminId);
      res.status(200).json(admin);
    } catch (error) {
      res.status(404).json({ error: 'Not Found', message: (error as Error).message });
    }
  };

  /**
   * Get supply status from blockchain
   * Queries TokenomicsContract:GetSupplyStatus
   */
  getSupplyStatus = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const supplyStatus = await supplyService.getSupplyStatus();
      res.status(200).json({ supply: supplyStatus });
    } catch (error) {
      logger.error({ error }, 'Failed to get supply status');
      res.status(500).json({ error: 'Internal Server Error', message: (error as Error).message });
    }
  };

  /**
   * Get specific pool status from blockchain
   */
  getPoolStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { poolId } = req.params;
      const poolStatus = await supplyService.getPoolStatus(poolId);

      if (!poolStatus) {
        res.status(404).json({ error: 'Not Found', message: `Pool ${poolId} not found` });
        return;
      }

      res.status(200).json({ pool: poolStatus });
    } catch (error) {
      logger.error({ error }, 'Failed to get pool status');
      res.status(500).json({ error: 'Internal Server Error', message: (error as Error).message });
    }
  };

  /**
   * Get public supply information (for transparency)
   * No authentication required - will be routed through public routes
   */
  getPublicSupply = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const publicSupply = await supplyService.getPublicSupply();
      res.status(200).json(publicSupply);
    } catch (error) {
      logger.error({ error }, 'Failed to get public supply');
      res.status(500).json({ error: 'Internal Server Error', message: (error as Error).message });
    }
  };

  /**
   * Get country allocations for supply management
   * Returns per-country phase allocation tracking data
   */
  getSupplyCountries = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const countries = await adminService.getCountryAllocations();
      res.status(200).json({ countries });
    } catch (error) {
      logger.error({ error }, 'Failed to get country allocations');
      res.status(500).json({ error: 'Internal Server Error', message: (error as Error).message });
    }
  };
}

export const adminController = new AdminController();
