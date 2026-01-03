import { db, Prisma } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { AppError } from '../utils';
import {
  AllocateFundsDTO,
  DisburseFundsDTO,
  GovernmentErrorCode,
  TransactionResponse,
} from '../types';
import { multiSigService } from './multi-sig.service';

type TransactionClient = Prisma.TransactionClient;

export class FundService {
  /**
   * Allocate funds from treasury/account to a child account
   * Creates a pending multi-sig transaction if rules require approval
   */
  async allocateFunds(
    fromEntityId: string,
    dto: AllocateFundsDTO,
    initiatedByProfileId: string
  ): Promise<{ pendingTxId?: string; immediate: boolean; message: string }> {
    const { toAccountId, amount, purpose, category, externalRef } = dto;

    // Validate source entity (treasury or account)
    const sourceAccount = await this.getSourceEntity(fromEntityId);
    if (!sourceAccount) {
      throw new AppError(
        GovernmentErrorCode.ACCOUNT_NOT_FOUND,
        404,
        'Source account/treasury not found'
      );
    }

    // Validate destination account
    const destAccount = await db.governmentHierarchyAccount.findUnique({
      where: { accountId: toAccountId },
    });

    if (!destAccount) {
      throw new AppError(
        GovernmentErrorCode.ACCOUNT_NOT_FOUND,
        404,
        'Destination account not found'
      );
    }

    if (destAccount.status !== 'ACCOUNT_ACTIVE') {
      throw new AppError(
        GovernmentErrorCode.ACCOUNT_FROZEN,
        400,
        'Destination account is not active'
      );
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new AppError(GovernmentErrorCode.INVALID_AMOUNT, 400, 'Invalid amount');
    }

    // Check balance
    const balance = parseFloat(sourceAccount.balance.toString());
    if (balance < amountNum) {
      throw new AppError(
        GovernmentErrorCode.INSUFFICIENT_BALANCE,
        400,
        `Insufficient balance. Available: ${balance}, Requested: ${amountNum}`
      );
    }

    // Verify destination is a child of source (for accounts)
    if (sourceAccount.type === 'ACCOUNT') {
      const isValidChild = this.isValidChild(
        sourceAccount.treasuryId,
        fromEntityId,
        toAccountId,
        destAccount
      );
      if (!isValidChild) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          'Destination account must be a child of source account'
        );
      }
    } else {
      // For treasury, destination must be a root account (no parent)
      if (destAccount.parentAccountId !== null) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          'Treasury can only allocate to root-level accounts'
        );
      }
      // Verify destination belongs to this treasury
      if (destAccount.treasuryId !== fromEntityId) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          'Destination account does not belong to this treasury'
        );
      }
    }

    // Check if multi-sig approval is required
    const entityType = sourceAccount.type === 'TREASURY' ? 'GOVERNMENT_TREASURY' : 'GOVERNMENT_ACCOUNT';
    const rule = await multiSigService.findApplicableRule(
      entityType,
      fromEntityId,
      'ALLOCATION',
      amount
    );

    if (rule && rule.requiredApprovals > 1) {
      // Create pending transaction for multi-sig approval
      const pendingTx = await multiSigService.createPendingTransaction({
        entityType,
        entityId: fromEntityId,
        transactionType: 'ALLOCATION',
        fromEntityId,
        toEntityId: toAccountId,
        amount,
        purpose,
        category,
        externalRef,
        initiatedByProfileId,
      });

      logger.info(
        {
          pendingTxId: pendingTx.pendingTxId,
          fromEntityId,
          toAccountId,
          amount,
        },
        'Allocation pending multi-sig approval'
      );

      return {
        pendingTxId: pendingTx.pendingTxId,
        immediate: false,
        message: `Allocation requires ${rule.requiredApprovals} approvals`,
      };
    }

    // Execute immediately if no multi-sig required
    await this.executeAllocation(fromEntityId, toAccountId, amount, purpose, category, externalRef, initiatedByProfileId);

    return {
      immediate: true,
      message: 'Allocation executed successfully',
    };
  }

  /**
   * Disburse funds from account to external recipient
   * Creates a pending multi-sig transaction if rules require approval
   */
  async disburseFunds(
    fromAccountId: string,
    dto: DisburseFundsDTO,
    initiatedByProfileId: string
  ): Promise<{ pendingTxId?: string; immediate: boolean; message: string }> {
    const { recipientId, recipientType, amount, purpose, category, externalRef } = dto;

    // Validate source account
    const sourceAccount = await db.governmentHierarchyAccount.findUnique({
      where: { accountId: fromAccountId },
      include: { treasury: true },
    });

    if (!sourceAccount) {
      throw new AppError(GovernmentErrorCode.ACCOUNT_NOT_FOUND, 404, 'Source account not found');
    }

    if (sourceAccount.status !== 'ACCOUNT_ACTIVE') {
      throw new AppError(GovernmentErrorCode.ACCOUNT_FROZEN, 400, 'Source account is not active');
    }

    // Check if treasury is active
    if (sourceAccount.treasury.status !== 'TREASURY_ACTIVE') {
      throw new AppError(
        GovernmentErrorCode.TREASURY_NOT_ACTIVE,
        400,
        'Treasury is not active'
      );
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new AppError(GovernmentErrorCode.INVALID_AMOUNT, 400, 'Invalid amount');
    }

    // Check balance
    const balance = parseFloat(sourceAccount.balance.toString());
    if (balance < amountNum) {
      throw new AppError(
        GovernmentErrorCode.INSUFFICIENT_BALANCE,
        400,
        `Insufficient balance. Available: ${balance}, Requested: ${amountNum}`
      );
    }

    // Validate recipient exists based on type
    await this.validateRecipient(recipientId, recipientType);

    // Check if multi-sig approval is required
    const rule = await multiSigService.findApplicableRule(
      'GOVERNMENT_ACCOUNT',
      fromAccountId,
      'DISBURSEMENT',
      amount
    );

    if (rule && rule.requiredApprovals > 1) {
      // Create pending transaction for multi-sig approval
      const pendingTx = await multiSigService.createPendingTransaction({
        entityType: 'GOVERNMENT_ACCOUNT',
        entityId: fromAccountId,
        transactionType: 'DISBURSEMENT',
        fromEntityId: fromAccountId,
        toEntityId: recipientId,
        amount,
        purpose,
        category,
        externalRef,
        initiatedByProfileId,
      });

      logger.info(
        {
          pendingTxId: pendingTx.pendingTxId,
          fromAccountId,
          recipientId,
          recipientType,
          amount,
        },
        'Disbursement pending multi-sig approval'
      );

      return {
        pendingTxId: pendingTx.pendingTxId,
        immediate: false,
        message: `Disbursement requires ${rule.requiredApprovals} approvals`,
      };
    }

    // Execute immediately if no multi-sig required
    await this.executeDisbursement(
      fromAccountId,
      recipientId,
      recipientType,
      amount,
      purpose,
      category,
      externalRef,
      initiatedByProfileId
    );

    return {
      immediate: true,
      message: 'Disbursement executed successfully',
    };
  }

  /**
   * Get transaction history for treasury or account
   */
  async getTransactionHistory(
    entityId: string,
    options: {
      page: number;
      limit: number;
      transactionType?: string;
      category?: string;
      fromDate?: Date;
      toDate?: Date;
    }
  ): Promise<{ transactions: TransactionResponse[]; total: number }> {
    const { page, limit, transactionType, category, fromDate, toDate } = options;
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [
        { treasuryId: entityId },
        { accountId: entityId },
      ],
    };

    if (transactionType) {
      where.transactionType = transactionType;
    }

    if (category) {
      where.category = category;
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }

    const [transactions, total] = await Promise.all([
      db.governmentTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.governmentTransaction.count({ where }),
    ]);

    return {
      transactions: transactions.map((tx: any) => this.mapTransactionToResponse(tx)),
      total,
    };
  }

  /**
   * Execute an allocation (internal - called after approval or immediate)
   */
  private async executeAllocation(
    fromEntityId: string,
    toAccountId: string,
    amount: string,
    purpose?: string,
    category?: string,
    externalRef?: string,
    initiatedByProfileId?: string
  ): Promise<void> {
    const amountNum = parseFloat(amount);

    // Determine if source is treasury or account
    const sourceAccount = await this.getSourceEntity(fromEntityId);
    if (!sourceAccount) {
      throw new AppError(GovernmentErrorCode.ACCOUNT_NOT_FOUND, 404, 'Source not found');
    }

    await db.$transaction(async (tx: TransactionClient) => {
      // Debit source
      if (sourceAccount.type === 'TREASURY') {
        await tx.governmentTreasury.update({
          where: { treasuryId: fromEntityId },
          data: {
            balance: { decrement: amountNum },
            totalAllocatedToAccounts: { increment: amountNum },
          },
        });
      } else {
        await tx.governmentHierarchyAccount.update({
          where: { accountId: fromEntityId },
          data: {
            balance: { decrement: amountNum },
            totalAllocatedToChildren: { increment: amountNum },
          },
        });
      }

      // Credit destination
      await tx.governmentHierarchyAccount.update({
        where: { accountId: toAccountId },
        data: {
          balance: { increment: amountNum },
          allocatedFromParent: { increment: amountNum },
        },
      });

      // Record transaction
      const govtTx = await tx.governmentTransaction.create({
        data: {
          tenantId: 'default',
          treasuryId: sourceAccount.treasuryId,
          accountId: toAccountId,
          transactionType: 'ALLOCATION',
          fromAccountId: sourceAccount.type === 'ACCOUNT' ? fromEntityId : null,
          toAccountId: toAccountId,
          amount: amount,
          fee: '0',
          purpose,
          category,
          externalRef,
        },
      });

      // Create outbox command for blockchain execution
      await tx.outboxCommand.create({
        data: {
          tenantId: 'default',
          service: 'svc-government',
          requestId: `govt-alloc-${govtTx.txId}`,
          commandType: 'GOVT_ALLOCATE_FUNDS',
          payload: {
            fromEntityId,
            toAccountId,
            amount: Math.round(parseFloat(amount) * 100), // Convert to smallest unit (cents)
            purpose: purpose || '',
            idempotencyKey: govtTx.txId,
            treasuryId: sourceAccount.treasuryId,
            initiatedBy: initiatedByProfileId,
          },
          status: 'PENDING',
          attempts: 0,
        },
      });
    });

    logger.info(
      { fromEntityId, toAccountId, amount },
      'Allocation executed, outbox command created'
    );
  }

  /**
   * Execute a disbursement (internal - called after approval or immediate)
   */
  private async executeDisbursement(
    fromAccountId: string,
    recipientId: string,
    recipientType: string,
    amount: string,
    purpose: string,
    category?: string,
    externalRef?: string,
    initiatedByProfileId?: string
  ): Promise<void> {
    const amountNum = parseFloat(amount);

    const account = await db.governmentHierarchyAccount.findUnique({
      where: { accountId: fromAccountId },
    });

    if (!account) {
      throw new AppError(GovernmentErrorCode.ACCOUNT_NOT_FOUND, 404, 'Account not found');
    }

    await db.$transaction(async (tx: TransactionClient) => {
      // Debit source account
      await tx.governmentHierarchyAccount.update({
        where: { accountId: fromAccountId },
        data: {
          balance: { decrement: amountNum },
          totalDisbursed: { increment: amountNum },
        },
      });

      // Update treasury totals
      await tx.governmentTreasury.update({
        where: { treasuryId: account.treasuryId },
        data: {
          totalDisbursed: { increment: amountNum },
        },
      });

      // Record transaction
      const govtTx = await tx.governmentTransaction.create({
        data: {
          tenantId: 'default',
          treasuryId: account.treasuryId,
          accountId: fromAccountId,
          transactionType: 'DISBURSEMENT',
          fromAccountId: fromAccountId,
          recipientId,
          recipientType,
          amount: amount,
          fee: '0', // Fees calculated on-chain
          purpose,
          category,
          externalRef,
        },
      });

      // Create outbox command for blockchain execution
      await tx.outboxCommand.create({
        data: {
          tenantId: 'default',
          service: 'svc-government',
          requestId: `govt-disburse-${govtTx.txId}`,
          commandType: 'GOVT_DISBURSE_FUNDS',
          payload: {
            fromAccountId,
            recipientId,
            recipientType,
            amount: Math.round(parseFloat(amount) * 100), // Convert to smallest unit (cents)
            purpose,
            category: category || '',
            idempotencyKey: govtTx.txId,
            treasuryId: account.treasuryId,
            initiatedBy: initiatedByProfileId,
          },
          status: 'PENDING',
          attempts: 0,
        },
      });
    });

    logger.info(
      { fromAccountId, recipientId, recipientType, amount },
      'Disbursement executed, outbox command created'
    );
  }

  /**
   * Get source entity (treasury or account)
   */
  private async getSourceEntity(
    entityId: string
  ): Promise<{ type: 'TREASURY' | 'ACCOUNT'; balance: any; treasuryId: string } | null> {
    // Check if it's a treasury
    const treasury = await db.governmentTreasury.findUnique({
      where: { treasuryId: entityId },
    });

    if (treasury) {
      return {
        type: 'TREASURY',
        balance: treasury.balance,
        treasuryId: entityId,
      };
    }

    // Check if it's an account
    const account = await db.governmentHierarchyAccount.findUnique({
      where: { accountId: entityId },
    });

    if (account) {
      return {
        type: 'ACCOUNT',
        balance: account.balance,
        treasuryId: account.treasuryId,
      };
    }

    return null;
  }

  /**
   * Check if destination is a valid child of source
   */
  private isValidChild(
    treasuryId: string,
    sourceAccountId: string,
    _destAccountId: string,
    destAccount: any
  ): boolean {
    // Destination must belong to same treasury
    if (destAccount.treasuryId !== treasuryId) {
      return false;
    }

    // Destination must be a direct child (parentAccountId === sourceAccountId)
    // Or a descendant (hierarchyPath contains source account ID)
    if (destAccount.parentAccountId === sourceAccountId) {
      return true;
    }

    // Check hierarchy path
    const pathParts = destAccount.hierarchyPath.split('/');
    return pathParts.includes(sourceAccountId);
  }

  /**
   * Validate recipient exists based on type
   */
  private async validateRecipient(recipientId: string, recipientType: string): Promise<void> {
    let exists = false;

    switch (recipientType) {
      case 'USER':
        const user = await db.userProfile.findUnique({
          where: { profileId: recipientId },
        });
        exists = user !== null;
        break;
      case 'BUSINESS':
        // TODO: Check business entity exists
        exists = true; // Placeholder
        break;
      case 'NPO':
        // TODO: Check NPO entity exists
        exists = true; // Placeholder
        break;
      default:
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          `Invalid recipient type: ${recipientType}`
        );
    }

    if (!exists) {
      throw new AppError(
        GovernmentErrorCode.RECIPIENT_NOT_FOUND,
        404,
        `Recipient not found: ${recipientId}`
      );
    }
  }

  /**
   * Map transaction to response
   */
  private mapTransactionToResponse(tx: any): TransactionResponse {
    return {
      txId: tx.txId,
      treasuryId: tx.treasuryId,
      accountId: tx.accountId ?? undefined,
      transactionType: tx.transactionType,
      fromAccountId: tx.fromAccountId ?? undefined,
      toAccountId: tx.toAccountId ?? undefined,
      recipientId: tx.recipientId ?? undefined,
      recipientType: tx.recipientType ?? undefined,
      amount: tx.amount.toString(),
      fee: tx.fee.toString(),
      purpose: tx.purpose ?? undefined,
      category: tx.category ?? undefined,
      externalRef: tx.externalRef ?? undefined,
      pendingTxId: tx.pendingTxId ?? undefined,
      blockchainTxId: tx.blockchainTxId ?? undefined,
      blockNumber: tx.blockNumber?.toString() ?? undefined,
      createdAt: tx.createdAt.toISOString(),
    };
  }
}

export const fundService = new FundService();
