import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { governanceService } from '../services/governance.service';
import type {
  AuthenticatedRequest,
  SubmitProposalRequestDTO,
  VoteOnProposalRequestDTO,
  ExecuteProposalRequestDTO,
} from '../types/dtos';

class GovernanceController {
  submitProposal = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data: SubmitProposalRequestDTO = req.body;

      if (!data.targetParam || !data.newValue || !data.proposerId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'targetParam, newValue, and proposerId are required',
        });
        return;
      }

      if (req.user && req.user.profileId !== data.proposerId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only submit proposals as yourself',
        });
        return;
      }

      const result = await governanceService.submitProposal(data);

      logger.info({ commandId: result.commandId, proposalId: result.proposalId }, 'Proposal submitted');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error }, 'Proposal submission failed');

      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'Proposal submission failed',
      });
    }
  };

  voteOnProposal = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { proposalId } = req.params;
      const { vote } = req.body;

      if (!proposalId || vote === undefined) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'proposalId and vote are required',
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const data: VoteOnProposalRequestDTO = {
        proposalId,
        vote: Boolean(vote),
        voterId: req.user.profileId,
      };

      const result = await governanceService.voteOnProposal(data);

      logger.info({ commandId: result.commandId, proposalId }, 'Vote recorded');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error, proposalId: req.params.proposalId }, 'Vote failed');

      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'Vote failed',
      });
    }
  };

  executeProposal = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { proposalId } = req.params;

      if (!proposalId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'proposalId is required',
        });
        return;
      }

      // TODO: Check admin role

      const data: ExecuteProposalRequestDTO = { proposalId };
      const result = await governanceService.executeProposal(data);

      logger.info({ commandId: result.commandId, proposalId }, 'Proposal execution initiated');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error, proposalId: req.params.proposalId }, 'Proposal execution failed');

      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'Proposal execution failed',
      });
    }
  };

  getProposal = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { proposalId } = req.params;

      if (!proposalId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'proposalId is required',
        });
        return;
      }

      const proposal = await governanceService.getProposal(proposalId);

      res.status(200).json({ proposal });
    } catch (error) {
      logger.error({ error, proposalId: req.params.proposalId }, 'Failed to fetch proposal');

      if ((error as Error).message === 'Proposal not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'Proposal not found',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch proposal',
      });
    }
  };

  listActiveProposals = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const proposals = await governanceService.listActiveProposals();

      res.status(200).json({ proposals });
    } catch (error) {
      logger.error({ error }, 'Failed to list active proposals');

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list active proposals',
      });
    }
  };
}

export const governanceController = new GovernanceController();
