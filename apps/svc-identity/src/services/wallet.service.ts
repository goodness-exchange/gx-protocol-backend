import { db } from '@gx/core-db';

/**
 * Wallet Service
 *
 * Provides wallet-related query functionality for the dashboard.
 * This service reads from the Wallet and Transaction tables
 * (CQRS read models projected from blockchain events).
 *
 * Note: This is a read-only service. All write operations go through
 * svc-tokenomics which uses the outbox pattern for blockchain transactions.
 */

export interface WalletBalanceDTO {
  walletId: string;
  profileId: string;
  fabricUserId: string;
  balance: number;
  walletName: string;
  updatedAt: Date;
}

export interface TransactionDTO {
  offTxId: string;
  onChainTxId: string | null;
  walletId: string;
  type: string;
  counterparty: string | null;
  amount: number;
  fee: number;
  remark: string | null;
  timestamp: Date;
  blockNumber: string | null;
}

class WalletService {
  /**
   * Get wallet balance for a user profile
   *
   * CQRS Read Operation: Queries projected Wallet table
   * Includes fabricUserId (blockchain address) for the wallet display
   */
  async getWalletBalance(profileId: string): Promise<WalletBalanceDTO> {
    // Fetch wallet along with user profile to get fabricUserId
    const wallet = await db.wallet.findFirst({
      where: { profileId, deletedAt: null },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Get user profile to fetch the blockchain address (fabricUserId)
    const userProfile = await db.userProfile.findUnique({
      where: { profileId },
      select: { fabricUserId: true },
    });

    return {
      walletId: wallet.walletId,
      profileId: wallet.profileId,
      fabricUserId: userProfile?.fabricUserId || '',
      balance: Number(wallet.cachedBalance),
      walletName: wallet.walletName,
      updatedAt: wallet.updatedAt,
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

    return transactions.map((tx: any) => ({
      offTxId: tx.offTxId,
      onChainTxId: tx.onChainTxId,
      walletId: tx.walletId,
      type: tx.type,
      counterparty: tx.counterparty,
      amount: Number(tx.amount),
      fee: Number(tx.fee),
      remark: tx.remark,
      timestamp: tx.timestamp,
      blockNumber: tx.blockNumber?.toString() || null,
    })) as TransactionDTO[];
  }

  /**
   * Get wallet dashboard data (combined balance and recent transactions)
   *
   * This provides all data needed for the dashboard in a single call
   */
  async getDashboardData(profileId: string): Promise<{
    wallet: WalletBalanceDTO;
    recentTransactions: TransactionDTO[];
  }> {
    const wallet = await this.getWalletBalance(profileId);
    const recentTransactions = await this.getTransactionHistory(profileId, 10, 0);

    return {
      wallet,
      recentTransactions,
    };
  }
}

export const walletService = new WalletService();
