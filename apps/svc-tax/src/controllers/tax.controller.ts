import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { taxService } from '../services/tax.service';
import type { AuthenticatedRequest } from '../types/dtos';

class TaxController {
  calculateFee = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = await taxService.calculateFee(req.body);
      res.status(200).json(result);
    } catch (error) {
      logger.error({ error }, 'Fee calculation failed');
      res.status(400).json({ error: 'Bad Request', message: (error as Error).message });
    }
  };

  applyVelocityTax = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = await taxService.applyVelocityTax(req.body);
      res.status(202).json(result);
    } catch (error) {
      logger.error({ error }, 'Velocity tax application failed');
      res.status(400).json({ error: 'Bad Request', message: (error as Error).message });
    }
  };

  checkEligibility = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { accountId } = req.params;
      const result = await taxService.checkEligibility(accountId);
      res.status(200).json(result);
    } catch (error) {
      logger.error({ error }, 'Eligibility check failed');
      res.status(500).json({ error: 'Internal Server Error', message: (error as Error).message });
    }
  };
}

export const taxController = new TaxController();
