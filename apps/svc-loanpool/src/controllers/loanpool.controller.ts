import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { loanPoolService } from '../services/loanpool.service';
import type {
  AuthenticatedRequest,
  ApplyForLoanRequestDTO,
  ApproveLoanRequestDTO,
} from '../types/dtos';

class LoanPoolController {
  /**
   * POST /api/v1/loans
   * Apply for a loan
   */
  applyForLoan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data: ApplyForLoanRequestDTO = req.body;

      if (!data.borrowerId || !data.amount || !data.collateralHash) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'borrowerId, amount, and collateralHash are required',
        });
        return;
      }

      // Authorization: users can only apply for loans for themselves
      if (req.user && req.user.profileId !== data.borrowerId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only apply for loans for yourself',
        });
        return;
      }

      if (data.amount <= 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Amount must be greater than 0',
        });
        return;
      }

      const result = await loanPoolService.applyForLoan(data);

      logger.info({ commandId: result.commandId, loanId: result.loanId }, 'Loan application initiated');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error }, 'Loan application failed');

      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'Loan application failed',
      });
    }
  };

  /**
   * POST /api/v1/loans/:loanId/approve
   * Approve loan (admin only)
   */
  approveLoan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { loanId } = req.params;

      if (!loanId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'loanId is required',
        });
        return;
      }

      // TODO: Check admin role

      const data: ApproveLoanRequestDTO = { loanId };
      const result = await loanPoolService.approveLoan(data);

      logger.info({ commandId: result.commandId, loanId }, 'Loan approval initiated');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error, loanId: req.params.loanId }, 'Loan approval failed');

      if ((error as Error).message === 'Loan not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'Loan not found',
        });
        return;
      }

      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'Loan approval failed',
      });
    }
  };

  /**
   * GET /api/v1/users/:borrowerId/loans
   * Get user's loans
   */
  getUserLoans = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { borrowerId } = req.params;

      if (!borrowerId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'borrowerId is required',
        });
        return;
      }

      // Authorization: users can only view their own loans
      if (req.user && req.user.profileId !== borrowerId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only view your own loans',
        });
        return;
      }

      const loans = await loanPoolService.getUserLoans(borrowerId);

      res.status(200).json({ loans });
    } catch (error) {
      logger.error({ error, borrowerId: req.params.borrowerId }, 'Failed to fetch user loans');

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch loans',
      });
    }
  };

  /**
   * GET /api/v1/loans/:loanId
   * Get specific loan details
   */
  getLoan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { loanId } = req.params;

      if (!loanId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'loanId is required',
        });
        return;
      }

      const loan = await loanPoolService.getLoan(loanId);

      // Authorization: users can only view their own loans (unless admin)
      if (req.user && req.user.profileId !== loan.borrowerId) {
        // TODO: Allow admins to view any loan
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only view your own loans',
        });
        return;
      }

      res.status(200).json({ loan });
    } catch (error) {
      logger.error({ error, loanId: req.params.loanId }, 'Failed to fetch loan');

      if ((error as Error).message === 'Loan not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'Loan not found',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch loan',
      });
    }
  };
}

export const loanPoolController = new LoanPoolController();
