import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import type {
  SubmitProposalRequestDTO,
  VoteOnProposalRequestDTO,
  ExecuteProposalRequestDTO,
  ProposalDTO,
} from '../types/dtos';

class GovernanceService {
  async submitProposal(
    data: SubmitProposalRequestDTO
  ): Promise<{ commandId: string; proposalId: string; message: string }> {
    const { targetParam, newValue, proposerId } = data;

    logger.info({ targetParam, newValue, proposerId }, 'Submitting governance proposal');

    const proposalId = `proposal-${targetParam}-${Date.now()}`;

    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-governance',
        requestId: proposalId,
        commandType: 'SUBMIT_PROPOSAL',
        payload: {
          targetParam,
          newValue,
          proposerId,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id, proposalId }, 'Proposal submission command created');

    return {
      commandId: command.id,
      proposalId,
      message: 'Proposal submitted. Voting period started.',
    };
  }

  async voteOnProposal(
    data: VoteOnProposalRequestDTO
  ): Promise<{ commandId: string; message: string }> {
    const { proposalId, vote, voterId } = data;

    logger.info({ proposalId, vote, voterId }, 'Voting on proposal');

    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-governance',
        requestId: `vote-${proposalId}-${voterId}-${Date.now()}`,
        commandType: 'CAST_VOTE',
        payload: {
          proposalId,
          vote,
          voterId,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id }, 'Vote command created');

    return {
      commandId: command.id,
      message: 'Vote recorded.',
    };
  }

  async executeProposal(
    data: ExecuteProposalRequestDTO
  ): Promise<{ commandId: string; message: string }> {
    const { proposalId } = data;

    logger.info({ proposalId }, 'Executing proposal');

    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-governance',
        requestId: `execute-${proposalId}-${Date.now()}`,
        commandType: 'EXECUTE_PROPOSAL',
        payload: {
          proposalId,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id }, 'Proposal execution command created');

    return {
      commandId: command.id,
      message: 'Proposal execution initiated.',
    };
  }

  async getProposal(proposalId: string): Promise<ProposalDTO> {
    const proposal = await db.proposal.findUnique({
      where: { proposalId },
    });

    if (!proposal) {
      throw new Error('Proposal not found');
    }

    return {
      proposalId: proposal.proposalId,
      targetParam: (proposal as any).targetParam,
      newValue: (proposal as any).newValue,
      proposerId: proposal.proposerId,
      status: proposal.status as 'Active' | 'Passed' | 'Failed' | 'Executed',
      forVotes: Number(proposal.forVotes),
      againstVotes: Number(proposal.againstVotes),
      endTime: (proposal as any).endTime,
    };
  }

  async listActiveProposals(): Promise<ProposalDTO[]> {
    const proposals = await db.proposal.findMany({
      where: { status: 'Active' },
      orderBy: { createdAt: 'asc' },
    });

    return proposals.map((p) => ({
      proposalId: p.proposalId,
      targetParam: p.targetParam,
      newValue: p.newValue,
      proposerId: p.proposerId,
      status: p.status as 'Active' | 'Passed' | 'Failed' | 'Executed',
      forVotes: Number(p.forVotes),
      againstVotes: Number(p.againstVotes),
      endTime: p.endTime,
    }));
  }
}

export const governanceService = new GovernanceService();
