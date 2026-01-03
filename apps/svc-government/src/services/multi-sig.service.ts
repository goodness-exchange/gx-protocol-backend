import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { AppError } from '../utils';
import {
  CreateSignatoryRuleDTO,
  VoteOnTransactionDTO,
  PendingTransactionResponse,
  GovernmentErrorCode,
  MultiSigStatus,
} from '../types';
import { governmentConfig } from '../config';

export class MultiSigService {
  /**
   * Create a signatory rule for an entity
   */
  async createSignatoryRule(
    treasuryId: string,
    entityType: 'GOVERNMENT_TREASURY' | 'GOVERNMENT_ACCOUNT',
    dto: CreateSignatoryRuleDTO,
    createdByProfileId: string
  ): Promise<any> {
    const { entityId, ruleOrder, minAmount, maxAmount, requiredApprovals, transactionTypes, approverRoles, autoExecute, validFrom, validUntil } = dto;

    // Verify entity exists
    if (entityType === 'GOVERNMENT_TREASURY') {
      const treasury = await db.governmentTreasury.findUnique({
        where: { treasuryId: entityId },
      });
      if (!treasury) {
        throw new AppError(GovernmentErrorCode.TREASURY_NOT_FOUND, 404, 'Treasury not found');
      }
    } else if (entityType === 'GOVERNMENT_ACCOUNT') {
      const account = await db.governmentHierarchyAccount.findUnique({
        where: { accountId: entityId },
      });
      if (!account || account.treasuryId !== treasuryId) {
        throw new AppError(GovernmentErrorCode.ACCOUNT_NOT_FOUND, 404, 'Account not found');
      }
    }

    const rule = await db.sharedSignatoryRule.create({
      data: {
        tenantId: 'default',
        entityType,
        entityId,
        ruleOrder,
        minAmount: minAmount ? minAmount : null,
        maxAmount: maxAmount ? maxAmount : null,
        requiredApprovals,
        transactionTypes: transactionTypes || [],
        approverRoles: approverRoles || [],
        autoExecute,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        isActive: true,
        createdBy: createdByProfileId,
      },
    });

    logger.info(
      { ruleId: rule.ruleId, entityType, entityId, requiredApprovals },
      'Signatory rule created'
    );

    return rule;
  }

  /**
   * Get signatory rules for an entity
   */
  async getSignatoryRules(
    entityType: 'GOVERNMENT_TREASURY' | 'GOVERNMENT_ACCOUNT',
    entityId: string
  ): Promise<any[]> {
    const rules = await db.sharedSignatoryRule.findMany({
      where: {
        entityType,
        entityId,
        isActive: true,
      },
      orderBy: { ruleOrder: 'asc' },
    });

    return rules;
  }

  /**
   * Find applicable rule for a transaction
   */
  async findApplicableRule(
    entityType: 'GOVERNMENT_TREASURY' | 'GOVERNMENT_ACCOUNT',
    entityId: string,
    transactionType: string,
    amount: string
  ): Promise<any | null> {
    const rules = await db.sharedSignatoryRule.findMany({
      where: {
        entityType,
        entityId,
        isActive: true,
        OR: [
          { validFrom: null },
          { validFrom: { lte: new Date() } },
        ],
        AND: [
          {
            OR: [
              { validUntil: null },
              { validUntil: { gte: new Date() } },
            ],
          },
        ],
      },
      orderBy: { ruleOrder: 'asc' },
    });

    const amountNum = parseFloat(amount);

    for (const rule of rules) {
      // Check transaction type filter
      if (rule.transactionTypes.length > 0 && !rule.transactionTypes.includes(transactionType)) {
        continue;
      }

      // Check amount range
      if (rule.minAmount && amountNum < parseFloat(rule.minAmount.toString())) {
        continue;
      }
      if (rule.maxAmount && amountNum > parseFloat(rule.maxAmount.toString())) {
        continue;
      }

      return rule;
    }

    return null;
  }

  /**
   * Create a pending multi-sig transaction
   */
  async createPendingTransaction(options: {
    entityType: 'GOVERNMENT_TREASURY' | 'GOVERNMENT_ACCOUNT';
    entityId: string;
    transactionType: string;
    fromEntityId: string;
    toEntityId: string;
    amount: string;
    fee?: string;
    purpose?: string;
    category?: string;
    externalRef?: string;
    initiatedByProfileId: string;
  }): Promise<PendingTransactionResponse> {
    const {
      entityType,
      entityId,
      transactionType,
      fromEntityId,
      toEntityId,
      amount,
      fee,
      purpose,
      category,
      externalRef,
      initiatedByProfileId,
    } = options;

    // Find applicable rule
    const rule = await this.findApplicableRule(entityType, entityId, transactionType, amount);

    if (!rule) {
      throw new AppError(
        GovernmentErrorCode.VALIDATION_ERROR,
        400,
        'No signatory rule found for this transaction'
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + governmentConfig.defaultApprovalExpiryHours);

    const pendingTx = await db.pendingMultiSigTransaction.create({
      data: {
        tenantId: 'default',
        entityType,
        entityId,
        transactionType,
        fromEntityId,
        toEntityId,
        amount: amount,
        fee: fee || '0',
        purpose,
        category,
        externalRef,
        requiredApprovals: rule.requiredApprovals,
        currentApprovals: 0,
        status: 'MULTISIG_PENDING',
        initiatedBy: initiatedByProfileId,
        expiresAt,
      },
      include: {
        votes: {
          include: {
            // We'd need to join userProfile for voter name
          },
        },
      },
    });

    logger.info(
      {
        pendingTxId: pendingTx.pendingTxId,
        entityType,
        entityId,
        transactionType,
        amount,
        requiredApprovals: rule.requiredApprovals,
      },
      'Pending multi-sig transaction created'
    );

    return this.mapPendingTxToResponse(pendingTx);
  }

  /**
   * Vote on a pending transaction
   */
  async voteOnTransaction(
    pendingTxId: string,
    dto: VoteOnTransactionDTO,
    voterProfileId: string,
    voterRole?: string
  ): Promise<PendingTransactionResponse> {
    const pendingTx = await db.pendingMultiSigTransaction.findUnique({
      where: { pendingTxId },
      include: { votes: true },
    });

    if (!pendingTx) {
      throw new AppError(GovernmentErrorCode.PENDING_TX_NOT_FOUND, 404, 'Pending transaction not found');
    }

    if (pendingTx.status !== 'MULTISIG_PENDING') {
      throw new AppError(
        GovernmentErrorCode.PENDING_TX_NOT_PENDING,
        400,
        `Transaction is ${pendingTx.status}, not pending`
      );
    }

    if (pendingTx.expiresAt && pendingTx.expiresAt < new Date()) {
      // Mark as expired
      await db.pendingMultiSigTransaction.update({
        where: { pendingTxId },
        data: { status: 'MULTISIG_EXPIRED' },
      });
      throw new AppError(GovernmentErrorCode.PENDING_TX_EXPIRED, 400, 'Transaction has expired');
    }

    // Check if already voted
    const existingVote = pendingTx.votes.find((v: any) => v.voterId === voterProfileId);
    if (existingVote) {
      throw new AppError(
        GovernmentErrorCode.PENDING_TX_ALREADY_VOTED,
        400,
        'You have already voted on this transaction'
      );
    }

    // Create vote and update approval count
    await db.$transaction(async (tx: any) => {
      await tx.multiSigVote.create({
        data: {
          tenantId: 'default',
          pendingTxId,
          voterId: voterProfileId,
          voterRole,
          approved: dto.approved,
          remarks: dto.remarks,
        },
      });

      if (dto.approved) {
        const newApprovalCount = pendingTx.currentApprovals + 1;
        const isApproved = newApprovalCount >= pendingTx.requiredApprovals;

        await tx.pendingMultiSigTransaction.update({
          where: { pendingTxId },
          data: {
            currentApprovals: newApprovalCount,
            status: isApproved ? 'MULTISIG_APPROVED' : 'MULTISIG_PENDING',
          },
        });
      }
    });

    logger.info(
      { pendingTxId, voterProfileId, approved: dto.approved },
      'Vote recorded on multi-sig transaction'
    );

    // Fetch updated transaction
    const updated = await db.pendingMultiSigTransaction.findUnique({
      where: { pendingTxId },
      include: { votes: true },
    });

    return this.mapPendingTxToResponse(updated!);
  }

  /**
   * Cancel a pending transaction
   */
  async cancelTransaction(pendingTxId: string, cancelledByProfileId: string): Promise<void> {
    const pendingTx = await db.pendingMultiSigTransaction.findUnique({
      where: { pendingTxId },
    });

    if (!pendingTx) {
      throw new AppError(GovernmentErrorCode.PENDING_TX_NOT_FOUND, 404, 'Pending transaction not found');
    }

    if (pendingTx.status !== 'MULTISIG_PENDING') {
      throw new AppError(
        GovernmentErrorCode.PENDING_TX_NOT_PENDING,
        400,
        `Transaction is ${pendingTx.status}, cannot cancel`
      );
    }

    await db.pendingMultiSigTransaction.update({
      where: { pendingTxId },
      data: {
        status: 'MULTISIG_CANCELLED',
        rejectedBy: cancelledByProfileId,
        rejectedAt: new Date(),
        rejectionReason: 'Cancelled by initiator',
      },
    });

    logger.info({ pendingTxId, cancelledByProfileId }, 'Multi-sig transaction cancelled');
  }

  /**
   * Mark transaction as executed
   */
  async markAsExecuted(pendingTxId: string, blockchainTxId: string): Promise<void> {
    await db.pendingMultiSigTransaction.update({
      where: { pendingTxId },
      data: {
        status: 'MULTISIG_EXECUTED',
        executedAt: new Date(),
        executedTxId: blockchainTxId,
      },
    });

    logger.info({ pendingTxId, blockchainTxId }, 'Multi-sig transaction marked as executed');
  }

  /**
   * List pending transactions for an entity
   */
  async listPendingTransactions(options: {
    entityType: 'GOVERNMENT_TREASURY' | 'GOVERNMENT_ACCOUNT';
    entityId: string;
    status?: MultiSigStatus;
    page: number;
    limit: number;
  }): Promise<{ transactions: PendingTransactionResponse[]; total: number }> {
    const { entityType, entityId, status, page, limit } = options;
    const skip = (page - 1) * limit;

    const where: any = { entityType, entityId };
    if (status) {
      where.status = status;
    }

    const [transactions, total] = await Promise.all([
      db.pendingMultiSigTransaction.findMany({
        where,
        include: { votes: true },
        skip,
        take: limit,
        orderBy: { initiatedAt: 'desc' },
      }),
      db.pendingMultiSigTransaction.count({ where }),
    ]);

    return {
      transactions: transactions.map((t: any) => this.mapPendingTxToResponse(t)),
      total,
    };
  }

  /**
   * Map database model to response
   */
  private mapPendingTxToResponse(tx: any): PendingTransactionResponse {
    return {
      pendingTxId: tx.pendingTxId,
      entityType: tx.entityType,
      entityId: tx.entityId,
      transactionType: tx.transactionType,
      fromEntityId: tx.fromEntityId,
      toEntityId: tx.toEntityId,
      amount: tx.amount.toString(),
      fee: tx.fee.toString(),
      purpose: tx.purpose ?? undefined,
      category: tx.category ?? undefined,
      externalRef: tx.externalRef ?? undefined,
      requiredApprovals: tx.requiredApprovals,
      currentApprovals: tx.currentApprovals,
      status: tx.status,
      initiatedBy: tx.initiatedBy,
      initiatedAt: tx.initiatedAt.toISOString(),
      expiresAt: tx.expiresAt?.toISOString(),
      votes: (tx.votes || []).map((v: any) => ({
        voteId: v.voteId,
        voterId: v.voterId,
        voterName: '', // Would need join to get
        voterRole: v.voterRole ?? undefined,
        approved: v.approved,
        remarks: v.remarks ?? undefined,
        votedAt: v.votedAt.toISOString(),
      })),
    };
  }
}

export const multiSigService = new MultiSigService();
