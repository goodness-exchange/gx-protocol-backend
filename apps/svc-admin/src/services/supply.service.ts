/**
 * Supply Service
 *
 * Provides supply status queries from the blockchain (Hyperledger Fabric).
 * Uses the TokenomicsContract:GetSupplyStatus chaincode function.
 *
 * Architecture:
 * - Creates a single Fabric client instance on first use (lazy initialization)
 * - Uses evaluate (query) transactions for read-only operations
 * - Caches connection for reuse across requests
 */

import { createFabricClient, IFabricClient } from '@gx/core-fabric';
import { logger } from '@gx/core-logger';

/**
 * Pool Status from blockchain
 */
interface PoolStatusDTO {
  poolId: string;
  cap: number;
  minted: number;
  availableToMint: number;
  balance: number;
  totalAvailable: number;
}

/**
 * Supply Status from blockchain (matches chaincode SupplyStatusDTO)
 */
interface SupplyStatusDTO {
  maxSupply: number;
  totalMinted: number;
  availableToMint: number;
  circulatingSupply: number;
  pools: Record<string, PoolStatusDTO>;
  lastUpdated: string;
}

/**
 * Public supply response (simplified for transparency)
 */
interface PublicSupplyDTO {
  maxSupply: string;
  totalMinted: string;
  availableToMint: string;
  circulatingSupply: string;
  mintedPercentage: number;
  lastUpdated: string;
  pools: {
    userGenesis: { cap: string; minted: string; percentage: number };
    govtGenesis: { cap: string; minted: string; percentage: number };
    charitable: { cap: string; minted: string; percentage: number };
    loan: { cap: string; minted: string; percentage: number };
    gx: { cap: string; minted: string; percentage: number };
    operations: { cap: string; minted: string; percentage: number };
  };
}

/**
 * Convert Qirat (smallest unit) to GX Coins for display
 * 1 GX = 1,000,000 Qirat
 */
const QIRAT_PRECISION = 1_000_000;

function qiratToGX(qirat: number): string {
  const gx = qirat / QIRAT_PRECISION;
  return gx.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

class SupplyService {
  private fabricClient: IFabricClient | null = null;
  private isConnecting = false;
  private connectionPromise: Promise<void> | null = null;

  /**
   * Get or create Fabric client connection
   * Uses lazy initialization and connection caching
   */
  private async getClient(): Promise<IFabricClient> {
    // Return existing client if connected
    if (this.fabricClient) {
      return this.fabricClient;
    }

    // Wait for existing connection attempt
    if (this.isConnecting && this.connectionPromise) {
      await this.connectionPromise;
      return this.fabricClient!;
    }

    // Start new connection
    this.isConnecting = true;
    this.connectionPromise = this.connect();

    try {
      await this.connectionPromise;
      return this.fabricClient!;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  /**
   * Connect to Fabric network
   */
  private async connect(): Promise<void> {
    logger.info('Connecting to Fabric network for supply queries...');

    try {
      this.fabricClient = await createFabricClient();
      await this.fabricClient.connect();
      logger.info('Connected to Fabric network successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to connect to Fabric network');
      this.fabricClient = null;
      throw error;
    }
  }

  /**
   * Get complete supply status from blockchain
   * Calls TokenomicsContract:GetSupplyStatus
   *
   * @returns SupplyStatusDTO with all pool details
   */
  async getSupplyStatus(): Promise<SupplyStatusDTO> {
    const client = await this.getClient();

    logger.info('Querying supply status from blockchain...');

    try {
      const result = await client.evaluateTransaction(
        'TokenomicsContract',
        'GetSupplyStatus'
      );

      const supplyStatus: SupplyStatusDTO = JSON.parse(
        Buffer.from(result).toString('utf-8')
      );

      logger.info({
        totalMinted: supplyStatus.totalMinted,
        maxSupply: supplyStatus.maxSupply,
      }, 'Supply status retrieved successfully');

      return supplyStatus;
    } catch (error) {
      logger.error({ error }, 'Failed to query supply status');
      throw new Error('Failed to retrieve supply status from blockchain');
    }
  }

  /**
   * Get public supply information (simplified for transparency)
   *
   * @returns PublicSupplyDTO with human-readable values
   */
  async getPublicSupply(): Promise<PublicSupplyDTO> {
    const status = await this.getSupplyStatus();

    const mintedPercentage = (status.totalMinted / status.maxSupply) * 100;

    return {
      maxSupply: qiratToGX(status.maxSupply),
      totalMinted: qiratToGX(status.totalMinted),
      availableToMint: qiratToGX(status.availableToMint),
      circulatingSupply: qiratToGX(status.circulatingSupply),
      mintedPercentage: Math.round(mintedPercentage * 100) / 100,
      lastUpdated: status.lastUpdated,
      pools: {
        userGenesis: this.formatPool(status.pools['USER_GENESIS']),
        govtGenesis: this.formatPool(status.pools['GOVT_GENESIS']),
        charitable: this.formatPool(status.pools['CHARITABLE']),
        loan: this.formatPool(status.pools['LOAN']),
        gx: this.formatPool(status.pools['GX']),
        operations: this.formatPool(status.pools['OPERATIONS']),
      },
    };
  }

  /**
   * Get specific pool status
   *
   * @param poolId Pool identifier (USER_GENESIS, GOVT_GENESIS, CHARITABLE, LOAN, GX, OPERATIONS)
   * @returns Pool status or null if not found
   */
  async getPoolStatus(poolId: string): Promise<PoolStatusDTO | null> {
    const client = await this.getClient();

    logger.info({ poolId }, 'Querying pool status from blockchain...');

    try {
      const result = await client.evaluateTransaction(
        'TokenomicsContract',
        'GetPoolStatus',
        poolId
      );

      const poolStatus: PoolStatusDTO = JSON.parse(
        Buffer.from(result).toString('utf-8')
      );

      return poolStatus;
    } catch (error) {
      logger.error({ error, poolId }, 'Failed to query pool status');
      return null;
    }
  }

  /**
   * Format pool data for public display
   */
  private formatPool(pool: PoolStatusDTO | undefined): { cap: string; minted: string; percentage: number } {
    if (!pool) {
      return { cap: '0', minted: '0', percentage: 0 };
    }

    const percentage = pool.cap > 0 ? (pool.minted / pool.cap) * 100 : 0;

    return {
      cap: qiratToGX(pool.cap),
      minted: qiratToGX(pool.minted),
      percentage: Math.round(percentage * 100) / 100,
    };
  }

  /**
   * Disconnect from Fabric network (for graceful shutdown)
   */
  disconnect(): void {
    if (this.fabricClient) {
      this.fabricClient.disconnect();
      this.fabricClient = null;
      logger.info('Disconnected from Fabric network');
    }
  }
}

export const supplyService = new SupplyService();
