import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import type {
  TransferRequestDTO,
  GenesisDistributionRequestDTO,
  WalletBalanceDTO,
  TreasuryBalanceDTO,
  TransactionDTO,
  FreezeWalletRequestDTO,
} from '../types/dtos';

/**
 * Tokenomics Service
 *
 * Handles token-related business logic including:
 * - Token transfers (CQRS write via outbox)
 * - Genesis distribution (CQRS write via outbox)
 * - Balance queries (read from Wallet table)
 * - Transaction history (read from Transaction table)
 * - Wallet freeze/unfreeze (admin operations)
 */

class TokenomicsService {
  /**
   * Transfer tokens between users
   *
   * CQRS Write Operation:
   * 1. Validate sender has sufficient balance (optimistic check)
   * 2. Create OutboxCommand for "TRANSFER_TOKENS"
   * 3. Outbox-submitter submits to TokenomicsContract:TransferTokens
   * 4. Fabric emits TransferCompleted event
   * 5. Projector updates sender/receiver balances
   */
  async transferTokens(data: TransferRequestDTO): Promise<{ commandId: string; message: string }> {
    const { fromUserId, toUserId, amount, remark } = data;

    logger.info({ fromUserId, toUserId, amount }, 'Initiating token transfer');

    // Get sender wallet (read model)
    const senderWallet = await db.wallet.findFirst({
      where: { profileId: fromUserId, deletedAt: null },
    });

    if (!senderWallet) {
      throw new Error('Sender wallet not found');
    }

    // Check sufficient balance (optimistic check)
    if (Number(senderWallet.cachedBalance) < amount) {
      throw new Error(
        `Insufficient balance. Available: ${senderWallet.cachedBalance}, Required: ${amount}`
      );
    }

    // Check receiver exists
    const receiverWallet = await db.wallet.findFirst({
      where: { profileId: toUserId, deletedAt: null },
    });

    if (!receiverWallet) {
      throw new Error('Receiver wallet not found');
    }

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-tokenomics',
        requestId: `transfer-${fromUserId}-${toUserId}-${Date.now()}`,
        commandType: 'TRANSFER_TOKENS',
        payload: {
          fromUserId,
          toUserId,
          amount: amount.toString(), // String for precision
          remark: remark || null,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id }, 'Transfer command created');

    return {
      commandId: command.id,
      message: 'Transfer initiated. Check status with command ID.',
    };
  }

  /**
   * Distribute genesis allocation to user
   *
   * CQRS Write Operation:
   * Calls TokenomicsContract:DistributeGenesis
   */
  async distributeGenesis(
    data: GenesisDistributionRequestDTO
  ): Promise<{ commandId: string; message: string }> {
    const { userId, userType, countryCode } = data;

    logger.info({ userId, userType, countryCode }, 'Distributing genesis allocation');

    // Check user exists
    const user = await db.userProfile.findUnique({
      where: { profileId: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check user has wallet
    const wallet = await db.wallet.findFirst({
      where: { profileId: userId, deletedAt: null },
    });

    if (!wallet) {
      throw new Error('User wallet not found');
    }

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-tokenomics',
        requestId: `genesis-${userId}-${Date.now()}`,
        commandType: 'DISTRIBUTE_GENESIS',
        payload: {
          userId,
          userType,
          countryCode,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id }, 'Genesis distribution command created');

    return {
      commandId: command.id,
      message: 'Genesis distribution initiated. Check status with command ID.',
    };
  }

  /**
   * Get wallet balance
   *
   * CQRS Read Operation: Queries projected Wallet table
   */
  async getWalletBalance(profileId: string): Promise<WalletBalanceDTO> {
    const wallet = await db.wallet.findFirst({
      where: { profileId, deletedAt: null },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    return {
      walletId: wallet.walletId,
      profileId: wallet.profileId,
      balance: Number(wallet.cachedBalance),
      updatedAt: wallet.updatedAt,
    };
  }

  /**
   * Get treasury balance for a country
   *
   * CQRS Read Operation: Queries projected Wallet table
   */
  async getTreasuryBalance(countryCode: string): Promise<TreasuryBalanceDTO> {
    // Treasury wallet has special profileId pattern: treasury-{countryCode}
    const treasuryWallet = await db.wallet.findFirst({
      where: {
        profileId: `treasury-${countryCode}`,
        deletedAt: null,
      },
    });

    if (!treasuryWallet) {
      throw new Error(`Treasury wallet not found for country: ${countryCode}`);
    }

    return {
      countryCode,
      balance: Number(treasuryWallet.cachedBalance),
      updatedAt: treasuryWallet.updatedAt,
    };
  }

  /**
   * Get transaction history for a wallet
   *
   * CQRS Read Operation: Queries projected Transaction table
   */
  async getTransactionHistory(
    profileId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<TransactionDTO[]> {
    const wallet = await db.wallet.findFirst({
      where: { profileId, deletedAt: null },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const transactions = await db.transaction.findMany({
      where: { walletId: wallet.walletId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });

    return transactions.map((tx) => ({
      offTxId: tx.offTxId,
      onChainTxId: tx.onChainTxId,
      walletId: tx.walletId,
      type: tx.type,
      counterparty: tx.counterparty,
      amount: Number(tx.amount),
      fee: Number(tx.fee),
      remark: tx.remark,
      timestamp: tx.timestamp,
      blockNumber: tx.blockNumber,
    })) as any;
  }

  /**
   * Freeze wallet (admin operation)
   *
   * CQRS Write Operation
   */
  async freezeWallet(data: FreezeWalletRequestDTO): Promise<{ commandId: string; message: string }> {
    const { walletId, reason } = data;

    logger.info({ walletId, reason }, 'Freezing wallet');

    // Check wallet exists
    const wallet = await db.wallet.findUnique({
      where: { walletId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-tokenomics',
        requestId: `freeze-${walletId}-${Date.now()}`,
        commandType: 'FREEZE_WALLET',
        payload: {
          userId: wallet.profileId,
          reason,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id }, 'Wallet freeze command created');

    return {
      commandId: command.id,
      message: 'Wallet freeze initiated.',
    };
  }

  /**
   * Unfreeze wallet (admin operation)
   *
   * CQRS Write Operation
   */
  async unfreezeWallet(walletId: string): Promise<{ commandId: string; message: string }> {
    logger.info({ walletId }, 'Unfreezing wallet');

    // Check wallet exists
    const wallet = await db.wallet.findUnique({
      where: { walletId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-tokenomics',
        requestId: `unfreeze-${walletId}-${Date.now()}`,
        commandType: 'UNFREEZE_WALLET',
        payload: {
          userId: wallet.profileId,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id }, 'Wallet unfreeze command created');

    return {
      commandId: command.id,
      message: 'Wallet unfreeze initiated.',
    };
  }
}

export const tokenomicsService = new TokenomicsService();
