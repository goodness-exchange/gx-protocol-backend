import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { adminService } from '../services/admin.service';
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
}

export const adminController = new AdminController();
